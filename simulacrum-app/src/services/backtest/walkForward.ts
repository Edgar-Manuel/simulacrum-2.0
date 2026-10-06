// Walk-forward validation.
//
// For each fold: pick the best parameter set on the TRAIN window, then run
// ONLY that set on the following TEST window the optimizer never saw. The
// out-of-sample (OOS) test windows are chained (capital carries over) and
// scored as one equity curve. If the OOS result is much worse than the
// in-sample one, the strategy is overfit.

import type { MarketData } from '../../types/trading';
import {
    computeMetrics,
    runStrategyBacktest,
    type EngineConfig,
    type EquityPoint,
    type Metrics,
    type Strategy,
    type Trade,
} from './strategyEngine';

export interface WalkForwardConfig {
    trainBars: number;
    testBars: number;
    /** Bars of history prepended to each window so indicators are warm. */
    warmupBars: number;
    engine: EngineConfig;
    minTrainTrades?: number;
}

export interface FoldResult<P> {
    fold: number;
    trainStart: number;
    testStart: number;
    testEnd: number;
    params: P;
    trainSharpe: number;
    testSharpe: number;
    testReturnPct: number;
    testTrades: number;
}

export interface WalkForwardResult<P> {
    folds: FoldResult<P>[];
    oos: Metrics;
    oosEquity: EquityPoint[];
    oosTrades: Trade[];
    avgTrainSharpe: number;
    avgTestSharpe: number;
}

function runWindow(
    candles: MarketData[],
    a: number,
    b: number,
    warmup: number,
    strategyOf: (c: MarketData[]) => Strategy,
    engine: EngineConfig,
) {
    const from = Math.max(0, a - warmup);
    const slice = candles.slice(from, b);
    const strat = strategyOf(slice);
    return runStrategyBacktest(slice, strat, { ...engine, startIndex: a - from });
}

export function walkForward<P>(
    candles: MarketData[],
    build: (c: MarketData[], p: P) => Strategy,
    grid: P[],
    cfg: WalkForwardConfig,
): WalkForwardResult<P> {
    const { trainBars, testBars, warmupBars, engine } = cfg;
    const minTrades = cfg.minTrainTrades ?? 5;
    const folds: FoldResult<P>[] = [];
    const oosTrades: Trade[] = [];
    const oosEquity: EquityPoint[] = [];
    let capital = engine.initialCapital;
    let barsInPos = 0;

    for (let s = warmupBars; s + trainBars + testBars <= candles.length; s += testBars) {
        const trainEnd = s + trainBars;
        const testEnd = trainEnd + testBars;

        let best: { p: P; sharpe: number } | null = null;
        for (const p of grid) {
            let sharpe = -Infinity;
            try {
                const r = runWindow(candles, s, trainEnd, warmupBars, c => build(c, p), engine);
                if (r.metrics.trades >= minTrades) sharpe = r.metrics.sharpe;
            } catch {
                /* window too short for this param set */
            }
            if (!best || sharpe > best.sharpe) best = { p, sharpe };
        }
        if (!best) continue;

        const test = runWindow(candles, trainEnd, testEnd, warmupBars, c => build(c, best!.p), {
            ...engine,
            initialCapital: capital,
        });
        capital = test.metrics.finalEquity;
        barsInPos += test.barsInPosition;
        oosTrades.push(...test.trades);
        oosEquity.push(...test.equityCurve);
        folds.push({
            fold: folds.length + 1,
            trainStart: s,
            testStart: trainEnd,
            testEnd,
            params: best.p,
            trainSharpe: Number.isFinite(best.sharpe) ? best.sharpe : 0,
            testSharpe: test.metrics.sharpe,
            testReturnPct: test.metrics.totalReturnPct,
            testTrades: test.metrics.trades,
        });
    }

    const oos = computeMetrics(oosTrades, oosEquity, engine.initialCapital, engine.barsPerYear, barsInPos);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return {
        folds,
        oos,
        oosEquity,
        oosTrades,
        avgTrainSharpe: avg(folds.map(f => f.trainSharpe)),
        avgTestSharpe: avg(folds.map(f => f.testSharpe)),
    };
}
