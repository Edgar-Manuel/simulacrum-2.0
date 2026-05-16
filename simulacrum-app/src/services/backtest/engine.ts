// Honest backtest engine.
//
// "Honest" because:
//   • It replays generateSignals candle-by-candle with no look-ahead.
//   • Fills happen on the NEXT candle's open (signal at close → execute at
//     the next open) and pay a configurable slippage + commission.
//   • Stop-loss / take-profit are evaluated intra-candle using high/low
//     ranges, not just the close. If both are hit in the same candle, we
//     conservatively assume the stop fired first (worst-case fill).
//   • Only one position open at a time, matching the spot-long strategy of
//     the live app.
//
// What the engine deliberately does NOT model:
//   • Funding / borrow costs (spot-only).
//   • Slippage that scales with order size (small notionals don't move EUR
//     books materially, so fixed-bps is a fair first cut).
//   • Partial fills, orderbook depth, exchange downtime, taker vs maker
//     differentiation — these matter at larger sizes than this app targets.

import { indicatorService } from '../trading/indicatorService';
import { DEFAULT_RISK_CONFIG } from '../risk/riskManagement';
import type { MarketData, TradingSignal } from '../../types/trading';
import type { RiskConfig } from '../risk/riskManagement';

export interface BacktestConfig {
    /** Initial capital in quote currency (e.g. EUR). */
    initialCapital: number;
    /** Risk per trade as % of equity (default: maxPositionSizePercent). */
    riskConfig?: Partial<RiskConfig>;
    /** Round-trip commission, e.g. 0.001 = 0.1% per side (Binance taker). */
    commissionPerSide: number;
    /** Slippage applied to every fill, in basis points. 5 bps = 0.05%. */
    slippageBps: number;
    /** Minimum candles before signals start firing. */
    warmupCandles: number;
    /** Optional Fear & Greed series aligned with the candles. */
    fearGreed?: number[];
}

export interface BacktestTrade {
    entryTime: number;
    exitTime: number;
    side: 'buy' | 'sell';
    entryPrice: number;
    exitPrice: number;
    sizeBase: number;
    notionalQuote: number;
    pnlQuote: number;
    pnlPercent: number;
    reason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'END_OF_DATA';
    entrySignalSource: string;
    entryConfidence: number;
}

export interface BacktestMetrics {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalReturnPct: number;
    grossPnlQuote: number;
    avgWinQuote: number;
    avgLossQuote: number;
    profitFactor: number;
    maxDrawdownPct: number;
    sharpe: number; // annualized, hourly samples assumed
    sortino: number;
    avgHoldingHours: number;
    finalEquity: number;
}

export interface BacktestResult {
    trades: BacktestTrade[];
    equityCurve: { timestamp: number; equity: number }[];
    metrics: BacktestMetrics;
}

interface OpenPosition {
    side: 'buy' | 'sell';
    entryTime: number;
    entryPrice: number;
    sizeBase: number;
    stopLoss: number;
    takeProfit: number;
    sourceSignal: TradingSignal;
}

