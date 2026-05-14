// ============================================
// SIMULACRUM - REAL TRADING TYPES
// ============================================

// --- EXCHANGE & TRADING TYPES ---
export type ExchangeId = 'binance' | 'coinbase' | 'kraken' | 'kucoin' | 'bybit' | 'okx' | 'uniswap' | 'sushiswap';

export interface ExchangeCredentials {
    apiKey: string;
    secret: string;
    password?: string; // For exchanges that require it (like KuCoin)
    sandbox?: boolean;
}

export interface MarketData {
    symbol: string;
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quoteVolume?: number;
}

export interface OrderBook {
    symbol: string;
    timestamp: number;
    bids: [number, number][]; // [price, amount][]
    asks: [number, number][];
    spread: number;
    spreadPercent: number;
}

export interface Ticker {
    symbol: string;
    timestamp: number;
    bid: number;
    ask: number;
    last: number;
    change: number;
    changePercent: number;
    volume: number;
    high24h: number;
    low24h: number;
}

export type OrderType = 'market' | 'limit' | 'stop_loss' | 'stop_loss_limit' | 'take_profit' | 'take_profit_limit';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'failed';

export interface Order {
    id: string;
    clientOrderId?: string;
    symbol: string;
    type: OrderType;
    side: OrderSide;
    price?: number;
    stopPrice?: number;
    amount: number;
    filled: number;
    remaining: number;
    cost: number;
    fee?: {
        cost: number;
        currency: string;
        rate?: number;
    };
    status: OrderStatus;
    timestamp: number;
    exchange: ExchangeId;
}

export interface Position {
    symbol: string;
    side: 'long' | 'short';
    size: number;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnl: number;
    unrealizedPnlPercent: number;
    leverage?: number;
    liquidationPrice?: number;
    margin?: number;
    timestamp: number;
}

export interface Balance {
    currency: string;
    free: number;
    used: number;
    total: number;
    valueInUSD?: number;
}

export interface Portfolio {
    totalValueUSD: number;
    totalPnL: number;
    totalPnLPercent: number;
    balances: Balance[];
    positions: Position[];
    lastUpdate: number;
}

// --- TECHNICAL INDICATORS ---
export interface TechnicalIndicators {
    rsi: number | null;
    rsi14: number | null;
    macd: {
        macd: number;
        signal: number;
        histogram: number;
    } | null;
    ema9: number | null;
    ema21: number | null;
    ema50: number | null;
    ema200: number | null;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    bollingerBands: {
        upper: number;
        middle: number;
        lower: number;
        width: number;
    } | null;
    atr: number | null;
    adx: number | null;
    stochastic: {
        k: number;
        d: number;
    } | null;
    vwap: number | null;
    obv: number | null;
    volume24h: number;
    volumeChange: number;
    fearGreedIndex?: number; // 🎯 For contrarian signals (0-100: 0=Extreme Fear, 100=Extreme Greed)
}

export interface MarketAnalysis {
    symbol: string;
    timestamp: number;
    indicators: TechnicalIndicators;
    trend: 'bullish' | 'bearish' | 'neutral';
    trendStrength: number; // 0-100
    volatility: 'low' | 'medium' | 'high' | 'extreme';
    support: number[];
    resistance: number[];
    signals: TradingSignal[];
}

// --- TRADING SIGNALS & STRATEGIES ---
export type SignalType = 'buy' | 'sell' | 'hold' | 'close_long' | 'close_short';
export type SignalStrength = 'weak' | 'moderate' | 'strong' | 'very_strong';

export interface TradingSignal {
    id: string;
    symbol: string;
    type: SignalType;
    strength: SignalStrength;
    confidence: number; // 0-100
    price: number;
    timestamp: number;
    source: string; // Which agent/indicator generated it
    reasoning: string;
    expires?: number; // Timestamp when signal becomes invalid
}

export interface Strategy {
    id: string;
    name: string;
    description: string;
    type: 'trend_following' | 'mean_reversion' | 'momentum' | 'arbitrage' | 'grid' | 'dca' | 'custom';
    symbols: string[];
    timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
    isActive: boolean;
    parameters: Record<string, any>;
    riskParameters: RiskParameters;
    performance: StrategyPerformance;
}

export interface StrategyPerformance {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnL: number;
    totalPnLPercent: number;
    maxDrawdown: number;
    sharpeRatio: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
    avgHoldingTime: number; // in minutes
}

// --- RISK MANAGEMENT ---
export interface RiskParameters {
    maxPositionSize: number; // Percentage of portfolio
    maxPortfolioRisk: number; // Percentage
    maxDailyLoss: number; // Percentage
    maxDrawdown: number; // Percentage
    stopLossPercent: number;
    takeProfitPercent: number;
    trailingStopPercent?: number;
    maxOpenPositions: number;
    maxLeverage: number;
    cooldownAfterLoss: number; // Minutes
}

export interface RiskAssessment {
    symbol: string;
    timestamp: number;
    overallRisk: 'low' | 'medium' | 'high' | 'extreme';
    riskScore: number; // 0-100
    volatilityRisk: number;
    liquidityRisk: number;
    correlationRisk: number;
    marketRisk: number;
    positionSizeRecommended: number;
    stopLossRecommended: number;
    takeProfitRecommended: number;
    warnings: string[];
}

// --- AI AGENTS ---
export type AgentRole = 'STRATEGIST' | 'ANALYST' | 'EXECUTOR' | 'RISK_MANAGER' | 'SENTIMENT' | 'ORACLE';
export type AgentStatus = 'idle' | 'analyzing' | 'computing' | 'executing' | 'waiting_approval' | 'error';

