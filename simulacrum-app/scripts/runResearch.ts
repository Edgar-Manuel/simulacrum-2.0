// Strategy research runner: walk-forward validation of candidate strategies
// across several symbols, with an explicit pass/fail gate.
//
// Usage:
//   npm run research -- --symbols BTCEUR,ETHEUR,SOLEUR --tf 4h --days 1460
//   npm run research -- --tf 1d --days 2000 --train 730 --test 180
//
// Data comes from Binance's public klines endpoint (no key) and is cached in
// .cache/ so re-runs are instant.

import fs from 'fs';
import path from 'path';
import { fetchBinanceHistory } from '../src/services/backtest/historicalData';
import { walkForward } from '../src/services/backtest/walkForward';
import {
    trendBreakout, emaTrend, pullbackTrend,
    type TrendBreakoutParams, type EmaTrendParams, type PullbackParams,
} from '../src/services/backtest/strategies';
import { buyAndHold, type EngineConfig } from '../src/services/backtest/strategyEngine';
import type { MarketData } from '../src/types/trading';

const arg = (k: string, d: string) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? process.argv[i + 1] : d;
};

const symbols = arg('symbols', 'BTCEUR,ETHEUR,SOLEUR').split(',');
const tf = arg('tf', '4h') as '1h' | '4h' | '1d';
const days = Number(arg('days', '1460'));
const barsPerYear = tf === '1d' ? 365 : tf === '4h' ? 6 * 365 : 24 * 365;
const trainBars = Number(arg('train', tf === '1d' ? '730' : String(2 * barsPerYear / 2)));
const testBars = Number(arg('test', tf === '1d' ? '180' : String(Math.round(barsPerYear / 4))));
const out = arg('out', '');

const engine: EngineConfig = {
    initialCapital: Number(arg('capital', '1000')),
    commissionPerSide: Number(arg('commission', '0.001')),
    slippageBps: Number(arg('slippage', '5')),
    riskPerTradePct: Number(arg('risk', '1')),
    maxExposurePct: Number(arg('maxexp', '100')),
    barsPerYear,
};

