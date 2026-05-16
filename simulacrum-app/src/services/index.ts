// Export all services for easy import.
// NOTE: ccxtService is intentionally NOT re-exported here because it depends
// on Node-only modules (http-proxy-agent, sockets) that Vite stubs out in the
// browser bundle. Import it directly from './trading/ccxtService' on the
// backend if you need it; the frontend should use binanceService.
export { marketDataService } from './data/marketDataService';
export { indicatorService } from './trading/indicatorService';
export { riskService } from './trading/riskService';
export { backtestService } from './trading/backtestService';
export { defiService } from './defi/defiService';
export { aiAgentsService } from './ai/agentService';
export { sentimentService } from './sentiment/sentimentService';

// Export types
export * from '../types/trading';

// Export config
export { exchangeConfig } from '../config/exchangeConfig';

// Export store
export { useTradingStore } from '../store/tradingStore';
