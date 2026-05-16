// ============================================
// CCXT TRADING SERVICE - REAL EXCHANGE CONNECTIONS
// ============================================

import ccxt, { Exchange, Order as CCXTOrder, Ticker as CCXTTicker, OHLCV } from 'ccxt';
import {
    ExchangeId,
    ExchangeCredentials,
    MarketData,
    OrderBook,
    Ticker,
    Order,
    OrderType,
    OrderSide,
    Balance,
    Portfolio,
    Position
} from '../../types/trading';

// Exchange configurations
const EXCHANGE_CONFIG: Record<ExchangeId, any> = {
    binance: { enableRateLimit: true, options: { defaultType: 'spot' } },
    coinbase: { enableRateLimit: true },
    kraken: { enableRateLimit: true },
    kucoin: { enableRateLimit: true },
    bybit: { enableRateLimit: true, options: { defaultType: 'spot' } },
    okx: { enableRateLimit: true },
    uniswap: {}, // Handled separately via ethers
    sushiswap: {} // Handled separately via ethers
};

class CCXTService {
    private exchanges: Map<ExchangeId, Exchange> = new Map();
    private activeExchange: Exchange | null = null;
    private activeExchangeId: ExchangeId | null = null;
    private isTestMode: boolean = true;

    // ==========================================
    // EXCHANGE CONNECTION
    // ==========================================

    async connectExchange(
        exchangeId: ExchangeId,
        credentials: ExchangeCredentials
    ): Promise<boolean> {
        try {
            // Skip DEX connections (handled by ethers)
            if (exchangeId === 'uniswap' || exchangeId === 'sushiswap') {
                console.log(`${exchangeId} is a DEX, use DeFi service instead`);
                return false;
            }

            const ExchangeClass = (ccxt as any)[exchangeId];
            if (!ExchangeClass) {
                throw new Error(`Exchange ${exchangeId} not supported`);
            }

            const exchange = new ExchangeClass({
                ...EXCHANGE_CONFIG[exchangeId],
                apiKey: credentials.apiKey,
                secret: credentials.secret,
                password: credentials.password,
                sandbox: credentials.sandbox || this.isTestMode,
            });

            // Test connection by loading markets
            await exchange.loadMarkets();

            this.exchanges.set(exchangeId, exchange);
            this.activeExchange = exchange;
            this.activeExchangeId = exchangeId;

            console.log(`✅ Connected to ${exchangeId} ${credentials.sandbox ? '(SANDBOX)' : '(LIVE)'}`);
            return true;
        } catch (error: any) {
            console.error(`❌ Failed to connect to ${exchangeId}:`, error.message);
            throw error;
        }
    }

    setTestMode(enabled: boolean): void {
        this.isTestMode = enabled;
        console.log(`Trading mode: ${enabled ? 'PAPER' : 'LIVE'}`);
    }

    getActiveExchange(): Exchange | null {
        return this.activeExchange;
    }

    // ==========================================
    // MARKET DATA
    // ==========================================

    async fetchTicker(symbol: string): Promise<Ticker | null> {
        if (!this.activeExchange) return null;

        try {
            const ticker: CCXTTicker = await this.activeExchange.fetchTicker(symbol);

            return {
                symbol,
                timestamp: ticker.timestamp || Date.now(),
                bid: ticker.bid || 0,
                ask: ticker.ask || 0,
                last: ticker.last || 0,
                change: ticker.change || 0,
                changePercent: ticker.percentage || 0,
                volume: ticker.baseVolume || 0,
                high24h: ticker.high || 0,
                low24h: ticker.low || 0,
            };
        } catch (error: any) {
            console.error(`Error fetching ticker for ${symbol}:`, error.message);
            return null;
        }
    }

    async fetchMultipleTickers(symbols: string[]): Promise<Map<string, Ticker>> {
        const tickers = new Map<string, Ticker>();

        if (!this.activeExchange) return tickers;

        try {
            // Check if exchange supports fetchTickers
            if (this.activeExchange.has['fetchTickers']) {
                const allTickers = await this.activeExchange.fetchTickers(symbols);

                for (const symbol of symbols) {
                    if (allTickers[symbol]) {
                        const t = allTickers[symbol];
                        tickers.set(symbol, {
                            symbol,
                            timestamp: t.timestamp || Date.now(),
                            bid: t.bid || 0,
                            ask: t.ask || 0,
                            last: t.last || 0,
                            change: t.change || 0,
                            changePercent: t.percentage || 0,
                            volume: t.baseVolume || 0,
                            high24h: t.high || 0,
                            low24h: t.low || 0,
                        });
                    }
                }
            } else {
                // Fallback to individual fetches
                for (const symbol of symbols) {
                    const ticker = await this.fetchTicker(symbol);
                    if (ticker) tickers.set(symbol, ticker);
                }
            }
        } catch (error: any) {
            console.error('Error fetching multiple tickers:', error.message);
        }

        return tickers;
    }

