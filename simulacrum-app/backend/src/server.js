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
const BIND_ADDR = process.env.BACKEND_BIND || '127.0.0.1';
const AUTH_TOKEN = process.env.BACKEND_AUTH_TOKEN || '';
const ALLOWED_ORIGINS = (process.env.BACKEND_CORS_ORIGINS ||
    'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:3000'
).split(',').map(s => s.trim()).filter(Boolean);

if (!AUTH_TOKEN) {
    console.warn(
        '⚠️  BACKEND_AUTH_TOKEN is empty. The backend will REJECT all trading\n' +
        '   requests until you set one in backend/.env. Generate one with:\n' +
        '       openssl rand -hex 32'
    );
}

// ==========================================
// MIDDLEWARE
// ==========================================

// Helmet defaults + a strict-ish CSP. The backend serves JSON only; it should
// never need to fetch arbitrary external content.
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            defaultSrc: ["'none'"],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));
app.use(cors({
    origin: (origin, cb) => {
        // Allow same-origin/no-origin (curl, server-to-server)
        if (!origin) return cb(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '64kb' }));

// ==========================================
// AUTH — every mutating / privileged endpoint requires the shared token.
// Public endpoints (/api/health) explicitly opt-out below.
// ==========================================
function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function requireAuth(req, res, next) {
    if (!AUTH_TOKEN) {
        return res.status(503).json({
            error: 'Backend auth not configured',
            message: 'Set BACKEND_AUTH_TOKEN in backend/.env',
        });
    }
    const supplied = req.headers['x-simulacrum-token'];
    if (!timingSafeEqual(String(supplied || ''), AUTH_TOKEN)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ==========================================
// BINANCE EXCHANGE INSTANCE
// ==========================================

let exchange = null;

function initializeExchange() {
    const useTestnet = String(process.env.BINANCE_USE_TESTNET || '').toLowerCase() === 'true';
    const config = {
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_API_SECRET,
        enableRateLimit: true,
        options: {
            defaultType: 'spot',
            adjustForTimeDifference: true,
        },
    };

    exchange = new ccxt.binance(config);
    if (useTestnet) {
        if (typeof exchange.setSandboxMode === 'function') {
            exchange.setSandboxMode(true);
        } else {
            exchange.urls['api'] = exchange.urls['test'];
        }
        console.log('🟡 Binance TESTNET mode initialized');
    } else {
        console.log('🔴 Binance LIVE mode initialized');
    }
    return exchange;
}

// Allow-list of symbols the API may touch. Set TRADEABLE_SYMBOLS in the env to
// override. Keeps the surface tight even if the frontend is tricked into
// sending garbage.
const TRADEABLE_SYMBOLS = (process.env.TRADEABLE_SYMBOLS ||
    'BTC/EUR,ETH/EUR,SOL/EUR,AVAX/EUR,BNB/EUR,XRP/EUR,ADA/EUR,DOGE/EUR,DOT/EUR,MATIC/EUR,BTC/USDT,ETH/USDT'
).split(',').map(s => s.trim()).filter(Boolean);

function normalizeAndValidateSymbol(rawSymbol) {
    if (!rawSymbol || typeof rawSymbol !== 'string') {
        return { error: 'Symbol is required' };
    }
    if (rawSymbol.length > 20 || !/^[A-Za-z0-9_/]+$/.test(rawSymbol)) {
        return { error: 'Invalid symbol format' };
    }
    const symbol = rawSymbol.replace('_', '/').toUpperCase();
    if (!TRADEABLE_SYMBOLS.includes(symbol)) {
        return { error: `Symbol ${symbol} not in allow-list` };
    }
    return { symbol };
}

// ==========================================
// API ROUTES
// ==========================================

// Health check — kept public so the UI can probe even without a token.
app.get('/api/health', (req, res) => {
    const useTestnet = String(process.env.BINANCE_USE_TESTNET || '').toLowerCase() === 'true';
    res.json({
        status: 'ok',
        mode: useTestnet ? 'testnet' : 'live',
        exchange: 'binance',
        connected: !!exchange,
        authConfigured: AUTH_TOKEN.length > 0,
        timestamp: Date.now(),
    });
});

// Initialize exchange connection (LIVE mode only)
app.post('/api/exchange/connect', requireAuth, async (req, res) => {
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

        const useTestnet = String(process.env.BINANCE_USE_TESTNET || '').toLowerCase() === 'true';
        res.json({
            success: true,
            mode: useTestnet ? 'testnet' : 'live',
            message: `Connected to Binance ${useTestnet ? 'TESTNET' : 'LIVE'} successfully`,
            balances: Object.entries(balance.total)
                .filter(([, v]) => v > 0)
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
app.get('/api/portfolio', requireAuth, async (req, res) => {
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
app.get('/api/ticker/:symbol', requireAuth, async (req, res) => {
    try {
        if (!exchange) {
            return res.status(400).json({ error: 'Exchange not connected' });
        }

        const { symbol, error } = normalizeAndValidateSymbol(req.params.symbol);
        if (error) return res.status(400).json({ error });
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
const ALLOWED_TIMEFRAMES = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']);
app.get('/api/candles/:symbol', requireAuth, async (req, res) => {
    try {
        if (!exchange) {
            return res.status(400).json({ error: 'Exchange not connected' });
        }

        const { symbol, error } = normalizeAndValidateSymbol(req.params.symbol);
        if (error) return res.status(400).json({ error });

        const timeframe = String(req.query.timeframe || '1h');
        if (!ALLOWED_TIMEFRAMES.has(timeframe)) {
            return res.status(400).json({ error: `Invalid timeframe: ${timeframe}` });
        }

        const requestedLimit = parseInt(req.query.limit, 10);
        const limit = Number.isFinite(requestedLimit)
            ? Math.max(1, Math.min(requestedLimit, 1000))
            : 200;

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
app.get('/api/orders', requireAuth, async (req, res) => {
    try {
        if (!exchange) {
            return res.status(400).json({ error: 'Exchange not connected' });
        }

        let symbol;
        if (req.query.symbol) {
            const v = normalizeAndValidateSymbol(req.query.symbol);
            if (v.error) return res.status(400).json({ error: v.error });
            symbol = v.symbol;
        }
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
app.get('/api/orders/history', requireAuth, async (req, res) => {
    try {
        if (!exchange) {
            return res.status(400).json({ error: 'Exchange not connected' });
        }

        let symbol;
        if (req.query.symbol) {
            const v = normalizeAndValidateSymbol(req.query.symbol);
            if (v.error) return res.status(400).json({ error: v.error });
            symbol = v.symbol;
        }
        const requestedLimit = parseInt(req.query.limit, 10);
        const limit = Number.isFinite(requestedLimit)
            ? Math.max(1, Math.min(requestedLimit, 500))
            : 50;

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
app.post('/api/order', requireAuth, async (req, res) => {
    try {
        if (!exchange) {
            return res.status(400).json({ error: 'Exchange not connected' });
        }

        const { symbol: rawSymbol, side, type, amount, price, stopLoss, takeProfit } = req.body;

        if (!rawSymbol || !side || !type || amount == null) {
            return res.status(400).json({
                error: 'Missing required fields: symbol, side, type, amount',
            });
        }
        if (side !== 'buy' && side !== 'sell') {
            return res.status(400).json({ error: 'Invalid side. Use "buy" or "sell"' });
        }
        if (type !== 'market' && type !== 'limit') {
            return res.status(400).json({ error: 'Invalid order type. Use "market" or "limit"' });
        }

        const amountNum = Number(amount);
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
            return res.status(400).json({ error: 'amount must be a positive number' });
        }

        const { symbol: formattedSymbol, error: symbolError } = normalizeAndValidateSymbol(rawSymbol);
        if (symbolError) return res.status(400).json({ error: symbolError });

        // Ensure markets are loaded
        if (!exchange.markets) {
            await exchange.loadMarkets();
        }

        if (!exchange.markets[formattedSymbol]) {
            return res.status(400).json({ error: `Invalid symbol: ${formattedSymbol}` });
        }

        const market = exchange.market(formattedSymbol);

        // 1. VALIDATE PRECISION
        const amountToPlace = exchange.amountToPrecision(formattedSymbol, amountNum);
        let priceToPlace;

        if (type === 'limit') {
            const priceNum = Number(price);
            if (!Number.isFinite(priceNum) || priceNum <= 0) {
                return res.status(400).json({ error: 'Limit orders require a positive price' });
            }
            priceToPlace = exchange.priceToPrecision(formattedSymbol, priceNum);
        }

        // 2. VALIDATE MIN NOTIONAL. Use ticker.bid for buys / ticker.ask for
        // sells (conservative) so we don't approve an order that will fail on
        // the exchange because price moved against us in the milliseconds
        // between the check and submission.
        let referencePrice = priceToPlace;
        if (!referencePrice) {
            const ticker = await exchange.fetchTicker(formattedSymbol);
            referencePrice = side === 'buy' ? (ticker.ask || ticker.last) : (ticker.bid || ticker.last);
        }
        const notional = parseFloat(amountToPlace) * parseFloat(referencePrice);

        if (market.limits && market.limits.cost && market.limits.cost.min) {
            if (notional < market.limits.cost.min) {
                return res.status(400).json({
                    error: `Order value too small. Value: ${notional.toFixed(2)}, Min: ${market.limits.cost.min}`
                });
            }
        }

        // 3. VALIDATE BALANCE with a safety buffer for market buys so a small
        // upward tick between estimate and execution doesn't cause a partial
        // fill or rejection.
        const balance = await exchange.fetchBalance();
        const SLIPPAGE_BUFFER = 1.01; // 1%

        if (side === 'buy') {
            const quoteCurrency = market.quote;
            const availableBalance = balance[quoteCurrency]?.free || 0;
            const required = type === 'market' ? notional * SLIPPAGE_BUFFER : notional;
            if (parseFloat(availableBalance) < required) {
                return res.status(400).json({
                    error: `Insufficient ${quoteCurrency} balance. Available: ${availableBalance}, Required: ~${required.toFixed(2)}`
                });
            }
        } else if (side === 'sell') {
            const baseCurrency = market.base;
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
        } else {
            order = await exchange.createOrder(formattedSymbol, 'limit', side, amountToPlace, priceToPlace);
        }
        console.log(`✅ Order placed: ${order.id}`);

        // 4. SL/TP placement.
        // - For BUY: protect what was filled (we now hold the base asset).
        // - For SELL: a spot sell that exits a long has nothing to protect;
        //   for a short you'd need margin which this server doesn't enable.
        // - For LIMIT orders that did NOT fill immediately we record the SL/TP
        //   intent in the response so the caller can wire it after fill.
        let protections = { stopLossOrderId: null, takeProfitOrderId: null, deferred: false };
        if ((stopLoss || takeProfit) && side === 'buy') {
            try {
                const filled = Number(order.filled || 0);
                if (filled > 0) {
                    protections = await placeSpotLongProtection({
                        market,
                        formattedSymbol,
                        filled,
                        stopLoss,
                        takeProfit,
                    });
                } else {
                    protections.deferred = true;
                    console.log('⚠️ Order not yet filled. SL/TP deferred until fill.');
                }
            } catch (slError) {
                console.error('❌ Failed to place Stop-Loss/TP:', slError.message);
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
                protections,
            },
        });
    } catch (error) {
        console.error('Order placement error:', error.message);
        let errorMsg = error.message;
        if (errorMsg.includes('MIN_NOTIONAL')) errorMsg = 'Order value too small (Min Notional)';
        if (errorMsg.includes('Account has insufficient balance')) errorMsg = 'Insufficient Funds';

        res.status(500).json({
            error: 'Order failed',
            message: errorMsg,
        });
    }
});

// Place SL/TP for a long spot position. Tries OCO first (a single atomic
// pair); falls back to individual STOP_LOSS_LIMIT / TAKE_PROFIT_LIMIT orders
// when OCO is unavailable. Note: stopLimitPrice is set slightly below the
// trigger so the limit order actually fills in a fast move (the old code
// used stopPrice == stopLimitPrice, which broke in volatile markets).
async function placeSpotLongProtection({ market, formattedSymbol, filled, stopLoss, takeProfit }) {
    const quantity = exchange.amountToPrecision(formattedSymbol, filled);
    const out = { stopLossOrderId: null, takeProfitOrderId: null, deferred: false };

    if (stopLoss && takeProfit) {
        try {
            const stopPrice = exchange.priceToPrecision(formattedSymbol, stopLoss);
            const stopLimitPrice = exchange.priceToPrecision(formattedSymbol, Number(stopLoss) * 0.995);
            const tpPrice = exchange.priceToPrecision(formattedSymbol, takeProfit);

            const oco = await exchange.privatePostOrderOco({
                symbol: market.id,
                side: 'SELL',
                quantity,
                price: tpPrice,
                stopPrice,
                stopLimitPrice,
                stopLimitTimeInForce: 'GTC',
            });
            // OCO returns an order list; we record the IDs we can find.
            const orders = oco?.orderReports || oco?.orders || [];
            for (const o of orders) {
                if (o.type === 'STOP_LOSS_LIMIT' || o.type === 'STOP_LOSS') out.stopLossOrderId = String(o.orderId || o.id);
                if (o.type === 'LIMIT_MAKER' || o.type === 'TAKE_PROFIT_LIMIT') out.takeProfitOrderId = String(o.orderId || o.id);
            }
            console.log('✅ OCO Order placed');
            return out;
        } catch (e) {
            console.warn('OCO failed, falling back to single SL:', e.message);
        }
    }

    if (stopLoss) {
        const stopPrice = exchange.priceToPrecision(formattedSymbol, stopLoss);
        const stopLimitPrice = exchange.priceToPrecision(formattedSymbol, Number(stopLoss) * 0.995);
        const slOrder = await exchange.createOrder(
            formattedSymbol, 'STOP_LOSS_LIMIT', 'sell', quantity, stopLimitPrice, { stopPrice }
        );
        out.stopLossOrderId = String(slOrder.id);
        console.log('✅ Stop-Loss placed');
    }
    if (takeProfit) {
        const tpPrice = exchange.priceToPrecision(formattedSymbol, takeProfit);
        const tpOrder = await exchange.createOrder(
            formattedSymbol, 'limit', 'sell', quantity, tpPrice
        );
        out.takeProfitOrderId = String(tpOrder.id);
        console.log('✅ Take-Profit placed');
    }
    return out;
}

// Cancel order
app.delete('/api/order/:id', requireAuth, async (req, res) => {
    try {
        if (!exchange) {
            return res.status(400).json({ error: 'Exchange not connected' });
        }

        const orderId = req.params.id;
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) {
            return res.status(400).json({ error: 'Invalid order id' });
        }
        if (!req.query.symbol) {
            return res.status(400).json({ error: 'Symbol is required' });
        }
        const { symbol, error: sErr } = normalizeAndValidateSymbol(req.query.symbol);
        if (sErr) return res.status(400).json({ error: sErr });

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
app.get('/api/fees', requireAuth, async (req, res) => {
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
app.get('/api/symbols', requireAuth, async (req, res) => {
    try {
        if (!exchange) {
            // Return default EUR symbols if not connected
            return res.json([
                'BTC/EUR', 'ETH/EUR', 'BNB/EUR', 'SOL/EUR', 'XRP/EUR',
                'ADA/EUR', 'DOGE/EUR', 'AVAX/EUR', 'DOT/EUR', 'MATIC/EUR',
            ]);
        }

        await exchange.loadMarkets();
        // Only return symbols that are both available on the exchange AND in
        // our explicit allow-list. Keeps the dropdown honest with what the
        // backend will actually accept on /api/order.
        const exchangeSymbols = new Set(Object.keys(exchange.markets));
        const symbols = TRADEABLE_SYMBOLS.filter(s => exchangeSymbols.has(s)).sort();

        res.json(symbols);
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

// symbol → { interval, subscribers:Set<ws> }
const subscriptions = new Map();

function ensureSubscription(symbol) {
    let entry = subscriptions.get(symbol);
    if (entry) return entry;

    const subscribers = new Set();
    const interval = setInterval(async () => {
        // Stop the timer if no one is listening any more (defensive).
        if (subscribers.size === 0) {
            clearInterval(interval);
            subscriptions.delete(symbol);
            return;
        }
        if (!exchange) return;
        try {
            const ticker = await exchange.fetchTicker(symbol);
            const payload = JSON.stringify({
                type: 'ticker',
                symbol,
                price: ticker.last,
                bid: ticker.bid,
                ask: ticker.ask,
                volume: ticker.quoteVolume,
                timestamp: Date.now(),
            });
            for (const client of subscribers) {
                if (client.readyState === 1) client.send(payload);
            }
        } catch (e) {
            console.error('Ticker stream error:', e.message);
        }
    }, 2000);

    entry = { interval, subscribers };
    subscriptions.set(symbol, entry);
    return entry;
}

function removeSubscriber(symbol, ws) {
    const entry = subscriptions.get(symbol);
    if (!entry) return;
    entry.subscribers.delete(ws);
    if (entry.subscribers.size === 0) {
        clearInterval(entry.interval);
        subscriptions.delete(symbol);
    }
}

wss.on('connection', (ws, req) => {
    // Auth via query string ?token=... so we don't have to wait for the first
    // message before validating. Close the socket immediately on bad token.
    let authed = false;
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token') || '';
        authed = AUTH_TOKEN.length > 0 && timingSafeEqual(token, AUTH_TOKEN);
    } catch {
        authed = false;
    }
    if (!authed) {
        ws.close(1008, 'unauthorized');
        return;
    }

    // Tracked subscriptions for THIS client.
    ws._subs = new Set();
    console.log('🔌 WebSocket client connected');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.action !== 'subscribe' && data.action !== 'unsubscribe') return;

            const v = normalizeAndValidateSymbol(data.symbol);
            if (v.error) return;
            const symbol = v.symbol;

            if (data.action === 'subscribe') {
                const entry = ensureSubscription(symbol);
                entry.subscribers.add(ws);
                ws._subs.add(symbol);
            } else {
                removeSubscriber(symbol, ws);
                ws._subs.delete(symbol);
            }
        } catch (e) {
            console.error('WebSocket message error:', e.message);
        }
    });

    ws.on('close', () => {
        for (const symbol of ws._subs) removeSubscriber(symbol, ws);
        ws._subs.clear();
        console.log('🔌 WebSocket client disconnected');
    });
});

// ==========================================
// START SERVER
// ==========================================

server.listen(PORT, BIND_ADDR, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║   🚀 SIMULACRUM TRADING BACKEND                          ║
║   Server running on: http://${BIND_ADDR}:${PORT}
║   WebSocket:         ws://${BIND_ADDR}:${PORT}/ws
║   CORS origins:      ${ALLOWED_ORIGINS.join(', ') || '(none)'}
║   Auth required:     ${AUTH_TOKEN ? 'YES (x-simulacrum-token)' : 'NO — token not set, requests will 503'}
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
