// ============================================
// RISK MANAGEMENT SERVICE
// Professional risk control for trading
// ============================================

import type {
    RiskParameters,
    RiskAssessment,
    Position,
    Order,
    TradingSignal,
    MarketAnalysis,
    Portfolio,
    Alert,
} from '../../types/trading';

// Default risk parameters
const DEFAULT_RISK_PARAMS: RiskParameters = {
    maxPositionSize: 5, // 5% of portfolio per position
    maxPortfolioRisk: 20, // 20% max portfolio at risk
    maxDailyLoss: 5, // 5% max daily loss
    maxDrawdown: 15, // 15% max drawdown
    stopLossPercent: 2, // 2% default stop loss
    takeProfitPercent: 4, // 4% default take profit (2:1 R/R)
    trailingStopPercent: 1.5, // 1.5% trailing stop
    maxOpenPositions: 5,
    maxLeverage: 3,
    cooldownAfterLoss: 30, // 30 minutes cooldown
};

interface DailyStats {
    date: string;
    startingBalance: number;
    currentBalance: number;
    realizedPnL: number;
    trades: number;
    winningTrades: number;
    losingTrades: number;
    lastLossTime?: number;
}

class RiskManagementService {
    private params: RiskParameters;
    private dailyStats: DailyStats;
    private alerts: Alert[] = [];
    private isTradeBlocked: boolean = false;
    private blockReason: string = '';

    constructor(params: Partial<RiskParameters> = {}) {
        this.params = { ...DEFAULT_RISK_PARAMS, ...params };
        this.dailyStats = this.initializeDailyStats(10000); // Default starting balance
    }

    // ==========================================
    // RISK ASSESSMENT
    // ==========================================

    assessRisk(
        symbol: string,
        analysis: MarketAnalysis,
        portfolio: Portfolio
    ): RiskAssessment {
        const warnings: string[] = [];

        // Volatility Risk (0-100)
        const volatilityRisk = this.calculateVolatilityRisk(analysis);
        if (volatilityRisk > 70) {
            warnings.push(`High volatility detected (${volatilityRisk.toFixed(0)}%)`);
        }

        // Liquidity Risk (0-100)
        const liquidityRisk = this.calculateLiquidityRisk(analysis);
        if (liquidityRisk > 50) {
            warnings.push(`Liquidity concerns (${liquidityRisk.toFixed(0)}%)`);
        }

        // Correlation Risk (0-100)
        const correlationRisk = this.calculateCorrelationRisk(symbol, portfolio);
        if (correlationRisk > 60) {
            warnings.push(`High correlation with existing positions (${correlationRisk.toFixed(0)}%)`);
        }

        // Market Risk (0-100)
        const marketRisk = this.calculateMarketRisk(analysis);
        if (marketRisk > 70) {
            warnings.push(`Adverse market conditions (${marketRisk.toFixed(0)}%)`);
        }

        // Overall risk score
        const riskScore = (volatilityRisk * 0.3 + liquidityRisk * 0.2 + correlationRisk * 0.2 + marketRisk * 0.3);
        const overallRisk = this.categorizeRisk(riskScore);

        // Position size recommendation
        const positionSizeRecommended = this.calculateRecommendedPositionSize(riskScore, portfolio);

        // Stop loss and take profit based on volatility. Use the last close
        // from analysis.signals if available (recent and tied to "now"); fall
        // back to VWAP as a session-average proxy. VWAP alone tends to drift
        // from current price as the day progresses, so SL/TP recommendations
        // were biased.
        const atr = analysis.indicators.atr || 0;
        const latestSignalPrice = analysis.signals[0]?.price || 0;
        const currentPrice = latestSignalPrice || analysis.indicators.vwap || 0;
        const atrPercent = currentPrice > 0 ? (atr / currentPrice) * 100 : 2;

        const stopLossRecommended = currentPrice * (1 - Math.max(atrPercent * 1.5, this.params.stopLossPercent) / 100);
        const takeProfitRecommended = currentPrice * (1 + Math.max(atrPercent * 3, this.params.takeProfitPercent) / 100);

        return {
            symbol,
            timestamp: Date.now(),
            overallRisk,
            riskScore,
            volatilityRisk,
            liquidityRisk,
            correlationRisk,
            marketRisk,
            positionSizeRecommended,
            stopLossRecommended,
            takeProfitRecommended,
            warnings,
        };
    }

