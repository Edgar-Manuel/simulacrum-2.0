// ============================================
// TECHNICAL INDICATORS SERVICE
// Real market analysis with professional indicators
// ============================================

import {
    RSI,
    MACD,
    EMA,
    SMA,
    BollingerBands,
    ATR,
    ADX,
    Stochastic,
    OBV,
    VWAP,
    CrossUp,
    CrossDown,
} from 'technicalindicators';

import type { MarketData, TechnicalIndicators, MarketAnalysis, TradingSignal, SignalType, SignalStrength } from '../../types/trading';
import type { RiskConfig } from '../risk/riskManagement';

class IndicatorService {

    // ==========================================
    // CALCULATE ALL INDICATORS
    // ==========================================

    calculateIndicators(candles: MarketData[]): TechnicalIndicators {
        if (candles.length < 200) {
            console.warn('Need at least 200 candles for accurate indicators');
        }

        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        const volumes = candles.map(c => c.volume);

        // RSI
        const rsi14Values = RSI.calculate({ values: closes, period: 14 });
        const rsi14 = rsi14Values[rsi14Values.length - 1] || null;

        // MACD
        const macdResult = MACD.calculate({
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false,
        });
        const macdLatest = macdResult[macdResult.length - 1];
        const macd = macdLatest ? {
            macd: macdLatest.MACD || 0,
            signal: macdLatest.signal || 0,
            histogram: macdLatest.histogram || 0,
        } : null;

        // EMAs
        const ema9Values = EMA.calculate({ values: closes, period: 9 });
        const ema21Values = EMA.calculate({ values: closes, period: 21 });
        const ema50Values = EMA.calculate({ values: closes, period: 50 });
        const ema200Values = EMA.calculate({ values: closes, period: 200 });

        // SMAs
        const sma20Values = SMA.calculate({ values: closes, period: 20 });
        const sma50Values = SMA.calculate({ values: closes, period: 50 });
        const sma200Values = SMA.calculate({ values: closes, period: 200 });

        // Bollinger Bands
        const bbResult = BollingerBands.calculate({
            values: closes,
            period: 20,
            stdDev: 2,
        });
        const bbLatest = bbResult[bbResult.length - 1];
        const bollingerBands = bbLatest ? {
            upper: bbLatest.upper,
            middle: bbLatest.middle,
            lower: bbLatest.lower,
            width: ((bbLatest.upper - bbLatest.lower) / bbLatest.middle) * 100,
        } : null;

        // ATR
        const atrValues = ATR.calculate({
            high: highs,
            low: lows,
            close: closes,
            period: 14,
        });
        const atr = atrValues[atrValues.length - 1] || null;

        // ADX
        const adxValues = ADX.calculate({
            high: highs,
            low: lows,
            close: closes,
            period: 14,
        });
        const adxLatest = adxValues[adxValues.length - 1];
        const adx = adxLatest?.adx || null;

        // Stochastic
        const stochResult = Stochastic.calculate({
            high: highs,
            low: lows,
            close: closes,
            period: 14,
            signalPeriod: 3,
        });
        const stochLatest = stochResult[stochResult.length - 1];
        const stochastic = stochLatest ? {
            k: stochLatest.k,
            d: stochLatest.d,
        } : null;

        // OBV
        const obvValues = OBV.calculate({
            close: closes,
            volume: volumes,
        });
        const obv = obvValues[obvValues.length - 1] || null;

        // VWAP (simplified - daily)
        const vwap = this.calculateVWAP(candles);

        // Volume analysis
        const volume24h = volumes.slice(-24).reduce((a, b) => a + b, 0);
        const volumePrev24h = volumes.slice(-48, -24).reduce((a, b) => a + b, 0);
        const volumeChange = volumePrev24h > 0 ? ((volume24h - volumePrev24h) / volumePrev24h) * 100 : 0;

        return {
            rsi: rsi14,
            rsi14,
            macd,
            ema9: ema9Values[ema9Values.length - 1] || null,
            ema21: ema21Values[ema21Values.length - 1] || null,
            ema50: ema50Values[ema50Values.length - 1] || null,
            ema200: ema200Values[ema200Values.length - 1] || null,
            sma20: sma20Values[sma20Values.length - 1] || null,
            sma50: sma50Values[sma50Values.length - 1] || null,
            sma200: sma200Values[sma200Values.length - 1] || null,
            bollingerBands,
            atr,
            adx,
            stochastic,
            vwap,
            obv,
            volume24h,
            volumeChange,
        };
    }