export function runBacktest(
    candles: MarketData[],
    config: BacktestConfig,
): BacktestResult {
    if (candles.length < config.warmupCandles + 2) {
        throw new Error(
            `Need at least warmup+2 candles. Got ${candles.length}, need ${config.warmupCandles + 2}.`,
        );
    }

    const risk: RiskConfig = { ...DEFAULT_RISK_CONFIG, ...(config.riskConfig || {}) };
    const slippage = config.slippageBps / 10_000;
    let equity = config.initialCapital;
    let peakEquity = equity;
    let maxDrawdownPct = 0;
    let position: OpenPosition | null = null;
    const trades: BacktestTrade[] = [];
    const equityCurve: { timestamp: number; equity: number }[] = [];

    // We walk the candles. At candle i:
    //  1. If a position is open, evaluate SL/TP against [low, high] of i.
    //  2. If no position, run signal generation on candles[0..i] (closed
    //     bars only) and queue an entry for the NEXT candle's open.
    //  3. Record equity at the end of candle i (mark-to-close).
    let pendingEntry: TradingSignal | null = null;

    for (let i = config.warmupCandles; i < candles.length; i++) {
        const c = candles[i];

        // (1) Evaluate open position against this candle's range.
        if (position) {
            const exit = checkExit(position, c);
            if (exit) {
                const filledExit = applySlippage(exit.exitPrice, position.side === 'buy' ? 'sell' : 'buy', slippage);
                const grossPnl =
                    position.side === 'buy'
                        ? (filledExit - position.entryPrice) * position.sizeBase
                        : (position.entryPrice - filledExit) * position.sizeBase;

                const fees =
                    config.commissionPerSide *
                    (position.entryPrice * position.sizeBase + filledExit * position.sizeBase);
                const netPnl = grossPnl - fees;
                equity += netPnl;

                trades.push({
                    entryTime: position.entryTime,
                    exitTime: c.timestamp,
                    side: position.side,
                    entryPrice: position.entryPrice,
                    exitPrice: filledExit,
                    sizeBase: position.sizeBase,
                    notionalQuote: position.entryPrice * position.sizeBase,
                    pnlQuote: netPnl,
                    pnlPercent: (netPnl / (position.entryPrice * position.sizeBase)) * 100,
                    reason: exit.reason,
                    entrySignalSource: position.sourceSignal.source,
                    entryConfidence: position.sourceSignal.confidence,
                });
                position = null;
            }
        }

        // (2) Generate signals on the closed bars window. We use the same
        // production signal generator so the backtest evaluates exactly the
        // same logic that the live app would execute.
        if (!position && !pendingEntry) {
            const window = candles.slice(0, i + 1);
            const indicators = indicatorService.calculateIndicators(window);
            if (config.fearGreed && config.fearGreed[i] !== undefined) {
                indicators.fearGreedIndex = config.fearGreed[i];
            }
            const signals = indicatorService.generateSignals(
                c.symbol,
                indicators,
                c.close,
                window,
                risk,
            );

            // Pick the highest-confidence actionable signal. The live app
            // gates this through an LLM committee; for the backtest we use
            // the technical confidence directly, which is the same input
            // the LLM sees.
            const top = signals
                .filter(s => s.type === 'buy' || s.type === 'sell')
                .sort((a, b) => b.confidence - a.confidence)[0];
            if (top) pendingEntry = top;
        }

        // (3) Execute any pending entry on this candle's OPEN (next bar after
        //     the signal). i.e. signal generated at candle i-1's close →
        //     executed at candle i's open. Below the pending entry was
        //     queued during this same iteration so we execute it next loop.
        if (pendingEntry && (pendingEntry.type === 'buy' || pendingEntry.type === 'sell') && i + 1 < candles.length) {
            const next = candles[i + 1];
            const side: 'buy' | 'sell' = pendingEntry.type === 'buy' ? 'buy' : 'sell';
            const fillPrice = applySlippage(next.open, side, slippage);
            const sizeQuote = (equity * risk.maxPositionSizePercent) / 100;
            const sizeBase = sizeQuote / fillPrice;

            const stopPct = risk.defaultStopLossPercent / 100;
            const tpPct = risk.defaultTakeProfitPercent / 100;
            const stopLoss = side === 'buy' ? fillPrice * (1 - stopPct) : fillPrice * (1 + stopPct);
            const takeProfit = side === 'buy' ? fillPrice * (1 + tpPct) : fillPrice * (1 - tpPct);

            position = {
                side,
                entryTime: next.timestamp,
                entryPrice: fillPrice,
                sizeBase,
                stopLoss,
                takeProfit,
                sourceSignal: pendingEntry,
            };
            pendingEntry = null;
        }

        // Mark-to-close equity tracking.
        const mtm = position
            ? equity +
              (position.side === 'buy'
                  ? (c.close - position.entryPrice) * position.sizeBase
                  : (position.entryPrice - c.close) * position.sizeBase)
            : equity;
        equityCurve.push({ timestamp: c.timestamp, equity: mtm });
        peakEquity = Math.max(peakEquity, mtm);
        const dd = ((peakEquity - mtm) / peakEquity) * 100;
        if (dd > maxDrawdownPct) maxDrawdownPct = dd;
    }

    // Close any leftover position at the last close.
    if (position) {
        const last = candles[candles.length - 1];
        const grossPnl =
            position.side === 'buy'
                ? (last.close - position.entryPrice) * position.sizeBase
                : (position.entryPrice - last.close) * position.sizeBase;
        const fees =
            config.commissionPerSide *
            (position.entryPrice * position.sizeBase + last.close * position.sizeBase);
        const netPnl = grossPnl - fees;
        equity += netPnl;
        trades.push({
            entryTime: position.entryTime,
            exitTime: last.timestamp,
            side: position.side,
            entryPrice: position.entryPrice,
            exitPrice: last.close,
            sizeBase: position.sizeBase,
            notionalQuote: position.entryPrice * position.sizeBase,
            pnlQuote: netPnl,
            pnlPercent: (netPnl / (position.entryPrice * position.sizeBase)) * 100,
            reason: 'END_OF_DATA',
            entrySignalSource: position.sourceSignal.source,
            entryConfidence: position.sourceSignal.confidence,
        });
    }

    return {
        trades,
        equityCurve,
        metrics: computeMetrics(trades, equityCurve, config.initialCapital, equity, maxDrawdownPct),
    };
}

