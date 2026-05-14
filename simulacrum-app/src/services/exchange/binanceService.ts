// ============================================
// BINANCE TRADING SERVICE
// Frontend service to communicate with backend API
// ============================================

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export interface OrderRequest {
    symbol: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit';
    amount: number;
    price?: number;
    stopLoss?: number;
    takeProfit?: number;
}

export interface Order {
    id: string;
    symbol: string;
    side: 'buy' | 'sell';
    type: string;
    price: number;
    amount: number;
    filled: number;
    remaining?: number;
    status: string;
    timestamp: number;
}

export interface Position {
    symbol: string;
    asset: string;
    size: number;
    currentPrice: number;
    valueUSD: number;
    unrealizedPnl: number;
    unrealizedPnlPercent: number;
}

export interface Portfolio {
    totalValueUSD: number;
    totalPnL: number;
    totalPnLPercent: number;
    positions: Position[];
    timestamp: number;
}

export interface Ticker {
    symbol: string;
    price: number;
    bid: number;
    ask: number;
    volume24h: number;
    change24h: number;
    high24h: number;
    low24h: number;
    timestamp: number;
}

export interface Candle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

class BinanceService {
    private ws: WebSocket | null = null;
    private isConnected: boolean = false;
    private mode: 'testnet' | 'live' = 'testnet';
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;
    private listeners: Map<string, ((data: any) => void)[]> = new Map();

    // 🔇 WebSocket log cooldown (prevent spam)
    private lastWsConnectLog: number = 0;
    private lastWsDisconnectLog: number = 0;
    private readonly WS_LOG_COOLDOWN = 60000; // Only log once per minute

    // ==========================================
    // CONNECTION
    // ==========================================