    private calculateVolatilityRisk(analysis: MarketAnalysis): number {
        let score = 0;

        // Based on volatility level
        const volatilityScores = { low: 10, medium: 30, high: 60, extreme: 90 };
        score += volatilityScores[analysis.volatility] || 50;

        // Bollinger Band width
        if (analysis.indicators.bollingerBands) {
            const bbWidth = analysis.indicators.bollingerBands.width;
            score = (score + Math.min(bbWidth * 10, 100)) / 2;
        }

        // ATR relative check
        if (analysis.indicators.atr && analysis.indicators.vwap) {
            const atrPercent = (analysis.indicators.atr / analysis.indicators.vwap) * 100;
            if (atrPercent > 5) score += 20;
            else if (atrPercent > 3) score += 10;
        }

        return Math.min(score, 100);
    }

    private calculateLiquidityRisk(analysis: MarketAnalysis): number {
        let score = 20; // Base score

        // Volume analysis
        if (analysis.indicators.volumeChange < -30) {
            score += 30; // Volume dropping significantly
        } else if (analysis.indicators.volumeChange < 0) {
            score += 15;
        }

        // Low volume in general increases risk
        if (analysis.indicators.volume24h < 1000000) {
            score += 40; // Very low volume
        } else if (analysis.indicators.volume24h < 10000000) {
            score += 20; // Low volume
        }

        return Math.min(score, 100);
    }

    private calculateCorrelationRisk(symbol: string, portfolio: Portfolio): number {
        // Simplified correlation check based on asset type
        const btcCorrelated = ['ETH', 'SOL', 'AVAX', 'MATIC', 'DOT'];
        const symbolBase = symbol.split('/')[0];

        let exposedToCorrelated = 0;
        for (const position of portfolio.positions) {
            const posBase = position.symbol.split('/')[0];
            if (btcCorrelated.includes(posBase) && btcCorrelated.includes(symbolBase)) {
                exposedToCorrelated += Math.abs(position.unrealizedPnl);
            }
        }

        // If already exposed to correlated assets
        const correlationExposure = portfolio.totalValueUSD > 0
            ? (exposedToCorrelated / portfolio.totalValueUSD) * 100
            : 0;

        return Math.min(correlationExposure * 2, 100);
    }

    private calculateMarketRisk(analysis: MarketAnalysis): number {
        let score = 30; // Base market risk

        // Weak trend is riskier for trend-following
        if (analysis.trendStrength < 30) {
            score += 20; // Choppy market
        }

        // Extreme RSI levels
        const rsi = analysis.indicators.rsi14;
        if (rsi) {
            if (rsi > 80 || rsi < 20) {
                score += 15; // Extreme levels
            }
        }

        // ADX below 20 = weak trend
        const adx = analysis.indicators.adx;
        if (adx && adx < 20) {
            score += 15;
        }

        // No clear signals = more risk
        if (analysis.signals.length === 0) {
            score += 10;
        }

        return Math.min(score, 100);
    }

    private categorizeRisk(score: number): 'low' | 'medium' | 'high' | 'extreme' {
        if (score < 30) return 'low';
        if (score < 50) return 'medium';
        if (score < 75) return 'high';
        return 'extreme';
    }

    private calculateRecommendedPositionSize(riskScore: number, portfolio: Portfolio): number {
        const baseSize = this.params.maxPositionSize;

        // Reduce position size based on risk
        let multiplier = 1;
        if (riskScore > 75) multiplier = 0.25;
        else if (riskScore > 50) multiplier = 0.5;
        else if (riskScore > 30) multiplier = 0.75;

        const recommendedPercent = baseSize * multiplier;
        return (portfolio.totalValueUSD * recommendedPercent) / 100;
    }

    // ==========================================
    // TRADE VALIDATION
    // ==========================================