function applySlippage(price: number, side: 'buy' | 'sell', slippageFrac: number): number {
    return side === 'buy' ? price * (1 + slippageFrac) : price * (1 - slippageFrac);
}

function checkExit(
    position: OpenPosition,
    candle: MarketData,
): { exitPrice: number; reason: 'STOP_LOSS' | 'TAKE_PROFIT' } | null {
    // Conservative: if both SL and TP fall inside this candle's [low, high]
    // range, assume the stop fired first. Real markets are noisier than
    // closes suggest; this avoids fairy-tale wins.
    if (position.side === 'buy') {
        const hitStop = candle.low <= position.stopLoss;
        const hitTp = candle.high >= position.takeProfit;
        if (hitStop) return { exitPrice: position.stopLoss, reason: 'STOP_LOSS' };
        if (hitTp) return { exitPrice: position.takeProfit, reason: 'TAKE_PROFIT' };
    } else {
        const hitStop = candle.high >= position.stopLoss;
        const hitTp = candle.low <= position.takeProfit;
        if (hitStop) return { exitPrice: position.stopLoss, reason: 'STOP_LOSS' };
        if (hitTp) return { exitPrice: position.takeProfit, reason: 'TAKE_PROFIT' };
    }
    return null;
}

function computeMetrics(
    trades: BacktestTrade[],
    equityCurve: { timestamp: number; equity: number }[],
    initialCapital: number,
    finalEquity: number,
    maxDrawdownPct: number,
): BacktestMetrics {
    const wins = trades.filter(t => t.pnlQuote > 0);
    const losses = trades.filter(t => t.pnlQuote <= 0);
    const grossPnl = finalEquity - initialCapital;
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnlQuote, 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnlQuote, 0) / losses.length) : 0;
    const sumWins = wins.reduce((s, t) => s + t.pnlQuote, 0);
    const sumLossesAbs = Math.abs(losses.reduce((s, t) => s + t.pnlQuote, 0));
    const profitFactor = sumLossesAbs > 0 ? sumWins / sumLossesAbs : sumWins > 0 ? Infinity : 0;

    // Hourly returns from the equity curve for Sharpe / Sortino.
    const hourlyReturns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
        const prev = equityCurve[i - 1].equity;
        const curr = equityCurve[i].equity;
        if (prev > 0) hourlyReturns.push((curr - prev) / prev);
    }
    const mean = hourlyReturns.reduce((a, b) => a + b, 0) / (hourlyReturns.length || 1);
    const std = Math.sqrt(
        hourlyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (hourlyReturns.length || 1),
    );
    const downReturns = hourlyReturns.filter(r => r < 0);
    const downStd = Math.sqrt(
        downReturns.reduce((s, r) => s + r ** 2, 0) / (downReturns.length || 1),
    );

    // Annualization factor for hourly samples: 24 * 365 = 8760.
    const annFactor = Math.sqrt(24 * 365);
    const sharpe = std > 0 ? (mean / std) * annFactor : 0;
    const sortino = downStd > 0 ? (mean / downStd) * annFactor : 0;

    const avgHoldingHours =
        trades.length > 0
            ? trades.reduce((s, t) => s + (t.exitTime - t.entryTime) / 3_600_000, 0) / trades.length
            : 0;

    return {
        totalTrades: trades.length,
        winningTrades: wins.length,
        losingTrades: losses.length,
        winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
        totalReturnPct: ((finalEquity - initialCapital) / initialCapital) * 100,
        grossPnlQuote: grossPnl,
        avgWinQuote: avgWin,
        avgLossQuote: avgLoss,
        profitFactor,
        maxDrawdownPct,
        sharpe,
        sortino,
        avgHoldingHours,
        finalEquity,
    };
}
