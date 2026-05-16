// CLI runner: fetches historical candles from Binance and runs the
// backtest engine against the production signal generator.
//
// Usage:
//   npm run backtest -- --symbol BTCEUR --days 365 --tf 1h
//   npm run backtest -- --symbol ETHEUR --days 730 --tf 4h --capital 1000

import { fetchBinanceHistory } from '../src/services/backtest/historicalData';
import { runBacktest, type BacktestConfig } from '../src/services/backtest/engine';

interface CliArgs {
    symbol: string;
    days: number;
    tf: '1h' | '4h' | '1d' | '15m' | '30m';
    capital: number;
    slippageBps: number;
    commission: number;
    out?: string;
}

function parseArgs(): CliArgs {
    const args = process.argv.slice(2);
    const get = (k: string, dflt?: string): string | undefined => {
        const i = args.indexOf(`--${k}`);
        return i >= 0 ? args[i + 1] : dflt;
    };
    return {
        symbol: get('symbol', 'BTCEUR')!,
        days: Number(get('days', '365')),
        tf: (get('tf', '1h') as CliArgs['tf']),
        capital: Number(get('capital', '1000')),
        slippageBps: Number(get('slippage', '5')),
        commission: Number(get('commission', '0.001')),
        out: get('out'),
    };
}

async function main() {
    const args = parseArgs();
    const endMs = Date.now();
    const startMs = endMs - args.days * 86_400_000;

    console.log(`\n📥 Fetching ${args.symbol} ${args.tf} candles from Binance...`);
    console.log(`   Window: ${new Date(startMs).toISOString().slice(0, 10)} → ${new Date(endMs).toISOString().slice(0, 10)} (${args.days}d)\n`);

    const candles = await fetchBinanceHistory({
        binanceSymbol: args.symbol,
        timeframe: args.tf,
        startMs,
        endMs,
        label: args.symbol.replace(/(\w+)(EUR|USDT|USDC|BTC)$/, '$1/$2'),
    });

    console.log(`✅ Fetched ${candles.length} candles.`);
    if (candles.length < 220) {
        console.error('❌ Not enough candles for indicators (need ~200 warmup).');
        process.exit(1);
    }

    const config: BacktestConfig = {
        initialCapital: args.capital,
        commissionPerSide: args.commission,
        slippageBps: args.slippageBps,
        warmupCandles: 210,
    };

    console.log(`\n🔬 Running backtest...`);
    console.log(`   Capital: ${args.capital}`);
    console.log(`   Commission: ${(args.commission * 100).toFixed(3)}% per side`);
    console.log(`   Slippage: ${args.slippageBps} bps per fill`);
    console.log();

    const result = runBacktest(candles, config);
    const m = result.metrics;

    const fmtPct = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`;
    const fmtNum = (x: number, d = 2) => x.toFixed(d);

    console.log('═══════════════════════════════════════════════');
    console.log(`  BACKTEST RESULTS — ${args.symbol} ${args.tf}`);
    console.log('═══════════════════════════════════════════════');
    console.log(`  Trades         : ${m.totalTrades}`);
    console.log(`  Win rate       : ${fmtNum(m.winRate)}%  (${m.winningTrades}W / ${m.losingTrades}L)`);
    console.log(`  Total return   : ${fmtPct(m.totalReturnPct)}`);
    console.log(`  Final equity   : ${fmtNum(m.finalEquity)}  (start ${args.capital})`);
    console.log(`  Avg win        : ${fmtNum(m.avgWinQuote)}`);
    console.log(`  Avg loss       : ${fmtNum(m.avgLossQuote)}`);
    console.log(`  Profit factor  : ${m.profitFactor === Infinity ? '∞' : fmtNum(m.profitFactor)}`);
    console.log(`  Max drawdown   : ${fmtNum(m.maxDrawdownPct)}%`);
    console.log(`  Sharpe (ann.)  : ${fmtNum(m.sharpe)}`);
    console.log(`  Sortino (ann.) : ${fmtNum(m.sortino)}`);
    console.log(`  Avg holding    : ${fmtNum(m.avgHoldingHours)}h`);
    console.log('═══════════════════════════════════════════════');

    // Quick verdict to keep us honest. These thresholds are conservative;
    // crypto strategies that don't clear them tend to bleed live.
    const verdicts: string[] = [];
    if (m.totalTrades < 30) verdicts.push('⚠️  Too few trades to draw conclusions.');
    if (m.sharpe < 1.0) verdicts.push('⚠️  Sharpe < 1.0 — not statistically meaningful edge.');
    if (m.maxDrawdownPct > 30) verdicts.push('⚠️  Drawdown > 30% — psychologically and financially hard to ride.');
    if (m.profitFactor < 1.3 && m.totalTrades >= 30) verdicts.push('⚠️  Profit factor < 1.3 — small edge, fragile to costs.');
    if (m.totalReturnPct < 0) verdicts.push('⚠️  Strategy lost money over the window.');
    if (verdicts.length === 0) verdicts.push('✅ No red flags. Re-run on a different window to check robustness.');
    console.log('\n' + verdicts.join('\n'));

    // Optional: dump trades.
    if (args.out) {
        const fs = await import('fs/promises');
        await fs.writeFile(args.out, JSON.stringify(result, null, 2));
        console.log(`\n💾 Full result written to ${args.out}`);
    }
}

main().catch(e => {
    console.error('\n❌ Backtest failed:', e);
    process.exit(1);
});
