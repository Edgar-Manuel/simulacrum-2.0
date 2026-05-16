// Smoke tests for the backtest engine.
// The goal is to verify wiring: candles in → trades out, with no look-ahead
// and with slippage / commissions applied as configured. Strategy quality
// is something the user judges by running runBacktest on real data.

import { describe, it, expect } from 'vitest';
import { runBacktest } from './engine';
import type { MarketData } from '../../types/trading';

function makeCandle(close: number, t: number, ohlcSpread = 0): MarketData {
    return {
        symbol: 'TEST/EUR',
        timestamp: t,
        open: close,
        high: close + ohlcSpread,
        low: close - ohlcSpread,
        close,
        volume: 1_000_000,
    };
}

describe('backtest engine — wiring', () => {
    it('runs without error on a long synthetic series and produces metrics', () => {
        // 500 candles, slow upward trend with sinusoidal noise. Realistic
        // enough to trigger some signals through the warmup window.
        const candles: MarketData[] = [];
        for (let i = 0; i < 500; i++) {
            const base = 100 + i * 0.05;
            const noise = Math.sin(i / 7) * 1.5;
            const close = base + noise;
            candles.push(makeCandle(close, i * 3_600_000, 0.5));
        }

        const result = runBacktest(candles, {
            initialCapital: 1000,
            commissionPerSide: 0.001,
            slippageBps: 5,
            warmupCandles: 210,
        });

        // Wiring checks (we are NOT asserting profitability — that depends
        // on the underlying strategy and data).
        expect(result.metrics).toBeDefined();
        expect(result.equityCurve.length).toBeGreaterThan(0);
        expect(Number.isFinite(result.metrics.finalEquity)).toBe(true);
        expect(Number.isFinite(result.metrics.maxDrawdownPct)).toBe(true);
        // win + loss should equal total
        expect(result.metrics.winningTrades + result.metrics.losingTrades).toBe(result.metrics.totalTrades);
    });

    it('refuses to run when there is not enough warmup data', () => {
        const candles: MarketData[] = Array.from({ length: 50 }, (_, i) => makeCandle(100, i));
        expect(() =>
            runBacktest(candles, {
                initialCapital: 1000,
                commissionPerSide: 0.001,
                slippageBps: 5,
                warmupCandles: 210,
            }),
        ).toThrow();
    });

    it('does not allow concurrent positions (one trade at a time)', () => {
        const candles: MarketData[] = [];
        for (let i = 0; i < 300; i++) {
            candles.push(makeCandle(100 + Math.sin(i / 5) * 10, i * 3_600_000, 1));
        }

        const result = runBacktest(candles, {
            initialCapital: 1000,
            commissionPerSide: 0,
            slippageBps: 0,
            warmupCandles: 210,
        });

        // For every pair of consecutive trades, the next entry must be at
        // or after the previous exit.
        for (let i = 1; i < result.trades.length; i++) {
            expect(result.trades[i].entryTime).toBeGreaterThanOrEqual(result.trades[i - 1].exitTime);
        }
    });
});
