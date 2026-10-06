// Strategy backtest engine (long-only spot, one position at a time).
//
// Realism rules:
//   • Signals are evaluated on the CLOSE of bar i; fills happen at the OPEN
//     of bar i+1 (no look-ahead).
//   • Stops are checked intra-bar against the low. If the bar gaps below the
//     stop, the fill is at the open (not at the stop price).
//   • Slippage applies to every fill, commission to every side.
//   • Position size is risk-based: (equity * riskPerTradePct) / stop distance,
//     capped at maxExposurePct of equity (no leverage).

import type { MarketData } from '../../types/trading';

export interface PositionView {
    entryPrice: number;
    stopLoss: number;
    entryIndex: number;
}

export interface Strategy {
    name: string;
    /** Bars needed before the strategy can emit anything. */
    warmup: number;
    /** At close of bar i while flat: return a stop to enter long at next open. */
    entry(i: number): { stopLoss: number; takeProfit?: number } | null;
    /** At close of bar i while long: return a candidate stop (engine only ratchets up). */
    trailStop?(i: number, pos: PositionView): number | null;
    /** At close of bar i while long: true → exit at next open. */
    exit?(i: number, pos: PositionView): boolean;
}

export interface EngineConfig {
    initialCapital: number;
    commissionPerSide: number; // 0.001 = 0.1%
    slippageBps: number;
    riskPerTradePct: number; // % of equity risked between entry and stop
    maxExposurePct: number; // cap on notional as % of equity
    barsPerYear: number;
    /** First bar to trade (defaults to strategy.warmup). Used by walk-forward. */
    startIndex?: number;
}

export interface Trade {
    entryIndex: number;
    exitIndex: number;
    entryTime: number;
    exitTime: number;
    entryPrice: number;
    exitPrice: number;
    size: number;
    pnl: number;
    pnlPct: number;
    reason: 'STOP' | 'TARGET' | 'SIGNAL' | 'END';
}

export interface Metrics {
    trades: number;
    winRate: number;
    totalReturnPct: number;
    annualizedReturnPct: number;
    maxDrawdownPct: number;
    sharpe: number;
    sortino: number;
    profitFactor: number;
    calmar: number;
    exposurePct: number;
    finalEquity: number;
}

export interface EquityPoint {
    timestamp: number;
    equity: number;
}

export interface StrategyResult {
    trades: Trade[];
    equityCurve: EquityPoint[];
    metrics: Metrics;
    buyHold: Metrics;
    barsInPosition: number;
}