    async fetchOHLCV(
        symbol: string,
        timeframe: string = '1h',
        limit: number = 100
    ): Promise<MarketData[]> {
        if (!this.activeExchange) return [];

        try {
            const ohlcv: OHLCV[] = await this.activeExchange.fetchOHLCV(symbol, timeframe, undefined, limit);

            return ohlcv.map(candle => ({
                symbol,
                timestamp: candle[0] as number,
                open: candle[1] as number,
                high: candle[2] as number,
                low: candle[3] as number,
                close: candle[4] as number,
                volume: candle[5] as number,
            }));
        } catch (error: any) {
            console.error(`Error fetching OHLCV for ${symbol}:`, error.message);
            return [];
        }
    }

    async fetchOrderBook(symbol: string, limit: number = 20): Promise<OrderBook | null> {
        if (!this.activeExchange) return null;

        try {
            const orderbook = await this.activeExchange.fetchOrderBook(symbol, limit);
            const topAsk = orderbook.asks[0]?.[0] ?? 0;
            const topBid = orderbook.bids[0]?.[0] ?? 0;
            const spread = topAsk - topBid;
            const midPrice = (topAsk + topBid) / 2;

            return {
                symbol,
                timestamp: orderbook.timestamp || Date.now(),
                bids: orderbook.bids as [number, number][],
                asks: orderbook.asks as [number, number][],
                spread,
                spreadPercent: midPrice > 0 ? (spread / midPrice) * 100 : 0,
            };
        } catch (error: any) {
            console.error(`Error fetching order book for ${symbol}:`, error.message);
            return null;
        }
    }

    // ==========================================
    // TRADING OPERATIONS
    // ==========================================

    async createOrder(
        symbol: string,
        type: OrderType,
        side: OrderSide,
        amount: number,
        price?: number,
        params?: Record<string, any>
    ): Promise<Order | null> {
        if (!this.activeExchange || !this.activeExchangeId) {
            console.error('No active exchange');
            return null;
        }

        try {
            // Map our order types to CCXT types
            const ccxtType = this.mapOrderType(type);

            let order: CCXTOrder;

            if (type === 'market') {
                order = await this.activeExchange.createOrder(symbol, 'market', side, amount, undefined, params);
            } else if (type === 'limit') {
                if (!price) throw new Error('Price required for limit orders');
                order = await this.activeExchange.createOrder(symbol, 'limit', side, amount, price, params);
            } else if (type === 'stop_loss' || type === 'stop_loss_limit') {
                if (!params?.stopPrice) throw new Error('Stop price required for stop loss orders');
                order = await this.activeExchange.createOrder(symbol, ccxtType, side, amount, price, {
                    stopPrice: params.stopPrice,
                    ...params
                });
            } else if (type === 'take_profit' || type === 'take_profit_limit') {
                if (!params?.stopPrice) throw new Error('Take profit price required');
                order = await this.activeExchange.createOrder(symbol, ccxtType, side, amount, price, {
                    stopPrice: params.stopPrice,
                    ...params
                });
            } else {
                order = await this.activeExchange.createOrder(symbol, ccxtType, side, amount, price, params);
            }

            console.log(`✅ Order created: ${order.id} - ${side} ${amount} ${symbol} @ ${price || 'market'}`);

            return this.mapCCXTOrder(order);
        } catch (error: any) {
            console.error(`❌ Error creating order:`, error.message);
            throw error;
        }
    }

    async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
        if (!this.activeExchange) return false;