    // ==========================================
    // MARKET ANALYSIS
    // ==========================================

    analyzeMarket(symbol: string, candles: MarketData[], riskConfig?: RiskConfig, fearGreedIndex?: number): MarketAnalysis {
        const indicators = this.calculateIndicators(candles);
        const currentPrice = candles[candles.length - 1].close;

        // 🎯 Add Fear & Greed Index to indicators for contrarian signals
        if (fearGreedIndex !== undefined) {
            indicators.fearGreedIndex = fearGreedIndex;
        }

        // Determine trend
        const { trend, trendStrength } = this.analyzeTrend(indicators, currentPrice);

        // Determine volatility
        const volatility = this.analyzeVolatility(indicators, candles);

        // Find support and resistance levels
        const { support, resistance } = this.findSupportResistance(candles);

        // Generate trading signals (con configuración de riesgo del usuario + Fear&Greed)
        const signals = this.generateSignals(symbol, indicators, currentPrice, candles, riskConfig);

        return {
            symbol,
            timestamp: Date.now(),
            indicators,
            trend,
            trendStrength,
            volatility,
            support,
            resistance,
            signals,
        };
    }

    private analyzeTrend(
        indicators: TechnicalIndicators,
        currentPrice: number
    ): { trend: 'bullish' | 'bearish' | 'neutral'; trendStrength: number } {
        let bullishScore = 0;
        let bearishScore = 0;

        // EMA alignment
        if (indicators.ema9 && indicators.ema21 && indicators.ema50) {
            if (indicators.ema9 > indicators.ema21 && indicators.ema21 > indicators.ema50) {
                bullishScore += 20;
            } else if (indicators.ema9 < indicators.ema21 && indicators.ema21 < indicators.ema50) {
                bearishScore += 20;
            }
        }

        // Price vs 200 EMA
        if (indicators.ema200) {
            if (currentPrice > indicators.ema200) {
                bullishScore += 15;
            } else {
                bearishScore += 15;
            }
        }

        // MACD
        if (indicators.macd) {
            if (indicators.macd.histogram > 0) {
                bullishScore += 15;
                if (indicators.macd.macd > indicators.macd.signal) bullishScore += 5;
            } else {
                bearishScore += 15;
                if (indicators.macd.macd < indicators.macd.signal) bearishScore += 5;
            }
        }

        // RSI
        if (indicators.rsi14) {
            if (indicators.rsi14 > 50) {
                bullishScore += 10;
                if (indicators.rsi14 > 60) bullishScore += 5;
            } else {
                bearishScore += 10;
                if (indicators.rsi14 < 40) bearishScore += 5;
            }
        }

        // ADX (trend strength)
        if (indicators.adx) {
            const adxBonus = Math.min(indicators.adx / 2, 20);
            if (bullishScore > bearishScore) {
                bullishScore += adxBonus;
            } else {
                bearishScore += adxBonus;
            }
        }

        const totalScore = bullishScore + bearishScore;
        const trendStrength = totalScore > 0 ?
            Math.abs(bullishScore - bearishScore) / totalScore * 100 : 0;

        if (bullishScore > bearishScore + 10) {
            return { trend: 'bullish', trendStrength };
        } else if (bearishScore > bullishScore + 10) {
            return { trend: 'bearish', trendStrength };
        }
        return { trend: 'neutral', trendStrength };
    }

    private analyzeVolatility(
        indicators: TechnicalIndicators,
        candles: MarketData[]
    ): 'low' | 'medium' | 'high' | 'extreme' {
        if (!indicators.atr || !indicators.bollingerBands) return 'medium';

        const currentPrice = candles[candles.length - 1].close;
        const atrPercent = (indicators.atr / currentPrice) * 100;
        const bbWidth = indicators.bollingerBands.width;

        // Combined volatility score
        const volatilityScore = (atrPercent * 10) + (bbWidth / 2);

        if (volatilityScore < 2) return 'low';
        if (volatilityScore < 4) return 'medium';
        if (volatilityScore < 8) return 'high';
        return 'extreme';
    }

