// ============================================
// EXCHANGE CONFIGURATION MANAGER
// Centralized exchange credentials management
// ============================================

import type { ExchangeId, ExchangeCredentials } from '../types/trading';

interface ExchangeConfig {
    id: ExchangeId;
    name: string;
    credentials: ExchangeCredentials | null;
    enabled: boolean;
    features: {
        spot: boolean;
        margin: boolean;
        futures: boolean;
        staking: boolean;
    };
    fees: {
        maker: number;
        taker: number;
    };
    limits: {
        minOrder: number;
        maxOrder: number;
    };
}

class ExchangeConfigManager {
    private configs: Map<ExchangeId, ExchangeConfig> = new Map();

    constructor() {
        this.initializeConfigs();
        this.loadFromEnv();
    }

    private initializeConfigs(): void {
        // Binance
        this.configs.set('binance', {
            id: 'binance',
            name: 'Binance',
            credentials: null,
            enabled: false,
            features: { spot: true, margin: true, futures: true, staking: true },
            fees: { maker: 0.1, taker: 0.1 },
            limits: { minOrder: 10, maxOrder: 1000000 },
        });

        // Coinbase
        this.configs.set('coinbase', {
            id: 'coinbase',
            name: 'Coinbase Pro',
            credentials: null,
            enabled: false,
            features: { spot: true, margin: false, futures: false, staking: true },
            fees: { maker: 0.5, taker: 0.5 },
            limits: { minOrder: 10, maxOrder: 1000000 },
        });

        // Kraken
        this.configs.set('kraken', {
            id: 'kraken',
            name: 'Kraken',
            credentials: null,
            enabled: false,
            features: { spot: true, margin: true, futures: true, staking: true },
            fees: { maker: 0.16, taker: 0.26 },
            limits: { minOrder: 10, maxOrder: 1000000 },
        });

        // KuCoin
        this.configs.set('kucoin', {
            id: 'kucoin',
            name: 'KuCoin',
            credentials: null,
            enabled: false,
            features: { spot: true, margin: true, futures: true, staking: false },
            fees: { maker: 0.1, taker: 0.1 },
            limits: { minOrder: 10, maxOrder: 1000000 },
        });

        // Bybit
        this.configs.set('bybit', {
            id: 'bybit',
            name: 'Bybit',
            credentials: null,
            enabled: false,
            features: { spot: true, margin: false, futures: true, staking: false },
            fees: { maker: 0.1, taker: 0.1 },
            limits: { minOrder: 10, maxOrder: 1000000 },
        });

        // OKX
        this.configs.set('okx', {
            id: 'okx',
            name: 'OKX',
            credentials: null,
            enabled: false,
            features: { spot: true, margin: true, futures: true, staking: false },
            fees: { maker: 0.08, taker: 0.1 },
            limits: { minOrder: 10, maxOrder: 1000000 },
        });
    }

    private loadFromEnv(): void {
        // Binance
        const binanceKey = import.meta.env.VITE_BINANCE_API_KEY;
        const binanceSecret = import.meta.env.VITE_BINANCE_SECRET;
        const binanceSandbox = import.meta.env.VITE_BINANCE_SANDBOX === 'true';

        if (binanceKey && binanceSecret && binanceKey !== 'your_binance_api_key_here') {
            this.setCredentials('binance', {
                apiKey: binanceKey,
                secret: binanceSecret,
                sandbox: binanceSandbox,
            });
        }

        // Coinbase
        const coinbaseKey = import.meta.env.VITE_COINBASE_API_KEY;
        const coinbaseSecret = import.meta.env.VITE_COINBASE_SECRET;
        const coinbaseSandbox = import.meta.env.VITE_COINBASE_SANDBOX === 'true';

        if (coinbaseKey && coinbaseSecret && coinbaseKey !== 'your_coinbase_api_key_here') {
            this.setCredentials('coinbase', {
                apiKey: coinbaseKey,
                secret: coinbaseSecret,
                sandbox: coinbaseSandbox,
            });
        }

        // Kraken
        const krakenKey = import.meta.env.VITE_KRAKEN_API_KEY;
        const krakenSecret = import.meta.env.VITE_KRAKEN_SECRET;
        const krakenSandbox = import.meta.env.VITE_KRAKEN_SANDBOX === 'true';

        if (krakenKey && krakenSecret && krakenKey !== 'your_kraken_api_key_here') {
            this.setCredentials('kraken', {
                apiKey: krakenKey,
                secret: krakenSecret,
                sandbox: krakenSandbox,
            });
        }

        // KuCoin
        const kucoinKey = import.meta.env.VITE_KUCOIN_API_KEY;
        const kucoinSecret = import.meta.env.VITE_KUCOIN_SECRET;
        const kucoinPassword = import.meta.env.VITE_KUCOIN_PASSWORD;
        const kucoinSandbox = import.meta.env.VITE_KUCOIN_SANDBOX === 'true';

        if (kucoinKey && kucoinSecret && kucoinPassword && kucoinKey !== 'your_kucoin_api_key_here') {
            this.setCredentials('kucoin', {
                apiKey: kucoinKey,
                secret: kucoinSecret,
                password: kucoinPassword,
                sandbox: kucoinSandbox,
            });
        }

        // Bybit
        const bybitKey = import.meta.env.VITE_BYBIT_API_KEY;
        const bybitSecret = import.meta.env.VITE_BYBIT_SECRET;
        const bybitSandbox = import.meta.env.VITE_BYBIT_SANDBOX === 'true';

        if (bybitKey && bybitSecret && bybitKey !== 'your_bybit_api_key_here') {
            this.setCredentials('bybit', {
                apiKey: bybitKey,
                secret: bybitSecret,
                sandbox: bybitSandbox,
            });
        }

        // OKX
        const okxKey = import.meta.env.VITE_OKX_API_KEY;
        const okxSecret = import.meta.env.VITE_OKX_SECRET;
        const okxPassword = import.meta.env.VITE_OKX_PASSWORD;
        const okxSandbox = import.meta.env.VITE_OKX_SANDBOX === 'true';

        if (okxKey && okxSecret && okxPassword && okxKey !== 'your_okx_api_key_here') {
            this.setCredentials('okx', {
                apiKey: okxKey,
                secret: okxSecret,
                password: okxPassword,
                sandbox: okxSandbox,
            });
        }

        console.log(`✅ Loaded credentials for exchanges: ${this.getEnabledExchanges().join(', ') || 'None'}`);
    }