export function runStrategyBacktest(
    candles: MarketData[],
    strategy: Strategy,
    cfg: EngineConfig,
): StrategyResult {
    const n = candles.length;
    const start = Math.max(strategy.warmup, cfg.startIndex ?? 0);
    if (n < start + 2) throw new Error(`Not enough candles: ${n}, need > ${start + 1}`);

    const slip = cfg.slippageBps / 10_000;
    const buyFill = (p: number) => p * (1 + slip);
    const sellFill = (p: number) => p * (1 - slip);

    let equity = cfg.initialCapital;
    let pos: (PositionView & { size: number; entryTime: number; takeProfit?: number }) | null = null;
    let pendingEntry: { stopLoss: number; takeProfit?: number } | null = null;
    let pendingExit = false;
    let barsInPosition = 0;
    const trades: Trade[] = [];
    const curve: EquityPoint[] = [];

    const close = (rawPrice: number, i: number, reason: Trade['reason']) => {
        if (!pos) return;
        const exitPrice = sellFill(rawPrice);
        const gross = (exitPrice - pos.entryPrice) * pos.size;
        const fees = cfg.commissionPerSide * (pos.entryPrice * pos.size + exitPrice * pos.size);
        const pnl = gross - fees;
        equity += pnl;
        trades.push({
            entryIndex: pos.entryIndex,
            exitIndex: i,
            entryTime: pos.entryTime,
            exitTime: candles[i].timestamp,
            entryPrice: pos.entryPrice,
            exitPrice,
            size: pos.size,
            pnl,
            pnlPct: (pnl / (pos.entryPrice * pos.size)) * 100,
            reason,
        });
        pos = null;
    };

    for (let i = start; i < n; i++) {
        const c = candles[i];

        // 1. Exit signal from previous close → fill at this open.
        if (pos && pendingExit) close(c.open, i, 'SIGNAL');
        pendingExit = false;

        // 2. Entry signal from previous close → fill at this open.
        if (!pos && pendingEntry) {
            const fill = buyFill(c.open);
            const stop = pendingEntry.stopLoss;
            const dist = fill - stop;
            if (dist > 0 && equity > 0) {
                const riskSize = (equity * cfg.riskPerTradePct) / 100 / dist;
                const capSize = (equity * cfg.maxExposurePct) / 100 / fill;
                const size = Math.min(riskSize, capSize);
                if (size > 0) {
                    pos = {
                        entryPrice: fill,
                        stopLoss: stop,
                        takeProfit: pendingEntry.takeProfit,
                        entryIndex: i,
                        entryTime: c.timestamp,
                        size,
                    };
                }
            }
        }
        pendingEntry = null;

        // 3. Intra-bar stop / target (stop wins ties; gaps fill at the open).
        if (pos) {
            if (c.low <= pos.stopLoss) {
                close(Math.min(c.open, pos.stopLoss), i, 'STOP');
            } else if (pos.takeProfit !== undefined && c.high >= pos.takeProfit) {
                close(Math.max(c.open, pos.takeProfit), i, 'TARGET');
            }
        }

        // 4. Mark to market at the close.
        let mtm = equity;
        if (pos) {
            barsInPosition++;
            mtm += (c.close - pos.entryPrice) * pos.size;
        }
        curve.push({ timestamp: c.timestamp, equity: mtm });

        // 5. Decide at the close for the NEXT open.
        if (pos) {
            const view: PositionView = pos;
            const cand = strategy.trailStop?.(i, view);
            if (cand !== null && cand !== undefined && Number.isFinite(cand) && cand > pos.stopLoss) {
                pos.stopLoss = cand;
            }
            if (strategy.exit?.(i, view)) pendingExit = true;
        } else if (i + 1 < n) {
            const e = strategy.entry(i);
            if (e) pendingEntry = e;
        }
    }

    // Close anything still open at the final close.
    if (pos) close(candles[n - 1].close, n - 1, 'END');
    if (curve.length > 0) curve[curve.length - 1].equity = equity;

    const metrics = computeMetrics(trades, curve, cfg.initialCapital, cfg.barsPerYear, barsInPosition);
    const bh = buyAndHold(candles.slice(start), cfg.initialCapital, cfg.barsPerYear);
    return { trades, equityCurve: curve, metrics, buyHold: bh, barsInPosition };
}

export function buyAndHold(candles: MarketData[], initialCapital: number, barsPerYear: number): Metrics {
    const first = candles[0].close;
    const curve: EquityPoint[] = candles.map(c => ({
        timestamp: c.timestamp,
        equity: (initialCapital * c.close) / first,
    }));
    return computeMetrics([], curve, initialCapital, barsPerYear, candles.length);
}

export function computeMetrics(
    trades: Trade[],
    curve: EquityPoint[],
    initialCapital: number,
    barsPerYear: number,
    barsInPosition: number,
): Metrics {
    const finalEquity = curve.length ? curve[curve.length - 1].equity : initialCapital;
    const wins = trades.filter(t => t.pnl > 0);
    const sumWins = wins.reduce((s, t) => s + t.pnl, 0);
    const sumLoss = Math.abs(trades.filter(t => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0));

    const rets: number[] = [];
    let peak = curve.length ? curve[0].equity : initialCapital;
    let maxDd = 0;
    for (let i = 0; i < curve.length; i++) {
        peak = Math.max(peak, curve[i].equity);
        maxDd = Math.max(maxDd, ((peak - curve[i].equity) / peak) * 100);
        if (i > 0 && curve[i - 1].equity > 0) {
            rets.push(curve[i].equity / curve[i - 1].equity - 1);
        }
    }
    const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
    const std = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length || 1));
    const down = rets.filter(r => r < 0);
    const dstd = Math.sqrt(down.reduce((s, r) => s + r * r, 0) / (down.length || 1));
    const ann = Math.sqrt(barsPerYear);

    const years = curve.length / barsPerYear;
    const totalRet = finalEquity / initialCapital - 1;
    const annRet = years > 0 && finalEquity > 0 ? (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100 : -100;

    return {
        trades: trades.length,
        winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
        totalReturnPct: totalRet * 100,
        annualizedReturnPct: annRet,
        maxDrawdownPct: maxDd,
        sharpe: std > 0 ? (mean / std) * ann : 0,
        sortino: dstd > 0 ? (mean / dstd) * ann : 0,
        profitFactor: sumLoss > 0 ? sumWins / sumLoss : sumWins > 0 ? Infinity : 0,
        calmar: maxDd > 0 ? annRet / maxDd : 0,
        exposurePct: curve.length ? (barsInPosition / curve.length) * 100 : 0,
        finalEquity,
    };
}