    validateTrade(
        signal: TradingSignal,
        proposedSize: number,
        portfolio: Portfolio,
        riskAssessment: RiskAssessment
    ): { isValid: boolean; reason: string; adjustedSize?: number } {

        // Check if trading is blocked
        if (this.isTradeBlocked) {
            return { isValid: false, reason: this.blockReason };
        }

        // Check cooldown after loss
        if (this.dailyStats.lastLossTime) {
            const timeSinceLoss = (Date.now() - this.dailyStats.lastLossTime) / (1000 * 60);
            if (timeSinceLoss < this.params.cooldownAfterLoss) {
                return {
                    isValid: false,
                    reason: `Cooldown active: ${Math.ceil(this.params.cooldownAfterLoss - timeSinceLoss)} minutes remaining`
                };
            }
        }

        // Check daily loss limit
        const dailyLossPercent = this.calculateDailyLossPercent();
        if (dailyLossPercent >= this.params.maxDailyLoss) {
            this.blockTrading(`Daily loss limit reached (${dailyLossPercent.toFixed(1)}%)`);
            return { isValid: false, reason: 'Daily loss limit reached - trading suspended' };
        }

        // Check max open positions
        if (portfolio.positions.length >= this.params.maxOpenPositions) {
            return { isValid: false, reason: `Maximum positions (${this.params.maxOpenPositions}) reached` };
        }

        // Check signal confidence
        if (signal.confidence < 50) {
            return {
                isValid: false,
                reason: `Signal confidence too low (${signal.confidence}% < 50%)`
            };
        }

        // Check risk level
        if (riskAssessment.overallRisk === 'extreme') {
            return { isValid: false, reason: 'Extreme market risk - trade blocked' };
        }

        // Validate position size
        const maxSize = (portfolio.totalValueUSD * this.params.maxPositionSize) / 100;
        if (proposedSize > maxSize) {
            return {
                isValid: true,
                reason: `Position size reduced from $${proposedSize.toFixed(2)} to max $${maxSize.toFixed(2)}`,
                adjustedSize: maxSize
            };
        }

        // Check portfolio risk exposure
        const currentExposure = this.calculatePortfolioExposure(portfolio);
        if (currentExposure + (proposedSize / portfolio.totalValueUSD * 100) > this.params.maxPortfolioRisk) {
            const allowedSize = ((this.params.maxPortfolioRisk - currentExposure) / 100) * portfolio.totalValueUSD;
            if (allowedSize <= 0) {
                return { isValid: false, reason: 'Portfolio risk limit reached' };
            }
            return {
                isValid: true,
                reason: `Position size reduced due to portfolio risk limit`,
                adjustedSize: allowedSize
            };
        }

        return { isValid: true, reason: 'Trade validated successfully' };
    }

    private calculateDailyLossPercent(): number {
        if (this.dailyStats.startingBalance === 0) return 0;
        const loss = this.dailyStats.startingBalance - this.dailyStats.currentBalance;
        return (loss / this.dailyStats.startingBalance) * 100;
    }

    private calculatePortfolioExposure(portfolio: Portfolio): number {
        if (portfolio.totalValueUSD === 0) return 0;

        let totalExposure = 0;
        for (const position of portfolio.positions) {
            totalExposure += Math.abs(position.size * position.currentPrice);
        }

        return (totalExposure / portfolio.totalValueUSD) * 100;
    }

    // ==========================================
    // STOP LOSS & TAKE PROFIT
    // ==========================================

    calculateStopLoss(
        entryPrice: number,
        side: 'long' | 'short',
        analysis: MarketAnalysis
    ): number {
        const atr = analysis.indicators.atr || (entryPrice * 0.02);
        const atrMultiplier = 1.5;

        if (side === 'long') {
            // For longs, stop is below entry
            const atrStop = entryPrice - (atr * atrMultiplier);
            const percentStop = entryPrice * (1 - this.params.stopLossPercent / 100);

            // Use the tighter stop but not too tight
            return Math.max(atrStop, percentStop, entryPrice * 0.95);
        } else {
            // For shorts, stop is above entry
            const atrStop = entryPrice + (atr * atrMultiplier);
            const percentStop = entryPrice * (1 + this.params.stopLossPercent / 100);

            return Math.min(atrStop, percentStop, entryPrice * 1.05);
        }
    }

    calculateTakeProfit(
        entryPrice: number,
        side: 'long' | 'short',
        analysis: MarketAnalysis,
        riskRewardRatio: number = 2
    ): number {
        const atr = analysis.indicators.atr || (entryPrice * 0.02);
        const stopDistance = atr * 1.5;
        const targetDistance = stopDistance * riskRewardRatio;

        if (side === 'long') {
            return entryPrice + targetDistance;
        } else {
            return entryPrice - targetDistance;
        }
    }

