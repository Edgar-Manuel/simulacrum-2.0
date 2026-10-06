// Candidate strategies. Each factory precomputes causal indicator series once
// and returns a Strategy whose callbacks only read index <= i.
//
// All three are long-only (spot) and use ATR-based stops, so the stop sits
// outside normal noise instead of a fixed 2% that gets hit by volatility.

import type { MarketData } from '../../types/trading';
import { atr, ema, priorHighest, priorLowest, rsi } from './series';
import type { Strategy } from './strategyEngine';

const ok = (...xs: number[]) => xs.every(Number.isFinite);

// 1) Donchian breakout trend-following (turtle-style) with a trend filter and
//    a chandelier (ATR) trailing stop. Few trades, rides large moves.
export interface TrendBreakoutParams {
    entryLookback: number;
    exitLookback: number;
    trendEma: number;
    atrMult: number;
}

export function trendBreakout(candles: MarketData[], p: TrendBreakoutParams): Strategy {
    const closes = candles.map(c => c.close);
    const hh = priorHighest(candles.map(c => c.high), p.entryLookback);
    const ll = priorLowest(candles.map(c => c.low), p.exitLookback);
    const trend = ema(closes, p.trendEma);
    const a = atr(candles, 14);
    return {
        name: `trendBreakout(${p.entryLookback}/${p.exitLookback},ema${p.trendEma},atr${p.atrMult})`,
        warmup: Math.max(p.entryLookback, p.exitLookback, p.trendEma, 15) + 1,
        entry: i => {
            if (!ok(hh[i], trend[i], a[i])) return null;
            if (closes[i] > hh[i] && closes[i] > trend[i]) {
                return { stopLoss: closes[i] - p.atrMult * a[i] };
            }
            return null;
        },
        trailStop: i => (ok(a[i]) ? closes[i] - p.atrMult * a[i] : null),
        exit: i => ok(ll[i]) && closes[i] < ll[i],
    };
}

// 2) EMA regime filter: long while price is above its EMA (with hysteresis
//    band to avoid whipsaw), cash otherwise. The classic "cut the bear market"
//    rule; the goal is lower drawdown more than higher return.
export interface EmaTrendParams {
    period: number;
    buffer: number; // fraction, e.g. 0.01 = 1% band
    atrMult: number;
}

export function emaTrend(candles: MarketData[], p: EmaTrendParams): Strategy {
    const closes = candles.map(c => c.close);
    const m = ema(closes, p.period);
    const a = atr(candles, 14);
    return {
        name: `emaTrend(${p.period},buf${p.buffer},atr${p.atrMult})`,
        warmup: Math.max(p.period, 15) + 1,
        entry: i => {
            if (!ok(m[i], a[i])) return null;
            if (closes[i] > m[i] * (1 + p.buffer)) {
                return { stopLoss: closes[i] - p.atrMult * a[i] };
            }
            return null;
        },
        trailStop: i => (ok(a[i]) ? closes[i] - p.atrMult * a[i] : null),
        exit: i => ok(m[i]) && closes[i] < m[i] * (1 - p.buffer),
    };
}

// 3) Pullback in an uptrend: buy RSI dips only while EMA50 > EMA200 and price
//    is above EMA200; exit on RSI recovery or loss of the long-term trend.
export interface PullbackParams {
    rsiBuy: number;
    rsiExit: number;
    atrMult: number;
}

export function pullbackTrend(candles: MarketData[], p: PullbackParams): Strategy {
    const closes = candles.map(c => c.close);
    const e50 = ema(closes, 50);
    const e200 = ema(closes, 200);
    const r = rsi(closes, 14);
    const a = atr(candles, 14);
    return {
        name: `pullback(rsi<${p.rsiBuy}->${p.rsiExit},atr${p.atrMult})`,
        warmup: 201,
        entry: i => {
            if (!ok(e50[i], e200[i], r[i], a[i])) return null;
            if (e50[i] > e200[i] && closes[i] > e200[i] && r[i] < p.rsiBuy) {
                return { stopLoss: closes[i] - p.atrMult * a[i] };
            }
            return null;
        },
        exit: i => ok(r[i], e200[i]) && (r[i] > p.rsiExit || closes[i] < e200[i]),
    };
}
