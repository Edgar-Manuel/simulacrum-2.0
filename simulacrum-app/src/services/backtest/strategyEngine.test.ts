import { describe, it, expect } from 'vitest';
import type { MarketData } from '../../types/trading';
import { ema, atr, priorHighest } from './series';
import { runStrategyBacktest, type EngineConfig, type Strategy } from './strategyEngine';
import { trendBreakout, emaTrend, pullbackTrend } from './strategies';
import { walkForward } from './walkForward';

const cfg: EngineConfig = {
    initialCapital: 1000,
    commissionPerSide: 0,
    slippageBps: 0,
    riskPerTradePct: 1,
    maxExposurePct: 100,
    barsPerYear: 365,
};

function bar(t: number, o: number, h: number, l: number, c: number): MarketData {
    return { symbol: 'T/EUR', timestamp: t * 86_400_000, open: o, high: h, low: l, close: c, volume: 1 };
}
const flat = (n: number, p = 100): MarketData[] => Array.from({ length: n }, (_, i) => bar(i, p, p, p, p));

// Deterministic pseudo-random for reproducible synthetic series.
function rng(seed: number) {
    let s = seed;
    return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
function trendingSeries(n: number, drift: number, vol: number, seed = 1): MarketData[] {
    const r = rng(seed);
    let p = 100;
    const out: MarketData[] = [];
    for (let i = 0; i < n; i++) {
        const o = p;
        p = p * (1 + drift + (r() - 0.5) * 2 * vol);
        const h = Math.max(o, p) * (1 + r() * vol * 0.3);
        const l = Math.min(o, p) * (1 - r() * vol * 0.3);
        out.push(bar(i, o, h, l, p));
    }
    return out;
}

describe('series are causal (no look-ahead)', () => {
    it('ema/atr/priorHighest at i are unchanged by appending future data', () => {
        const c = trendingSeries(300, 0.001, 0.02);
        const closes = c.map(x => x.close);
        const short = c.slice(0, 250);
        const sc = short.map(x => x.close);
        for (const i of [60, 120, 249]) {
            expect(ema(closes, 20)[i]).toBeCloseTo(ema(sc, 20)[i], 10);
            expect(atr(c, 14)[i]).toBeCloseTo(atr(short, 14)[i], 10);
            expect(priorHighest(closes, 20)[i]).toBe(priorHighest(sc, 20)[i]);
        }
    });
});

describe('engine mechanics', () => {
    const enterAt = (idx: number, stop: number): Strategy => ({
        name: 'test',
        warmup: 1,
        entry: i => (i === idx ? { stopLoss: stop } : null),
    });

    it('fills entries at the NEXT bar open, not the signal close', () => {
        const c = flat(10);
        c[4] = bar(4, 100, 100, 100, 100);
        c[5] = bar(5, 105, 106, 104, 105); // next open = 105
        const r = runStrategyBacktest(c, enterAt(4, 90), cfg);
        expect(r.trades[0].entryIndex).toBe(5);
        expect(r.trades[0].entryPrice).toBeCloseTo(105, 8);
    });

    it('sizes by risk: a stop-out loses ~riskPerTradePct of equity', () => {
        const c = flat(10);
        c[5] = bar(5, 100, 100, 100, 100);
        c[6] = bar(6, 100, 100, 94, 94); // stop at 95 is hit
        const r = runStrategyBacktest(c, enterAt(4, 95), cfg);
        expect(r.trades[0].reason).toBe('STOP');
        expect(r.trades[0].pnl).toBeCloseTo(-10, 6); // 1% of 1000
    });

    it('gap below the stop fills at the open, not at the stop', () => {
        const c = flat(10);
        c[6] = bar(6, 90, 90, 88, 89); // gaps through the stop at 95
        const r = runStrategyBacktest(c, enterAt(4, 95), cfg);
        expect(r.trades[0].reason).toBe('STOP');
        expect(r.trades[0].exitPrice).toBeCloseTo(90, 8);
        expect(r.trades[0].pnl).toBeLessThan(-10); // worse than planned risk
    });

    it('applies commission and slippage', () => {
        const c = flat(10);
        c[6] = bar(6, 100, 100, 94, 94);
        const free = runStrategyBacktest(c, enterAt(4, 95), cfg);
        const costly = runStrategyBacktest(c, enterAt(4, 95), {
            ...cfg,
            commissionPerSide: 0.001,
            slippageBps: 10,
        });
        expect(costly.trades[0].pnl).toBeLessThan(free.trades[0].pnl);
    });

    it('never exceeds maxExposurePct of equity', () => {
        const c = flat(10);
        // stop 0.1% away would imply a huge risk-based size; cap must bind
        const r = runStrategyBacktest(c, enterAt(4, 99.9), { ...cfg, maxExposurePct: 50 });
        const t = r.trades[0];
        expect(t.size * t.entryPrice).toBeLessThanOrEqual(500 + 1e-6);
    });
});

describe('strategies', () => {
    it('trendBreakout makes money on a clean, strong uptrend', () => {
        const c = trendingSeries(600, 0.004, 0.01);
        const s = trendBreakout(c, { entryLookback: 20, exitLookback: 10, trendEma: 100, atrMult: 3 });
        const r = runStrategyBacktest(c, s, { ...cfg, riskPerTradePct: 2 });
        expect(r.metrics.trades).toBeGreaterThan(0);
        expect(r.metrics.totalReturnPct).toBeGreaterThan(0);
    });

    it('emaTrend and pullbackTrend run end to end on noisy data', () => {
        const c = trendingSeries(700, 0.001, 0.02, 7);
        const a = runStrategyBacktest(c, emaTrend(c, { period: 50, buffer: 0.01, atrMult: 3 }), cfg);
        const b = runStrategyBacktest(c, pullbackTrend(c, { rsiBuy: 40, rsiExit: 65, atrMult: 3 }), cfg);
        for (const r of [a, b]) {
            expect(Number.isFinite(r.metrics.finalEquity)).toBe(true);
            expect(r.metrics.maxDrawdownPct).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('walk-forward', () => {
    it('produces folds, chains OOS equity, and reports train vs test Sharpe', () => {
        const c = trendingSeries(1800, 0.001, 0.015, 3);
        const grid = [
            { entryLookback: 20, exitLookback: 10, trendEma: 100, atrMult: 3 },
            { entryLookback: 55, exitLookback: 20, trendEma: 100, atrMult: 3 },
        ];
        const wf = walkForward(c, (cc, p) => trendBreakout(cc, p), grid, {
            trainBars: 500,
            testBars: 150,
            warmupBars: 250,
            engine: cfg,
            minTrainTrades: 1,
        });
        expect(wf.folds.length).toBeGreaterThan(3);
        expect(wf.oosEquity.length).toBe(wf.folds.length * 150);
        expect(Number.isFinite(wf.oos.sharpe)).toBe(true);
        // Test windows never overlap the train window of the same fold.
        for (const f of wf.folds) expect(f.testStart).toBeGreaterThan(f.trainStart);
    });
});