async function loadCandles(sym: string): Promise<MarketData[]> {
    const dir = path.resolve('.cache');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${sym}_${tf}_${days}.json`);
    if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 86_400_000) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    const end = Date.now();
    const candles = await fetchBinanceHistory({
        binanceSymbol: sym, timeframe: tf, startMs: end - days * 86_400_000, endMs: end, label: sym,
        onProgress: m => console.log(`   ${sym} ${m.trim()}`),
    });
    fs.writeFileSync(file, JSON.stringify(candles));
    return candles;
}

function grid<T extends Record<string, number[]>>(spec: T): { [K in keyof T]: number }[] {
    let acc: Record<string, number>[] = [{}];
    for (const [k, vals] of Object.entries(spec)) {
        acc = acc.flatMap(a => vals.map(v => ({ ...a, [k]: v })));
    }
    return acc as { [K in keyof T]: number }[];
}

const candidates = [
    {
        name: 'trendBreakout',
        run: (c: MarketData[]) => walkForward<TrendBreakoutParams>(
            c, (cc, p) => trendBreakout(cc, p),
            grid({ entryLookback: [20, 40, 55, 100], exitLookback: [10, 20, 30], trendEma: [100, 200], atrMult: [2.5, 3, 4] }),
            { trainBars, testBars, warmupBars: 250, engine, minTrainTrades: 5 }),
    },
    {
        name: 'emaTrend',
        run: (c: MarketData[]) => walkForward<EmaTrendParams>(
            c, (cc, p) => emaTrend(cc, p),
            grid({ period: [50, 100, 150, 200], buffer: [0, 0.01, 0.02], atrMult: [3, 4, 6] }),
            { trainBars, testBars, warmupBars: 250, engine, minTrainTrades: 5 }),
    },
    {
        name: 'pullbackTrend',
        run: (c: MarketData[]) => walkForward<PullbackParams>(
            c, (cc, p) => pullbackTrend(cc, p),
            grid({ rsiBuy: [30, 35, 40, 45], rsiExit: [55, 60, 70], atrMult: [2, 3, 4] }),
            { trainBars, testBars, warmupBars: 250, engine, minTrainTrades: 5 }),
    },
];

// Gate: a strategy is only "promising" if it clears ALL of these on a
// majority of symbols, OUT OF SAMPLE and after costs.
const GATE = { sharpe: 0.7, maxDD: 35, trades: 15 };

const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '∞');

async function main() {
    console.log(`\nResearch: ${symbols.join(', ')} | ${tf} | ${days}d | train=${trainBars} test=${testBars} bars`);
    console.log(`Costs: ${engine.commissionPerSide * 100}%/side + ${engine.slippageBps}bps slippage | risk/trade ${engine.riskPerTradePct}%\n`);

    const data = new Map<string, MarketData[]>();
    for (const s of symbols) {
        console.log(`📥 ${s}`);
        data.set(s, await loadCandles(s));
        console.log(`   ${data.get(s)!.length} candles`);
    }

    const report: Record<string, unknown> = {};
    const summary: { name: string; passes: number; rows: string[] }[] = [];

    for (const cand of candidates) {
        const rows: string[] = [];
        let passes = 0;
        for (const s of symbols) {
            const c = data.get(s)!;
            const wf = cand.run(c);
            const oosStart = wf.folds[0]?.testStart ?? 0;
            const bh = buyAndHold(c.slice(oosStart), engine.initialCapital, barsPerYear);
            const m = wf.oos;
            const pass = m.sharpe >= GATE.sharpe && m.maxDrawdownPct <= GATE.maxDD && m.trades >= GATE.trades && m.totalReturnPct > 0;
            if (pass) passes++;
            rows.push(
                `  ${s.padEnd(8)} OOS: ret ${f(m.totalReturnPct).padStart(7)}% | Sharpe ${f(m.sharpe).padStart(5)} | DD ${f(m.maxDrawdownPct).padStart(5)}% | ` +
                `PF ${f(m.profitFactor).padStart(4)} | trades ${String(m.trades).padStart(3)} | expo ${f(m.exposurePct, 0)}% | ` +
                `train/test Sharpe ${f(wf.avgTrainSharpe)}/${f(wf.avgTestSharpe)} | B&H ret ${f(bh.totalReturnPct)}% DD ${f(bh.maxDrawdownPct)}% ${pass ? '✅' : '❌'}`,
            );
            report[`${cand.name}:${s}`] = { oos: m, buyHold: bh, folds: wf.folds };
        }
        summary.push({ name: cand.name, passes, rows });
    }

    console.log('\n═══════════ WALK-FORWARD (out-of-sample) ═══════════');
    for (const s of summary) {
        console.log(`\n▶ ${s.name}  — passes gate on ${s.passes}/${symbols.length} symbols`);
        s.rows.forEach(r => console.log(r));
    }
    console.log(`\nGate: OOS Sharpe ≥ ${GATE.sharpe}, maxDD ≤ ${GATE.maxDD}%, trades ≥ ${GATE.trades}, return > 0 (after costs)`);

    const need = Math.ceil(symbols.length / 2) + (symbols.length % 2 === 0 ? 1 : 0);
    const winners = summary.filter(s => s.passes >= need);
    console.log('\n═══════════ VERDICT ═══════════');
    if (winners.length === 0) {
        console.log('❌ No strategy clears the gate on a majority of symbols. Do NOT trade real money.');
    } else {
        console.log(`✅ Promising (still needs paper trading): ${winners.map(w => w.name).join(', ')}`);
        console.log('   A backtest pass is necessary, not sufficient. Next: 4+ weeks of paper trading.');
    }

    if (out) {
        fs.writeFileSync(out, JSON.stringify(report, null, 2));
        console.log(`\n💾 ${out}`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