    setCredentials(exchangeId: ExchangeId, credentials: ExchangeCredentials): void {
        const config = this.configs.get(exchangeId);
        if (config) {
            config.credentials = credentials;
            config.enabled = true;
        }
    }

    getCredentials(exchangeId: ExchangeId): ExchangeCredentials | null {
        return this.configs.get(exchangeId)?.credentials || null;
    }

    getConfig(exchangeId: ExchangeId): ExchangeConfig | null {
        return this.configs.get(exchangeId) || null;
    }

    getAllConfigs(): ExchangeConfig[] {
        return Array.from(this.configs.values());
    }

    getEnabledExchanges(): ExchangeId[] {
        return Array.from(this.configs.values())
            .filter(config => config.enabled)
            .map(config => config.id);
    }

    isExchangeEnabled(exchangeId: ExchangeId): boolean {
        return this.configs.get(exchangeId)?.enabled || false;
    }

    getDefaultExchange(): ExchangeId | null {
        const enabled = this.getEnabledExchanges();
        if (enabled.length === 0) return null;

        // Prefer Binance if available
        if (enabled.includes('binance')) return 'binance';

        // Otherwise return first enabled
        return enabled[0];
    }

    validateCredentials(exchangeId: ExchangeId): boolean {
        const credentials = this.getCredentials(exchangeId);
        if (!credentials) return false;

        // Basic validation
        if (!credentials.apiKey || !credentials.secret) return false;
        if (credentials.apiKey.includes('your_') || credentials.apiKey === '') return false;

        return true;
    }

    getSandboxStatus(): Map<ExchangeId, boolean> {
        const status = new Map<ExchangeId, boolean>();

        for (const [id, config] of this.configs.entries()) {
            if (config.credentials) {
                status.set(id, config.credentials.sandbox || false);
            }
        }

        return status;
    }

    isPaperTradingMode(): boolean {
        return import.meta.env.VITE_PAPER_TRADING_MODE !== 'false';
    }

    hasAnyExchangeConfigured(): boolean {
        return this.getEnabledExchanges().length > 0;
    }

    getExchangeFees(exchangeId: ExchangeId): { maker: number; taker: number } {
        const config = this.configs.get(exchangeId);
        return config?.fees || { maker: 0.1, taker: 0.1 };
    }

    // Risk Management Defaults from ENV
    getRiskDefaults() {
        return {
            maxPositionSize: parseFloat(import.meta.env.VITE_MAX_POSITION_SIZE || '5'),
            maxDailyLoss: parseFloat(import.meta.env.VITE_MAX_DAILY_LOSS || '5'),
            defaultStopLoss: parseFloat(import.meta.env.VITE_DEFAULT_STOP_LOSS || '2'),
            defaultTakeProfit: parseFloat(import.meta.env.VITE_DEFAULT_TAKE_PROFIT || '4'),
        };
    }
}

export const exchangeConfig = new ExchangeConfigManager();
export default exchangeConfig;
