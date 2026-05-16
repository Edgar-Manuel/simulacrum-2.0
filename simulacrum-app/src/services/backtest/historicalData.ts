// Fetch real OHLCV history from Binance's public REST API.
// No API key required — this is the same endpoint exposed at
// https://api.binance.com/api/v3/klines and used by every charting tool.
//
// The endpoint returns at most 1000 candles per call, so we paginate
// backwards from a target end time. Results are returned oldest-first.

import type { MarketData } from '../../types/trading';

const BINANCE_REST = 'https://api.binance.com/api/v3/klines';

const TIMEFRAME_MS: Record<string, number> = {
    '1m': 60_000,
    '5m': 300_000,
    '15m': 900_000,
    '30m': 1_800_000,
    '1h': 3_600_000,
    '4h': 14_400_000,
    '1d': 86_400_000,
};

export interface FetchHistoryArgs {
    /** Binance symbol with no slash, e.g. 'BTCEUR'. */
    binanceSymbol: string;
    timeframe: keyof typeof TIMEFRAME_MS;
    /** Inclusive start timestamp (ms). */
    startMs: number;
    /** Inclusive end timestamp (ms). */
    endMs: number;
    /** Optional UX label used only for the returned MarketData.symbol. */
    label?: string;
    /** Hook to log progress; defaults to console.log. */
    onProgress?: (msg: string) => void;
}

export async function fetchBinanceHistory({
    binanceSymbol,
    timeframe,
    startMs,
    endMs,
    label,
    onProgress = (m) => console.log(m),
}: FetchHistoryArgs): Promise<MarketData[]> {
    const step = TIMEFRAME_MS[timeframe];
    if (!step) throw new Error(`Unknown timeframe: ${timeframe}`);

    const out: MarketData[] = [];
    let cursor = startMs;
    const symLabel = label || binanceSymbol;
    let batches = 0;

    while (cursor < endMs) {
        const url =
            `${BINANCE_REST}?symbol=${binanceSymbol}` +
            `&interval=${timeframe}` +
            `&startTime=${cursor}` +
            `&endTime=${endMs}` +
            `&limit=1000`;

        const res = await fetch(url);
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`Binance klines ${res.status}: ${body.slice(0, 200)}`);
        }
        const rows = (await res.json()) as unknown[];
        if (!Array.isArray(rows) || rows.length === 0) break;

        for (const r of rows) {
            const c = r as [number, string, string, string, string, string, ...unknown[]];
            out.push({
                symbol: symLabel,
                timestamp: c[0],
                open: parseFloat(c[1]),
                high: parseFloat(c[2]),
                low: parseFloat(c[3]),
                close: parseFloat(c[4]),
                volume: parseFloat(c[5]),
            });
        }

        const last = out[out.length - 1];
        cursor = last.timestamp + step;
        batches += 1;
        if (batches % 5 === 0) {
            onProgress(`  …${out.length} candles fetched, cursor=${new Date(cursor).toISOString()}`);
        }

        // Respect rate limits politely. Binance allows ~1200 req/min on
        // klines; 100ms per call is well within that.
        await new Promise((r) => setTimeout(r, 100));

        // Defensive cap: if the endpoint somehow stops advancing, abort.
        if (rows.length < 1000 && cursor < endMs) {
            // The last page wasn't full — there is simply no more data.
            break;
        }
    }

    return out;
}