    calculateTrailingStop(
        entryPrice: number,
        currentPrice: number,
        highestPrice: number,
        side: 'long' | 'short'
    ): number {
        const trailPercent = this.params.trailingStopPercent || 1.5;

        if (side === 'long') {
            return highestPrice * (1 - trailPercent / 100);
        } else {
            // For shorts, use lowest price instead
            return highestPrice * (1 + trailPercent / 100);
        }
    }

    // ==========================================
    // POSITION SIZING
    // ==========================================

    calculatePositionSize(
        portfolio: Portfolio,
        entryPrice: number,
        stopLossPrice: number,
        riskPercent?: number
    ): { size: number; riskAmount: number } {
        const riskPerTrade = riskPercent || 1; // Default 1% risk per trade
        const riskAmount = (portfolio.totalValueUSD * riskPerTrade) / 100;

        const stopLossPercent = Math.abs((entryPrice - stopLossPrice) / entryPrice);
        const positionValue = riskAmount / stopLossPercent;

        // Cap at max position size
        const maxValue = (portfolio.totalValueUSD * this.params.maxPositionSize) / 100;
        const finalValue = Math.min(positionValue, maxValue);

        const size = finalValue / entryPrice;

        return {
            size,
            riskAmount: finalValue * stopLossPercent,
        };
    }

    // ==========================================
    // DAILY STATS & MONITORING
    // ==========================================

    private initializeDailyStats(startingBalance: number): DailyStats {
        return {
            date: new Date().toISOString().split('T')[0],
            startingBalance,
            currentBalance: startingBalance,
            realizedPnL: 0,
            trades: 0,
            winningTrades: 0,
            losingTrades: 0,
        };
    }

    // Track the first balance seen on a new day so subsequent intra-day
    // updates don't overwrite startingBalance (which masked real drawdown).
    private startOfDayBalanceRecorded = false;

    updateBalance(newBalance: number): void {
        const today = new Date().toISOString().split('T')[0];

        if (this.dailyStats.date !== today) {
            // First update of a new day: seed with this balance.
            this.dailyStats = this.initializeDailyStats(newBalance);
            this.startOfDayBalanceRecorded = true;
            this.isTradeBlocked = false;
            this.blockReason = '';
        } else if (!this.startOfDayBalanceRecorded) {
            // First-ever observation. Treat as start-of-day baseline.
            this.dailyStats.startingBalance = newBalance;
            this.startOfDayBalanceRecorded = true;
        }

        this.dailyStats.currentBalance = newBalance;
    }

    recordTrade(pnl: number): void {
        this.dailyStats.trades++;
        this.dailyStats.realizedPnL += pnl;

        if (pnl >= 0) {
            this.dailyStats.winningTrades++;
        } else {
            this.dailyStats.losingTrades++;
            this.dailyStats.lastLossTime = Date.now();
        }

        this.dailyStats.currentBalance += pnl;
    }

    blockTrading(reason: string): void {
        this.isTradeBlocked = true;
        this.blockReason = reason;
        this.createAlert('risk', 'critical', 'Trading Blocked', reason);
    }

    unblockTrading(): void {
        this.isTradeBlocked = false;
        this.blockReason = '';
    }

    // ==========================================
    // ALERTS
    // ==========================================

    private createAlert(
        type: Alert['type'],
        severity: Alert['severity'],
        title: string,
        message: string
    ): void {
        this.alerts.push({
            id: `alert_${Date.now()}`,
            type,
            severity,
            title,
            message,
            timestamp: Date.now(),
            acknowledged: false,
            actionRequired: severity === 'critical',
        });
    }

    getAlerts(): Alert[] {
        return this.alerts;
    }

    acknowledgeAlert(alertId: string): void {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
        }
    }

    // ==========================================
    // GETTERS
    // ==========================================

    getParameters(): RiskParameters {
        return { ...this.params };
    }

    updateParameters(newParams: Partial<RiskParameters>): void {
        this.params = { ...this.params, ...newParams };
    }

    getDailyStats(): DailyStats {
        return { ...this.dailyStats };
    }

    isBlocked(): { blocked: boolean; reason: string } {
        return { blocked: this.isTradeBlocked, reason: this.blockReason };
    }
}

export const riskService = new RiskManagementService();
export default riskService;
