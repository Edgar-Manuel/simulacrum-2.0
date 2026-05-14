// ============================================
// BACKTESTING SERVICE
// Test strategies before going live
// ============================================

import type {
    Strategy,
    StrategyPerformance,
    BacktestConfig,
    BacktestResult,
    BacktestTrade,
    MarketData,
    TechnicalIndicators,
    OrderSide,
} from '../../types/trading';
import { indicatorService } from '../trading/indicatorService';

class BacktestingService {
    private historicalData: Map<string, MarketData[]> = new Map();

    // ==========================================
    // RUN BACKTEST
    // ==========================================

    async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
        console.log(`🔄 Starting backtest for ${config.strategy.name} on ${config.symbol}`);
        console.log(`   Period: ${config.startDate.toISOString()} to ${config.endDate.toISOString()}`);

        const trades: BacktestTrade[] = [];
        const equityCurve: { timestamp: number; value: number }[] = [];
        const drawdownCurve: { timestamp: number; value: number }[] = [];

        let equity = config.initialCapital;
        let peakEquity = equity;
        let position: { side: OrderSide; size: number; entryPrice: number; entryTime: number } | null = null;

        // Get or simulate historical data
        let candles = this.historicalData.get(config.symbol);
        if (!candles || candles.length < 200) {
            candles = this.generateMockData(config.symbol, config.startDate, config.endDate);
            this.historicalData.set(config.symbol, candles);
        }

        // Filter candles for backtest period
        const startTimestamp = config.startDate.getTime();
        const endTimestamp = config.endDate.getTime();
        const testCandles = candles.filter(c => c.timestamp >= startTimestamp && c.timestamp <= endTimestamp);

        if (testCandles.length < 200) {
            console.warn('Insufficient data for backtest, using available data');
        }

        // Run through each candle
        for (let i = 200; i < testCandles.length; i++) {
            const lookback = testCandles.slice(i - 200, i);
            const currentCandle = testCandles[i];
            const currentPrice = currentCandle.close;

            // Calculate indicators
            const indicators = indicatorService.calculateIndicators(lookback);

            // Record equity
            if (position) {
                const unrealizedPnL = position.side === 'buy'
                    ? (currentPrice - position.entryPrice) * position.size
                    : (position.entryPrice - currentPrice) * position.size;
                const currentEquity = equity + unrealizedPnL;
                equityCurve.push({ timestamp: currentCandle.timestamp, value: currentEquity });

                // Calculate drawdown
                peakEquity = Math.max(peakEquity, currentEquity);
                const drawdown = ((peakEquity - currentEquity) / peakEquity) * 100;
                drawdownCurve.push({ timestamp: currentCandle.timestamp, value: drawdown });
            } else {
                equityCurve.push({ timestamp: currentCandle.timestamp, value: equity });
                drawdownCurve.push({ timestamp: currentCandle.timestamp, value: 0 });
            }

            // Check for exit conditions if in position
            if (position) {
                const { shouldExit, reason } = this.checkExitConditions(
                    position,
                    currentPrice,
                    indicators,
                    config.strategy
                );

                if (shouldExit) {
                    // Close position
                    const pnl = position.side === 'buy'
                        ? (currentPrice - position.entryPrice) * position.size
                        : (position.entryPrice - currentPrice) * position.size;

                    // Apply commission and slippage
                    const costs = currentPrice * position.size * (config.commission / 100) +
                        currentPrice * position.size * (config.slippage / 100);
                    const netPnl = pnl - costs;

                    equity += netPnl;

                    trades.push({
                        entryTime: position.entryTime,
                        exitTime: currentCandle.timestamp,
                        entryPrice: position.entryPrice,
                        exitPrice: currentPrice,
                        side: position.side,
                        size: position.size,
                        pnl: netPnl,
                        pnlPercent: (netPnl / (position.entryPrice * position.size)) * 100,
                        reason,
                    });

                    position = null;
                }
            }

            // Check for entry conditions if not in position
            if (!position) {
                const { shouldEnter, side } = this.checkEntryConditions(
                    indicators,
                    currentPrice,
                    config.strategy
                );

                if (shouldEnter && side) {
                    // Calculate position size
                    const positionValue = equity * (config.strategy.riskParameters.maxPositionSize / 100);
                    const size = positionValue / currentPrice;

                    // Apply slippage to entry
                    const slippagePrice = side === 'buy'
                        ? currentPrice * (1 + config.slippage / 100)
                        : currentPrice * (1 - config.slippage / 100);

                    position = {
                        side,
                        size,
                        entryPrice: slippagePrice,
                        entryTime: currentCandle.timestamp,
                    };
                }
            }
        }

