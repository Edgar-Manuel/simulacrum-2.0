// Causal indicator series. Every function returns an array aligned with the
// input where index i only depends on data up to and including i (NaN while
// there is not enough history). No look-ahead.

import type { MarketData } from '../../types/trading';

export function ema(values: number[], period: number): number[] {
    const out = new Array<number>(values.length).fill(NaN);
    if (values.length < period) return out;
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i];
    let prev = sum / period;
    out[period - 1] = prev;
    const k = 2 / (period + 1);
    for (let i = period; i < values.length; i++) {
        prev = values[i] * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

/** Wilder ATR. */
export function atr(candles: MarketData[], period: number): number[] {
    const out = new Array<number>(candles.length).fill(NaN);
    if (candles.length <= period) return out;
    const tr: number[] = new Array(candles.length).fill(0);
    for (let i = 1; i < candles.length; i++) {
        const c = candles[i];
        const pc = candles[i - 1].close;
        tr[i] = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
    }
    let sum = 0;
    for (let i = 1; i <= period; i++) sum += tr[i];
    let prev = sum / period;
    out[period] = prev;
    for (let i = period + 1; i < candles.length; i++) {
        prev = (prev * (period - 1) + tr[i]) / period;
        out[i] = prev;
    }
    return out;
}

/** Wilder RSI. */
export function rsi(values: number[], period: number): number[] {
    const out = new Array<number>(values.length).fill(NaN);
    if (values.length <= period) return out;
    let gain = 0;
    let loss = 0;
    for (let i = 1; i <= period; i++) {
        const d = values[i] - values[i - 1];
        if (d >= 0) gain += d;
        else loss -= d;
    }
    let avgGain = gain / period;
    let avgLoss = loss / period;
    out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    for (let i = period + 1; i < values.length; i++) {
        const d = values[i] - values[i - 1];
        avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return out;
}

/** Highest value of the `window` bars BEFORE i (excludes bar i itself). */
export function priorHighest(values: number[], window: number): number[] {
    const out = new Array<number>(values.length).fill(NaN);
    for (let i = window; i < values.length; i++) {
        let m = -Infinity;
        for (let j = i - window; j < i; j++) if (values[j] > m) m = values[j];
        out[i] = m;
    }
    return out;
}

/** Lowest value of the `window` bars BEFORE i (excludes bar i itself). */
export function priorLowest(values: number[], window: number): number[] {
    const out = new Array<number>(values.length).fill(NaN);
    for (let i = window; i < values.length; i++) {
        let m = Infinity;
        for (let j = i - window; j < i; j++) if (values[j] < m) m = values[j];
        out[i] = m;
    }
    return out;
}
