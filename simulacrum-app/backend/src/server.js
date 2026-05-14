// ============================================
// SIMULACRUM TRADING BACKEND
// Binance Integration Server
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import ccxt from 'ccxt';
import { WebSocketServer } from 'ws';
import http from 'http';

// Load .env from backend folder first, then fallback to parent
dotenv.config(); // Load from current folder (backend/.env)
dotenv.config({ path: '../.env' }); // Also try parent .env as fallback

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(helmet());
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:3000'],
    credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());

// ==========================================
// BINANCE EXCHANGE INSTANCE
// ==========================================

let exchange = null;

function initializeExchange() {
    const config = {
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_API_SECRET,
        enableRateLimit: true,
        options: {
            defaultType: 'spot',
            adjustForTimeDifference: true,
        },
    };

    // Always use Production Binance (LIVE mode)
    exchange = new ccxt.binance(config);
    console.log('🔴 Binance LIVE mode initialized');
    return exchange;
}

// ==========================================
// API ROUTES
// ==========================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        mode: 'live',
        exchange: 'binance',
        connected: !!exchange,
        timestamp: Date.now(),
    });
});

// Initialize exchange connection (LIVE mode only)
app.post('/api/exchange/connect', async (req, res) => {
    try {
        if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
            return res.status(400).json({
                error: 'API keys not configured',
                message: 'Please set BINANCE_API_KEY and BINANCE_API_SECRET in backend/.env file',
            });
        }

        initializeExchange();

        // Test connection by fetching balance
        const balance = await exchange.fetchBalance();

        res.json({
            success: true,
            mode: 'live',
            message: 'Connected to Binance LIVE successfully',
            balances: Object.entries(balance.total)
                .filter(([_, v]) => v > 0)
                .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
        });
    } catch (error) {
        console.error('Exchange connection error:', error.message);
        res.status(500).json({
            error: 'Connection failed: binance',
            message: error.message,
        });
    }
});

