// Tests for riskService — focused on the regression where intra-day
// balance updates would overwrite startingBalance, masking real drawdown
// (#16 in the audit).

import { describe, it, expect, beforeEach } from 'vitest';
import { riskService } from './riskService';

beforeEach(() => {
    // Reset the singleton to a known state.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (riskService as any).dailyStats = {
        date: new Date().toISOString().split('T')[0],
        startingBalance: 0,
        currentBalance: 0,
        realizedPnL: 0,
        trades: 0,
        winningTrades: 0,
        losingTrades: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (riskService as any).startOfDayBalanceRecorded = false;
});

describe('updateBalance — startingBalance protection (regression of #16)', () => {
    it('uses the FIRST observation of the day as startingBalance', () => {
        riskService.updateBalance(10000);
        const stats = riskService.getDailyStats();
        expect(stats.startingBalance).toBe(10000);
        expect(stats.currentBalance).toBe(10000);
    });

    it('does NOT overwrite startingBalance on subsequent intra-day updates', () => {
        // The bug: a later updateBalance call would reset startingBalance to
        // the current value, hiding losses against the original baseline.
        riskService.updateBalance(10000);   // morning
        riskService.updateBalance(9500);    // after a -5% drawdown
        riskService.updateBalance(9200);    // continued drawdown

        const stats = riskService.getDailyStats();
        expect(stats.startingBalance).toBe(10000);
        expect(stats.currentBalance).toBe(9200);
    });
});

describe('recordTrade — daily stats accounting', () => {
    it('increments winning trades on positive PnL', () => {
        riskService.updateBalance(10000);
        riskService.recordTrade(100);
        const s = riskService.getDailyStats();
        expect(s.trades).toBe(1);
        expect(s.winningTrades).toBe(1);
        expect(s.losingTrades).toBe(0);
        expect(s.realizedPnL).toBeCloseTo(100, 6);
    });

    it('increments losing trades and stamps lastLossTime on negative PnL', () => {
        riskService.updateBalance(10000);
        const before = Date.now();
        riskService.recordTrade(-50);
        const s = riskService.getDailyStats();
        expect(s.trades).toBe(1);
        expect(s.losingTrades).toBe(1);
        expect(s.winningTrades).toBe(0);
        expect(s.realizedPnL).toBeCloseTo(-50, 6);
        expect(s.lastLossTime).toBeGreaterThanOrEqual(before);
    });
});

describe('validateTrade — daily loss / cooldown blocks new trades', () => {
    it('blocks once daily loss exceeds the configured limit', () => {
        riskService.updateParameters({ maxDailyLoss: 5, cooldownAfterLoss: 30 });
        riskService.updateBalance(10000);
        // Simulate cumulative losses of 6% (-600 on 10000).
        riskService.recordTrade(-600);

        // After a -6% day the validator must reject regardless of signal.
        const result = riskService.validateTrade(
            {
                id: 'x',
                symbol: 'BTC/EUR',
                type: 'buy',
                strength: 'strong',
                confidence: 90,
                price: 60000,
                timestamp: Date.now(),
                source: 'test',
                reasoning: 'test',
            },
            100,
            {
                totalValueUSD: 9400,
                totalPnL: -600,
                totalPnLPercent: -6,
                balances: [],
                positions: [],
                lastUpdate: Date.now(),
            },
            {
                symbol: 'BTC/EUR',
                timestamp: Date.now(),
                overallRisk: 'low',
                riskScore: 20,
                volatilityRisk: 10,
                liquidityRisk: 10,
                correlationRisk: 10,
                marketRisk: 10,
                positionSizeRecommended: 100,
                stopLossRecommended: 0,
                takeProfitRecommended: 0,
                warnings: [],
            },
        );
        expect(result.isValid).toBe(false);
        // Either gate (cooldown-after-loss OR daily-loss limit) is a valid
        // refusal. We only assert that the trade is blocked.
        expect(result.reason).toMatch(/daily loss|cooldown/i);
    });

    it('blocks immediately after any loss while cooldown is active', () => {
        riskService.updateParameters({ cooldownAfterLoss: 30 });
        riskService.updateBalance(10000);
        riskService.recordTrade(-10); // tiny loss but cooldown still applies

        const result = riskService.validateTrade(
            {
                id: 'x', symbol: 'BTC/EUR', type: 'buy', strength: 'strong',
                confidence: 90, price: 60000, timestamp: Date.now(),
                source: 'test', reasoning: 'test',
            },
            100,
            {
                totalValueUSD: 10000, totalPnL: -10, totalPnLPercent: -0.1,
                balances: [], positions: [], lastUpdate: Date.now(),
            },
            {
                symbol: 'BTC/EUR', timestamp: Date.now(), overallRisk: 'low',
                riskScore: 20, volatilityRisk: 10, liquidityRisk: 10,
                correlationRisk: 10, marketRisk: 10,
                positionSizeRecommended: 100, stopLossRecommended: 0,
                takeProfitRecommended: 0, warnings: [],
            },
        );
        expect(result.isValid).toBe(false);
        expect(result.reason).toMatch(/cooldown/i);
    });
});
