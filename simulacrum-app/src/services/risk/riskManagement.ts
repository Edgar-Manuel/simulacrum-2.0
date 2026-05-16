// ============================================
// RISK MANAGEMENT SERVICE
// Controls position sizing, stop-loss, and risk parameters
// ============================================

import { riskService } from '../trading/riskService';

export interface RiskConfig {
    // Position Sizing
    maxPositionSizePercent: number;     // Max % of portfolio per trade (default: 2%)
    maxDailyLossPercent: number;        // Max daily loss before stopping (default: 5%)
    maxOpenPositions: number;           // Max concurrent positions (default: 3)

    // Stop-Loss & Take-Profit
    defaultStopLossPercent: number;     // Default stop-loss % (default: 2%)
    defaultTakeProfitPercent: number;   // Default take-profit % (default: 4%)
    useTrailingStop: boolean;           // Enable trailing stop (default: true)
    trailingStopPercent: number;        // Trailing stop distance % (default: 1.5%)

    // Signal Filtering
    minConfidenceThreshold: number;     // Min AI confidence to trade (default: 75%)
    requireMultiAgentConsensus: boolean; // Require 3+ agents to agree (default: true)
    minTrendStrength: number;           // Min trend strength % (default: 60%)

    // Volatility Adjustment
    adjustForVolatility: boolean;       // Reduce size in high volatility (default: true)
    highVolatilityThreshold: number;    // % to consider "high volatility" (default: 3%)
    volatilityPositionReduction: number; // Reduce position by this % in high vol (default: 50%)
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
    // 🔧 INCREASED for small capital (€91.62) - need at least €5-10 per trade for Binance minimums
    maxPositionSizePercent: 10,         // INCREASED from 2% to 10% for small accounts
    maxDailyLossPercent: 5,             // Stop trading if -5% daily
    maxOpenPositions: 3,

    // Tight risk controls
    defaultStopLossPercent: 2,          // 2% stop-loss
    defaultTakeProfitPercent: 4,        // 4% take-profit (2:1 risk/reward)
    useTrailingStop: true,
    trailingStopPercent: 1.5,

    // 🔧 Signal filtering - synced with UI defaults
    minConfidenceThreshold: 65,         // UI default: 65% confidence minimum
    requireMultiAgentConsensus: false,  // DISABLED: Allow single signal trades
    minTrendStrength: 30,               // 30% trend strength (for contrarian signals)

    // Volatility protection
    adjustForVolatility: true,
    highVolatilityThreshold: 3,
    volatilityPositionReduction: 50,
};

class RiskManagementService {
    private config: RiskConfig = DEFAULT_RISK_CONFIG;
    private dailyPnL: number = 0;
    private openPositions: Map<string, {
        size: number;
        entryPrice: number;
        stopLoss: number;
        takeProfit: number;
        side: 'buy' | 'sell';
        orderId?: string;
        stopLossOrderId?: string;
        takeProfitOrderId?: string;
    }> = new Map();
    private tradeHistory: { timestamp: number; pnl: number }[] = [];

    // 🆕 Historial de trades recientes para evitar duplicados
    private recentTrades: Array<{
        symbol: string;
        side: 'buy' | 'sell';
        entryPrice: number;
        timestamp: number;
    }> = [];

    // Configuración de anti-duplicados
    private readonly SIMILAR_TRADE_THRESHOLD_PERCENT = 3; // Trades a menos de 3% son considerados similares
    private readonly TRADE_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutos cooldown por símbolo

    // ==========================================
    // CONFIGURATION
    // ==========================================

    getConfig(): RiskConfig {
        return { ...this.config };
    }

    updateConfig(updates: Partial<RiskConfig>): void {
        this.config = { ...this.config, ...updates };
        console.log('📊 Risk config updated:', this.config);
    }

    // ==========================================
    // POSITION SIZING
    // ==========================================

    calculatePositionSize(
        portfolioValueUSD: number,
        currentPrice: number,
        volatility24h: number = 0
    ): { amount: number; maxRiskUSD: number; reason: string } {
        let positionPercent = this.config.maxPositionSizePercent;
        let reason = `Base: ${positionPercent}% del portafolio`;

        // Reduce size in high volatility
        if (this.config.adjustForVolatility && volatility24h > this.config.highVolatilityThreshold) {
            const reduction = this.config.volatilityPositionReduction / 100;
            positionPercent = positionPercent * (1 - reduction);
            reason += ` | Reducido por volatilidad alta (${volatility24h.toFixed(1)}%)`;
        }

        // Calculate position value in USD
        const positionValueUSD = (portfolioValueUSD * positionPercent) / 100;

        // Calculate amount in base currency
        const amount = positionValueUSD / currentPrice;

        // Calculate max risk based on stop-loss
        const maxRiskUSD = positionValueUSD * (this.config.defaultStopLossPercent / 100);

        return {
            amount: Number(amount.toFixed(6)),
            maxRiskUSD: Number(maxRiskUSD.toFixed(2)),
            reason,
        };
    }