        // Close any remaining position at end
        if (position) {
            const lastPrice = testCandles[testCandles.length - 1].close;
            const pnl = position.side === 'buy'
                ? (lastPrice - position.entryPrice) * position.size
                : (position.entryPrice - lastPrice) * position.size;

            const costs = lastPrice * position.size * (config.commission / 100);
            equity += pnl - costs;

            trades.push({
                entryTime: position.entryTime,
                exitTime: testCandles[testCandles.length - 1].timestamp,
                entryPrice: position.entryPrice,
                exitPrice: lastPrice,
                side: position.side,
                size: position.size,
                pnl: pnl - costs,
                pnlPercent: ((pnl - costs) / (position.entryPrice * position.size)) * 100,
                reason: 'End of backtest period',
            });
        }

        // Calculate performance metrics
        const performance = this.calculatePerformance(trades, config.initialCapital, equity);

        // Calculate monthly returns
        const monthlyReturns = this.calculateMonthlyReturns(equityCurve, config.initialCapital);

        console.log(`✅ Backtest complete: ${trades.length} trades, ${performance.winRate.toFixed(1)}% win rate, ${performance.totalPnLPercent.toFixed(2)}% total return`);

        return {
            config,
            performance,
            trades,
            equityCurve,
            drawdownCurve,
            monthlyReturns,
        };
    }

    // ==========================================
    // ENTRY/EXIT LOGIC
    // ==========================================

    private checkEntryConditions(
        indicators: TechnicalIndicators,
        currentPrice: number,
        strategy: Strategy
    ): { shouldEnter: boolean; side: OrderSide | null } {

        // Strategy-based entry logic
        switch (strategy.type) {
            case 'trend_following':
                return this.trendFollowingEntry(indicators, currentPrice);
            case 'mean_reversion':
                return this.meanReversionEntry(indicators, currentPrice);
            case 'momentum':
                return this.momentumEntry(indicators, currentPrice);
            default:
                return this.defaultEntry(indicators, currentPrice);
        }
    }

    private trendFollowingEntry(
        indicators: TechnicalIndicators,
        currentPrice: number
    ): { shouldEnter: boolean; side: OrderSide | null } {
        // EMA crossover + RSI filter
        if (!indicators.ema9 || !indicators.ema21 || !indicators.rsi14) {
            return { shouldEnter: false, side: null };
        }

        // Bullish: EMA9 > EMA21 and RSI not overbought
        if (indicators.ema9 > indicators.ema21 && indicators.rsi14 < 70 && indicators.rsi14 > 40) {
            // Additional confirmation: price above EMA50
            if (indicators.ema50 && currentPrice > indicators.ema50) {
                return { shouldEnter: true, side: 'buy' };
            }
        }

        // Bearish: EMA9 < EMA21 and RSI not oversold
        if (indicators.ema9 < indicators.ema21 && indicators.rsi14 > 30 && indicators.rsi14 < 60) {
            if (indicators.ema50 && currentPrice < indicators.ema50) {
                return { shouldEnter: true, side: 'sell' };
            }
        }

        return { shouldEnter: false, side: null };
    }

    private meanReversionEntry(
        indicators: TechnicalIndicators,
        currentPrice: number
    ): { shouldEnter: boolean; side: OrderSide | null } {
        if (!indicators.bollingerBands || !indicators.rsi14) {
            return { shouldEnter: false, side: null };
        }

        const bb = indicators.bollingerBands;

        // Buy when price touches lower BB and RSI is oversold
        if (currentPrice <= bb.lower && indicators.rsi14 < 30) {
            return { shouldEnter: true, side: 'buy' };
        }

        // Sell when price touches upper BB and RSI is overbought
        if (currentPrice >= bb.upper && indicators.rsi14 > 70) {
            return { shouldEnter: true, side: 'sell' };
        }

        return { shouldEnter: false, side: null };
    }

    private momentumEntry(
        indicators: TechnicalIndicators,
        currentPrice: number
    ): { shouldEnter: boolean; side: OrderSide | null } {
        if (!indicators.macd || !indicators.rsi14 || !indicators.adx) {
            return { shouldEnter: false, side: null };
        }

        // Strong trend condition
        if (indicators.adx < 25) {
            return { shouldEnter: false, side: null };
        }

        // MACD bullish crossover with strong RSI
        if (indicators.macd.histogram > 0 && indicators.macd.macd > indicators.macd.signal) {
            if (indicators.rsi14 > 50 && indicators.rsi14 < 75) {
                return { shouldEnter: true, side: 'buy' };
            }
        }

        // MACD bearish crossover with weak RSI
        if (indicators.macd.histogram < 0 && indicators.macd.macd < indicators.macd.signal) {
            if (indicators.rsi14 < 50 && indicators.rsi14 > 25) {
                return { shouldEnter: true, side: 'sell' };
            }
        }

        return { shouldEnter: false, side: null };
    }

    private defaultEntry(
        indicators: TechnicalIndicators,
        currentPrice: number
    ): { shouldEnter: boolean; side: OrderSide | null } {
        // Simple RSI-based entry
        if (!indicators.rsi14) {
            return { shouldEnter: false, side: null };
        }

        if (indicators.rsi14 < 25) {
            return { shouldEnter: true, side: 'buy' };
        }

        if (indicators.rsi14 > 75) {
            return { shouldEnter: true, side: 'sell' };
        }

        return { shouldEnter: false, side: null };
    }

    private checkExitConditions(
        position: { side: OrderSide; size: number; entryPrice: number; entryTime: number },
        currentPrice: number,
        indicators: TechnicalIndicators,
        strategy: Strategy
    ): { shouldExit: boolean; reason: string } {
        const { stopLossPercent, takeProfitPercent } = strategy.riskParameters;

        // Calculate P&L percentage
        const pnlPercent = position.side === 'buy'
            ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
            : ((position.entryPrice - currentPrice) / position.entryPrice) * 100;

        // Stop loss
        if (pnlPercent <= -stopLossPercent) {
            return { shouldExit: true, reason: 'Stop loss hit' };
        }

        // Take profit
        if (pnlPercent >= takeProfitPercent) {
            return { shouldExit: true, reason: 'Take profit hit' };
        }

        // Technical exit signals
        if (indicators.rsi14) {
            // Exit long if RSI becomes overbought
            if (position.side === 'buy' && indicators.rsi14 > 75) {
                return { shouldExit: true, reason: 'RSI overbought exit' };
            }
            // Exit short if RSI becomes oversold
            if (position.side === 'sell' && indicators.rsi14 < 25) {
                return { shouldExit: true, reason: 'RSI oversold exit' };
            }
        }

        // EMA crossover exit
        if (indicators.ema9 && indicators.ema21) {
            if (position.side === 'buy' && indicators.ema9 < indicators.ema21) {
                return { shouldExit: true, reason: 'EMA bearish crossover' };
            }
            if (position.side === 'sell' && indicators.ema9 > indicators.ema21) {
                return { shouldExit: true, reason: 'EMA bullish crossover' };
            }
        }

        return { shouldExit: false, reason: '' };
    }

    // ==========================================
    // PERFORMANCE CALCULATION
    // ==========================================

    private calculatePerformance(
        trades: BacktestTrade[],
        initialCapital: number,
        finalEquity: number
    ): StrategyPerformance {
        const winningTrades = trades.filter(t => t.pnl > 0);
        const losingTrades = trades.filter(t => t.pnl <= 0);

        const totalPnL = finalEquity - initialCapital;
        const totalPnLPercent = (totalPnL / initialCapital) * 100;

        const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;

        const avgWin = winningTrades.length > 0
            ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length
            : 0;

        const avgLoss = losingTrades.length > 0
            ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length)
            : 0;

        const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : 0;

        // Calculate max drawdown
        let peak = initialCapital;
        let maxDrawdown = 0;
        let runningEquity = initialCapital;

        for (const trade of trades) {
            runningEquity += trade.pnl;
            peak = Math.max(peak, runningEquity);
            const drawdown = ((peak - runningEquity) / peak) * 100;
            maxDrawdown = Math.max(maxDrawdown, drawdown);
        }

        // Calculate Sharpe Ratio (simplified, assuming 0 risk-free rate)
        const returns = trades.map(t => t.pnlPercent);
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length || 0;
        const stdDev = Math.sqrt(
            returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length || 1
        );
        const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

        // Average holding time
        const avgHoldingTime = trades.length > 0
            ? trades.reduce((sum, t) => sum + (t.exitTime - t.entryTime), 0) / trades.length / (1000 * 60)
            : 0;

        return {
            totalTrades: trades.length,
            winningTrades: winningTrades.length,
            losingTrades: losingTrades.length,
            winRate,
            totalPnL,
            totalPnLPercent,
            maxDrawdown,
            sharpeRatio,
            profitFactor,
            avgWin,
            avgLoss,
            avgHoldingTime,
        };
    }

    private calculateMonthlyReturns(
        equityCurve: { timestamp: number; value: number }[],
        initialCapital: number
    ): { month: string; return: number }[] {
        const monthlyReturns: { month: string; return: number }[] = [];
        let monthStart = initialCapital;

        for (let i = 1; i < equityCurve.length; i++) {
            const prevDate = new Date(equityCurve[i - 1].timestamp);
            const currDate = new Date(equityCurve[i].timestamp);

            if (currDate.getMonth() !== prevDate.getMonth()) {
                const monthEnd = equityCurve[i - 1].value;
                const monthReturn = ((monthEnd - monthStart) / monthStart) * 100;

                monthlyReturns.push({
                    month: `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`,
                    return: monthReturn,
                });

                monthStart = monthEnd;
            }
        }

        return monthlyReturns;
    }

    // ==========================================
    // MOCK DATA GENERATION
    // ==========================================

    private generateMockData(
        symbol: string,
        startDate: Date,
        endDate: Date
    ): MarketData[] {
        const candles: MarketData[] = [];
        const msPerHour = 60 * 60 * 1000;

        // Starting price based on symbol
        let price = symbol.includes('BTC') ? 45000 : symbol.includes('ETH') ? 2500 : 100;
        const volatility = 0.02; // 2% volatility per candle

        let currentTime = startDate.getTime();

        while (currentTime <= endDate.getTime()) {
            // Random walk with mean reversion
            const change = (Math.random() - 0.5) * 2 * volatility;
            const meanReversion = (price > price * 1.1 ? -0.001 : price < price * 0.9 ? 0.001 : 0);

            const open = price;
            price = price * (1 + change + meanReversion);
            const close = price;
            const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
            const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
            const volume = 1000000 + Math.random() * 5000000;

            candles.push({
                symbol,
                timestamp: currentTime,
                open,
                high,
                low,
                close,
                volume,
            });

            currentTime += msPerHour;
        }

        return candles;
    }

    // ==========================================
    // DATA MANAGEMENT
    // ==========================================

    loadHistoricalData(symbol: string, candles: MarketData[]): void {
        this.historicalData.set(symbol, candles);
    }

    clearData(): void {
        this.historicalData.clear();
    }
}

export const backtestService = new BacktestingService();
export default backtestService;