    private findSupportResistance(candles: MarketData[]): { support: number[]; resistance: number[] } {
        const recentCandles = candles.slice(-100);
        const pivots: { price: number; type: 'high' | 'low' }[] = [];

        // Find pivot points
        for (let i = 2; i < recentCandles.length - 2; i++) {
            const curr = recentCandles[i];
            const prev1 = recentCandles[i - 1];
            const prev2 = recentCandles[i - 2];
            const next1 = recentCandles[i + 1];
            const next2 = recentCandles[i + 2];

            // Pivot high
            if (curr.high > prev1.high && curr.high > prev2.high &&
                curr.high > next1.high && curr.high > next2.high) {
                pivots.push({ price: curr.high, type: 'high' });
            }

            // Pivot low
            if (curr.low < prev1.low && curr.low < prev2.low &&
                curr.low < next1.low && curr.low < next2.low) {
                pivots.push({ price: curr.low, type: 'low' });
            }
        }

        // Cluster nearby levels
        const support = this.clusterLevels(
            pivots.filter(p => p.type === 'low').map(p => p.price)
        ).slice(0, 3);

        const resistance = this.clusterLevels(
            pivots.filter(p => p.type === 'high').map(p => p.price)
        ).slice(0, 3);

        return { support, resistance };
    }

    private clusterLevels(levels: number[], threshold = 0.01): number[] {
        if (levels.length === 0) return [];

        const sorted = [...levels].sort((a, b) => a - b);
        const clusters: number[][] = [[sorted[0]]];

        for (let i = 1; i < sorted.length; i++) {
            const lastCluster = clusters[clusters.length - 1];
            const lastLevel = lastCluster[lastCluster.length - 1];

            if ((sorted[i] - lastLevel) / lastLevel < threshold) {
                lastCluster.push(sorted[i]);
            } else {
                clusters.push([sorted[i]]);
            }
        }

        // Return average of each cluster, sorted by cluster size
        return clusters
            .map(c => ({
                level: c.reduce((a, b) => a + b, 0) / c.length,
                strength: c.length,
            }))
            .sort((a, b) => b.strength - a.strength)
            .map(c => c.level);
    }

    // ==========================================
    // SIGNAL GENERATION
    // ==========================================

