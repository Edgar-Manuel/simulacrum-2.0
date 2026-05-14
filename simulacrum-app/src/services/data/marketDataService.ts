// ============================================
// REAL-TIME MARKET DATA SERVICE (Simplified)
// Free APIs - No keys needed!
// ============================================

import type { MarketData, Ticker, OrderBook } from '../../types/trading';

const BINANCE_API = 'https://api.binance.com/api/v3';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

const SYMBOLS: Record<string, string> = {
    'BTC/EUR': 'BTCEUR',
    'ETH/EUR': 'ETHEUR',
    'SOL/EUR': 'SOLEUR',
    'AVAX/EUR': 'AVAXEUR',
    // Legacy USDT pairs for compatibility
    'BTC/USDT': 'BTCUSDT',
    'ETH/USDT': 'ETHUSDT',
};

class MarketDataService {
    private cache = new Map<string, { data: any; timestamp: number }>();
    private cacheDuration = 10000; // 10 seconds

    async getTicker(symbol: string): Promise<Ticker | null> {
        const binanceSymbol = SYMBOLS[symbol] || symbol.replace('/', '');

        try {
            const response = await fetch(`${BINANCE_API}/ticker/24hr?symbol=${binanceSymbol}`);
            if (!response.ok) throw new Error('Binance API error');

            const data = await response.json();

            return {
                symbol,
                timestamp: data.closeTime,
                bid: parseFloat(data.bidPrice),
                ask: parseFloat(data.askPrice),
                last: parseFloat(data.lastPrice),
                change: parseFloat(data.priceChange),
                changePercent: parseFloat(data.priceChangePercent),
                volume: parseFloat(data.volume),
                high24h: parseFloat(data.highPrice),
                low24h: parseFloat(data.lowPrice),
            };
        } catch (error) {
            console.error('Failed to fetch ticker:', error);
            return null;
        }
    }

    async getCandles(symbol: string, interval = '1h', limit = 200): Promise<MarketData[]> {
        const binanceSymbol = SYMBOLS[symbol] || symbol.replace('/', '');

        try {
            const response = await fetch(
                `${BINANCE_API}/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`
            );

            if (!response.ok) throw new Error('Binance API error');

            const data = await response.json();

            return data.map((k: any[]) => ({
                symbol,
                timestamp: k[0],
                open: parseFloat(k[1]),
                high: parseFloat(k[2]),
                low: parseFloat(k[3]),
                close: parseFloat(k[4]),
                volume: parseFloat(k[5]),
            }));
        } catch (error) {
            console.error('Failed to fetch candles:', error);
            return [];
        }
    }

    async getPrice(symbol: string): Promise<number | null> {
        const ticker = await this.getTicker(symbol);
        return ticker ? ticker.last : null;
    }

    async getMultiplePrices(symbols: string[]): Promise<Map<string, number>> {
        const prices = new Map<string, number>();

        const results = await Promise.allSettled(
            symbols.map(s => this.getPrice(s))
        );

        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                prices.set(symbols[index], result.value);
            }
        });

        return prices;
    }
}

export const marketDataService = new MarketDataService();
export default marketDataService;