export interface AIAgent {
    id: string;
    name: string;
    role: AgentRole;
    description: string;
    status: AgentStatus;
    currentTask: string;
    efficiency: number;
    confidence: number;
    lastAction: string;
    lastActionTimestamp: number;
    lastThought: string; // El razonamiento/reflexión actual del agente
    memory: AgentMemory;
    parameters: Record<string, any>;
}

export interface AgentMemory {
    shortTerm: MemoryEntry[];
    longTerm: MemoryEntry[];
    tradingHistory: TradeMemory[];
    learnings: string[];
    successPatterns: Pattern[];
    failurePatterns: Pattern[];
}

export interface MemoryEntry {
    id: string;
    timestamp: number;
    type: 'observation' | 'decision' | 'outcome' | 'learning';
    content: string;
    importance: number; // 0-100
    context: Record<string, any>;
    relatedEntries?: string[];
}

export interface TradeMemory {
    tradeId: string;
    symbol: string;
    entry: number;
    exit: number;
    side: OrderSide;
    pnl: number;
    pnlPercent: number;
    reasoning: string;
    marketConditions: string;
    lessonsLearned: string[];
    timestamp: number;
}

export interface Pattern {
    id: string;
    name: string;
    description: string;
    conditions: string[];
    outcome: 'profitable' | 'unprofitable';
    occurrences: number;
    avgProfit: number;
    confidence: number;
}

// --- A2A COMMUNICATION ---
export type A2AProtocol =
    | 'HANDSHAKE'
    | 'TASK_DELEGATION'
    | 'RESOURCE_REQUEST'
    | 'EXECUTION_CONFIRM'
    | 'RISK_ALERT'
    | 'MARKET_UPDATE'
    | 'SIGNAL_BROADCAST'
    | 'APPROVAL_REQUEST'
    | 'APPROVAL_GRANTED'
    | 'APPROVAL_DENIED'
    | 'ERROR'
    | 'SYNC';

export interface A2AMessage {
    id: string;
    from: string;
    to: string | 'ALL';
    protocol: A2AProtocol;
    payload: any;
    priority: 'low' | 'normal' | 'high' | 'critical';
    timestamp: number;
    requiresResponse: boolean;
    responseTimeout?: number;
    acknowledged?: boolean;
}

// --- SENTIMENT ANALYSIS ---
export interface SentimentData {
    symbol: string;
    timestamp: number;
    overallSentiment: number; // -100 to 100
    twitterSentiment: number;
    redditSentiment: number;
    newsSentiment: number;
    fearGreedIndex: number;
    socialVolume: number;
    socialVolumeChange: number;
    influencerMentions: number;
    topTopics: string[];
    controversyLevel: number;
}

// --- BACKTESTING ---
export interface BacktestConfig {
    strategy: Strategy;
    symbol: string;
    startDate: Date;
    endDate: Date;
    initialCapital: number;
    commission: number;
    slippage: number;
}

export interface BacktestResult {
    config: BacktestConfig;
    performance: StrategyPerformance;
    trades: BacktestTrade[];
    equityCurve: { timestamp: number; value: number }[];
    drawdownCurve: { timestamp: number; value: number }[];
    monthlyReturns: { month: string; return: number }[];
}

export interface BacktestTrade {
    entryTime: number;
    exitTime: number;
    entryPrice: number;
    exitPrice: number;
    side: OrderSide;
    size: number;
    pnl: number;
    pnlPercent: number;
    reason: string;
}

// --- DEX SPECIFIC ---
export interface UniswapPool {
    address: string;
    token0: TokenInfo;
    token1: TokenInfo;
    fee: number;
    liquidity: string;
    sqrtPriceX96: string;
    tick: number;
    token0Price: number;
    token1Price: number;
    tvlUSD: number;
    volume24hUSD: number;
}

export interface TokenInfo {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
}

export interface SwapQuote {
    tokenIn: TokenInfo;
    tokenOut: TokenInfo;
    amountIn: string;
    amountOut: string;
    priceImpact: number;
    route: string[];
    gasEstimate: string;
    executionPrice: number;
    minimumReceived: string;
    fee: number;
}

// --- TRANSACTION TYPES ---
export interface Transaction {
    id: string;
    hash?: string;
    type: 'swap' | 'transfer' | 'approval' | 'stake' | 'unstake';
    status: 'pending' | 'confirmed' | 'failed';
    from: string;
    to: string;
    value: string;
    gasUsed?: string;
    gasPrice?: string;
    timestamp: number;
    blockNumber?: number;
    metadata: Record<string, any>;
}

// --- NOTIFICATIONS & ALERTS ---
export type AlertType = 'price' | 'signal' | 'risk' | 'execution' | 'system' | 'approval';

export interface Alert {
    id: string;
    type: AlertType;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
    timestamp: number;
    acknowledged: boolean;
    actionRequired: boolean;
    action?: {
        label: string;
        callback: () => void;
    };
}

// --- STATE ---
export interface TradingState {
    isConnected: boolean;
    isLive: boolean; // true = live trading, false = paper trading
    portfolio: Portfolio | null;
    activeStrategies: Strategy[];
    openOrders: Order[];
    pendingSignals: TradingSignal[];
    agents: AIAgent[];
    messages: A2AMessage[];
    alerts: Alert[];
    currentAnalysis: Map<string, MarketAnalysis>;
    sentiment: Map<string, SentimentData>;
    lastError: string | null;
}