// Get portfolio/balance
app.get('/api/portfolio', async (req, res) => {
    try {
        if (!exchange) {
            return res.status(400).json({ error: 'Exchange not connected' });
        }

        const balance = await exchange.fetchBalance();

        // Get current prices for valuation (EUR pairs for EU)
        const tickers = await exchange.fetchTickers(['BTC/EUR', 'ETH/EUR', 'BNB/EUR']);

        const positions = [];
        let totalValueEUR = 0;

        for (const [asset, amount] of Object.entries(balance.total)) {
            if (amount > 0) {
                let valueEUR = 0;
                let price = 0;

                if (asset === 'EUR') {
                    valueEUR = amount;
                    price = 1;
                } else {
                    const ticker = tickers[`${asset}/EUR`];
                    if (ticker) {
                        price = ticker.last;
                        valueEUR = amount * price;
                    }
                }

                if (valueEUR > 0.01) { // Filter dust
                    positions.push({
                        symbol: `${asset}/EUR`,
                        asset,
                        size: amount,
                        currentPrice: price,
                        valueEUR,
                        unrealizedPnl: 0, // Would need entry price tracking
                        unrealizedPnlPercent: 0,
                    });
                    totalValueEUR += valueEUR;
                }
            }
        }

        res.json({
            totalValueEUR,
            totalPnL: 0, // Would need historical tracking
            totalPnLPercent: 0,
            positions,
            timestamp: Date.now(),
        });
    } catch (error) {
        console.error('Portfolio fetch error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get ticker/price
app.get('/api/ticker/:symbol', async (req, res) => {
    try {
        if (!exchange) {
            return res.status(400).json({ error: 'Exchange not connected' });
        }

        const symbol = req.params.symbol.replace('_', '/');
        const ticker = await exchange.fetchTicker(symbol);

        res.json({
            symbol,
            price: ticker.last,
            bid: ticker.bid,
            ask: ticker.ask,
            volume24h: ticker.quoteVolume,
            change24h: ticker.percentage,
            high24h: ticker.high,
            low24h: ticker.low,
            timestamp: ticker.timestamp,
        });
    } catch (error) {
        console.error('Ticker fetch error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get OHLCV candles
app.get('/api/candles/:symbol', async (req, res) => {
    try {
        if (!exchange) {
            return res.status(400).json({ error: 'Exchange not connected' });
        }

        const symbol = req.params.symbol.replace('_', '/');
        const timeframe = req.query.timeframe || '1h';
        const limit = parseInt(req.query.limit) || 200;

        const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);

        res.json(candles.map(c => ({
            timestamp: c[0],
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5],
        })));
    } catch (error) {
        console.error('Candles fetch error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get open orders
app.get('/api/orders', async (req, res) => {
    try {
        if (!exchange) {
            return res.status(400).json({ error: 'Exchange not connected' });
        }

        const symbol = req.query.symbol?.replace('_', '/');
        const orders = await exchange.fetchOpenOrders(symbol);

        res.json(orders.map(order => ({
            id: order.id,
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            price: order.price,
            amount: order.amount,
            filled: order.filled,
            remaining: order.remaining,
            status: order.status,
            timestamp: order.timestamp,
        })));
    } catch (error) {
        console.error('Orders fetch error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get order history
app.get('/api/orders/history', async (req, res) => {
    try {
        if (!exchange) {
            return res.status(400).json({ error: 'Exchange not connected' });
        }

        const symbol = req.query.symbol?.replace('_', '/');
        const limit = parseInt(req.query.limit) || 50;

        const orders = await exchange.fetchClosedOrders(symbol, undefined, limit);

        res.json(orders.map(order => ({
            id: order.id,
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            price: order.price || order.average,
            amount: order.amount,
            filled: order.filled,
            cost: order.cost,
            status: order.status,
            timestamp: order.timestamp,
        })));
    } catch (error) {
        console.error('Order history fetch error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Place order
app.post('/api/order', async (req, res) => {
    try {
        if (!exchange) {
            return res.status(400).json({ error: 'Exchange not connected' });
        }

        const { symbol, side, type, amount, price, stopLoss, takeProfit } = req.body;

        if (!symbol || !side || !type || !amount) {
            return res.status(400).json({
                error: 'Missing required fields: symbol, side, type, amount',
            });
        }

        const formattedSymbol = symbol.replace('_', '/');

        // Ensure markets are loaded
        if (!exchange.markets) {
            await exchange.loadMarkets();
        }

        if (!exchange.markets[formattedSymbol]) {
            return res.status(400).json({ error: `Invalid symbol: ${formattedSymbol}` });
        }

        const market = exchange.market(formattedSymbol);

        // 1. VALIDATE PRECISION
        // Normalize amount and price to exchange strict requirements
        const amountToPlace = exchange.amountToPrecision(formattedSymbol, amount);
        let priceToPlace = undefined;

        if (type === 'limit') {
            if (!price) {
                return res.status(400).json({ error: 'Limit orders require a price' });
            }
            priceToPlace = exchange.priceToPrecision(formattedSymbol, price);
        }

        // 2. VALIDATE MIN NOTIONAL (Minimum Order Value)
        // If it's a market order, we need current price to estimate value
        const currentPrice = priceToPlace || (await exchange.fetchTicker(formattedSymbol)).last;
        const notional = parseFloat(amountToPlace) * parseFloat(currentPrice);

        if (market.limits && market.limits.cost && market.limits.cost.min) {
            if (notional < market.limits.cost.min) {
                return res.status(400).json({
                    error: `Order value too small. Value: ${notional.toFixed(2)}, Min: ${market.limits.cost.min}`
                });
            }
        }

        // 3. VALIDATE BALANCE
        const balance = await exchange.fetchBalance();

        if (side === 'buy') {
            const quoteCurrency = market.quote; // e.g., USDT
            const availableBalance = balance[quoteCurrency]?.free || 0;

            // For market buys, we estimate cost. For limit, it's exact price.
            if (parseFloat(availableBalance) < notional) {
                return res.status(400).json({
                    error: `Insufficient ${quoteCurrency} balance. Available: ${availableBalance}, Required: ~${notional.toFixed(2)}`
                });
            }
        } else if (side === 'sell') {
            const baseCurrency = market.base; // e.g., BTC
            const availableBalance = balance[baseCurrency]?.free || 0;

            if (parseFloat(availableBalance) < parseFloat(amountToPlace)) {
                return res.status(400).json({
                    error: `Insufficient ${baseCurrency} balance. Available: ${availableBalance}, Required: ${amountToPlace}`
                });
            }
        }

        console.log(`📝 Placing ${side.toUpperCase()} ${type} order: ${amountToPlace} ${formattedSymbol} @ ${priceToPlace || 'market'}`);

        let order;

        if (type === 'market') {
            order = await exchange.createOrder(formattedSymbol, 'market', side, amountToPlace);
        } else if (type === 'limit') {
            order = await exchange.createOrder(formattedSymbol, 'limit', side, amountToPlace, priceToPlace);
        } else {
            return res.status(400).json({ error: 'Invalid order type. Use "market" or "limit"' });
        }

        console.log(`✅ Order placed: ${order.id}`);

        // 4. HANDLE STOP-LOSS & TAKE-PROFIT (Priority 2)
        // For Spot, we place these as separate orders AFTER the main order is filled or if using an advanced order type if supported.
        // Simplest robust implementation for this auditing phase:
        if (stopLoss || takeProfit) {
            try {
                // Only place protections if the main order was a BUY. 
                // Protecting a SELL (short) on spot matches is not typical spot logic (margin needed).
                // Assuming Spot Long strategy here.
                if (side === 'buy') {
                    // Check if we have the asset now (market buy fills immediately-ish, limit might not)
                    // If limit buy, we can't place SL/TP yet until filled. 
                    // This is a limitation of simple spot.
                    // For now, we will log a warning if it's a limit order that isn't filled.

                    if (order.status === 'closed' || order.status === 'open') {
                        // Note: If order is 'open' (limit), placing SL now might fail if we don't have funds, 
                        // BUT for OCO orders we sell the asset we just bought.
                        // Only place SL/TP if order is FILLED (for market). 
                        // For Limit, we can't attach OCO easily in one go on basic spot API without margin.

                        if (type === 'market' && order.filled > 0) {
                            const sellAmount = order.filled; // Sell what we bought

                            if (stopLoss && takeProfit) {
                                // Try OCO order
                                console.log(`🛡️ Placing OCO for ${formattedSymbol}`);
                                const stopPrice = exchange.priceToPrecision(formattedSymbol, stopLoss);
                                const takeProfitPrice = exchange.priceToPrecision(formattedSymbol, takeProfit);

                                // Binance OCO params
                                // Stop Limit order for SL, LimitMaker for TP
                                await exchange.privatePostOrderOco({
                                    symbol: market.id,
                                    side: 'SELL',
                                    quantity: exchange.amountToPrecision(formattedSymbol, sellAmount),
                                    price: takeProfitPrice,
                                    stopPrice: stopPrice,
                                    stopLimitPrice: stopPrice, // Trigger limit at same price or slightly lower
                                });
                                console.log('✅ OCO Order placed');
                            }
                            else if (stopLoss) {
                                console.log(`🛡️ Placing Stop-Loss for ${formattedSymbol}`);
                                // Stop Market or Stop Limit
                                // Using Stop Limit usually on Binance Spot
                                const stopPrice = exchange.priceToPrecision(formattedSymbol, stopLoss);
                                await exchange.createOrder(formattedSymbol, 'STOP_LOSS_LIMIT', 'sell', sellAmount, stopPrice, {
                                    stopPrice: stopPrice
                                });
                            }
                        } else {
                            console.log('⚠️ Pending Limit Order: SL/TP not attached automatically. Monitor order execution.');
                        }
                    }
                }
            } catch (slError) {
                console.error('❌ Failed to place Stop-Loss/TP:', slError.message);
                // Don't fail the main request, but log it.
            }
        }

        res.json({
            success: true,
            order: {
                id: order.id,
                symbol: order.symbol,
                side: order.side,
                type: order.type,
                price: order.price || order.average,
                amount: order.amount,
                filled: order.filled,
                status: order.status,
                timestamp: order.timestamp,
            },
        });
    } catch (error) {
        console.error('Order placement error:', error.message);
        // Categorize errors if possible
        let errorMsg = error.message;
        if (errorMsg.includes('MIN_NOTIONAL')) errorMsg = 'Order value too small (Min Notional)';
        if (errorMsg.includes('Account has insufficient balance')) errorMsg = 'Insufficient Funds';

        res.status(500).json({
            error: 'Order failed',
            message: errorMsg,
        });
    }
});

// Cancel order
app.delete('/api/order/:id', async (req, res) => {
    try {
        if (!exchange) {
            return res.status(400).json({ error: 'Exchange not connected' });
        }

        const orderId = req.params.id;
        const symbol = req.query.symbol?.replace('_', '/');

        if (!symbol) {
            return res.status(400).json({ error: 'Symbol is required' });
        }

        console.log(`❌ Cancelling order ${orderId} for ${symbol}`);

        const result = await exchange.cancelOrder(orderId, symbol);

        res.json({
            success: true,
            cancelled: orderId,
            message: 'Order cancelled successfully',
        });
    } catch (error) {
        console.error('Order cancellation error:', error.message);
        res.status(500).json({
            error: 'Cancellation failed',
            message: error.message,
        });
    }
});

// Get trading fees
app.get('/api/fees', async (req, res) => {
    try {
        if (!exchange) {
            return res.status(400).json({ error: 'Exchange not connected' });
        }

        const fees = await exchange.fetchTradingFees();

        res.json({
            maker: fees['BTC/EUR']?.maker || 0.001,
            taker: fees['BTC/EUR']?.taker || 0.001,
        });
    } catch (error) {
        console.error('Fees fetch error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get available symbols
app.get('/api/symbols', async (req, res) => {
    try {
        if (!exchange) {
            // Return default EUR symbols if not connected
            return res.json([
                'BTC/EUR', 'ETH/EUR', 'BNB/EUR', 'SOL/EUR', 'XRP/EUR',
                'ADA/EUR', 'DOGE/EUR', 'AVAX/EUR', 'DOT/EUR', 'MATIC/EUR',
            ]);
        }

        await exchange.loadMarkets();
        const symbols = Object.keys(exchange.markets)
            .filter(s => s.endsWith('/EUR'))
            .sort();

        res.json(symbols.slice(0, 100)); // Limit to 100 most common
    } catch (error) {
        console.error('Symbols fetch error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// WEBSOCKET SERVER FOR REAL-TIME DATA
// ==========================================

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const subscriptions = new Map();

wss.on('connection', (ws) => {
    console.log('🔌 WebSocket client connected');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.action === 'subscribe') {
                const symbol = data.symbol;
                console.log(`📡 Subscribing to ${symbol}`);

                // Start price streaming for this symbol
                if (!subscriptions.has(symbol)) {
                    const interval = setInterval(async () => {
                        try {
                            if (exchange) {
                                const ticker = await exchange.fetchTicker(symbol);
                                wss.clients.forEach(client => {
                                    if (client.readyState === 1) {
                                        client.send(JSON.stringify({
                                            type: 'ticker',
                                            symbol,
                                            price: ticker.last,
                                            bid: ticker.bid,
                                            ask: ticker.ask,
                                            volume: ticker.quoteVolume,
                                            timestamp: Date.now(),
                                        }));
                                    }
                                });
                            }
                        } catch (e) {
                            console.error('Ticker stream error:', e.message);
                        }
                    }, 2000); // Update every 2 seconds

                    subscriptions.set(symbol, interval);
                }
            }

            if (data.action === 'unsubscribe') {
                const symbol = data.symbol;
                const interval = subscriptions.get(symbol);
                if (interval) {
                    clearInterval(interval);
                    subscriptions.delete(symbol);
                    console.log(`📡 Unsubscribed from ${symbol}`);
                }
            }
        } catch (e) {
            console.error('WebSocket message error:', e.message);
        }
    });

    ws.on('close', () => {
        console.log('🔌 WebSocket client disconnected');
    });
});

// ==========================================
// START SERVER
// ==========================================

server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 SIMULACRUM TRADING BACKEND                          ║
║                                                           ║
║   Server running on: http://localhost:${PORT}              ║
║   WebSocket:         ws://localhost:${PORT}/ws             ║
║                                                           ║
║   Endpoints:                                              ║
║   - GET  /api/health              Health check            ║
║   - POST /api/exchange/connect    Connect to Binance      ║
║   - GET  /api/portfolio           Get balances            ║
║   - GET  /api/ticker/:symbol      Get price               ║
║   - GET  /api/candles/:symbol     Get OHLCV               ║
║   - GET  /api/orders              Get open orders         ║
║   - POST /api/order               Place order             ║
║   - DELETE /api/order/:id         Cancel order            ║
║   - GET  /api/symbols             Available symbols       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

    // Auto-initialize in LIVE mode if keys are present
    if (process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET) {
        try {
            initializeExchange();
            console.log('✅ Exchange auto-initialized in LIVE mode');
        } catch (e) {
            console.error('❌ Exchange initialization failed:', e.message);
        }
    } else {
        console.log('⚠️  No API keys found. Please configure BINANCE_API_KEY and BINANCE_API_SECRET in backend/.env');
    }
});
