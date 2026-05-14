// ============================================
// GLOBAL TRADING STORE
// State management with Zustand
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
    TradingState,
    Portfolio,
    Strategy,
    Order,
    TradingSignal,
    AIAgent,
    A2AMessage,
    Alert,
    MarketAnalysis,
    SentimentData,
    ExchangeCredentials,
    ExchangeId,
} from '../types/trading';

// Import services
// import { ccxtService } from '../services/trading/ccxtService'; // CCXT is Node.js only, not browser compatible
import { marketDataService } from '../services/data/marketDataService'; // Use for market data in browser
import { indicatorService } from '../services/trading/indicatorService';
import { riskService } from '../services/trading/riskService';
import { defiService } from '../services/defi/defiService';
import { aiAgentsService } from '../services/ai/agentService';
import { backtestService } from '../services/trading/backtestService';
import { sentimentService } from '../services/sentiment/sentimentService';

interface TradingStore extends TradingState {
    // Connection Actions
    connectExchange: (exchangeId: ExchangeId, credentials: ExchangeCredentials) => Promise<boolean>;
    disconnectExchange: () => void;
    setLiveMode: (isLive: boolean) => void;

    // Portfolio Actions
    fetchPortfolio: () => Promise<void>;
    updatePortfolio: (portfolio: Portfolio) => void;

    // Trading Actions
    placeOrder: (symbol: string, side: 'buy' | 'sell', amount: number, price?: number) => Promise<Order | null>;
    cancelOrder: (orderId: string, symbol: string) => Promise<boolean>;
    fetchOpenOrders: () => Promise<void>;

    // Analysis Actions
    analyzeSymbol: (symbol: string) => Promise<MarketAnalysis | null>;
    fetchSentiment: (symbol: string) => Promise<SentimentData | null>;
    runAIAnalysis: (symbol: string) => Promise<void>;

    // Agent Actions
    initializeAgents: (apiKey: string) => void;
    getAgents: () => AIAgent[];
    addMessage: (message: A2AMessage) => void;

    // Strategy Actions
    addStrategy: (strategy: Strategy) => void;
    removeStrategy: (strategyId: string) => void;
    toggleStrategy: (strategyId: string) => void;

    // Signal Actions
    addSignal: (signal: TradingSignal) => void;
    removeSignal: (signalId: string) => void;
    clearExpiredSignals: () => void;

    // Alert Actions
    addAlert: (alert: Alert) => void;
    acknowledgeAlert: (alertId: string) => void;
    clearAlerts: () => void;

    // Error handling
    setError: (error: string | null) => void;
    clearError: () => void;
}