    async connect(testnet: boolean = true): Promise<{ success: boolean; message: string; balances?: Record<string, number> }> {
        try {
            const response = await fetch(`${BACKEND_URL}/api/exchange/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ testnet }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Connection failed');
            }

            this.isConnected = true;
            this.mode = testnet ? 'testnet' : 'live';

            // Connect WebSocket for real-time data
            this.connectWebSocket();

            console.log(`✅ Connected to Binance ${this.mode.toUpperCase()}`);
            return { success: true, message: data.message, balances: data.balances };
        } catch (error: any) {
            console.error('Connection error:', error.message);
            return { success: false, message: error.message };
        }
    }

    private connectWebSocket() {
        if (this.ws) {
            this.ws.close();
        }

        const wsUrl = BACKEND_URL.replace('http', 'ws') + '/ws';
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            const now = Date.now();
            if (now - this.lastWsConnectLog > this.WS_LOG_COOLDOWN) {
                console.log('🔌 WebSocket connected');
                this.lastWsConnectLog = now;
            }
            this.reconnectAttempts = 0;
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const listeners = this.listeners.get(data.symbol) || [];
                listeners.forEach(callback => callback(data));
            } catch (e) {
                // Silent - don't spam console with parse errors
            }
        };

        this.ws.onclose = () => {
            const now = Date.now();
            if (now - this.lastWsDisconnectLog > this.WS_LOG_COOLDOWN) {
                console.log('🔌 WebSocket disconnected - will reconnect...');
                this.lastWsDisconnectLog = now;
            }
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                // Exponential backoff: 5s, 10s, 20s, 40s, 80s
                const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 60000);
                setTimeout(() => this.connectWebSocket(), delay);
            }
        };

        this.ws.onerror = () => {
            // Silent - onclose will handle reconnection
        };
    }

    // ==========================================
    // MARKET DATA
    // ==========================================

    async getTicker(symbol: string): Promise<Ticker | null> {
        try {
            const response = await fetch(`${BACKEND_URL}/api/ticker/${symbol.replace('/', '_')}`);
            if (!response.ok) throw new Error('Failed to fetch ticker');
            return await response.json();
        } catch (error: any) {
            console.error('Ticker fetch error:', error.message);
            return null;
        }
    }

    async getCandles(symbol: string, timeframe: string = '1h', limit: number = 200): Promise<Candle[]> {
        try {
            const response = await fetch(
                `${BACKEND_URL}/api/candles/${symbol.replace('/', '_')}?timeframe=${timeframe}&limit=${limit}`
            );
            if (!response.ok) throw new Error('Failed to fetch candles');
            return await response.json();
        } catch (error: any) {
            console.error('Candles fetch error:', error.message);
            return [];
        }
    }

    async getSymbols(): Promise<string[]> {
        try {
            const response = await fetch(`${BACKEND_URL}/api/symbols`);
            if (!response.ok) throw new Error('Failed to fetch symbols');
            return await response.json();
        } catch (error: any) {
            console.error('Symbols fetch error:', error.message);
            return ['BTC/EUR', 'ETH/EUR', 'SOL/EUR', 'AVAX/EUR'];
        }
    }

    subscribeTicker(symbol: string, callback: (data: Ticker) => void) {
        if (!this.listeners.has(symbol)) {
            this.listeners.set(symbol, []);
        }
        this.listeners.get(symbol)!.push(callback);

        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'subscribe', symbol }));
        }
    }

    unsubscribeTicker(symbol: string) {
        this.listeners.delete(symbol);
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'unsubscribe', symbol }));
        }
    }

    // ==========================================
    // PORTFOLIO
    // ==========================================

    async getPortfolio(): Promise<Portfolio | null> {
        try {
            const response = await fetch(`${BACKEND_URL}/api/portfolio`);
            if (!response.ok) throw new Error('Failed to fetch portfolio');
            return await response.json();
        } catch (error: any) {
            console.error('Portfolio fetch error:', error.message);
            return null;
        }
    }

    // ==========================================
    // ORDERS
    // ==========================================

    async getOpenOrders(symbol?: string): Promise<Order[]> {
        try {
            const url = symbol
                ? `${BACKEND_URL}/api/orders?symbol=${symbol.replace('/', '_')}`
                : `${BACKEND_URL}/api/orders`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch orders');
            return await response.json();
        } catch (error: any) {
            console.error('Orders fetch error:', error.message);
            return [];
        }
    }

    async getOrderHistory(symbol?: string, limit: number = 50): Promise<Order[]> {
        try {
            const params = new URLSearchParams({ limit: String(limit) });
            if (symbol) params.append('symbol', symbol.replace('/', '_'));

            const response = await fetch(`${BACKEND_URL}/api/orders/history?${params}`);
            if (!response.ok) throw new Error('Failed to fetch order history');
            return await response.json();
        } catch (error: any) {
            console.error('Order history fetch error:', error.message);
            return [];
        }
    }

    async placeOrder(order: OrderRequest): Promise<{ success: boolean; order?: Order; error?: string }> {
        try {
            console.log(`📝 Placing ${order.side.toUpperCase()} ${order.type} order:`, order);

            const response = await fetch(`${BACKEND_URL}/api/order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(order),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Order failed');
            }

            console.log('✅ Order placed:', data.order);
            return { success: true, order: data.order };
        } catch (error: any) {
            console.error('Order placement error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async cancelOrder(orderId: string, symbol: string): Promise<{ success: boolean; error?: string }> {
        try {
            console.log(`❌ Cancelling order ${orderId}`);

            const response = await fetch(
                `${BACKEND_URL}/api/order/${orderId}?symbol=${symbol.replace('/', '_')}`,
                { method: 'DELETE' }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Cancellation failed');
            }

            console.log('✅ Order cancelled');
            return { success: true };
        } catch (error: any) {
            console.error('Order cancellation error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    async healthCheck(): Promise<{ status: string; mode: string; exchange: string }> {
        try {
            const response = await fetch(`${BACKEND_URL}/api/health`);
            return await response.json();
        } catch (error) {
            return { status: 'error', mode: 'unknown', exchange: 'unknown' };
        }
    }

    getMode(): 'testnet' | 'live' {
        return this.mode;
    }

    isExchangeConnected(): boolean {
        return this.isConnected;
    }

    disconnect() {
        this.isConnected = false;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.listeners.clear();
    }
}

export const binanceService = new BinanceService();
export default binanceService;