    // ==========================================
    // STOP-LOSS & TAKE-PROFIT
    // ==========================================

    calculateStopLoss(entryPrice: number, side: 'buy' | 'sell'): number {
        const slPercent = this.config.defaultStopLossPercent / 100;

        if (side === 'buy') {
            // For longs, stop-loss is below entry
            return Number((entryPrice * (1 - slPercent)).toFixed(2));
        } else {
            // For shorts, stop-loss is above entry
            return Number((entryPrice * (1 + slPercent)).toFixed(2));
        }
    }

    calculateTakeProfit(entryPrice: number, side: 'buy' | 'sell'): number {
        const tpPercent = this.config.defaultTakeProfitPercent / 100;

        if (side === 'buy') {
            // For longs, take-profit is above entry
            return Number((entryPrice * (1 + tpPercent)).toFixed(2));
        } else {
            // For shorts, take-profit is below entry
            return Number((entryPrice * (1 - tpPercent)).toFixed(2));
        }
    }

    calculateTrailingStop(currentPrice: number, highestPrice: number, side: 'buy' | 'sell'): number {
        const tsPercent = this.config.trailingStopPercent / 100;

        if (side === 'buy') {
            // Trail below the highest price reached
            return Number((highestPrice * (1 - tsPercent)).toFixed(2));
        } else {
            // Trail above the lowest price reached (for shorts)
            return Number((highestPrice * (1 + tsPercent)).toFixed(2));
        }
    }

    // ==========================================
    // SIGNAL VALIDATION
    // ==========================================

    shouldExecuteTrade(
        confidence: number,
        trendStrength: number,
        agentAgreement: number, // Number of agents agreeing
        totalAgents: number = 6
    ): { approved: boolean; reason: string } {
        const reasons: string[] = [];

        // Check confidence threshold
        if (confidence < this.config.minConfidenceThreshold) {
            return {
                approved: false,
                reason: `⛔ Confianza insuficiente: ${confidence}% < ${this.config.minConfidenceThreshold}% mínimo`,
            };
        }
        reasons.push(`✅ Confianza: ${confidence}%`);

        // Check trend strength
        if (trendStrength < this.config.minTrendStrength) {
            return {
                approved: false,
                reason: `⛔ Tendencia débil: ${trendStrength}% < ${this.config.minTrendStrength}% mínimo`,
            };
        }
        reasons.push(`✅ Fuerza de tendencia: ${trendStrength}%`);

        // Check multi-agent consensus
        if (this.config.requireMultiAgentConsensus) {
            const minAgents = Math.ceil(totalAgents / 2); // Majority required
            if (agentAgreement < minAgents) {
                return {
                    approved: false,
                    reason: `⛔ Consenso insuficiente: ${agentAgreement}/${totalAgents} agentes (se requieren ${minAgents}+)`,
                };
            }
            reasons.push(`✅ Consenso: ${agentAgreement}/${totalAgents} agentes`);
        }

        // Check daily loss limit
        if (this.dailyPnL < -(this.config.maxDailyLossPercent)) {
            return {
                approved: false,
                reason: `⛔ Límite de pérdida diaria alcanzado: ${this.dailyPnL.toFixed(2)}%`,
            };
        }

        // Check max open positions
        if (this.openPositions.size >= this.config.maxOpenPositions) {
            return {
                approved: false,
                reason: `⛔ Máximo de posiciones abiertas alcanzado: ${this.openPositions.size}/${this.config.maxOpenPositions}`,
            };
        }

        return {
            approved: true,
            reason: reasons.join(' | '),
        };
    }

    // ==========================================
    // POSITION TRACKING
    // ==========================================

    openPosition(
        symbol: string,
        size: number,
        entryPrice: number,
        side: 'buy' | 'sell',
        orderId?: string
    ): void {
        this.openPositions.set(symbol, {
            size,
            entryPrice,
            stopLoss: this.calculateStopLoss(entryPrice, side),
            takeProfit: this.calculateTakeProfit(entryPrice, side),
            side,
            orderId,
        });

        // 🆕 Registrar en historial de trades recientes
        this.recentTrades.push({
            symbol,
            side,
            entryPrice,
            timestamp: Date.now()
        });

        // Limpiar trades más viejos que el cooldown configurado. Antes se
        // limpiaba a las 2h pero el cooldown era 30 min, lo que mantenía el
        // bloqueo "similar trade" 90 min de más.
        const cutoff = Date.now() - this.TRADE_COOLDOWN_MS;
        this.recentTrades = this.recentTrades.filter(t => t.timestamp > cutoff);

        console.log(`📈 Position opened: ${symbol} ${side.toUpperCase()} ${size} @ ${entryPrice} [ID: ${orderId}]`);
    }