export const useTradingStore = create<TradingStore>()(
    persist(
        (set, get) => ({
            // Initial State
            isConnected: false,
            isLive: false,
            portfolio: null,
            activeStrategies: [],
            openOrders: [],
            pendingSignals: [],
            agents: [],
            messages: [],
            alerts: [],
            currentAnalysis: new Map(),
            sentiment: new Map(),
            lastError: null,

            // ==========================================
            // CONNECTION ACTIONS
            // ==========================================

            connectExchange: async (exchangeId, credentials) => {
                try {
                    // Exchange connection requires backend - simulated for now
                    console.log('Exchange connection (simulated in browser):', exchangeId);
                    set({ isConnected: true, lastError: null });

                    // Simulate portfolio
                    const mockPortfolio: Portfolio = {
                        totalValueUSD: 10000,
                        totalPnL: 0,
                        totalPnLPercent: 0,
                        balances: [],
                        positions: [],
                        lastUpdate: Date.now(),
                    };
                    set({ portfolio: mockPortfolio });
                    return true;
                } catch (error: any) {
                    set({ lastError: error.message, isConnected: false });
                    return false;
                }
            },

            disconnectExchange: () => {
                set({
                    isConnected: false,
                    portfolio: null,
                    openOrders: [],
                });
            },

            setLiveMode: (isLive) => {
                // Test mode setting (backend only)
                console.log('Live mode:', isLive);
                set({ isLive });

                get().addAlert({
                    id: `alert_${Date.now()}`,
                    type: 'system',
                    severity: isLive ? 'critical' : 'info',
                    title: isLive ? '⚠️ LIVE TRADING ENABLED' : 'Paper Trading Mode',
                    message: isLive
                        ? 'Real funds will be used for all trades. Exercise extreme caution.'
                        : 'Running in paper trading mode. No real funds at risk.',
                    timestamp: Date.now(),
                    acknowledged: false,
                    actionRequired: isLive,
                });
            },

            // ==========================================
            // PORTFOLIO ACTIONS
            // ==========================================

            fetchPortfolio: async () => {
                try {
                    // Portfolio fetching requires backend connection
                    // Using simulated data for now
                    const { portfolio } = get();
                    if (portfolio) {
                        riskService.updateBalance(portfolio.totalValueUSD);
                    }
                } catch (error: any) {
                    set({ lastError: error.message });
                }
            },

            updatePortfolio: (portfolio) => {
                set({ portfolio });
            },

            // ==========================================
            // TRADING ACTIONS
            // ==========================================

            placeOrder: async (symbol, side, amount, price) => {
                const { isLive, portfolio } = get();

                if (!portfolio) {
                    set({ lastError: 'Portfolio not loaded' });
                    return null;
                }

                // Get current analysis for risk assessment
                const analysis = get().currentAnalysis.get(symbol);
                if (analysis) {
                    const riskAssessment = riskService.assessRisk(symbol, analysis, portfolio);

                    // Validate trade
                    const mockSignal: TradingSignal = {
                        id: 'manual',
                        symbol,
                        type: side === 'buy' ? 'buy' : 'sell',
                        strength: 'moderate',
                        confidence: 70,
                        price: price || 0,
                        timestamp: Date.now(),
                        source: 'Manual Order',
                        reasoning: 'User initiated trade',
                    };

                    const validation = riskService.validateTrade(
                        mockSignal,
                        amount * (price || 1),
                        portfolio,
                        riskAssessment
                    );

                    if (!validation.isValid) {
                        set({ lastError: validation.reason });
                        get().addAlert({
                            id: `alert_${Date.now()}`,
                            type: 'risk',
                            severity: 'warning',
                            title: 'Trade Blocked',
                            message: validation.reason,
                            timestamp: Date.now(),
                            acknowledged: false,
                            actionRequired: false,
                        });
                        return null;
                    }

                    if (validation.adjustedSize) {
                        amount = validation.adjustedSize / (price || 1);
                    }
                }

                try {
                    // Real order execution requires backend
                    // Simulating order for paper trading
                    const mockOrder: Order = {
                        id: `order_${Date.now()}`,
                        exchange: 'binance',
                        symbol,
                        type: price ? 'limit' : 'market',
                        side,
                        price: price || 0,
                        amount,
                        filled: 0,
                        remaining: amount,
                        cost: 0,
                        fee: { cost: 0, currency: 'USDT' },
                        status: 'open',
                        timestamp: Date.now(),
                    };

                    // Add to open orders
                    set(state => ({
                        openOrders: [...state.openOrders, mockOrder],
                    }));

                    // Broadcast to agents
                    get().addMessage({
                        id: `msg_${Date.now()}`,
                        from: 'SYS_TRADING',
                        to: 'ALL',
                        protocol: 'EXECUTION_CONFIRM',
                        payload: { order: mockOrder, isLive },
                        priority: 'high',
                        timestamp: Date.now(),
                        requiresResponse: false,
                    });

                    // Refresh portfolio
                    get().fetchPortfolio();

                    return mockOrder;
                } catch (error: any) {
                    set({ lastError: error.message });
                    return null;
                }
            },

            cancelOrder: async (orderId, _symbol) => {
                try {
                    // Real order cancellation requires backend
                    set(state => ({
                        openOrders: state.openOrders.filter(o => o.id !== orderId),
                    }));
                    return true;
                } catch (error: any) {
                    set({ lastError: error.message });
                    return false;
                }
            },

            fetchOpenOrders: async () => {
                try {
                    // Fetching orders requires backend
                    // Current orders already in state
                } catch (error: any) {
                    set({ lastError: error.message });
                }
            },

            // ==========================================
            // ANALYSIS ACTIONS
            // ==========================================

            analyzeSymbol: async (symbol) => {
                try {
                    // Fetch OHLCV data using marketDataService (browser compatible)
                    const candles = await marketDataService.getCandles(symbol, '1h', 200);

                    if (candles.length < 50) {
                        console.warn('Insufficient data for analysis');
                        return null;
                    }

                    // Run technical analysis
                    const analysis = indicatorService.analyzeMarket(symbol, candles);

                    // Store in state
                    set(state => {
                        const newMap = new Map(state.currentAnalysis);
                        newMap.set(symbol, analysis);
                        return { currentAnalysis: newMap };
                    });

                    // Broadcast to agents
                    get().addMessage({
                        id: `msg_${Date.now()}`,
                        from: 'SYS_ANALYSIS',
                        to: 'ALL',
                        protocol: 'MARKET_UPDATE',
                        payload: { symbol, trend: analysis.trend, signals: analysis.signals.length },
                        priority: 'normal',
                        timestamp: Date.now(),
                        requiresResponse: false,
                    });

                    return analysis;
                } catch (error: any) {
                    set({ lastError: error.message });
                    return null;
                }
            },

            fetchSentiment: async (symbol) => {
                try {
                    const sentiment = await sentimentService.getSentiment(symbol);

                    set(state => {
                        const newMap = new Map(state.sentiment);
                        newMap.set(symbol, sentiment);
                        return { sentiment: newMap };
                    });

                    return sentiment;
                } catch (error: any) {
                    set({ lastError: error.message });
                    return null;
                }
            },

            runAIAnalysis: async (symbol) => {
                const analysis = get().currentAnalysis.get(symbol);
                const sentiment = get().sentiment.get(symbol);

                if (!analysis) {
                    // First fetch market data
                    await get().analyzeSymbol(symbol);
                    const newAnalysis = get().currentAnalysis.get(symbol);
                    if (!newAnalysis) return;
                }

                try {
                    const result = await aiAgentsService.analyzeMarket(
                        symbol,
                        analysis || get().currentAnalysis.get(symbol)!,
                        sentiment
                    );

                    console.log('AI Analysis Result:', result);

                    // Update agents state
                    set({ agents: aiAgentsService.getAllAgents() });

                } catch (error: any) {
                    set({ lastError: error.message });
                }
            },

            // ==========================================
            // AGENT ACTIONS
            // ==========================================

            initializeAgents: (apiKey) => {
                aiAgentsService.initialize(apiKey);
                set({ agents: aiAgentsService.getAllAgents() });
            },

            getAgents: () => {
                return aiAgentsService.getAllAgents();
            },

            addMessage: (message) => {
                set(state => ({
                    messages: [...state.messages.slice(-100), message], // Keep last 100 messages
                }));
            },

            // ==========================================
            // STRATEGY ACTIONS
            // ==========================================

            addStrategy: (strategy) => {
                set(state => ({
                    activeStrategies: [...state.activeStrategies, strategy],
                }));
            },

            removeStrategy: (strategyId) => {
                set(state => ({
                    activeStrategies: state.activeStrategies.filter(s => s.id !== strategyId),
                }));
            },

            toggleStrategy: (strategyId) => {
                set(state => ({
                    activeStrategies: state.activeStrategies.map(s =>
                        s.id === strategyId ? { ...s, isActive: !s.isActive } : s
                    ),
                }));
            },

            // ==========================================
            // SIGNAL ACTIONS
            // ==========================================

            addSignal: (signal) => {
                set(state => ({
                    pendingSignals: [...state.pendingSignals, signal],
                }));
            },

            removeSignal: (signalId) => {
                set(state => ({
                    pendingSignals: state.pendingSignals.filter(s => s.id !== signalId),
                }));
            },

            clearExpiredSignals: () => {
                const now = Date.now();
                set(state => ({
                    pendingSignals: state.pendingSignals.filter(s => !s.expires || s.expires > now),
                }));
            },

            // ==========================================
            // ALERT ACTIONS
            // ==========================================

            addAlert: (alert) => {
                set(state => ({
                    alerts: [...state.alerts, alert],
                }));
            },

            acknowledgeAlert: (alertId) => {
                set(state => ({
                    alerts: state.alerts.map(a =>
                        a.id === alertId ? { ...a, acknowledged: true } : a
                    ),
                }));
            },

            clearAlerts: () => {
                set({ alerts: [] });
            },

            // ==========================================
            // ERROR HANDLING
            // ==========================================

            setError: (error) => {
                set({ lastError: error });
            },

            clearError: () => {
                set({ lastError: null });
            },
        }),
        {
            name: 'simulacrum-trading-store',
            partialize: (state) => ({
                // Only persist these fields
                activeStrategies: state.activeStrategies,
                isLive: state.isLive,
            }),
        }
    )
);

export default useTradingStore;
