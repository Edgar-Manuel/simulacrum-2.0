import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  Share2,
  DollarSign,
  Briefcase,
  Code,
  FileText,
  Activity,
  TrendingUp,
  TrendingDown,
  Lock,
  Zap,
  X,
  Eye,
  Wallet,
  BarChart3,
  Target,
  Shield,
  Brain,
  Flame,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  LineChart,
  Coins,
  AlertTriangle,
  CheckCircle,
  Bot,
  History,
  XCircle
} from 'lucide-react';
import { createConfig, http, useConnect, useAccount, useDisconnect, useBalance, WagmiProvider } from 'wagmi';
import { mainnet, arbitrum, optimism, polygon, base } from 'wagmi/chains';
import { injected, metaMask } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { formatEther } from 'viem';

// Import our trading services
import { indicatorService } from './services/trading/indicatorService';
import { riskService } from './services/trading/riskService';
import { aiAgentsService } from './services/ai/agentService';
import { sentimentService } from './services/sentiment/sentimentService';
import { binanceService } from './services/exchange/binanceService'; // Live trading with Binance
import { marketDataService } from './services/data/marketDataService'; // Real market data
import { riskManagement, DEFAULT_RISK_CONFIG } from './services/risk/riskManagement'; // Risk controls
import type {
  AIAgent,
  A2AMessage,
  TradingSignal,
  MarketAnalysis,
  RiskAssessment,
  SentimentData,
  TechnicalIndicators,
} from './types/trading';

// --- WAGMI CONFIG ---
const queryClient = new QueryClient();

const config = createConfig({
  chains: [mainnet, arbitrum, optimism, polygon, base],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [base.id]: http(),
  },
  connectors: [
    injected(),
    metaMask(),
  ],
});

// --- TYPES ---
interface ProjectArtifact {
  id: string;
  name: string;
  type: 'CODE' | 'REPORT' | 'TRANSACTION' | 'SIGNAL' | 'ANALYSIS' | 'TRADE_EXECUTED' | 'TRADE_BLOCKED';
  status: 'PENDING' | 'READY' | 'DEPLOYED' | 'EXECUTING' | 'SUCCESS' | 'FAILED';
  value: string;
  content?: string;
  // Enhanced fields for trading info
  timestamp?: number;
  symbol?: string;
  action?: 'BUY' | 'SELL' | 'HOLD';
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  confidence?: number;
  pnl?: number;
  reasoning?: string;
}

interface TradingAction {
  id: string;
  type: 'BUY' | 'SELL' | 'HOLD';
  symbol: string;
  amount: number;
  price: number;
  stopLoss?: number;
  takeProfit?: number;
  confidence: number;
  reasoning: string;
  status: 'PENDING_AUTH' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
}

// --- COMPONENTS ---