    closePosition(symbol: string, exitPrice: number): number {
        const position = this.openPositions.get(symbol);
        if (!position) return 0;

        // Respect side: shorts profit when exit < entry.
        const direction = position.side === 'sell' ? -1 : 1;
        const pnl = direction * (exitPrice - position.entryPrice) * position.size;
        this.dailyPnL += pnl;
        this.tradeHistory.push({ timestamp: Date.now(), pnl });
        this.openPositions.delete(symbol);

        // Notify the trading risk service so its cooldown-after-loss /
        // daily-loss circuit-breaker actually fires.
        try {
            riskService.recordTrade(pnl);
        } catch {
            // best-effort — don't fail the close
        }

        console.log(`📉 Position closed: ${symbol} PnL: $${pnl.toFixed(2)}`);
        return pnl;
    }

    getOpenPositions(): Map<string, {
        size: number;
        entryPrice: number;
        stopLoss: number;
        takeProfit: number;
        side: 'buy' | 'sell';
        orderId?: string;
        stopLossOrderId?: string;
        takeProfitOrderId?: string;
    }> {
        return new Map(this.openPositions);
    }

    // ==========================================
    // RISK METRICS
    // ==========================================

    getRiskMetrics(): {
        dailyPnL: number;
        openPositionsCount: number;
        totalExposure: number;
        riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    } {
        let totalExposure = 0;
        this.openPositions.forEach(pos => {
            totalExposure += pos.size * pos.entryPrice;
        });

        let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
        if (this.openPositions.size >= 2 || Math.abs(this.dailyPnL) > 2) {
            riskLevel = 'MEDIUM';
        }
        if (this.openPositions.size >= 3 || Math.abs(this.dailyPnL) > 4) {
            riskLevel = 'HIGH';
        }

        return {
            dailyPnL: this.dailyPnL,
            openPositionsCount: this.openPositions.size,
            totalExposure,
            riskLevel,
        };
    }

    // ==========================================
    // 🆕 DUPLICATE/SIMILAR TRADE VALIDATION
    // ==========================================

    canOpenNewTrade(
        symbol: string,
        side: 'buy' | 'sell',
        entryPrice: number
    ): { allowed: boolean; reason: string } {
        // 1️⃣ Check max open positions
        if (this.openPositions.size >= this.config.maxOpenPositions) {
            return {
                allowed: false,
                reason: `⛔ MAX POSITIONS: Ya tienes ${this.openPositions.size}/${this.config.maxOpenPositions} posiciones abiertas`
            };
        }

        // 2️⃣ Check if same symbol already has open position
        const existingPosition = this.openPositions.get(symbol);
        if (existingPosition) {
            return {
                allowed: false,
                reason: `⛔ DUPLICATE: Ya existe posición ${existingPosition.side.toUpperCase()} en ${symbol} @ ${existingPosition.entryPrice}`
            };
        }

        // 3️⃣ Check cooldown - no trades on same symbol within 30 minutes
        const now = Date.now();
        const recentSameSymbol = this.recentTrades.find(
            trade => trade.symbol === symbol &&
                (now - trade.timestamp) < this.TRADE_COOLDOWN_MS
        );
        if (recentSameSymbol) {
            const minutesAgo = Math.round((now - recentSameSymbol.timestamp) / 60000);
            const cooldownLeft = Math.round((this.TRADE_COOLDOWN_MS - (now - recentSameSymbol.timestamp)) / 60000);
            return {
                allowed: false,
                reason: `⏰ COOLDOWN: Trade en ${symbol} hace ${minutesAgo} min. Esperar ${cooldownLeft} min más.`
            };
        }

        // 4️⃣ Check for similar trades (same SYMBOL, same direction, price within threshold).
        // Previously this missed the symbol check, so e.g. an ETH buy at 3000
        // would block a BTC buy at 3001 because the price was within 3%.
        const similarTrade = this.recentTrades.find(trade => {
            if (trade.symbol !== symbol) return false;
            if (trade.side !== side) return false;
            const priceDiff = Math.abs((entryPrice - trade.entryPrice) / trade.entryPrice) * 100;
            return priceDiff < this.SIMILAR_TRADE_THRESHOLD_PERCENT;
        });
        if (similarTrade) {
            const priceDiff = ((entryPrice - similarTrade.entryPrice) / similarTrade.entryPrice * 100).toFixed(2);
            return {
                allowed: false,
                reason: `🔄 SIMILAR: Trade ${side.toUpperCase()} muy similar a ${similarTrade.symbol} @ ${similarTrade.entryPrice} (${priceDiff}% diferencia)`
            };
        }

        // ✅ All checks passed
        return {
            allowed: true,
            reason: `✅ Trade permitido: ${symbol} ${side.toUpperCase()} @ ${entryPrice}`
        };
    }

    // Reset daily stats (call at start of trading day)
    resetDaily(): void {
        this.dailyPnL = 0;
        this.tradeHistory = [];
        this.recentTrades = []; // Also clear recent trades
        console.log('🔄 Daily risk stats reset');
    }
}

export const riskManagement = new RiskManagementService();
export default riskManagement;
