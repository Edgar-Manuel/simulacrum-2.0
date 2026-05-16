// Tests for indicatorService signal generation. The headline regression is
// the Golden/Death Cross (#8 in the audit): the previous code passed only 3
// candles to a period-200 EMA, so the cross check returned an empty array
// and the signal NEVER fired in production.

import { describe, it, expect } from 'vitest';
import { indicatorService } from './indicatorService';
import type { MarketData } from '../../types/trading';
import type { RiskConfig } from '../risk/riskManagement';
import { DEFAULT_RISK_CONFIG } from '../risk/riskManagement';

function makeCandle(close: number, t = 0): MarketData {
    // Synthetic OHLCV: open=close=high=low to make indicators deterministic.
    // Volume is constant to keep volumeChange = 0 (no boost).
    return {
        symbol: 'BTC/EUR',
        timestamp: t,
        open: close,
        high: close,
        low: close,
        close,
        volume: 1_000_000,
    };
}

// Build a price series that creates a Golden Cross at some point:
//   phase A (250 candles): ramp DOWN 150 → 100 — pushes EMA50 BELOW EMA200
//   phase B (250 candles): ramp UP   100 → 150 — pulls EMA50 back ABOVE EMA200
// Somewhere in phase B the cross fires.
function goldenCrossSeries(): MarketData[] {
    const out: MarketData[] = [];
    for (let i = 0; i < 250; i++) out.push(makeCandle(150 - (i * 50) / 250, i));
    for (let i = 0; i < 250; i++) out.push(makeCandle(100 + (i * 50) / 250, 250 + i));
    return out;
}

// Mirror for Death Cross: ramp UP first (EMA50 above EMA200), then DOWN.
function deathCrossSeries(): MarketData[] {
    const out: MarketData[] = [];
    for (let i = 0; i < 250; i++) out.push(makeCandle(100 + (i * 50) / 250, i));
    for (let i = 0; i < 250; i++) out.push(makeCandle(150 - (i * 50) / 250, 250 + i));
    return out;
}

// Loose risk config — we want signals NOT to be filtered out by the EMA200
// sniper filter for these tests; we just want to know if the cross fires at
// all when the data warrants it.
const permissiveConfig: RiskConfig = {
    ...DEFAULT_RISK_CONFIG,
    minConfidenceThreshold: 0,
};

describe('Golden Cross / Death Cross (regression of #8)', () => {
    it('eventually emits a Golden-Cross signal on a bullish ramp', () => {
        const series = goldenCrossSeries();

        // Walk the series candle by candle from index 250 onward; we only
        // need to confirm that AT LEAST ONE Golden-Cross fires somewhere in
        // the ramp. (Previously: never fired, ever.)
        let saw = false;
        for (let i = 201; i < series.length; i++) {
            const slice = series.slice(0, i);
            const signals = indicatorService.generateSignals(
                'BTC/EUR',
                indicatorService.calculateIndicators(slice),
                slice[slice.length - 1].close,
                slice,
                permissiveConfig,
            );
            if (signals.some(s => s.source === 'Golden-Cross')) {
                saw = true;
                break;
            }
        }
        expect(saw).toBe(true);
    });

    it('eventually emits a Death-Cross signal on a bearish ramp', () => {
        const series = deathCrossSeries();
        let saw = false;
        for (let i = 201; i < series.length; i++) {
            const slice = series.slice(0, i);
            const signals = indicatorService.generateSignals(
                'BTC/EUR',
                indicatorService.calculateIndicators(slice),
                slice[slice.length - 1].close,
                slice,
                permissiveConfig,
            );
            if (signals.some(s => s.source === 'Death-Cross')) {
                saw = true;
                break;
            }
        }
        expect(saw).toBe(true);
    });

    it('does NOT emit a cross when there is no crossing', () => {
        // 300 flat candles — EMAs converge but never cross.
        const flat: MarketData[] = Array.from({ length: 300 }, (_, i) => makeCandle(100, i));
        const signals = indicatorService.generateSignals(
            'BTC/EUR',
            indicatorService.calculateIndicators(flat),
            flat[flat.length - 1].close,
            flat,
            permissiveConfig,
        );
        const crosses = signals.filter(
            s => s.source === 'Golden-Cross' || s.source === 'Death-Cross'
        );
        expect(crosses).toHaveLength(0);
    });
});

describe('calculateIndicators on short series', () => {
    it('returns nulls instead of throwing when there is not enough data', () => {
        const tiny: MarketData[] = Array.from({ length: 10 }, (_, i) => makeCandle(100, i));
        const indicators = indicatorService.calculateIndicators(tiny);
        // EMA200 cannot be computed from 10 candles.
        expect(indicators.ema200).toBeNull();
        // But RSI(14) needs only 14 — still null with 10.
        expect(indicators.rsi14).toBeNull();
    });

    it('produces a finite RSI value on a normal series', () => {
        const candles: MarketData[] = [];
        for (let i = 0; i < 100; i++) {
            // sinusoidal close so RSI moves around 50
            candles.push(makeCandle(100 + Math.sin(i / 10) * 5, i));
        }
        const indicators = indicatorService.calculateIndicators(candles);
        expect(indicators.rsi14).not.toBeNull();
        expect(indicators.rsi14! > 0 && indicators.rsi14! < 100).toBe(true);
    });
});