const ArtifactModal = ({ artifact, onClose }: { artifact: ProjectArtifact | null, onClose: () => void }) => {
  if (!artifact) return null;
  return (
    <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-10">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl h-[80vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-950 rounded-t-xl">
          <div className="flex items-center gap-3">
            {artifact.type === 'CODE' ? <Code className="text-blue-400" /> :
              artifact.type === 'SIGNAL' ? <Target className="text-green-400" /> :
                artifact.type === 'ANALYSIS' ? <BarChart3 className="text-purple-400" /> :
                  <FileText className="text-purple-400" />}
            <h3 className="font-bold text-slate-200">{artifact.name}</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded text-slate-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-auto p-6 bg-[#0d1117]">
          <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap">{artifact.content || "Contenido pendiente..."}</pre>
        </div>
        <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
          <button className="px-4 py-2 bg-slate-700 text-white text-xs rounded font-bold hover:bg-slate-600" onClick={onClose}>
            CLOSE
          </button>
          <button className="px-4 py-2 bg-blue-600 text-white text-xs rounded font-bold hover:bg-blue-500" onClick={() => { navigator.clipboard.writeText(artifact.content || ""); }}>
            COPY TO CLIPBOARD
          </button>
        </div>
      </div>
    </div>
  );
};

// Risk Control Panel Component
const RiskControlPanel = ({
  onClose,
  config,
  onUpdateConfig
}: {
  onClose: () => void;
  config: typeof DEFAULT_RISK_CONFIG;
  onUpdateConfig: (updates: Partial<typeof DEFAULT_RISK_CONFIG>) => void;
}) => {
  return (
    <div className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-10">
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-700 flex justify-between items-center sticky top-0 bg-slate-900">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-500" />
            <h3 className="font-bold text-xl text-white">⚙️ Configuración de Gestión de Riesgo</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Position Sizing */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-sm font-bold text-blue-400 mb-4 flex items-center gap-2">
              <Coins className="w-4 h-4" /> Tamaño de Posición
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Máximo por operación (%)</label>
                <input
                  type="number"
                  value={config.maxPositionSizePercent}
                  onChange={(e) => onUpdateConfig({ maxPositionSizePercent: Number(e.target.value) })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                  min="0.5" max="10" step="0.5"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Pérdida diaria máxima (%)</label>
                <input
                  type="number"
                  value={config.maxDailyLossPercent}
                  onChange={(e) => onUpdateConfig({ maxDailyLossPercent: Number(e.target.value) })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                  min="1" max="20" step="1"
                />
              </div>
            </div>
          </div>

          {/* Stop Loss & Take Profit */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-sm font-bold text-green-400 mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4" /> Stop-Loss & Take-Profit
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Stop-Loss predeterminado (%)</label>
                <input
                  type="number"
                  value={config.defaultStopLossPercent}
                  onChange={(e) => onUpdateConfig({ defaultStopLossPercent: Number(e.target.value) })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                  min="0.5" max="10" step="0.5"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Take-Profit predeterminado (%)</label>
                <input
                  type="number"
                  value={config.defaultTakeProfitPercent}
                  onChange={(e) => onUpdateConfig({ defaultTakeProfitPercent: Number(e.target.value) })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                  min="1" max="20" step="0.5"
                />
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.useTrailingStop}
                  onChange={(e) => onUpdateConfig({ useTrailingStop: e.target.checked })}
                  className="w-4 h-4"
                />
                <label className="text-sm text-slate-300">
                  Usar Trailing Stop ({config.trailingStopPercent}%)
                </label>
              </div>
            </div>
          </div>

          {/* Signal Filtering */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-sm font-bold text-purple-400 mb-4 flex items-center gap-2">
              <Brain className="w-4 h-4" /> Filtrado de Señales AI
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Confianza mínima para operar (%)</label>
                <input
                  type="number"
                  value={config.minConfidenceThreshold}
                  onChange={(e) => onUpdateConfig({ minConfidenceThreshold: Number(e.target.value) })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                  min="50" max="95" step="5"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Fuerza de tendencia mínima (%)</label>
                <input
                  type="number"
                  value={config.minTrendStrength}
                  onChange={(e) => onUpdateConfig({ minTrendStrength: Number(e.target.value) })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                  min="30" max="90" step="5"
                />
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.requireMultiAgentConsensus}
                  onChange={(e) => onUpdateConfig({ requireMultiAgentConsensus: e.target.checked })}
                  className="w-4 h-4"
                />
                <label className="text-sm text-slate-300">
                  Requerir consenso de múltiples agentes AI
                </label>
              </div>
            </div>
          </div>

          {/* Current Risk Metrics */}
          <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-4 border border-blue-500/30">
            <h4 className="text-sm font-bold text-blue-400 mb-3">📊 Resumen de Configuración</h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-white">{config.maxPositionSizePercent}%</div>
                <div className="text-xs text-slate-400">Máx. por trade</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-400">1:{(config.defaultTakeProfitPercent / config.defaultStopLossPercent).toFixed(1)}</div>
                <div className="text-xs text-slate-400">Risk/Reward</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-400">{config.minConfidenceThreshold}%</div>
                <div className="text-xs text-slate-400">Min. Confianza</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-700 flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
const TradingActionModal = ({
  action,
  onApprove,
  onReject,
  onClose
}: {
  action: TradingAction | null;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}) => {
  if (!action) return null;

  return (
    <div className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-10">
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-yellow-500/50 rounded-xl w-full max-w-lg shadow-[0_0_50px_rgba(234,179,8,0.2)]">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-yellow-500/20 rounded-full">
              <AlertTriangle className="w-8 h-8 text-yellow-500 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-xl text-white">HUMAN AUTHORIZATION REQUIRED</h3>
              <p className="text-sm text-slate-400">AI agents request permission to execute trade</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className={`p-4 rounded-lg border ${action.type === 'BUY' ? 'bg-green-500/10 border-green-500/30' : action.type === 'SELL' ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-800 border-slate-700'}`}>
            <div className="flex justify-between items-center mb-2">
              <span className={`font-bold text-lg ${action.type === 'BUY' ? 'text-green-400' : action.type === 'SELL' ? 'text-red-400' : 'text-slate-400'}`}>
                {action.type} {action.symbol}
              </span>
              <span className="text-2xl font-bold text-white">${action.price.toFixed(2)}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Amount:</span>
                <span className="ml-2 text-slate-300">{action.amount.toFixed(6)}</span>
              </div>
              <div>
                <span className="text-slate-500">Value:</span>
                <span className="ml-2 text-slate-300">${(action.amount * action.price).toFixed(2)}</span>
              </div>
              {action.stopLoss && (
                <div>
                  <span className="text-slate-500">Stop Loss:</span>
                  <span className="ml-2 text-red-400">${action.stopLoss.toFixed(2)}</span>
                </div>
              )}
              {action.takeProfit && (
                <div>
                  <span className="text-slate-500">Take Profit:</span>
                  <span className="ml-2 text-green-400">${action.takeProfit.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">AI Confidence</span>
              <span className={`font-bold ${action.confidence >= 70 ? 'text-green-400' : action.confidence >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                {action.confidence}%
              </span>
            </div>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${action.confidence >= 70 ? 'bg-green-500' : action.confidence >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${action.confidence}%` }}
              />
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="text-slate-400 text-xs uppercase mb-2">AI Reasoning</div>
            <p className="text-slate-300 text-sm">{action.reasoning}</p>
          </div>
        </div>

        <div className="p-6 border-t border-slate-700 flex gap-4">
          <button
            onClick={onReject}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            REJECT
          </button>
          <button
            onClick={onApprove}
            className="flex-1 py-3 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white rounded-lg font-bold text-sm transition-colors shadow-[0_0_20px_rgba(34,197,94,0.3)] flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            AUTHORIZE TRADE
          </button>
        </div>
      </div>
    </div>
  );
};

const A2AStream = ({ messages }: { messages: A2AMessage[] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const getProtocolColor = (protocol: string) => {
    switch (protocol) {
      case 'SIGNAL_BROADCAST': return 'text-green-400';
      case 'RISK_ALERT': return 'text-red-400';
      case 'APPROVAL_REQUEST': return 'text-yellow-400';
      case 'MARKET_UPDATE': return 'text-green-500';
      default: return 'text-green-300';
    }
  };

  return (
    <div
      className="bg-black border border-green-900/50 rounded-lg p-0 overflow-hidden flex flex-col h-full"
      style={{
        boxShadow: 'inset 0 0 40px rgba(0,255,0,0.03)',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.015) 2px, rgba(0,255,0,0.015) 4px)'
      }}
    >
      {/* Header */}
      <div className="bg-black/80 p-2 border-b border-green-900/40 flex justify-between items-center">
        <span
          className="text-green-400 flex items-center gap-2 text-[10px] tracking-widest uppercase"
          style={{ fontFamily: "'VT323', 'Courier New', monospace" }}
        >
          <Share2 className="w-3 h-3" /> A2A_NEURAL_LINK
        </span>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(0,255,0,0.8)]" />
          <span
            className="text-green-500 text-[9px] tracking-wider"
            style={{ fontFamily: "'VT323', 'Courier New', monospace" }}
          >
            ACTIVE
          </span>
        </div>
      </div>

      {/* Terminal Content */}
      <div
        className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin scrollbar-thumb-green-900 scrollbar-track-transparent"
        style={{ fontFamily: "'VT323', 'Courier New', monospace" }}
      >
        {messages.length === 0 && (
          <div className="text-green-700 text-center text-xs mt-10">
            {'>'} Waiting_for_agent_communication...<span className="inline-block w-2 h-3 bg-green-500 ml-1 animate-pulse" />
          </div>
        )}
        {messages.slice(-20).map((msg) => (
          <div
            key={msg.id}
            className="group flex flex-col gap-0.5 p-1.5 rounded bg-black/50 border border-green-900/30 hover:border-green-500/40 transition-colors animate-in slide-in-from-left-2 fade-in duration-300"
          >
            <div className="flex justify-between text-[10px]">
              <span className="text-green-400 font-bold">
                {msg.from} <span className="text-green-700">→</span> {msg.to}
              </span>
              <span className="text-green-700">{new Date(msg.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className={`text-[10px] font-semibold ${getProtocolColor(msg.protocol)}`}>
              [{msg.protocol}]
            </div>
            <div className="text-green-500/80 text-[9px] pl-2 border-l border-green-900/40 line-clamp-2 hover:line-clamp-none">
              {typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload).slice(0, 100)}
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
        {/* Cursor parpadeante al final */}
        <div className="text-green-500 text-[10px] mt-1">
          {'>'} <span className="inline-block w-1.5 h-2.5 bg-green-500 animate-pulse" />
        </div>
      </div>
    </div>
  );
};

const SignalCard = ({ signal, onExecute, onDismiss }: { signal: TradingSignal; onExecute: () => void; onDismiss: () => void }) => {
  const isExpired = signal.expires && signal.expires < Date.now();

  return (
    <div className={`p-3 rounded-lg border ${isExpired ? 'opacity-50 border-slate-800' : signal.type === 'buy' ? 'border-green-500/30 bg-green-500/5' : signal.type === 'sell' ? 'border-red-500/30 bg-red-500/5' : 'border-slate-700 bg-slate-800/50'}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          {signal.type === 'buy' ? (
            <ArrowUpRight className="w-4 h-4 text-green-400" />
          ) : signal.type === 'sell' ? (
            <ArrowDownRight className="w-4 h-4 text-red-400" />
          ) : (
            <Pause className="w-4 h-4 text-slate-400" />
          )}
          <span className={`font-bold ${signal.type === 'buy' ? 'text-green-400' : signal.type === 'sell' ? 'text-red-400' : 'text-slate-400'}`}>
            {signal.type.toUpperCase()} {signal.symbol}
          </span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded ${signal.strength === 'very_strong' ? 'bg-purple-500/20 text-purple-400' : signal.strength === 'strong' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700 text-slate-400'}`}>
          {signal.strength}
        </span>
      </div>
      <div className="text-xs text-slate-400 mb-2">{signal.source}: {signal.reasoning}</div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-500">Confidence: {signal.confidence}%</span>
        <div className="flex gap-2">
          <button
            onClick={onDismiss}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded font-bold"
          >
            ✕
          </button>
          {!isExpired && signal.type !== 'hold' && (
            <button
              onClick={onExecute}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-bold"
            >
              EXECUTE
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const IndicatorDisplay = ({ indicators, symbol }: { indicators: TechnicalIndicators | null; symbol: string }) => {
  if (!indicators) return null;

  const getRSIColor = (rsi: number | null) => {
    if (!rsi) return 'text-slate-500';
    if (rsi > 70) return 'text-red-400';
    if (rsi < 30) return 'text-green-400';
    return 'text-slate-300';
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
      <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
        <LineChart className="w-3 h-3" /> Technical Indicators - {symbol}
      </h4>
      <div className="grid grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-800/50 p-2 rounded">
          <div className="text-slate-500">RSI(14)</div>
          <div className={`font-bold ${getRSIColor(indicators.rsi14)}`}>
            {indicators.rsi14?.toFixed(1) || 'N/A'}
          </div>
        </div>
        <div className="bg-slate-800/50 p-2 rounded">
          <div className="text-slate-500">MACD</div>
          <div className={`font-bold ${indicators.macd?.histogram && indicators.macd.histogram > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {indicators.macd?.histogram?.toFixed(2) || 'N/A'}
          </div>
        </div>
        <div className="bg-slate-800/50 p-2 rounded">
          <div className="text-slate-500">EMA(50)</div>
          <div className="font-bold text-slate-300">
            €{indicators.ema50?.toFixed(2) || 'N/A'}
          </div>
        </div>
        <div className="bg-slate-800/50 p-2 rounded">
          <div className="text-slate-500">ATR</div>
          <div className="font-bold text-slate-300">
            €{indicators.atr?.toFixed(2) || 'N/A'}
          </div>
        </div>
        <div className="bg-slate-800/50 p-2 rounded">
          <div className="text-slate-500">ADX</div>
          <div className={`font-bold ${indicators.adx && indicators.adx > 25 ? 'text-green-400' : 'text-yellow-400'}`}>
            {indicators.adx?.toFixed(1) || 'N/A'}
          </div>
        </div>
        <div className="bg-slate-800/50 p-2 rounded">
          <div className="text-slate-500">BB Width</div>
          <div className="font-bold text-slate-300">
            {indicators.bollingerBands?.width.toFixed(2) || 'N/A'}%
          </div>
        </div>
        <div className="bg-slate-800/50 p-2 rounded">
          <div className="text-slate-500">Stoch K</div>
          <div className={`font-bold ${indicators.stochastic?.k && indicators.stochastic.k > 80 ? 'text-red-400' : indicators.stochastic?.k && indicators.stochastic.k < 20 ? 'text-green-400' : 'text-slate-300'}`}>
            {indicators.stochastic?.k?.toFixed(1) || 'N/A'}
          </div>
        </div>
        <div className="bg-slate-800/50 p-2 rounded">
          <div className="text-slate-500">Vol Δ</div>
          <div className={`font-bold ${indicators.volumeChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {indicators.volumeChange > 0 ? '+' : ''}{indicators.volumeChange.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
};

const SentimentDisplay = ({ sentiment }: { sentiment: SentimentData | null }) => {
  if (!sentiment) return null;

  const getSentimentColor = (value: number) => {
    if (value > 30) return 'text-green-400';
    if (value < -30) return 'text-red-400';
    return 'text-yellow-400';
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
      <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
        <Flame className="w-3 h-3" /> Market Sentiment
      </h4>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="bg-slate-800/50 p-2 rounded text-center">
          <div className="text-slate-500 mb-1">Overall</div>
          <div className={`font-bold text-lg ${getSentimentColor(sentiment.overallSentiment)}`}>
            {sentiment.overallSentiment > 0 ? '+' : ''}{sentiment.overallSentiment.toFixed(0)}
          </div>
        </div>
        <div className="bg-slate-800/50 p-2 rounded text-center">
          <div className="text-slate-500 mb-1">Fear/Greed</div>
          <div className={`font-bold text-lg ${sentiment.fearGreedIndex > 60 ? 'text-green-400' : sentiment.fearGreedIndex < 40 ? 'text-red-400' : 'text-yellow-400'}`}>
            {sentiment.fearGreedIndex}
          </div>
        </div>
        <div className="bg-slate-800/50 p-2 rounded text-center">
          <div className="text-slate-500 mb-1">Social Vol</div>
          <div className={`font-bold ${sentiment.socialVolumeChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {sentiment.socialVolumeChange > 0 ? '+' : ''}{sentiment.socialVolumeChange.toFixed(0)}%
          </div>
        </div>
      </div>
      {sentiment.topTopics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {sentiment.topTopics.map((topic, i) => (
            <span key={i} className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] rounded">
              #{topic}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const AgentCard = ({ agent }: { agent: AIAgent }) => {
  const statusColors = {
    idle: 'border-slate-600 bg-slate-900',
    analyzing: 'border-blue-500 bg-blue-500/10',
    computing: 'border-purple-500 bg-purple-500/10 animate-pulse',
    executing: 'border-green-500 bg-green-500/10',
    waiting_approval: 'border-yellow-500 bg-yellow-500/10 animate-pulse',
    error: 'border-red-500 bg-red-500/10',
  };

  const roleIcons = {
    STRATEGIST: <Target className="w-5 h-5" />,
    ANALYST: <BarChart3 className="w-5 h-5" />,
    EXECUTOR: <Zap className="w-5 h-5" />,
    RISK_MANAGER: <Shield className="w-5 h-5" />,
    SENTIMENT: <Flame className="w-5 h-5" />,
    ORACLE: <Brain className="w-5 h-5" />,
  };

  // Generar pensamientos del agente basados en su estado
  const getAgentThoughts = () => {
    if (agent.status === 'idle') {
      return ['> Standby...', '> Awaiting input...'];
    }
    if (agent.status === 'analyzing') {
      return ['> Analyzing data...', '> Processing market info...', `> ${agent.currentTask || 'Working...'}`];
    }
    if (agent.status === 'computing') {
      return ['> Computing...', '> Running algorithms...', `> ${agent.currentTask || 'Calculating...'}`];
    }
    if (agent.status === 'executing') {
      return ['> EXECUTING...', `> ${agent.currentTask || 'Running trade...'}`, '> Awaiting confirmation...'];
    }
    if (agent.status === 'error') {
      return ['> ERROR DETECTED', `> ${agent.currentTask || 'Unknown error'}`, '> Retrying...'];
    }
    return [`> ${agent.currentTask || 'Processing...'}`];
  };

  const thoughts = getAgentThoughts();

  return (
    <div className={`p-3 rounded-lg border-2 ${statusColors[agent.status]} transition-all flex flex-col`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="text-slate-400">{roleIcons[agent.role]}</div>
        <div>
          <div className="font-bold text-sm text-white">{agent.name}</div>
          <div className="text-[10px] text-slate-500">{agent.role}</div>
        </div>
      </div>

      {/* 🖥️ Mini Terminal Retro - Pensamientos del Agente */}
      <div
        className="mt-2 bg-black/80 border border-green-900/40 rounded p-2 min-h-[70px] relative overflow-hidden"
        style={{
          boxShadow: 'inset 0 0 20px rgba(0,255,0,0.05)',
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.02) 2px, rgba(0,255,0,0.02) 4px)'
        }}
      >
        {/* Glow effect */}
        <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 30px rgba(0,255,0,0.08)' }} />

        {/* Terminal content */}
        <div
          className="text-[10px] space-y-0.5 relative z-10"
          style={{ fontFamily: "'VT323', 'Courier New', monospace" }}
        >
          {thoughts.slice(0, 2).map((thought, i) => (
            <div
              key={i}
              className={`${agent.status === 'error' ? 'text-red-400' :
                agent.status === 'executing' ? 'text-yellow-400' :
                  agent.status === 'idle' ? 'text-green-700' : 'text-green-400'
                } truncate`}
            >
              {thought}
            </div>
          ))}
          {/* Cursor parpadeante */}
          <div className="text-green-500 flex items-center">
            {'>'} <span className="inline-block w-1.5 h-2.5 bg-green-500 ml-0.5 animate-pulse" />
          </div>
        </div>

        {/* 📜 Scrolling Marquee - Pensamiento REAL del agente */}
        <div className="mt-1 pt-1 border-t border-green-900/30 overflow-hidden">
          {(() => {
            const text = agent.lastThought || 'Sistema inicializado. Esperando datos de mercado...';
            // Duración proporcional al texto: mínimo 15s, +0.25s por cada caracter (velocidad lenta)
            const duration = Math.max(15, Math.min(text.length * 0.25, 60));
            return (
              <div
                className="terminal-marquee whitespace-nowrap text-[9px]"
                style={{
                  fontFamily: "'VT323', 'Courier New', monospace",
                  animationDuration: `${duration}s`
                }}
              >
                <span className={`${agent.status === 'error' ? 'text-red-400' :
                  agent.status === 'executing' ? 'text-yellow-300' :
                    agent.status === 'analyzing' || agent.status === 'computing' ? 'text-green-400' : 'text-green-600'
                  }`}>
                  {'◆ '}{text}{' ◆'}
                </span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center mt-2 text-[10px]">
        <span className={`px-2 py-0.5 rounded ${agent.status === 'idle' ? 'bg-slate-800 text-slate-500' : 'bg-green-500/20 text-green-400'}`}>
          {agent.status.toUpperCase()}
        </span>
        <span className="text-slate-500">Conf: {agent.confidence}%</span>
      </div>
    </div>
  );
};

const ArtifactVault = ({ artifacts, onView }: { artifacts: ProjectArtifact[], onView: (a: ProjectArtifact) => void }) => {
  // Sort artifacts by timestamp (newest first)
  const sortedArtifacts = [...artifacts].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '00:00:00';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="bg-black border border-green-900/50 rounded-lg h-full overflow-hidden font-mono">
      {/* Terminal Header */}
      <div className="bg-green-950/30 border-b border-green-900/50 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-green-700" />
            <div className="w-2 h-2 rounded-full bg-green-900" />
          </div>
          <span className="text-[10px] text-green-400 uppercase tracking-wider">ARTIFACT_VAULT</span>
        </div>
        {artifacts.length > 0 && (
          <span className="text-[10px] text-green-600">[{artifacts.length} entries]</span>
        )}
      </div>

      {/* Terminal Content */}
      <div className="p-3 h-[calc(100%-40px)] overflow-y-auto scrollbar-thin scrollbar-thumb-green-900 scrollbar-track-transparent">
        {artifacts.length === 0 ? (
          <div className="text-green-700 text-xs py-8 text-center">
            <div className="mb-2">{'>'} AWAITING_DATA...</div>
            <div className="animate-pulse">_</div>
          </div>
        ) : (
          <div className="space-y-1">
            {sortedArtifacts.slice(0, 15).map((art, idx) => {
              const isSuccess = art.type === 'TRADE_EXECUTED' || art.status === 'SUCCESS';
              const isFailed = art.type === 'TRADE_BLOCKED' || art.status === 'FAILED';

              return (
                <div
                  key={art.id}
                  className={`group cursor-pointer hover:bg-green-950/30 px-2 py-1.5 rounded transition-colors ${isSuccess ? 'border-l-2 border-green-500' :
                    isFailed ? 'border-l-2 border-red-500' : 'border-l-2 border-green-800'
                    }`}
                  onClick={() => onView(art)}
                >
                  {/* Line prefix */}
                  <div className="flex items-start gap-2">
                    <span className="text-green-700 text-[10px] shrink-0">{formatTime(art.timestamp)}</span>
                    <div className="flex-1 min-w-0">
                      {/* Main line */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-bold ${isSuccess ? 'text-green-400' : isFailed ? 'text-red-400' : 'text-green-500'
                          }`}>
                          [{art.type === 'TRADE_EXECUTED' ? 'EXEC' :
                            art.type === 'TRADE_BLOCKED' ? 'BLKD' :
                              art.type === 'ANALYSIS' ? 'ANLS' : 'SGNL'}]
                        </span>
                        <span className="text-green-300 text-[10px] font-bold">
                          {art.symbol || art.name.split('_')[2]?.replace('_', '/')}
                        </span>
                        {art.action && (
                          <span className={`text-[10px] ${art.action === 'BUY' ? 'text-green-400' :
                            art.action === 'SELL' ? 'text-red-400' : 'text-green-600'
                            }`}>
                            {art.action}
                          </span>
                        )}
                        {art.price && (
                          <span className="text-green-600 text-[10px]">
                            @€{art.price.toFixed(2)}
                          </span>
                        )}
                        {art.pnl !== undefined && (
                          <span className={`text-[10px] font-bold ${art.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {art.pnl >= 0 ? '+' : ''}€{art.pnl.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {/* Details line */}
                      {(art.stopLoss || art.takeProfit || art.confidence) && (
                        <div className="text-[9px] text-green-700 mt-0.5 flex items-center gap-2">
                          {art.stopLoss && <span>SL:€{art.stopLoss.toFixed(0)}</span>}
                          {art.takeProfit && <span>TP:€{art.takeProfit.toFixed(0)}</span>}
                          {art.confidence && <span>CONF:{art.confidence}%</span>}
                        </div>
                      )}

                      {/* Reasoning line (truncated) */}
                      {art.reasoning && (
                        <div className="text-[9px] text-green-800 mt-0.5 truncate group-hover:text-green-600">
                          {'>'} {art.reasoning.substring(0, 60)}...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Cursor line */}
            <div className="text-green-600 text-[10px] px-2 py-1">
              {'>'} <span className="animate-pulse">_</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const RiskMeter = ({ risk }: { risk: RiskAssessment | null }) => {
  if (!risk) return null;

  const riskColors = {
    low: 'text-green-400 bg-green-500',
    medium: 'text-yellow-400 bg-yellow-500',
    high: 'text-orange-400 bg-orange-500',
    extreme: 'text-red-400 bg-red-500',
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
          <Shield className="w-3 h-3" /> Risk Assessment
        </h4>
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${riskColors[risk.overallRisk]}`}>
          {risk.overallRisk.toUpperCase()}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Risk Score</span>
          <span className="text-white">{risk.riskScore.toFixed(0)}/100</span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${riskColors[risk.overallRisk].split(' ')[1]}`}
            style={{ width: `${risk.riskScore}%` }}
          />
        </div>
      </div>

      {risk.warnings.length > 0 && (
        <div className="mt-3 space-y-1">
          {risk.warnings.map((warning, i) => (
            <div key={i} className="text-[10px] text-yellow-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {warning}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
        <div className="bg-slate-800/50 p-2 rounded">
          <div className="text-slate-500">Rec. Stop Loss</div>
          <div className="text-red-400 font-bold">€{risk.stopLossRecommended.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800/50 p-2 rounded">
          <div className="text-slate-500">Rec. Take Profit</div>
          <div className="text-green-400 font-bold">€{risk.takeProfitRecommended.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
const SimulacrumTradingContent = () => {
  // State
  const [isRunning, setIsRunning] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/EUR');
  const [messages, setMessages] = useState<A2AMessage[]>([]);
  const [artifacts, setArtifacts] = useState<ProjectArtifact[]>([]);
  const [viewingArtifact, setViewingArtifact] = useState<ProjectArtifact | null>(null);
  const [pendingAction, setPendingAction] = useState<TradingAction | null>(null);
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [currentAnalysis, setCurrentAnalysis] = useState<MarketAnalysis | null>(null);
  const [binanceBalance, setBinanceBalance] = useState<string | null>(null);
  const [currentRisk, setCurrentRisk] = useState<RiskAssessment | null>(null);
  const [currentSentiment, setCurrentSentiment] = useState<SentimentData | null>(null);
  const [realizedProfit, setRealizedProfit] = useState(0);
  const [tradeCount, setTradeCount] = useState(0);
  const [marketData, setMarketData] = useState<any>(null);
  const [showRiskPanel, setShowRiskPanel] = useState(false);
  const [riskConfig, setRiskConfig] = useState(DEFAULT_RISK_CONFIG);
  const [aiProvider, setAiProvider] = useState<'groq' | 'gemini'>('groq');

  // 📊 OPEN POSITIONS STATE - Track positions for UI display
  interface UIPosition {
    symbol: string;
    size: number;
    entryPrice: number;
    currentPrice: number;
    stopLoss: number;
    takeProfit: number;
    pnl: number;
    pnlPercent: number;
    orderId?: string;
  }
  const [openPositionsUI, setOpenPositionsUI] = useState<UIPosition[]>([]);
  const [closingPosition, setClosingPosition] = useState<string | null>(null);

  // 💰 BINANCE PORTFOLIO STATE - Real holdings from exchange
  interface PortfolioPosition {
    symbol: string;
    asset: string;
    size: number;
    currentPrice: number;
    valueEUR: number;
  }
  const [binancePortfolio, setBinancePortfolio] = useState<PortfolioPosition[]>([]);
  const [btcHoldings, setBtcHoldings] = useState<number>(0);
  const [btcValueEUR, setBtcValueEUR] = useState<number>(0);
  // 🔄 TRADEABLE COINS & ROTATION LOGIC
  const TRADEABLE_SYMBOLS = ['BTC/EUR', 'ETH/EUR', 'SOL/EUR', 'AVAX/EUR'];
  const MAX_POSITIONS_PER_COIN = 3;

  // Function to get next available symbol when current is full
  const getNextAvailableSymbol = useCallback(() => {
    const openPositions = riskManagement.getOpenPositions();

    for (const sym of TRADEABLE_SYMBOLS) {
      // Count positions for this symbol
      const positionsForSymbol = Array.from(openPositions.entries())
        .filter(([key]) => key === sym).length;

      if (positionsForSymbol < MAX_POSITIONS_PER_COIN) {
        return sym;
      }
    }

    // All symbols are full
    return null;
  }, []);


  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  // Initialize agents
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    if (apiKey) {
      aiAgentsService.initialize(apiKey);
      setAgents(aiAgentsService.getAllAgents());
    }
  }, []);

  // 🔄 SYNC RISK CONFIG - Sincronizar config de UI con el servicio real
  useEffect(() => {
    riskManagement.updateConfig(riskConfig);
    console.log('📊 Risk config synced with service:', riskConfig);
  }, [riskConfig]);

  // 📊 SYNC OPEN POSITIONS - Solo en modo SIMULACIÓN (Paper Trading)
  // En Live Mode, las posiciones vienen de syncBinancePortfolio
  useEffect(() => {
    // Skip if in live mode - Binance sync handles positions
    if (isLiveMode) return;

    const syncPositions = () => {
      const positions = riskManagement.getOpenPositions();
      const currentPrice = marketData?.bitcoin?.eur || 0;

      const positionsArray: UIPosition[] = [];
      positions.forEach((pos, symbol) => {
        const pnl = (currentPrice - pos.entryPrice) * pos.size;
        const pnlPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;

        positionsArray.push({
          symbol,
          size: pos.size,
          entryPrice: pos.entryPrice,
          currentPrice,
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
          pnl,
          pnlPercent,
          orderId: pos.orderId,
        });
      });

      setOpenPositionsUI(positionsArray);

      // Log position monitoring only if there are positions
      if (positionsArray.length > 0) {
        console.log(`📊 [Paper Trading] Monitoring positions - Current price: $${currentPrice}`);
      }
    };

    // Initial sync
    syncPositions();

    // Sync every 5 seconds
    const interval = setInterval(syncPositions, 5000);
    return () => clearInterval(interval);
  }, [marketData, isLiveMode]);

  // 💰 SYNC BINANCE PORTFOLIO - Fetch real holdings from exchange every 10 seconds
  useEffect(() => {
    const syncBinancePortfolio = async () => {
      if (!isLiveMode) return;

      try {
        const portfolio = await binanceService.getPortfolio();
        if (portfolio && portfolio.positions) {
          setBinancePortfolio(portfolio.positions.map((p: any) => ({
            symbol: p.symbol,
            asset: p.asset,
            size: p.size,
            currentPrice: p.currentPrice,
            valueEUR: p.valueEUR || p.valueUSD,
          })));

          // Extract BTC holdings
          const btcPosition = portfolio.positions.find((p: any) => p.asset === 'BTC');
          if (btcPosition) {
            setBtcHoldings(btcPosition.size);
            setBtcValueEUR((btcPosition as any).valueEUR || (btcPosition as any).valueUSD || 0);
          }

          // 🆕 SYNC BINANCE POSITIONS TO UI - Show only REAL trading positions
          // Only show tradeable coins: BTC, ETH, SOL, AVAX (same as dropdown)
          const TRADEABLE_ASSETS = ['BTC', 'ETH', 'SOL', 'AVAX'];
          const cryptoPositions = portfolio.positions.filter(
            (p: any) => TRADEABLE_ASSETS.includes(p.asset) && p.size > 0
          );

          if (cryptoPositions.length > 0) {
            // 🆕 Fetch order history to get REAL entry prices
            const orderHistories: Record<string, number> = {};
            for (const p of cryptoPositions) {
              const symbol = p.symbol || `${p.asset}/EUR`;
              // Always try to get the real entry price on first load
              const existingPos = riskManagement.getOpenPositions().get(symbol);
              const needsRealPrice = !existingPos || existingPos.entryPrice === p.currentPrice;

              if (needsRealPrice) {
                try {
                  console.log(`📡 Fetching order history for ${symbol}...`);
                  const orders = await binanceService.getOrderHistory(symbol, 20);
                  console.log(`📜 Got ${orders.length} orders for ${symbol}:`, orders.slice(0, 3));

                  // Find the MOST RECENT BUY order for this symbol (sorted by timestamp desc)
                  const buyOrders = orders
                    .filter((o: any) => o.side === 'buy' && o.status === 'closed')
                    .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
                  console.log(`📜 Found ${buyOrders.length} closed BUY orders, latest:`, buyOrders[0]);
                  const lastBuyOrder = buyOrders[0];
                  if (lastBuyOrder) {
                    const price = lastBuyOrder.price || lastBuyOrder.average || 0;
                    if (price > 0) {
                      orderHistories[symbol] = price;
                      console.log(`✅ Found real entry price for ${symbol}: €${price.toFixed(2)} (Order ID: ${lastBuyOrder.id})`);
                    }
                  } else {
                    console.log(`⚠️ No closed BUY orders found for ${symbol}`);
                  }
                } catch (e) {
                  console.log(`⚠️ Could not fetch order history for ${symbol}:`, e);
                }
              }
            }

            const uiPositions: UIPosition[] = cryptoPositions.map((p: any) => {
              const symbol = p.symbol || `${p.asset}/EUR`;

              // 🔧 FIX: Get REAL entry price from multiple sources
              const existingPosition = riskManagement.getOpenPositions().get(symbol);
              let realEntryPrice: number;

              if (existingPosition && existingPosition.entryPrice > 0) {
                // 1. Best: Use the real entry price we recorded when the trade was executed
                realEntryPrice = existingPosition.entryPrice;
              } else if (orderHistories[symbol]) {
                // 2. Good: Use the price from Binance order history
                realEntryPrice = orderHistories[symbol];
              } else {
                // 3. Fallback: Use current price (0% PnL until we get real price)
                realEntryPrice = p.currentPrice;
              }

              const pnl = (p.currentPrice - realEntryPrice) * p.size;
              const pnlPercent = realEntryPrice > 0 ? ((p.currentPrice - realEntryPrice) / realEntryPrice) * 100 : 0;

              // 🆕 SYNC TO RISK MANAGEMENT - Register position for anti-duplicate protection
              if (!riskManagement.getOpenPositions().has(symbol)) {
                riskManagement.openPosition(
                  symbol,
                  p.size,
                  realEntryPrice,
                  'buy' // Assume long position
                );
                console.log(`🔄 Synced Binance position to riskManagement: ${symbol} @ €${realEntryPrice.toFixed(2)}`);
              }

              return {
                symbol,
                size: p.size,
                entryPrice: realEntryPrice,
                currentPrice: p.currentPrice,
                stopLoss: realEntryPrice * 0.98, // 2% below REAL entry
                takeProfit: realEntryPrice * 1.04, // 4% above REAL entry
                pnl,
                pnlPercent,
              };
            });

            setOpenPositionsUI(uiPositions);
            console.log(`📊 Synced ${uiPositions.length} positions from Binance:`,
              uiPositions.map(p => `${p.symbol}: ${p.size} @ €${p.entryPrice.toFixed(2)}`).join(', '));
          }
        }
      } catch (error) {
        console.error('Failed to sync Binance portfolio:', error);
      }
    };

    // Initial sync
    syncBinancePortfolio();

    // Sync every 10 seconds
    const interval = setInterval(syncBinancePortfolio, 10000);
    return () => clearInterval(interval);
  }, [isLiveMode]);

  // Fetch market data
  const fetchMarketData = useCallback(async () => {
    try {
      // 🇪🇺 Fetch prices in EUR for European market
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=eur&include_24hr_change=true&include_24hr_vol=true');
      const data = await response.json();
      setMarketData(data);
      return data;
    } catch (e) {
      console.error("Market data fetch failed", e);
      return { bitcoin: { eur: 85000 }, ethereum: { eur: 3000 }, solana: { eur: 120 } };
    }
  }, []);

  // Add message to A2A stream
  const addMessage = useCallback((from: string, to: string, protocol: string, payload: any) => {
    const message: A2AMessage = {
      id: Math.random().toString(36),
      from,
      to,
      protocol: protocol as any,
      payload,
      priority: 'normal',
      timestamp: Date.now(),
      requiresResponse: false,
    };
    setMessages(prev => [...prev.slice(-50), message]);
  }, []);

  // 🔴 CLOSE POSITION MANUALLY - Allow user to close position before SL/TP
  const closePositionManually = useCallback(async (symbol: string) => {
    try {
      setClosingPosition(symbol);

      const position = riskManagement.getOpenPositions().get(symbol);
      if (!position) {
        console.error('Position not found:', symbol);
        setClosingPosition(null);
        return;
      }

      console.log(`🔴 MANUALLY CLOSING POSITION: ${symbol}`, position);

      // Place a market SELL order to close the position
      const result = await binanceService.placeOrder({
        symbol,
        side: 'sell',
        type: 'market',
        amount: position.size,
      });

      if (result.success && result.order) {
        // Close position in risk management
        const pnl = riskManagement.closePosition(symbol, result.order.price);

        // Update UI
        setRealizedProfit(prev => prev + pnl);
        setTradeCount(prev => prev + 1);

        // Add to artifacts
        setArtifacts(prev => [...prev, {
          id: `manual_close_${Date.now()}`,
          name: `🔴 MANUAL_CLOSE_${symbol.replace('/', '_')}`,
          type: 'TRANSACTION' as const,
          content: JSON.stringify({
            symbol,
            closedSize: position.size,
            entryPrice: position.entryPrice,
            exitPrice: result.order!.price,
            pnl: pnl.toFixed(2),
            timestamp: new Date().toISOString(),
          }, null, 2),
          status: 'READY' as const,
          value: `€${pnl.toFixed(2)}`,
        }]);

        addMessage('USER', 'ALL', 'POSITION_CLOSED', {
          symbol,
          pnl: pnl.toFixed(2),
          reason: 'Manual close by user',
        });

        console.log(`✅ Position closed manually: ${symbol}, PnL: €${pnl.toFixed(2)}`);
      } else {
        console.error('Failed to close position:', result.error);
        addMessage('SYSTEM', 'ALL', 'ERROR', {
          message: `Failed to close ${symbol}: ${result.error}`,
        });
      }
    } catch (error: any) {
      console.error('Error closing position:', error);
      addMessage('SYSTEM', 'ALL', 'ERROR', {
        message: `Error closing position: ${error.message}`,
      });
    } finally {
      setClosingPosition(null);
    }
  }, [addMessage]);

  // ============================================
  // AUTOMATIC TRADE EXECUTION (No human approval needed)
  // Los agentes AI deciden y ejecutan automáticamente
  // ============================================
  const executeAutomaticTrade = useCallback(async (action: TradingAction) => {
    try {
      console.log('🤖 AUTO-EXECUTING TRADE:', action);

      let orderResult = null;
      let executionProfit = 0;

      // In live mode, execute real transaction via Binance
      if (isLiveMode) {
        // 🆕 VALIDACIÓN COMPLETA DE DUPLICADOS/SIMILARES
        const tradeValidation = riskManagement.canOpenNewTrade(
          action.symbol,
          action.type.toLowerCase() as 'buy' | 'sell',
          action.price
        );

        if (!tradeValidation.allowed) {
          console.log(`🚫 Trade bloqueado: ${tradeValidation.reason}`);

          addMessage('guardian', 'ALL', 'TRADE_BLOCKED', {
            message: tradeValidation.reason,
            symbol: action.symbol,
            type: action.type,
            price: action.price
          });

          // Register in Artifact Vault with enhanced fields
          setArtifacts(prev => [...prev, {
            id: `blocked_${Date.now()}`,
            name: `🚫 BLOQUEADO_${action.type}_${action.symbol.replace('/', '_')}`,
            type: 'TRADE_BLOCKED',
            status: 'FAILED',
            value: tradeValidation.reason,
            // Enhanced fields
            timestamp: Date.now(),
            symbol: action.symbol,
            action: action.type as 'BUY' | 'SELL',
            price: action.price,
            stopLoss: action.stopLoss,
            takeProfit: action.takeProfit,
            confidence: action.confidence,
            reasoning: `Bloqueado: ${tradeValidation.reason}`,
            content: JSON.stringify({
              ...action,
              blockedAt: new Date().toISOString(),
              blockReason: tradeValidation.reason,
              mode: 'RISK_VALIDATION_FAILED',
            }, null, 2),
          }]);

          // 🔄 AUTO-ROTATION: Switch to next available symbol
          const nextSymbol = getNextAvailableSymbol();
          if (nextSymbol && nextSymbol !== action.symbol) {
            console.log(`🔄 Auto-rotating from ${action.symbol} to ${nextSymbol}`);
            setSelectedSymbol(nextSymbol);
            addMessage('SYSTEM', 'ALL', 'MARKET_UPDATE', {
              message: `🔄 Rotando a ${nextSymbol} (${action.symbol} tiene posición abierta)`
            });
          } else if (!nextSymbol) {
            console.log(`⚠️ Todas las monedas tienen posiciones abiertas - Sistema en espera`);
            addMessage('SYSTEM', 'ALL', 'MARKET_UPDATE', {
              message: `⚠️ Todas las monedas tienen máximo de posiciones - Esperando cierre`
            });
          }

          setAgents(aiAgentsService.getAllAgents());
          return;
        }

        console.log(`✅ Trade aprobado: ${tradeValidation.reason}`);

        // 🧠 VALIDACIÓN DEL RAZONAMIENTO DE LA IA (MENOS AGRESIVA)
        // Solo bloquear si la IA EXPLÍCITAMENTE dice que NO opere
        // No bloquear por mencionar riesgos, que es normal en cualquier análisis
        const strictNegativePatterns = [
          'la decisión final es hold',
          'recomendación final es hold',
          'recomiendo hold',
          'no abrir posición',
          'no ejecutar esta operación',
          'cancelar la operación',
          'veto la operación'
        ];

        const reasoningLower = action.reasoning.toLowerCase();

        // Solo bloquear si encuentra patrones MUY específicos de rechazo
        const aiRecommendsNoTrade = strictNegativePatterns.some(pattern =>
          reasoningLower.includes(pattern)
        );

        if (aiRecommendsNoTrade) {
          addMessage('guardian', 'ALL', 'AI_RECOMMENDATION_BLOCKED', {
            message: `🧠 IA recomienda NO OPERAR - Respetando decisión`,
            reasoning: action.reasoning.slice(0, 200) + '...',
          });

          // Register in Artifact Vault
          setArtifacts(prev => [...prev, {
            id: `ai_blocked_${Date.now()}`,
            name: `🧠 IA_RECOMIENDA_NO_${action.type}_${action.symbol.replace('/', '_')}`,
            type: 'SIGNAL',
            status: 'READY',
            value: `IA recomienda mantener/esperar`,
            content: JSON.stringify({
              ...action,
              blockedAt: new Date().toISOString(),
              blockReason: 'La IA recomienda NO abrir esta posición en su razonamiento',
              mode: 'AI_RECOMMENDED_HOLD',
            }, null, 2),
          }]);

          setAgents(aiAgentsService.getAllAgents());
          return;
        }

        // ⚠️ RISK VALIDATION - Always validate before executing
        const riskCheck = riskManagement.shouldExecuteTrade(
          action.confidence,
          currentAnalysis?.trendStrength || 50,
          3, // Simulated agent agreement
          6
        );

        if (!riskCheck.approved) {
          addMessage('guardian', 'ALL', 'RISK_ALERT', {
            message: `⛔ Operación AUTO-RECHAZADA por gestión de riesgo`,
            reason: riskCheck.reason,
          });

          // Register rejection in Artifact Vault
          setArtifacts(prev => [...prev, {
            id: `rejected_${Date.now()}`,
            name: `❌ RECHAZADO_${action.type}_${action.symbol.replace('/', '_')}`,
            type: 'SIGNAL',
            status: 'READY',
            value: `Rechazado: ${riskCheck.reason}`,
            content: JSON.stringify({
              ...action,
              rejectedAt: new Date().toISOString(),
              rejectionReason: riskCheck.reason,
              mode: 'AUTO_REJECTED',
            }, null, 2),
          }]);

          setAgents(aiAgentsService.getAllAgents());
          return;
        }

        // Calculate safe position size using REAL EUR balance from Binance
        const portfolioValue = binanceBalance ? parseFloat(binanceBalance) : 91.62; // 🔧 FIX: Use binanceBalance state
        console.log('💰 Auto-trade using portfolio value:', portfolioValue, 'EUR');

        const positionCalc = riskManagement.calculatePositionSize(
          portfolioValue,
          action.price,
          currentAnalysis?.volatility === 'extreme' ? 5 :
            currentAnalysis?.volatility === 'high' ? 3 : 1
        );

        // Use the smaller of requested or calculated safe amount
        const safeAmount = Math.min(action.amount, positionCalc.amount);

        // Calculate stop-loss and take-profit
        const stopLoss = riskManagement.calculateStopLoss(
          action.price,
          action.type.toLowerCase() as 'buy' | 'sell'
        );
        const takeProfit = riskManagement.calculateTakeProfit(
          action.price,
          action.type.toLowerCase() as 'buy' | 'sell'
        );

        addMessage('claude_x', 'ALL', 'AUTO_EXECUTION_START', {
          action: action.type,
          symbol: action.symbol,
          amount: safeAmount,
          stopLoss,
          takeProfit,
          mode: 'AUTONOMOUS',
        });

        // Execute order via Binance backend with safe parameters
        const result = await binanceService.placeOrder({
          symbol: action.symbol,
          side: action.type.toLowerCase() as 'buy' | 'sell',
          type: 'market',
          amount: safeAmount,
          stopLoss,
          takeProfit,
        });

        if (result.success && result.order) {
          orderResult = result.order;
          // Calculate actual profit from the trade
          const tradeCost = result.order.filled * (result.order.price || action.price);
          executionProfit = action.type === 'SELL' ? tradeCost : -tradeCost;

          // 📊 TRACK POSITION - Registrar la posición abierta en risk management
          if (action.type === 'BUY') {
            riskManagement.openPosition(
              action.symbol,
              result.order.filled,
              result.order.price || action.price,
              'buy'
            );
            console.log('📊 Position tracked:', action.symbol, result.order.filled, 'BTC');
          } else if (action.type === 'SELL') {
            // Si es SELL, intentamos cerrar la posición existente
            const closedPnL = riskManagement.closePosition(action.symbol, result.order.price || action.price);

            // Si no había posición registrada, calculamos el profit de la venta directamente
            // (vendimos X BTC por Y USDT, el profit es el valor en USDT recibido)
            if (closedPnL === 0) {
              // Para una venta, el "profit" inmediato es lo que recibimos
              // Esto se ajustará cuando cerremos la operación completa
              executionProfit = result.order.filled * result.order.price; // USDT recibidos
              console.log('📊 Direct SELL executed:', action.symbol, 'Received:', executionProfit.toFixed(2), 'USDT');
            } else {
              executionProfit = closedPnL;
              console.log('📊 Position closed:', action.symbol, 'PnL:', closedPnL);
            }
          }

          addMessage('claude_x', 'ALL', 'AUTO_EXECUTION_SUCCESS', {
            orderId: result.order.id,
            status: result.order.status,
            filledAt: result.order.price,
            profit: executionProfit.toFixed(2),
          });
          console.log('✅ AUTO LIVE ORDER EXECUTED:', result.order, 'Profit:', executionProfit);
        } else {
          throw new Error(result.error || 'Order execution failed');
        }
      } else {
        // Paper trading - simulate profit
        executionProfit = (Math.random() - 0.3) * 100;
        addMessage('claude_x', 'ALL', 'PAPER_EXECUTION', {
          action: action.type,
          symbol: action.symbol,
          simulatedProfit: executionProfit.toFixed(2),
        });
      }

      // Record the trade stats
      setTradeCount(prev => prev + 1);
      setRealizedProfit(prev => prev + executionProfit);

      // ✅ Register in Artifact Vault with full details
      setArtifacts(prev => [...prev, {
        id: `auto_tx_${Date.now()}`,
        name: `⚡ AUTO_${action.type}_${action.symbol.replace('/', '_')}`,
        type: 'TRADE_EXECUTED',
        status: 'SUCCESS',
        value: `€${(action.amount * action.price).toFixed(2)} | Conf: ${action.confidence}%`,
        // Enhanced fields
        timestamp: Date.now(),
        symbol: action.symbol,
        action: action.type as 'BUY' | 'SELL',
        price: orderResult?.price || action.price,
        stopLoss: action.stopLoss,
        takeProfit: action.takeProfit,
        confidence: action.confidence,
        pnl: executionProfit,
        reasoning: action.reasoning.substring(0, 150),
        content: JSON.stringify({
          ...action,
          executedAt: new Date().toISOString(),
          profit: executionProfit,
          liveOrder: orderResult,
          mode: isLiveMode ? 'AUTO_LIVE' : 'AUTO_PAPER',
          executionType: 'AUTONOMOUS',
          aiReasoning: action.reasoning,
        }, null, 2),
      }]);

      // Update agents to show success
      setAgents(prev => prev.map(a =>
        a.id === 'claude_x' ? { ...a, status: 'executing' as any, currentTask: `✅ ${action.type} ejecutado automáticamente!` } : a
      ));

      setTimeout(() => {
        setAgents(aiAgentsService.getAllAgents());
      }, 3000);

    } catch (error) {
      console.error('Auto trade execution failed:', error);
      addMessage('SYSTEM', 'ALL', 'AUTO_EXECUTION_ERROR', { error: String(error) });

      // Register error in Artifact Vault
      setArtifacts(prev => [...prev, {
        id: `error_${Date.now()}`,
        name: `⚠️ ERROR_${action.type}_${action.symbol.replace('/', '_')}`,
        type: 'SIGNAL',
        status: 'PENDING',
        value: `Error: ${String(error)}`,
        content: JSON.stringify({
          ...action,
          errorAt: new Date().toISOString(),
          error: String(error),
        }, null, 2),
      }]);
    }
  }, [isLiveMode, addMessage, currentAnalysis]);

  // ============================================
  // POSITION MONITOR - Verifica SL/TP y cierra automáticamente
  // ============================================
  const monitorOpenPositions = useCallback(async () => {
    if (!isLiveMode) return;

    const openPositions = riskManagement.getOpenPositions();
    if (openPositions.size === 0) return;

    try {
      // Verificar cada posición abierta CON SU PROPIO PRECIO
      for (const [symbol, position] of openPositions) {
        // 🔧 FIX: Obtener el precio del símbolo de la posición, NO del símbolo seleccionado
        const ticker = await binanceService.getTicker(symbol);
        if (!ticker?.price) {
          console.log(`⚠️ No price for ${symbol}, skipping SL/TP check`);
          continue;
        }

        const currentPrice = ticker.price;
        const { entryPrice, stopLoss, takeProfit, size } = position;

        // Skip BNB - it's for transaction fees, not trading
        if (symbol.startsWith('BNB')) {
          continue;
        }

        console.log(`📊 Monitoring ${symbol} - Current: €${currentPrice.toFixed(2)} | SL: €${stopLoss.toFixed(2)} | TP: €${takeProfit.toFixed(2)}`);

        let shouldClose = false;
        let closeReason = '';
        let closeType: 'STOP_LOSS' | 'TAKE_PROFIT' | null = null;

        // ⛔ CHECK STOP-LOSS
        if (currentPrice <= stopLoss) {
          shouldClose = true;
          closeReason = `⛔ STOP-LOSS alcanzado: €${currentPrice.toFixed(2)} <= €${stopLoss.toFixed(2)}`;
          closeType = 'STOP_LOSS';
        }

        // 🎯 CHECK TAKE-PROFIT
        if (currentPrice >= takeProfit) {
          shouldClose = true;
          closeReason = `🎯 TAKE-PROFIT alcanzado: €${currentPrice.toFixed(2)} >= €${takeProfit.toFixed(2)}`;
          closeType = 'TAKE_PROFIT';
        }

        if (shouldClose && closeType) {
          console.log(`🔔 ${closeReason}`);

          addMessage('guardian', 'ALL', 'AUTO_CLOSE_TRIGGERED', {
            symbol,
            reason: closeReason,
            currentPrice,
            entryPrice,
            size,
          });

          try {
            // Ejecutar orden de venta para cerrar posición
            const result = await binanceService.placeOrder({
              symbol: symbol,
              side: 'sell',
              type: 'market',
              amount: size,
            });

            if (result.success && result.order) {
              const order = result.order;
              // Calcular P/L
              const pnl = (order.price - entryPrice) * size;

              // Cerrar posición en el tracker
              riskManagement.closePosition(symbol, order.price);

              // Actualizar stats
              setTradeCount(prev => prev + 1);
              setRealizedProfit(prev => prev + pnl);

              // Registrar en Artifact Vault
              setArtifacts(prev => [...prev, {
                id: `auto_close_${Date.now()}`,
                name: `${closeType === 'STOP_LOSS' ? '⛔' : '🎯'} AUTO_CLOSE_${symbol.replace('/', '_')}`,
                type: 'TRANSACTION',
                status: 'DEPLOYED',
                value: `${closeType} | PnL: $${pnl.toFixed(2)}`,
                content: JSON.stringify({
                  type: 'AUTO_CLOSE',
                  closeType,
                  symbol,
                  size,
                  entryPrice,
                  exitPrice: order.price,
                  stopLoss,
                  takeProfit,
                  pnl,
                  closedAt: new Date().toISOString(),
                  order: order,
                  reason: closeReason,
                }, null, 2),
              }]);


              addMessage('claude_x', 'ALL', 'POSITION_CLOSED', {
                symbol,
                closeType,
                pnl: pnl.toFixed(2),
                entryPrice,
                exitPrice: result.order.price,
              });

              console.log(`✅ Position closed: ${symbol} | ${closeType} | PnL: $${pnl.toFixed(2)}`);
            }
          } catch (closeError) {
            console.error('Failed to close position:', closeError);
            addMessage('SYSTEM', 'ALL', 'ERROR', {
              message: `Error cerrando posición ${symbol}`,
              error: String(closeError),
            });
          }
        }
      }
    } catch (error) {
      console.error('Position monitoring error:', error);
    }
  }, [isLiveMode, addMessage]);

  // Run analysis cycle
  const runAnalysisCycle = useCallback(async () => {
    if (!isRunning) return;

    try {
      // Update agents status
      setAgents(prev => prev.map(a => a.id === 'market_oracle' ? { ...a, status: 'analyzing' as any, currentTask: 'Fetching market data...' } : a));

      // Fetch market data
      const market = await fetchMarketData();
      addMessage('market_oracle', 'ALL', 'MARKET_UPDATE', { prices: market });

      // Get sentiment
      setAgents(prev => prev.map(a => a.id === 'pulse' ? { ...a, status: 'computing' as any, currentTask: 'Analyzing sentiment...' } : a));
      const sentiment = await sentimentService.getSentiment(selectedSymbol);
      setCurrentSentiment(sentiment);
      addMessage('pulse', 'ALL', 'MARKET_UPDATE', { sentiment: sentiment.overallSentiment, fearGreed: sentiment.fearGreedIndex });

      // Fetch REAL candles from Binance for BTC/EUR
      setAgents(prev => prev.map(a => a.id === 'market_oracle' ? { ...a, status: 'computing' as any, currentTask: 'Fetching BTC/EUR candles...' } : a));

      let realCandles;
      try {
        // Use marketDataService to get real EUR candles
        realCandles = await marketDataService.getCandles(selectedSymbol, '1h', 200);
        console.log(`📊 Fetched ${realCandles.length} real ${selectedSymbol} candles`);
      } catch (candleError) {
        console.warn('Failed to fetch real candles, using EUR-adjusted mock:', candleError);
        // Fallback: Use EUR price from market data (eur instead of usd)
        const eurPrice = market.bitcoin?.eur || 74000;
        realCandles = Array.from({ length: 200 }, (_, i) => ({
          symbol: selectedSymbol,
          timestamp: Date.now() - (200 - i) * 3600000,
          open: eurPrice * (1 + (Math.random() - 0.5) * 0.02),
          high: eurPrice * (1 + Math.random() * 0.01),
          low: eurPrice * (1 - Math.random() * 0.01),
          close: eurPrice * (1 + (Math.random() - 0.5) * 0.02),
          volume: 1000000 + Math.random() * 5000000,
        }));
      }

      // Run technical analysis with REAL EUR data + Fear&Greed for contrarian signals
      setAgents(prev => prev.map(a => a.id === 'market_oracle' ? { ...a, status: 'computing' as any, currentTask: 'Running technical analysis...' } : a));
      const analysis = indicatorService.analyzeMarket(selectedSymbol, realCandles, riskConfig, sentiment.fearGreedIndex);
      setCurrentAnalysis(analysis);

      // Create analysis artifact
      setArtifacts(prev => [...prev, {
        id: `analysis_${Date.now()}`,
        name: `Analysis_${selectedSymbol.replace('/', '_')}.json`,
        type: 'ANALYSIS',
        status: 'READY',
        value: `Trend: ${analysis.trend}`,
        content: JSON.stringify(analysis, null, 2),
      }]);

      // Run risk assessment
      setAgents(prev => prev.map(a => a.id === 'guardian' ? { ...a, status: 'computing' as any, currentTask: 'Assessing risk...' } : a));
      const mockPortfolio = {
        totalValueUSD: balance ? parseFloat(formatEther(balance.value)) * (market.ethereum?.eur || 3000) : 10000,
        totalPnL: realizedProfit,
        totalPnLPercent: (realizedProfit / 10000) * 100,
        balances: [],
        positions: [],
        lastUpdate: Date.now(),
      };
      const risk = riskService.assessRisk(selectedSymbol, analysis, mockPortfolio);
      setCurrentRisk(risk);

      if (risk.overallRisk === 'extreme') {
        addMessage('guardian', 'ALL', 'RISK_ALERT', { warning: 'Extreme risk detected - trading suspended' });
      }

      // Store signals
      setSignals(analysis.signals);

      // AI Strategy Generation - SIEMPRE ejecutar, los agentes deciden si operar
      // 🔥 CAMBIO: Antes solo analizaba si había señales técnicas (analysis.signals.length > 0)
      // Ahora SIEMPRE analiza - los agentes IA son suficientemente inteligentes para decidir
      console.log('🤖 Iniciando análisis AI con', analysis.signals.length, 'señales técnicas previas');
      setAgents(prev => prev.map(a => a.id === 'nexus_prime' ? { ...a, status: 'computing' as any, currentTask: 'Generating strategy...' } : a));

      const aiResult = await aiAgentsService.analyzeMarket(selectedSymbol, analysis, sentiment);

      addMessage('nexus_prime', 'ALL', 'SIGNAL_BROADCAST', {
        confidence: aiResult.confidence,
        signals: aiResult.signals.length
      });


      // If high confidence signal, execute AUTOMATICALLY (no human approval needed)
      // Los agentes son suficientemente inteligentes para decidir
      console.log('🔍 AI Result:', { confidence: aiResult.confidence, signals: analysis.signals.length });

      // 🛡️ RESPETAR EL ANÁLISIS DE RIESGO:
      const reasoningLower = aiResult.reasoning.toLowerCase();
      const riskRejected = reasoningLower.includes('rejected') ||
        reasoningLower.includes('no aprobada') ||
        reasoningLower.includes('rechazado') ||
        reasoningLower.includes('veto');

      // 📊 Calcular confianza efectiva: combinar IA + señales técnicas
      const topSignal = analysis.signals.length > 0
        ? analysis.signals.sort((a, b) => b.confidence - a.confidence)[0]
        : null;
      const technicalConfidence = topSignal?.confidence || 0;

      // Si hay señal técnica fuerte (>=75%) y IA no rechaza explícitamente, usar la técnica
      // Si IA tiene confianza alta, usar la de IA
      const effectiveConfidence = Math.max(
        aiResult.confidence,
        riskRejected ? 0 : technicalConfidence * 0.9  // Dar 90% peso a técnica si IA no rechaza
      );

      console.log(`📊 Confidence: AI=${aiResult.confidence}%, Technical=${technicalConfidence}%, Effective=${effectiveConfidence.toFixed(0)}%`);

      if (riskRejected) {
        console.log('⛔ Trade bloqueado - Análisis IA rechazó explícitamente');
        addMessage('guardian', 'ALL', 'RISK_ALERT', {
          message: '⛔ Operación bloqueada por gestión de riesgo',
          reason: 'El análisis indica que el riesgo no es aceptable en este momento'
        });
      } else if (effectiveConfidence >= riskConfig.minConfidenceThreshold && topSignal && topSignal.type !== 'hold') {
        console.log(`✅ Confianza efectiva ${effectiveConfidence.toFixed(0)}% >= ${riskConfig.minConfidenceThreshold}% - Ejecutando trade`);

        const action: TradingAction = {
          id: `action_${Date.now()}`,
          type: topSignal.type === 'buy' ? 'BUY' : 'SELL',
          symbol: selectedSymbol,
          amount: risk.positionSizeRecommended / topSignal.price,
          price: topSignal.price,
          stopLoss: risk.stopLossRecommended,
          takeProfit: risk.takeProfitRecommended,
          confidence: effectiveConfidence,
          reasoning: aiResult.reasoning,
          status: 'PENDING_AUTH',
        };

        // Log the automatic execution decision
        addMessage('nexus_prime', 'claude_x', 'AUTO_EXECUTE', {
          action: action.type,
          symbol: action.symbol,
          confidence: action.confidence,
          mode: 'AUTONOMOUS'
        });

        setAgents(prev => prev.map(a =>
          a.id === 'claude_x' ? { ...a, status: 'executing' as any, currentTask: '⚡ Ejecutando automáticamente...' } : a
        ));

        // Execute trade automatically instead of waiting for human approval
        executeAutomaticTrade(action);
      } else if (effectiveConfidence < riskConfig.minConfidenceThreshold) {
        console.log(`⏸️ Confianza insuficiente (${effectiveConfidence.toFixed(0)}% < ${riskConfig.minConfidenceThreshold}%) - No se ejecuta trade`);
        addMessage('nexus_prime', 'ALL', 'MARKET_UPDATE', {
          message: `Confianza insuficiente (${effectiveConfidence.toFixed(0)}%) - Manteniendo posición`
        });
      }

      // Reset agent statuses
      setTimeout(() => {
        setAgents(aiAgentsService.getAllAgents());
      }, 2000);

    } catch (error) {
      console.error('Analysis cycle error:', error);
      addMessage('SYSTEM', 'ALL', 'ERROR', { error: String(error) });
    }
  }, [isRunning, selectedSymbol, fetchMarketData, addMessage, balance, realizedProfit]);

  // Run analysis cycle periodically
  useEffect(() => {
    if (!isRunning) return;

    runAnalysisCycle();
    const interval = setInterval(runAnalysisCycle, 180000); // 🔥 Every 3 MINUTES (180 segundos) - permite que ciclos completos terminen

    return () => clearInterval(interval);
  }, [isRunning, runAnalysisCycle]);

  // Monitor open positions for SL/TP (every 10 seconds)
  useEffect(() => {
    if (!isRunning || !isLiveMode) return;

    // Check positions immediately
    monitorOpenPositions();

    // Then check every 10 seconds
    const positionMonitorInterval = setInterval(monitorOpenPositions, 10000);

    return () => clearInterval(positionMonitorInterval);
  }, [isRunning, isLiveMode, monitorOpenPositions]);

  // Handle trade approval
  const handleApproveAction = useCallback(async () => {
    if (!pendingAction) {
      return;
    }

    // Note: For Binance trading, we use API keys on the backend
    // Web3 wallet is only needed for DeFi/DEX trading

    try {
      console.log('🎯 AUTHORIZE TRADE CLICKED!', pendingAction);

      let orderResult = null;
      let executionProfit = 0;

      // In live mode, execute real transaction via Binance
      if (isLiveMode) {
        // ⚠️ RISK VALIDATION - Validate before executing
        const riskCheck = riskManagement.shouldExecuteTrade(
          pendingAction.confidence,
          currentAnalysis?.trendStrength || 50,
          3, // Simulated agent agreement
          6
        );

        if (!riskCheck.approved) {
          addMessage('guardian', 'HUMAN', 'RISK_ALERT', {
            message: `⛔ Operación RECHAZADA por gestión de riesgo`,
            reason: riskCheck.reason,
          });
          alert(`Operación rechazada por gestión de riesgo:\n${riskCheck.reason}`);
          setPendingAction(null);
          return;
        }

        // Calculate safe position size (max 10% of portfolio for small accounts)
        // 🔧 FIX: Use binanceBalance state (the EUR balance from Binance)
        let portfolioValue = binanceBalance ? parseFloat(binanceBalance) : 91.62;

        if (isLiveMode) {
          try {
            const realPortfolio = await binanceService.getPortfolio();
            // Use EUR value from backend
            if (realPortfolio && ((realPortfolio as any).totalValueEUR || realPortfolio.totalValueUSD) > 0) {
              portfolioValue = (realPortfolio as any).totalValueEUR || realPortfolio.totalValueUSD || portfolioValue;
              console.log('💰 Using REAL portfolio value:', portfolioValue, 'EUR');
            }
          } catch (e) {
            console.error('Failed to fetch portfolio, using binanceBalance:', binanceBalance);
            portfolioValue = binanceBalance ? parseFloat(binanceBalance) : 91.62;
          }
        }

        const positionCalc = riskManagement.calculatePositionSize(
          portfolioValue,
          pendingAction.price,
          currentAnalysis?.volatility === 'extreme' ? 5 :
            currentAnalysis?.volatility === 'high' ? 3 : 1
        );

        // Use the smaller of requested or calculated safe amount
        const safeAmount = Math.min(pendingAction.amount, positionCalc.amount);

        // Calculate stop-loss and take-profit
        const stopLoss = riskManagement.calculateStopLoss(
          pendingAction.price,
          pendingAction.type.toLowerCase() as 'buy' | 'sell'
        );
        const takeProfit = riskManagement.calculateTakeProfit(
          pendingAction.price,
          pendingAction.type.toLowerCase() as 'buy' | 'sell'
        );

        addMessage('claude_x', 'ALL', 'EXECUTION_START', {
          action: pendingAction.type,
          symbol: pendingAction.symbol,
          amount: safeAmount,
          stopLoss,
          takeProfit,
          riskApproval: riskCheck.reason,
        });

        // Execute order via Binance backend with safe parameters
        const result = await binanceService.placeOrder({
          symbol: pendingAction.symbol,
          side: pendingAction.type.toLowerCase() as 'buy' | 'sell',
          type: 'market',
          amount: safeAmount,
          stopLoss,
          takeProfit,
        });

        if (result.success && result.order) {
          orderResult = result.order;
          // Calculate actual profit from the trade
          const tradeCost = result.order.filled * (result.order.price || pendingAction.price);
          // For SELL orders, we gain USDT; for BUY orders, we spend USDT
          executionProfit = pendingAction.type === 'SELL' ? tradeCost : -tradeCost;

          addMessage('claude_x', 'ALL', 'EXECUTION_CONFIRM', {
            orderId: result.order.id,
            status: result.order.status,
            filledAt: result.order.price,
            profit: executionProfit.toFixed(2),
          });
          console.log('✅ LIVE ORDER EXECUTED:', result.order, 'Profit:', executionProfit);

          // ✅ Track position for Risk Management Monitoring (Priority 7)
          if (pendingAction.type === 'BUY') {
            riskManagement.openPosition(
              pendingAction.symbol,
              result.order.filled,
              result.order.price || pendingAction.price,
              'buy',
              result.order.id
            );
          }
        } else {
          throw new Error(result.error || 'Order execution failed');
        }
      } else {
        // Paper trading - simulate profit
        executionProfit = (Math.random() - 0.3) * 100;
      }

      // Record the trade
      setTradeCount(prev => prev + 1);
      setRealizedProfit(prev => prev + executionProfit);

      // Create transaction artifact
      setArtifacts(prev => [...prev, {
        id: `tx_${Date.now()}`,
        name: `TX_${pendingAction.type}_${pendingAction.symbol.replace('/', '_')}`,
        type: 'TRANSACTION',
        status: isLiveMode ? 'DEPLOYED' : 'READY',
        value: `$${(pendingAction.amount * pendingAction.price).toFixed(2)}`,
        content: JSON.stringify({
          ...pendingAction,
          executedAt: new Date().toISOString(),
          profit: executionProfit,
          liveOrder: orderResult,
          mode: isLiveMode ? 'LIVE' : 'PAPER',
        }, null, 2),
      }]);

      addMessage('HUMAN', 'claude_x', 'APPROVAL_GRANTED', { actionId: pendingAction.id });

      setAgents(prev => prev.map(a =>
        a.id === 'claude_x' ? { ...a, status: 'executing' as any, currentTask: isLiveMode ? 'Order executed on Binance!' : 'Simulating trade...' } : a
      ));

      setTimeout(() => {
        setAgents(aiAgentsService.getAllAgents());
      }, 3000);

      setPendingAction(null);

    } catch (error) {
      console.error('Trade execution failed:', error);
      addMessage('SYSTEM', 'ALL', 'ERROR', { error: String(error) });
      alert(`Trade execution failed: ${error}`);
    }
  }, [pendingAction, isConnected, isLiveMode, connect, connectors, addMessage]);

  const handleRejectAction = useCallback(() => {
    if (pendingAction) {
      addMessage('HUMAN', 'fingpt_core', 'APPROVAL_DENIED', { actionId: pendingAction.id, reason: 'User rejected' });
      setPendingAction(null);
      setAgents(aiAgentsService.getAllAgents());
    }
  }, [pendingAction, addMessage]);

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-300 font-sans selection:bg-blue-500/30 overflow-hidden relative">

      {viewingArtifact && <ArtifactModal artifact={viewingArtifact} onClose={() => setViewingArtifact(null)} />}

      {pendingAction && (
        <TradingActionModal
          action={pendingAction}
          onApprove={handleApproveAction}
          onReject={handleRejectAction}
          onClose={() => setPendingAction(null)}
        />
      )}

      {showRiskPanel && (
        <RiskControlPanel
          onClose={() => setShowRiskPanel(false)}
          config={riskConfig}
          onUpdateConfig={(updates) => {
            setRiskConfig(prev => ({ ...prev, ...updates }));
            riskManagement.updateConfig(updates);
          }}
        />
      )}

      {/* TOP COMMAND BAR */}
      <div className="h-16 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-white font-bold tracking-wider">
            <Bot className="w-6 h-6 text-blue-500" />
            SIMULACRUM <span className="text-slate-600">|</span>
            <span className="text-purple-400">REAL TRADING</span>
            <span className={`text-[10px] ml-2 px-2 py-0.5 rounded border ${isLiveMode ? 'bg-red-900/30 border-red-500 text-red-400' : 'bg-green-900/30 border-green-500 text-green-400'}`}>
              {isLiveMode ? '⚠️ LIVE' : '🧪 PAPER'}
            </span>
          </div>

          {/* Symbol Selector */}
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-3 py-1 text-xs text-slate-300"
          >
            <option value="BTC/EUR">BTC/EUR</option>
            <option value="ETH/EUR">ETH/EUR</option>
            <option value="SOL/EUR">SOL/EUR</option>
            <option value="AVAX/EUR">AVAX/EUR</option>
          </select>
        </div>

        {/* 💰 CENTER: REAL-TIME BALANCE & PNL */}
        <div className="flex bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-1.5 items-center gap-6 mx-auto">
          {/* Available Balance */}
          <div className="flex flex-col items-start leading-none">
            <span className="text-[10px] text-slate-500 font-bold tracking-wide uppercase">Available</span>
            <div className="flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-sm font-bold text-white tracking-tight">
                {isLiveMode && typeof binanceBalance === 'string'
                  ? `€${parseFloat(binanceBalance).toFixed(2)}`
                  : (balance && balance.value ? `€${(parseFloat(formatEther(balance.value)) * 3000).toFixed(2)}` : '€100.00')}
                <span className="text-[10px] text-slate-600">EUR</span>
              </span>
            </div>
          </div>

          <div className="w-[1px] h-6 bg-slate-800"></div>

          {/* 🔶 BTC HOLDINGS - Only show in live mode with BTC */}
          {isLiveMode && btcHoldings > 0 && (
            <>
              <div className="flex flex-col items-start leading-none">
                <span className="text-[10px] text-yellow-500 font-bold tracking-wide uppercase">BTC Holdings</span>
                <div className="flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-yellow-500" />
                  <span className="text-sm font-bold text-yellow-400 tracking-tight">
                    {btcHoldings.toFixed(5)}
                    <span className="text-[10px] text-yellow-600 ml-1">BTC</span>
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-start leading-none">
                <span className="text-[10px] text-slate-500 font-bold tracking-wide uppercase">Value</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-white tracking-tight">
                    €{btcValueEUR.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="w-[1px] h-6 bg-slate-800"></div>
            </>
          )}

          {/* Session PnL */}
          <div className="flex flex-col items-start leading-none">
            <span className="text-[10px] text-slate-500 font-bold tracking-wide uppercase">Session PnL</span>
            <div className={`flex items-center gap-1.5 font-bold text-sm tracking-tight ${realizedProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {realizedProfit >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {realizedProfit >= 0 ? '+' : '-'}${Math.abs(realizedProfit).toFixed(2)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Live Mode Toggle */}
          <button
            onClick={async () => {
              if (!isLiveMode) {
                // Connect to Binance (PRODUCTION MODE)
                try {
                  // Try to connect to Binance backend
                  addMessage('SYSTEM', 'ALL', 'MARKET_UPDATE', { message: 'Connecting to Binance LIVE (Real Money)...' });

                  // 🔴 WARNING: CONNECTING TO REAL EXCHANGE
                  const result = await binanceService.connect(false); // false = PRODUCTION mode

                  console.log('📡 Binance connection result:', result);

                  if (result.success) {
                    setIsLiveMode(true);

                    // Extract EUR balance - backend returns simple {EUR: 100} format
                    const eurBalance = result.balances?.EUR || result.balances?.['EUR'] || '0';
                    console.log('💶 EUR Balance:', eurBalance);
                    setBinanceBalance(String(eurBalance));

                    addMessage('SYSTEM', 'ALL', 'MARKET_UPDATE', {
                      message: `✅ Connected to Binance REAL TRADING. Balance: €${parseFloat(String(eurBalance)).toFixed(2)} EUR`,
                      balances: result.balances
                    });
                    console.log('🔴 LIVE MODE ACTIVATED - Connected to Binance PRODUCTION');
                  } else {
                    console.error('Connection failed:', result.message);
                    addMessage('SYSTEM', 'ALL', 'MARKET_UPDATE', { message: `❌ Connection failed: ${result.message}` });
                  }
                } catch (err: any) {
                  console.error('Connection error:', err);
                  addMessage('SYSTEM', 'ALL', 'MARKET_UPDATE', { message: `❌ Error: ${err.message}` });
                }
              } else {
                binanceService.disconnect();
                setIsLiveMode(false);
                addMessage('SYSTEM', 'ALL', 'MARKET_UPDATE', { message: 'Disconnected from Binance' });
              }
            }}
            className={`px-4 py-1.5 rounded text-xs font-bold transition-all ${isLiveMode
              ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
          >
            {isLiveMode ? '🔴 LIVE MODE' : '🟢 PAPER MODE'}
          </button>

          {/* AI Provider Status - Multi-Provider System */}
          <div className="flex items-center gap-2 bg-slate-800/50 border border-purple-500/20 rounded px-3 py-1.5">
            <Brain className="w-4 h-4 text-purple-400" />
            <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wide">
              Multi-AI
            </span>
            <div className="flex gap-1">
              <span className="text-[8px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded" title="OpenRouter (Pulse, Oracle)">OR</span>
              <span className="text-[8px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded" title="Gemini (Nexus Prime)">GEM</span>
              <span className="text-[8px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded" title="Groq (Guardian, FinGPT, Claude-X)">GRQ</span>
            </div>
          </div>

          {/* Risk Configuration Button */}
          <button
            onClick={() => setShowRiskPanel(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-500/30 rounded text-xs font-bold transition-colors"
          >
            <Shield className="w-3 h-3" />
            RISK: {riskConfig.maxPositionSizePercent}%
          </button>
          <div className="h-8 w-[1px] bg-slate-800" />

          {/* Start/Stop Engine */}
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`w-12 h-12 flex items-center justify-center rounded-full border-2 transition-all ${isRunning
              ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500'
              : 'bg-green-600 border-green-400 text-white shadow-[0_0_20px_rgba(22,163,74,0.5)]'
              }`}
          >
            {isRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 grid grid-cols-12 gap-0 overflow-hidden">

        {/* LEFT: A2A Communications */}
        <div className="col-span-3 border-r border-slate-800 bg-slate-950/50 p-4 flex flex-col gap-4 overflow-hidden">
          <div className="flex-1 min-h-0">
            <A2AStream messages={messages} />
          </div>

          {/* System Health */}
          <div className="bg-black border border-slate-800 rounded-lg p-3 font-mono text-[10px]">
            <div className="font-bold text-white mb-2 flex items-center gap-2">
              <Activity className="w-3 h-3 text-green-500" /> SYSTEM STATUS
            </div>
            <div className="space-y-1 text-slate-500">
              <div className="flex justify-between"><span>AI Agents:</span> <span className="text-purple-400">{agents.length} ACTIVE</span></div>
              <div className="flex justify-between"><span>Exchange:</span> <span className={isLiveMode ? 'text-green-400' : 'text-slate-500'}>{isLiveMode ? 'BINANCE API' : 'SIMULATED'}</span></div>
              <div className="flex justify-between"><span>Mode:</span> <span className={isLiveMode ? 'text-red-400' : 'text-green-400'}>{isLiveMode ? 'LIVE' : 'PAPER'}</span></div>
              <div className="flex justify-between"><span>Signals:</span> <span className="text-blue-400">{signals.length} PENDING</span></div>
            </div>
          </div>
        </div>

        {/* CENTER: Main Dashboard */}
        <div className="col-span-6 flex flex-col p-4 gap-4 overflow-y-auto bg-gradient-to-b from-slate-950 to-slate-900">

          {/* Agents Grid */}
          <div className="grid grid-cols-3 gap-3">
            {
              agents.slice(0, 6).map(agent => (
                <AgentCard key={agent.id} agent={agent} />
              ))
            }
          </div>

          {/* Technical Indicators */}
          <IndicatorDisplay indicators={currentAnalysis?.indicators || null} symbol={selectedSymbol} />

          {/* Sentiment & Risk */}
          <div className="grid grid-cols-2 gap-4">
            <SentimentDisplay sentiment={currentSentiment} />
            <RiskMeter risk={currentRisk} />
          </div>

          {/* Active Signals */}
          {
            signals.length > 0 && (
              <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                  <Target className="w-3 h-3" /> Active Signals ({signals.length})
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {signals.slice(0, 4).map(signal => (
                    <SignalCard
                      key={signal.id}
                      signal={signal}
                      onExecute={() => {
                        const action: TradingAction = {
                          id: `action_${Date.now()}`,
                          type: signal.type === 'buy' ? 'BUY' : 'SELL',
                          symbol: signal.symbol,
                          amount: 0.1,
                          price: signal.price,
                          confidence: signal.confidence,
                          reasoning: signal.reasoning,
                          status: 'PENDING_AUTH',
                        };
                        setPendingAction(action);
                      }}
                      onDismiss={() => {
                        setSignals(prev => prev.filter(s => s.id !== signal.id));
                      }}
                    />
                  ))}
                </div>
              </div>
            )
          }

          {/* Market Prices */}
          {
            marketData && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { coin: 'bitcoin', name: 'BTC' },
                  { coin: 'ethereum', name: 'ETH' },
                  { coin: 'solana', name: 'SOL' },
                ].map(({ coin, name }) => marketData[coin] && (
                  <div key={coin} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Coins className="w-4 h-4 text-yellow-500" />
                      <span className="font-bold text-white">{name}</span>
                    </div>
                    <div className="text-xl font-bold text-white">
                      €{marketData[coin].eur?.toLocaleString()}
                    </div>
                    <div className={`text-xs flex items-center gap-1 ${marketData[coin].eur_24h_change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {marketData[coin].eur_24h_change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {marketData[coin].eur_24h_change?.toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
            )
          }

          {/* 📊 OPEN POSITIONS PANEL */}
          <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                Open Positions
                {openPositionsUI.length > 0 && (
                  <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full text-[10px]">
                    {openPositionsUI.length}
                  </span>
                )}
              </h3>
              {openPositionsUI.length > 0 && (
                <div className="text-xs text-slate-400">
                  Total P&L: <span className={`font-bold ${openPositionsUI.reduce((acc, p) => acc + p.pnl, 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    €{openPositionsUI.reduce((acc, p) => acc + p.pnl, 0).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {openPositionsUI.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-800/50 flex items-center justify-center">
                  <Briefcase className="w-6 h-6 text-slate-600" />
                </div>
                <p className="text-sm">No open positions</p>
                <p className="text-xs text-slate-600 mt-1">Positions will appear here when you execute trades</p>
              </div>
            ) : (
              <div className="space-y-2">
                {openPositionsUI.map((position) => (
                  <div
                    key={position.symbol}
                    className={`bg-slate-800/60 border rounded-lg p-3 transition-all duration-300 ${position.pnl >= 0 ? 'border-green-500/30' : 'border-red-500/30'
                      }`}
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${position.pnl >= 0 ? 'bg-green-400' : 'bg-red-400'}`} />
                        <span className="font-bold text-white">{position.symbol}</span>
                        <span className="text-xs text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded">
                          LONG
                        </span>
                      </div>
                      <div className={`text-sm font-bold ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {position.pnl >= 0 ? '+' : ''}€{position.pnl.toFixed(2)}
                        <span className="text-xs ml-1">({position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%)</span>
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-4 gap-2 text-xs mb-3">
                      <div>
                        <span className="text-slate-500 block">Size</span>
                        <span className="text-white font-medium">{position.size.toFixed(6)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Entry</span>
                        <span className="text-white font-medium">€{position.entryPrice.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Current</span>
                        <span className={`font-medium ${position.currentPrice > position.entryPrice ? 'text-green-400' : 'text-red-400'}`}>
                          €{position.currentPrice.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Value</span>
                        <span className="text-white font-medium">€{(position.size * position.currentPrice).toFixed(2)}</span>
                      </div>
                    </div>

                    {/* SL/TP Progress Bar */}
                    <div className="mb-3">
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-red-400">SL: €{position.stopLoss.toFixed(2)}</span>
                        <span className="text-slate-400">Current: €{position.currentPrice.toFixed(2)}</span>
                        <span className="text-green-400">TP: €{position.takeProfit.toFixed(2)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full relative overflow-hidden">
                        {/* Background gradient */}
                        <div className="absolute inset-0 flex">
                          <div className="w-1/2 bg-gradient-to-r from-red-500/50 to-slate-600" />
                          <div className="w-1/2 bg-gradient-to-r from-slate-600 to-green-500/50" />
                        </div>
                        {/* Current price indicator */}
                        <div
                          className="absolute top-0 w-1 h-full bg-white shadow-lg shadow-white/50"
                          style={{
                            left: `${Math.min(100, Math.max(0,
                              ((position.currentPrice - position.stopLoss) / (position.takeProfit - position.stopLoss)) * 100
                            ))}%`
                          }}
                        />
                      </div>
                    </div>

                    {/* Close Button */}
                    <button
                      onClick={() => closePositionManually(position.symbol)}
                      disabled={closingPosition === position.symbol}
                      className={`w-full py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all duration-200 ${closingPosition === position.symbol
                        ? 'bg-slate-700 text-slate-400 cursor-wait'
                        : 'bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50'
                        }`}
                    >
                      {closingPosition === position.symbol ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Closing...
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3" />
                          Close Position at Market
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Artifacts & Stats */}
        <div className="col-span-3 border-l border-slate-800 bg-slate-950/50 p-4 flex flex-col gap-4 overflow-hidden">

          {/* Profit Display */}
          <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 border border-blue-800/30 rounded-lg p-4">
            <h4 className="text-xs font-bold text-blue-300 uppercase mb-2 flex items-center gap-2">
              <TrendingUp className="w-3 h-3" /> Session Performance
            </h4>
            <div className="text-3xl font-bold text-white flex items-center gap-1">
              <span className="text-slate-500 text-lg">€</span>
              <span className={realizedProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                {Math.abs(realizedProfit).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-slate-400">
              <span>Trades: {tradeCount}</span>
              <span className={realizedProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                {realizedProfit >= 0 ? '+' : ''}{((realizedProfit / 10000) * 100).toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Artifacts */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ArtifactVault artifacts={artifacts} onView={setViewingArtifact} />
          </div>

          {/* Quick Actions */}
          <div className="space-y-2">
            <button
              onClick={runAnalysisCycle}
              disabled={isRunning}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded text-xs font-bold flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3 h-3" />
              FORCE ANALYSIS
            </button>
            <button
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold flex items-center justify-center gap-2"
              onClick={() => {
                setMessages([]);
                setArtifacts([]);
                setSignals([]);
              }}
            >
              <History className="w-3 h-3" />
              CLEAR HISTORY
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SimulacrumTrading = () => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <SimulacrumTradingContent />
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default SimulacrumTrading;