    generateSignals(
        symbol: string,
        indicators: TechnicalIndicators,
        currentPrice: number,
        candles: MarketData[],
        riskConfig?: RiskConfig
    ): TradingSignal[] {
        const signals: TradingSignal[] = [];
        const closes = candles.map(c => c.close);

        // Obtener umbral de confianza del usuario (default: 60%)
        const userMinConfidence = riskConfig?.minConfidenceThreshold || 60;

        // 🔍 DEBUG: Log inicial para ver qué indicadores tenemos
        console.log(`📊 [SignalGen] Generando señales para ${symbol}:`, {
            price: currentPrice.toFixed(2),
            rsi: indicators.rsi14?.toFixed(1),
            macd: indicators.macd?.histogram?.toFixed(2),
            stoch: indicators.stochastic ? `K=${indicators.stochastic.k?.toFixed(1)}, D=${indicators.stochastic.d?.toFixed(1)}` : 'N/A',
            ema200: indicators.ema200?.toFixed(2),
            userMinConfidence
        });

        // RSI signals
        if (indicators.rsi14) {
            if (indicators.rsi14 < 30) {
                signals.push(this.createSignal(symbol, 'buy', 'moderate', 65, currentPrice,
                    'RSI-Oversold', `RSI at ${indicators.rsi14.toFixed(1)} indicates oversold conditions`));
            } else if (indicators.rsi14 > 70) {
                signals.push(this.createSignal(symbol, 'sell', 'moderate', 65, currentPrice,
                    'RSI-Overbought', `RSI at ${indicators.rsi14.toFixed(1)} indicates overbought conditions`));
            } else {
                console.log(`📊 [SignalGen] RSI=${indicators.rsi14.toFixed(1)} - Neutral zone (30-70), no signal`);
            }
            // RSI divergence check would go here
        }

        // MACD crossovers — derive the previous histogram value from the same
        // MACD series we already computed (O(1) instead of recomputing MACD).
        if (indicators.macd) {
            const macdSeries = MACD.calculate({
                values: closes,
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9,
                SimpleMAOscillator: false,
                SimpleMASignal: false,
            });
            const prev = macdSeries.length >= 2 ? macdSeries[macdSeries.length - 2] : null;
            const prevHistogram = prev?.histogram ?? null;
            if (prevHistogram !== null) {
                if (indicators.macd.histogram > 0 && prevHistogram <= 0) {
                    signals.push(this.createSignal(symbol, 'buy', 'strong', 75, currentPrice,
                        'MACD-Bullish-Cross', 'MACD histogram crossed above zero - bullish momentum'));
                } else if (indicators.macd.histogram < 0 && prevHistogram >= 0) {
                    signals.push(this.createSignal(symbol, 'sell', 'strong', 75, currentPrice,
                        'MACD-Bearish-Cross', 'MACD histogram crossed below zero - bearish momentum'));
                }
            }
        }

        // Bollinger Band signals
        if (indicators.bollingerBands) {
            const bb = indicators.bollingerBands;
            if (currentPrice <= bb.lower) {
                signals.push(this.createSignal(symbol, 'buy', 'moderate', 60, currentPrice,
                    'BB-Lower-Touch', 'Price touching lower Bollinger Band - potential reversal'));
            } else if (currentPrice >= bb.upper) {
                signals.push(this.createSignal(symbol, 'sell', 'moderate', 60, currentPrice,
                    'BB-Upper-Touch', 'Price touching upper Bollinger Band - potential reversal'));
            }
        }

        // EMA Golden/Death Cross. EMA needs the full series; passing only the
        // tail (e.g. slice(-3)) to a period-200 EMA returns an empty array, so
        // the crossover never triggers. Use the full closes and look at the
        // last two EMA values.
        if (indicators.ema50 && indicators.ema200 && closes.length >= 201) {
            const ema50Series = EMA.calculate({ values: closes, period: 50 });
            const ema200Series = EMA.calculate({ values: closes, period: 200 });

            if (ema50Series.length >= 2 && ema200Series.length >= 2) {
                const prev50 = ema50Series[ema50Series.length - 2];
                const prev200 = ema200Series[ema200Series.length - 2];
                const last50 = ema50Series[ema50Series.length - 1];
                const last200 = ema200Series[ema200Series.length - 1];

                const prevAbove = prev50 > prev200;
                const currAbove = last50 > last200;

                if (!prevAbove && currAbove) {
                    signals.push(this.createSignal(symbol, 'buy', 'very_strong', 85, currentPrice,
                        'Golden-Cross', 'EMA 50 crossed above EMA 200 - strong bullish signal'));
                } else if (prevAbove && !currAbove) {
                    signals.push(this.createSignal(symbol, 'sell', 'very_strong', 85, currentPrice,
                        'Death-Cross', 'EMA 50 crossed below EMA 200 - strong bearish signal'));
                }
            }
        }

        // Stochastic signals
        if (indicators.stochastic) {
            const { k, d } = indicators.stochastic;
            if (k < 20 && d < 20 && k > d) {
                signals.push(this.createSignal(symbol, 'buy', 'moderate', 60, currentPrice,
                    'Stoch-Oversold', 'Stochastic in oversold territory with bullish crossover'));
            } else if (k > 80 && d > 80 && k < d) {
                signals.push(this.createSignal(symbol, 'sell', 'moderate', 60, currentPrice,
                    'Stoch-Overbought', 'Stochastic in overbought territory with bearish crossover'));
            }
        }

        // 📈 TREND CONTINUATION SIGNALS - Generate signals when trend is clear but not extreme
        // These signals fire when there's a strong trend alignment even without oversold/overbought conditions
        if (indicators.ema9 && indicators.ema21 && indicators.ema50 && indicators.ema200 && indicators.rsi14 && indicators.adx) {
            const ema9 = indicators.ema9;
            const ema21 = indicators.ema21;
            const ema50 = indicators.ema50;
            const ema200 = indicators.ema200;
            const rsi = indicators.rsi14;
            const adx = indicators.adx;

            // 🟢 BULLISH TREND CONTINUATION
            // Conditions: EMA9 > EMA21 > EMA50, Price > EMA200, RSI > 50, ADX > 20 (trending)
            const bullishEmaAlignment = ema9 > ema21 && ema21 > ema50;
            const priceAboveEma200 = currentPrice > ema200;
            const bullishRsi = rsi > 50 && rsi < 70; // Bullish but not overbought
            const trendStrong = adx > 12; // 🔧 REDUCED from 15 to 12 for more signals

            if (bullishEmaAlignment && priceAboveEma200 && bullishRsi && trendStrong) {
                const confidence = adx > 30 ? 70 : 65; // Higher confidence if ADX > 30
                signals.push(this.createSignal(symbol, 'buy', 'strong', confidence, currentPrice,
                    'Trend-Bullish-Continuation',
                    `Bullish trend continuation: EMAs aligned (9>21>50), Price>${ema200.toFixed(0)} EMA200, RSI=${rsi.toFixed(1)}, ADX=${adx.toFixed(1)}`));
                console.log(`📈 [SignalGen] BULLISH Trend Continuation signal generated! ADX=${adx.toFixed(1)}, RSI=${rsi.toFixed(1)}`);
            }

            // 🔴 BEARISH TREND CONTINUATION
            // Conditions: EMA9 < EMA21 < EMA50, Price < EMA200, RSI < 50, ADX > 20 (trending)
            const bearishEmaAlignment = ema9 < ema21 && ema21 < ema50;
            const priceBelowEma200 = currentPrice < ema200;
            const bearishRsi = rsi < 50 && rsi > 30; // Bearish but not oversold

            if (bearishEmaAlignment && priceBelowEma200 && bearishRsi && trendStrong) {
                const confidence = adx > 30 ? 70 : 65;
                signals.push(this.createSignal(symbol, 'sell', 'strong', confidence, currentPrice,
                    'Trend-Bearish-Continuation',
                    `Bearish trend continuation: EMAs aligned (9<21<50), Price<${ema200.toFixed(0)} EMA200, RSI=${rsi.toFixed(1)}, ADX=${adx.toFixed(1)}`));
                console.log(`📉 [SignalGen] BEARISH Trend Continuation signal generated! ADX=${adx.toFixed(1)}, RSI=${rsi.toFixed(1)}`);
            }

            // 🔄 Log if no trend continuation but close to conditions
            if (!bullishEmaAlignment && !bearishEmaAlignment) {
                console.log(`📊 [SignalGen] No EMA alignment: EMA9=${ema9.toFixed(0)}, EMA21=${ema21.toFixed(0)}, EMA50=${ema50.toFixed(0)}`);
            }
        }

        // Volume confirmation
        if (indicators.volumeChange > 50 && signals.length > 0) {
            // Boost confidence if volume confirms
            signals.forEach(s => {
                s.confidence = Math.min(s.confidence + 10, 100);
                s.reasoning += ` (Volume +${indicators.volumeChange.toFixed(0)}% confirms)`;
            });
        }

        // 🎯 FEAR & GREED CONTRARIAN SIGNALS (Roger Strategy)
        // When market is in Extreme Fear AND price is near support = BUY opportunity
        // When market is in Extreme Greed AND price is near resistance = SELL opportunity
        if (indicators.fearGreedIndex !== undefined) {
            const fearGreed = indicators.fearGreedIndex;
            const rsi = indicators.rsi14 || 50;

            // 🟢 EXTREME FEAR CONTRARIAN BUY
            // Fear & Greed < 25 = Extreme Fear = masses are selling in panic = contrarian BUY
            if (fearGreed < 25 && rsi > 30 && rsi < 70) { // 🔧 EXPANDED from 30-60 to 30-70
                const confidence = fearGreed < 15 ? 70 : 65; // Higher confidence at more extreme fear
                signals.push(this.createSignal(symbol, 'buy', 'strong', confidence, currentPrice,
                    'Contrarian-ExtremeFear',
                    `🐻➡️🐂 Contrarian BUY: Fear&Greed=${fearGreed} (Extreme Fear), RSI=${rsi.toFixed(1)} - Masses panic selling, smart money buying`));
                console.log(`🎯 [SignalGen] CONTRARIAN BUY signal! Fear&Greed=${fearGreed} (Extreme Fear)`);
            }

            // 🔴 EXTREME GREED CONTRARIAN SELL
            // Fear & Greed > 75 = Extreme Greed = masses are FOMO buying = contrarian SELL
            if (fearGreed > 75 && rsi > 50 && rsi < 70) {
                const confidence = fearGreed > 85 ? 70 : 65;
                signals.push(this.createSignal(symbol, 'sell', 'strong', confidence, currentPrice,
                    'Contrarian-ExtremeGreed',
                    `🐂➡️🐻 Contrarian SELL: Fear&Greed=${fearGreed} (Extreme Greed), RSI=${rsi.toFixed(1)} - Masses FOMO buying, smart money selling`));
                console.log(`🎯 [SignalGen] CONTRARIAN SELL signal! Fear&Greed=${fearGreed} (Extreme Greed)`);
            }

            // Log current Fear & Greed status
            if (fearGreed >= 25 && fearGreed <= 75) {
                console.log(`📊 [SignalGen] Fear&Greed=${fearGreed} - Neutral zone (25-75), no contrarian signal`);
            }
        }

        // � DEBUG: Log ANTES de filtros
        const preFilterCount = signals.length;
        console.log(`📌 [SignalGen] ${symbol}: ${preFilterCount} señales ANTES de filtros:`,
            signals.map(s => `${s.source}(${s.type},${s.confidence}%,${s.strength})`).join(', ') || 'NINGUNA'
        );

        // �🛡️ SNIPER MODE FILTER (BALANCED): EMA 200 (The "King" Filter)
        // Permite señales STRONG y VERY_STRONG para equilibrio entre oportunidades y seguridad
        // If Price < EMA 200, we are in a BEAR market -> Only strong/very_strong BUYS
        // If Price > EMA 200, we are in a BULL market -> Only strong/very_strong SELLS
        if (indicators.ema200 && currentPrice) {
            const isBullish = currentPrice > indicators.ema200;
            console.log(`🎯 [SignalGen] EMA200 Filter: Price ${currentPrice.toFixed(2)} ${isBullish ? '>' : '<'} EMA200 ${indicators.ema200.toFixed(2)} → ${isBullish ? 'BULLISH' : 'BEARISH'} market`);

            // Filter BUY signals in Bear Market
            if (!isBullish) {
                // Remove BUY signals that are not "strong" or "very_strong"
                for (let i = signals.length - 1; i >= 0; i--) {
                    if (signals[i].type === 'buy' &&
                        signals[i].strength !== 'very_strong' &&
                        signals[i].strength !== 'strong') {
                        console.log(`🛡️ Sniper Mode (Balanced): Blocked weak BUY signal for ${symbol} (Price < EMA 200, only strong+ allowed)`);
                        signals.splice(i, 1);
                    }
                }
            } else {
                // Filter SELL signals in Bull Market (since we are Spot trading mostly)
                for (let i = signals.length - 1; i >= 0; i--) {
                    if (signals[i].type === 'sell' &&
                        signals[i].strength !== 'very_strong' &&
                        signals[i].strength !== 'strong') {
                        console.log(`🛡️ Sniper Mode (Balanced): Blocked weak SELL signal for ${symbol} (Price > EMA 200, only strong+ allowed)`);
                        signals.splice(i, 1);
                    }
                }
            }
        }

        // 👤 USER CONFIDENCE FILTER: Respeta la configuración del usuario
        // Elimina señales que no cumplan con el umbral de confianza configurado
        for (let i = signals.length - 1; i >= 0; i--) {
            if (signals[i].confidence < userMinConfidence) {
                console.log(`👤 User Filter: Blocked signal for ${symbol} (confidence ${signals[i].confidence}% < user minimum ${userMinConfidence}%)`);
                signals.splice(i, 1);
            }
        }

        // 🔍 DEBUG: Log final de señales que pasan todos los filtros
        console.log(`✅ [SignalGen] ${symbol}: ${signals.length} señales finales pasaron todos los filtros:`,
            signals.map(s => `${s.source}(${s.type},${s.confidence}%,${s.strength})`).join(', ') || 'NINGUNA'
        );

        return signals;
    }

    private createSignal(
        symbol: string,
        type: SignalType,
        strength: SignalStrength,
        confidence: number,
        price: number,
        source: string,
        reasoning: string
    ): TradingSignal {
        return {
            id: `sig_${Date.now()}_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11)}`,
            symbol,
            type,
            strength,
            confidence,
            price,
            timestamp: Date.now(),
            source,
            reasoning,
            expires: Date.now() + (60 * 60 * 1000), // 1 hour expiry
        };
    }

    private calculateVWAP(candles: MarketData[]): number | null {
        if (candles.length === 0) return null;

        let cumulativeTPV = 0;
        let cumulativeVolume = 0;

        for (const candle of candles) {
            const typicalPrice = (candle.high + candle.low + candle.close) / 3;
            cumulativeTPV += typicalPrice * candle.volume;
            cumulativeVolume += candle.volume;
        }

        return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : null;
    }
}

export const indicatorService = new IndicatorService();
export default indicatorService;