        try {
            await this.activeExchange.cancelOrder(orderId, symbol);
            console.log(`✅ Order cancelled: ${orderId}`);
            return true;
        } catch (error: any) {
            console.error(`❌ Error cancelling order:`, error.message);
            return false;
        }
    }

    async cancelAllOrders(symbol?: string): Promise<boolean> {
        if (!this.activeExchange) return false;

        try {
            if (this.activeExchange.has['cancelAllOrders']) {
                await this.activeExchange.cancelAllOrders(symbol);
            } else {
                // Fallback: fetch and cancel each order
                const orders = await this.fetchOpenOrders(symbol);
                for (const order of orders) {
                    await this.cancelOrder(order.id, order.symbol);
                }
            }
            console.log(`✅ All orders cancelled${symbol ? ` for ${symbol}` : ''}`);
            return true;
        } catch (error: any) {
            console.error(`❌ Error cancelling all orders:`, error.message);
            return false;
        }
    }

    async fetchOpenOrders(symbol?: string): Promise<Order[]> {
        if (!this.activeExchange) return [];

        try {
            const orders = await this.activeExchange.fetchOpenOrders(symbol);
            return orders.map(o => this.mapCCXTOrder(o));
        } catch (error: any) {
            console.error('Error fetching open orders:', error.message);
            return [];
        }
    }

    async fetchOrder(orderId: string, symbol: string): Promise<Order | null> {
        if (!this.activeExchange) return null;

        try {
            const order = await this.activeExchange.fetchOrder(orderId, symbol);
            return this.mapCCXTOrder(order);
        } catch (error: any) {
            console.error(`Error fetching order ${orderId}:`, error.message);
            return null;
        }
    }

    // ==========================================
    // PORTFOLIO & BALANCE
    // ==========================================

    async fetchBalance(): Promise<Balance[]> {
        if (!this.activeExchange) return [];

        try {
            const balance = await this.activeExchange.fetchBalance();
            const balances: Balance[] = [];

            for (const [currency, data] of Object.entries(balance.total)) {
                const total = data as number;
                if (total > 0) {
                    const balanceData = balance[currency] as any;
                    balances.push({
                        currency,
                        free: balanceData?.free || 0,
                        used: balanceData?.used || 0,
                        total,
                    });
                }
            }

            return balances;
        } catch (error: any) {
            console.error('Error fetching balance:', error.message);
            return [];
        }
    }

    async fetchPortfolio(): Promise<Portfolio | null> {
        if (!this.activeExchange) return null;

        try {
            const balances = await this.fetchBalance();

            // Calculate total value in USD
            let totalValueUSD = 0;
            const balancesWithValue: Balance[] = [];

            for (const balance of balances) {
                let valueInUSD = 0;

                if (balance.currency === 'USDT' || balance.currency === 'USDC' || balance.currency === 'USD') {
                    valueInUSD = balance.total;
                } else {
                    // Try to get USD value
                    try {
                        const ticker = await this.fetchTicker(`${balance.currency}/USDT`);
                        if (ticker) {
                            valueInUSD = balance.total * ticker.last;
                        }
                    } catch {
                        // Try with USD pair
                        try {
                            const ticker = await this.fetchTicker(`${balance.currency}/USD`);
                            if (ticker) {
                                valueInUSD = balance.total * ticker.last;
                            }
                        } catch {
                            // Skip if no USD pair available
                        }
                    }
                }

                balancesWithValue.push({
                    ...balance,
                    valueInUSD,
                });
                totalValueUSD += valueInUSD;
            }

            return {
                totalValueUSD,
                totalPnL: 0, // Would need historical data to calculate
                totalPnLPercent: 0,
                balances: balancesWithValue,
                positions: [], // Spot trading doesn't have positions
                lastUpdate: Date.now(),
            };
        } catch (error: any) {
            console.error('Error fetching portfolio:', error.message);
            return null;
        }
    }

    // Fetch positions for derivatives exchanges
    async fetchPositions(symbol?: string): Promise<Position[]> {
        if (!this.activeExchange) return [];

        try {
            if (!this.activeExchange.has['fetchPositions']) {
                return [];
            }

            const positions = await this.activeExchange.fetchPositions(symbol ? [symbol] : undefined);

            return positions
                .filter((p: any) => Math.abs(p.contracts) > 0)
                .map((p: any) => ({
                    symbol: p.symbol,
                    side: p.side === 'long' ? 'long' : 'short',
                    size: Math.abs(p.contracts),
                    entryPrice: p.entryPrice || 0,
                    currentPrice: p.markPrice || 0,
                    unrealizedPnl: p.unrealizedPnl || 0,
                    unrealizedPnlPercent: p.percentage || 0,
                    leverage: p.leverage,
                    liquidationPrice: p.liquidationPrice,
                    margin: p.collateral,
                    timestamp: Date.now(),
                }));
        } catch (error: any) {
            console.error('Error fetching positions:', error.message);
            return [];
        }
    }

    // ==========================================
    // UTILITY METHODS
    // ==========================================

    private mapOrderType(type: OrderType): string {
        const mapping: Record<OrderType, string> = {
            market: 'market',
            limit: 'limit',
            stop_loss: 'stop',
            stop_loss_limit: 'stop_limit',
            take_profit: 'take_profit',
            take_profit_limit: 'take_profit_limit',
        };
        return mapping[type] || 'market';
    }

    private mapCCXTOrder(order: CCXTOrder): Order {
        return {
            id: order.id,
            clientOrderId: order.clientOrderId,
            symbol: order.symbol,
            type: (order.type || 'market') as OrderType,
            side: (order.side || 'buy') as OrderSide,
            price: order.price ?? 0,
            stopPrice: order.stopPrice,
            amount: order.amount ?? 0,
            filled: order.filled ?? 0,
            remaining: order.remaining ?? 0,
            cost: order.cost ?? 0,
            fee: order.fee ? {
                cost: order.fee.cost ?? 0,
                currency: order.fee.currency ?? '',
                rate: order.fee.rate,
            } : undefined,
            status: this.mapOrderStatus(order.status ?? 'open'),
            timestamp: order.timestamp ?? Date.now(),
            exchange: this.activeExchangeId!,
        };
    }


    private mapOrderStatus(status: string): Order['status'] {
        const mapping: Record<string, Order['status']> = {
            open: 'open',
            closed: 'filled',
            canceled: 'cancelled',
            expired: 'cancelled',
            rejected: 'failed',
            partial: 'partially_filled',
            partially_filled: 'partially_filled',
        };
        return mapping[status] || 'pending';
    }

    getSupportedSymbols(): string[] {
        if (!this.activeExchange) return [];
        return Object.keys(this.activeExchange.markets || {});
    }

    async testConnection(): Promise<boolean> {
        if (!this.activeExchange) return false;

        try {
            await this.activeExchange.fetchTime();
            return true;
        } catch {
            return false;
        }
    }
}

// Singleton instance
export const ccxtService = new CCXTService();
export default ccxtService;
