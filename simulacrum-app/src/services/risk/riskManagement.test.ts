// Tests for riskManagement: anti-duplicate, cooldown, side-aware close,
// daily P&L, and similar-trade filter. These tests cover the regressions
// fixed in the audit (#10 closePosition side, #11 similar-trade by symbol,
// #12 recordTrade wiring, #26 cooldown vs cleanup window).

import { describe, it, expect, beforeEach } from 'vitest';
import { riskManagement } from './riskManagement';
import { riskService } from '../trading/riskService';

beforeEach(() => {
    // riskManagement is a singleton; reset state between tests so they are
    // independent. resetDaily clears dailyPnL, trade history, and the recent
    // trades buffer. We also clear openPositions manually because resetDaily
    // doesn't (positions can survive a day boundary in real usage).
    riskManagement.resetDaily();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (riskManagement as any).openPositions = new Map();
});

describe('canOpenNewTrade — max positions', () => {
    it('blocks when at the maxOpenPositions limit', () => {
        riskManagement.updateConfig({ maxOpenPositions: 2 });
        riskManagement.openPosition('BTC/EUR', 0.01, 60000, 'buy');
        riskManagement.openPosition('ETH/EUR', 0.1, 3000, 'buy');

        const result = riskManagement.canOpenNewTrade('SOL/EUR', 'buy', 100);
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/MAX POSITIONS/);
    });
});

describe('canOpenNewTrade — duplicate symbol', () => {
    it('blocks a second open on the same symbol', () => {
        riskManagement.openPosition('BTC/EUR', 0.01, 60000, 'buy');
        const result = riskManagement.canOpenNewTrade('BTC/EUR', 'buy', 61000);
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/DUPLICATE/);
    });
});

describe('canOpenNewTrade — similar trade filter (regression of #11)', () => {
    it('blocks a near-identical trade on the SAME symbol', () => {
        riskManagement.openPosition('BTC/EUR', 0.01, 60000, 'buy');
        // close that position so the next "similar" check is what's tested
        riskManagement.closePosition('BTC/EUR', 60500);

        // a new BTC buy at 60100 (~0.17% away) should still be blocked by
        // the similar-trade filter for the cooldown window
        const result = riskManagement.canOpenNewTrade('BTC/EUR', 'buy', 60100);
        expect(result.allowed).toBe(false);
        // Could be cooldown OR similar — both are valid "no" reasons.
        expect(result.reason).toMatch(/COOLDOWN|SIMILAR/);
    });

    it('does NOT block a trade on a DIFFERENT symbol at a similar price', () => {
        // The old bug: BTC@60k buy would block ETH@60.1k buy because the
        // similar-trade filter ignored the symbol field.
        riskManagement.openPosition('BTC/EUR', 0.01, 60000, 'buy');
        riskManagement.closePosition('BTC/EUR', 60000);

        const result = riskManagement.canOpenNewTrade('ETH/EUR', 'buy', 60100);
        expect(result.allowed).toBe(true);
    });
});

describe('closePosition — side-aware P&L (regression of #10)', () => {
    it('LONG: profit when exit > entry', () => {
        riskManagement.openPosition('BTC/EUR', 1, 60000, 'buy');
        const pnl = riskManagement.closePosition('BTC/EUR', 61000);
        expect(pnl).toBeCloseTo(1000, 6); // (61000 - 60000) * 1 = +1000
    });

    it('LONG: loss when exit < entry', () => {
        riskManagement.openPosition('BTC/EUR', 1, 60000, 'buy');
        const pnl = riskManagement.closePosition('BTC/EUR', 59000);
        expect(pnl).toBeCloseTo(-1000, 6);
    });

    it('SHORT: profit when exit < entry', () => {
        // Previously the PnL formula always used (exit - entry), which is
        // backwards for shorts.
        riskManagement.openPosition('BTC/EUR', 1, 60000, 'sell');
        const pnl = riskManagement.closePosition('BTC/EUR', 59000);
        expect(pnl).toBeCloseTo(1000, 6);
    });

    it('SHORT: loss when exit > entry', () => {
        riskManagement.openPosition('BTC/EUR', 1, 60000, 'sell');
        const pnl = riskManagement.closePosition('BTC/EUR', 61000);
        expect(pnl).toBeCloseTo(-1000, 6);
    });

    it('returns 0 when there is no open position', () => {
        expect(riskManagement.closePosition('UNKNOWN/EUR', 100)).toBe(0);
    });

    it('removes the position from openPositions after close', () => {
        riskManagement.openPosition('BTC/EUR', 1, 60000, 'buy');
        expect(riskManagement.getOpenPositions().has('BTC/EUR')).toBe(true);
        riskManagement.closePosition('BTC/EUR', 60500);
        expect(riskManagement.getOpenPositions().has('BTC/EUR')).toBe(false);
    });
});

describe('closePosition signals riskService.recordTrade (regression of #12)', () => {
    it('triggers cooldown-after-loss on the trading risk service', () => {
        // Configure a short cooldown so the test is fast.
        riskService.updateParameters({ cooldownAfterLoss: 5 });
        // Reset its daily stats so lastLossTime starts clean.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (riskService as any).dailyStats = {
            date: new Date().toISOString().split('T')[0],
            startingBalance: 10000,
            currentBalance: 10000,
            realizedPnL: 0,
            trades: 0,
            winningTrades: 0,
            losingTrades: 0,
        };

        riskManagement.openPosition('BTC/EUR', 1, 60000, 'buy');
        // Close at a loss — should propagate to riskService.recordTrade.
        riskManagement.closePosition('BTC/EUR', 58000);

        const stats = riskService.getDailyStats();
        expect(stats.losingTrades).toBe(1);
        expect(stats.lastLossTime).toBeTypeOf('number');
        expect(stats.realizedPnL).toBeCloseTo(-2000, 6);
    });
});

describe('canOpenNewTrade — happy path', () => {
    it('returns allowed=true when no constraint applies', () => {
        const result = riskManagement.canOpenNewTrade('BTC/EUR', 'buy', 60000);
        expect(result.allowed).toBe(true);
    });
});
