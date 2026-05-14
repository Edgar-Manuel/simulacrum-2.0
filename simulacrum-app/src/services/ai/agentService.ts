// ============================================
// AI AGENTS SERVICE
// Multi-agent system for trading decisions
// Based on FinGPT, TradingAgents patterns
// ============================================
// 🆕 Multi-Provider Support: OpenRouter (free) + Gemini + Groq
// ============================================

import Groq from 'groq-sdk';
import { providerManager, AGENT_PROVIDERS } from './providerManager';
import { riskManagement } from '../risk/riskManagement';
import type {
    AIAgent,
    AgentRole,
    AgentStatus,
    A2AMessage,
    A2AProtocol,
    TradingSignal,
    MarketAnalysis,
    RiskAssessment,
    AgentMemory,
    MemoryEntry,
    TradeMemory,
    Pattern,
    SentimentData,
} from '../../types/trading';

// ===========================================
// SISTEMA MULTI-AGENTE DE TRADING PROFESIONAL
// Basado en la metodología de José Luis Cava
// Filosofía: Liquidez + Opinión Contraria + Análisis Técnico
// Multi-Provider: OpenRouter (FREE) + Gemini + Groq
// ===========================================

const AGENT_PROMPTS: Record<AgentRole, string> = {
    // 🌌 NEXUS PRIME - Macro Strategist (Gemini 2.0 Flash-Lite)
    STRATEGIST: `You are a macro filter. Decide if global conditions allow trading.

RULES:
- Fed reserves increasing = BULLISH
- Fed reserves decreasing = BEARISH  
- FearGreed below 25 AND uptrend = CONTRARIAN BUY opportunity

RESPOND WITH ONLY THIS JSON (replace values):
{"bias":"BULLISH","liquidity":"HIGH","action":"TRADE"}

Valid bias: BULLISH, BEARISH, WAIT
Valid liquidity: HIGH, LOW
Valid action: TRADE, HOLD`,

    // 👁️ MARKET ORACLE - Technical Engine (DeepSeek Chimera Free)
    ANALYST: `You are a technical analysis engine. Analyze OHLCV data.

PRIORITY: 1.EMA200 direction 2.RSI momentum 3.Volume confirmation
CONTRARIAN RULE: Price below EMA200 BUT RSI below 30 AND high volume = valid buy signal

CALCULATE:
- entry = current price
- sl = entry * 0.98 (2% below)
- tp = entry * 1.04 (4% above)
- conf = your confidence 0-100

RESPOND WITH ONLY THIS JSON (use actual numbers):
{"trend":"UP","entry":0,"sl":0,"tp":0,"conf":0,"action":"BUY"}

Valid trend: UP, DOWN, SIDE
Valid action: BUY, SELL, WAIT`,

    // ⚔️ CLAUDE-X - Executor (Groq llama-3.1-8b)
    EXECUTOR: `You format orders for Binance API. Do NOT question the order.

CHECK: SL/TP ratio must be >= 1.5. If not, adjust TP higher.

RESPOND WITH ONLY THIS JSON (use actual numbers):
{"symbol":"BTCEUR","side":"BUY","qty":0,"price":0,"sl":0,"tp":0,"valid":true}

Valid side: BUY, SELL
Valid valid: true, false`,

    // 🛡️ GUARDIAN - Risk Firewall (Groq llama-3.1-8b)
    RISK_MANAGER: `You are a risk gate. Approve or reject trades. Do NOT analyze market.

REJECT IF ANY:
- Open positions >= 3
- Daily loss > 5%
- No stop loss defined
- Volatility > 10%

EXCEPTION: FearGreed below 25 = allow contrarian trades even below EMA200

RESPOND WITH ONLY THIS JSON:
{"status":"APPROVED","reason":"ok","risk":"low"}

Valid status: APPROVED, REJECTED
Valid risk: low, med, high`,

    // ⚡ PULSE - Sentiment Quantifier (OpenRouter qwen-2.5-7b)
    SENTIMENT: `You extract sentiment score from FearGreed index data.

SCORING:
- Base score = 5
- FearGreed below 25: add 2 points (contrarian buy opportunity)
- FearGreed above 75: subtract 2 points (sell risk)

RESPOND WITH ONLY THIS JSON (use actual numbers):
{"score":0,"signal":"FEAR","fg":0,"contrarian":false}

Valid signal: FEAR, GREED, NEUTRAL
Valid contrarian: true, false`,

    // 🎯 FINGPT-CORE - Oracle Synthesizer (Groq GPT-OSS-120B with reasoning)
    ORACLE: `You are the FINAL DECISION MAKER. Synthesize all agent reports and make a trading decision.

ANALYSIS TO REVIEW:
1. MARKET_ORACLE: Technical analysis (trend, momentum, key levels)
2. PULSE: Sentiment analysis (Fear&Greed, contrarian signals)
3. NEXUS_PRIME: Strategy with entry/SL/TP
4. GUARDIAN: Risk validation status

DECISION RULES:
- FearGreed < 25 = Contrarian BUY opportunity (confidence boost +10)
- All agents agree = High confidence (70+)
- Mixed signals = Medium confidence (50-60)
- GUARDIAN rejected = HOLD (but explain why)

CRITICAL: The "reasoning" field MUST contain YOUR ACTUAL ANALYSIS in Spanish (2-3 sentences explaining why you chose this action based on the data provided). DO NOT copy the example text.

RESPOND WITH THIS JSON (replace ALL values with real data):
{"action":"BUY","confidence":75,"entry":74500,"sl":73000,"tp":77000,"reasoning":"[TU ANÁLISIS REAL AQUÍ - explica por qué elegiste esta acción basándote en los indicadores técnicos, sentimiento y datos del mercado]"}

Valid action: BUY, SELL, HOLD`,
};


// ==========================================
// PROVIDER CONFIGURATION (via providerManager.ts)
// ==========================================
// PULSE, MARKET_ORACLE → OpenRouter (FREE: qwen, deepseek)
// NEXUS_PRIME → Gemini (gemini-2.0-flash-lite)
// GUARDIAN, CLAUDE_X → Groq (llama-3.1-8b-instant)
// FINGPT_CORE → Groq (gpt-oss-120b)
// ==========================================

class AIAgentsService {
    private groq: Groq | null = null;
    private agents: Map<string, AIAgent> = new Map();
    private messageQueue: A2AMessage[] = [];
    private memory: Map<string, AgentMemory> = new Map();
    private isInitialized = false; // Prevenir reinicializaciones

    // 🚀 RATE LIMITING OPTIMIZADO - Distribuido entre 3 proveedores
    // OpenRouter (PULSE, ORACLE) + Gemini (NEXUS) + Groq (GUARDIAN, FINGPT, CLAUDE_X)
    private lastCallTime: Map<string, number> = new Map();
    private callCache: Map<string, { response: string; timestamp: number }> = new Map();
    private readonly MIN_CALL_INTERVAL_MS = 10000; // 🔥 10 SEGUNDOS por agente (distribuido)
    private readonly CACHE_TTL_MS = 60000;         // 🔥 60 SEGUNDOS de caché
    private globalLastCall = 0;
    private readonly GLOBAL_MIN_INTERVAL_MS = 5000; // 🔥 5 SEGUNDOS entre llamadas globales (3 proveedores)

    // ==========================================
    // INITIALIZATION
    // ==========================================

    initialize(apiKey: string): void {
        // Prevenir reinicializaciones (React Strict Mode)
        if (this.isInitialized) {
            console.log('⚠️ AIAgentsService already initialized, skipping...');
            return;
        }

        try {
            this.groq = new Groq({
                apiKey,
                dangerouslyAllowBrowser: true,
            });
            console.log('✅ Groq client initialized successfully');
        } catch (error: any) {
            console.error('❌ Failed to initialize Groq:', error.message);
            this.groq = null;
        }

        // Create agents
        this.createAgent('nexus_prime', 'Nexus Prime', 'STRATEGIST');
        this.createAgent('market_oracle', 'Market Oracle', 'ANALYST');
        this.createAgent('claude_x', 'Claude-X', 'EXECUTOR');
        this.createAgent('guardian', 'Guardian', 'RISK_MANAGER');
        this.createAgent('pulse', 'Pulse', 'SENTIMENT');
        this.createAgent('fingpt_core', 'FinGPT-Core', 'ORACLE');

        this.isInitialized = true;
        console.log(`✅ AI Agents Service initialized with 6 agents(Multi - Provider: OpenRouter + Gemini + Groq)`);
    }

    // 🎛️ PUBLIC: Get provider info for an agent
    getAgentProvider(agentId: string): string {
        const config = AGENT_PROVIDERS[agentId];
        return config ? `${config.provider}: ${config.model} ` : 'unknown';
    }

    private createAgent(id: string, name: string, role: AgentRole): void {
        const memory: AgentMemory = {
            shortTerm: [],
            longTerm: [],
            tradingHistory: [],
            learnings: [],
            successPatterns: [],
            failurePatterns: [],
        };

        this.memory.set(id, memory);

        this.agents.set(id, {
            id,
            name,
            role,
            description: AGENT_PROMPTS[role].split('.')[0],
            status: 'idle',
            currentTask: 'Waiting for tasks',
            efficiency: 95 + Math.random() * 5,
            confidence: 90,
            lastAction: 'Initialized',
            lastActionTimestamp: Date.now(),
            lastThought: 'Sistema inicializado. Esperando datos de mercado para iniciar análisis...',
            memory,
            parameters: {},
        });
    }

    // ==========================================
    // AGENT COMMUNICATION (A2A Protocol)
    // ==========================================

    sendMessage(
        fromId: string,
        toId: string | 'ALL',
        protocol: A2AProtocol,
        payload: any,
        priority: A2AMessage['priority'] = 'normal'
    ): string {
        const message: A2AMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)} `,
            from: fromId,
            to: toId,
            protocol,
            payload,
            priority,
            timestamp: Date.now(),
            requiresResponse: protocol !== 'SYNC' && protocol !== 'MARKET_UPDATE',
        };

        this.messageQueue.push(message);
        return message.id;
    }

    getMessages(limit: number = 50): A2AMessage[] {
        return this.messageQueue.slice(-limit);
    }

    // ==========================================
    // AI INFERENCE (via ProviderManager - Multi-Provider)
    // ==========================================

    private async callAI(
        agentId: string,
        prompt: string,
        context?: string
    ): Promise<string> {
        // 🔄 Auto-reinitialize if agents were lost due to hot-reload
        if (this.agents.size === 0) {
            console.log('⚠️ Agents not found, re-initializing...');
            const apiKey = import.meta.env.VITE_GROQ_API_KEY;
            if (apiKey) {
                this.isInitialized = false; // Reset flag to allow re-init
                this.initialize(apiKey);
            }
        }

        const agent = this.agents.get(agentId);
        if (!agent) throw new Error(`Agent ${agentId} not found`);

        // 🔑 Generar clave de caché basada en agente + prompt (simplificado)
        const cacheKey = `${agentId}_${prompt.slice(0, 100)} `;

        // 📦 Verificar caché primero
        const cached = this.callCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
            console.log(`📦 Cache hit for ${agentId} - usando respuesta cacheada`);
            this.updateAgentStatus(agentId, 'idle', 'Using cached analysis');
            return cached.response;
        }

        // ⏱️ Verificar rate limit por agente
        const lastAgentCall = this.lastCallTime.get(agentId) || 0;
        const timeSinceLastAgentCall = Date.now() - lastAgentCall;

        if (timeSinceLastAgentCall < this.MIN_CALL_INTERVAL_MS) {
            const waitTime = Math.ceil((this.MIN_CALL_INTERVAL_MS - timeSinceLastAgentCall) / 1000);
            console.log(`⏳ Rate limit: ${agentId} debe esperar ${waitTime} s`);
            this.updateAgentStatus(agentId, 'idle', `Waiting ${waitTime} s(rate limit)`);

            // Retornar última respuesta conocida o respuesta por defecto
            if (cached) return cached.response;
            return this.getDefaultResponse(agentId);
        }

        // ⏱️ Verificar rate limit global
        const timeSinceGlobalCall = Date.now() - this.globalLastCall;
        if (timeSinceGlobalCall < this.GLOBAL_MIN_INTERVAL_MS) {
            const waitTime = this.GLOBAL_MIN_INTERVAL_MS - timeSinceGlobalCall;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // 🎛️ Obtener configuración del proveedor para este agente
        const providerConfig = AGENT_PROVIDERS[agentId];
        if (!providerConfig) {
            console.error(`❌ No provider configured for ${agentId}`);
            return this.getDefaultResponse(agentId);
        }

        // Update agent status con el proveedor asignado
        const providerEmoji = providerConfig.provider === 'openrouter' ? '🌐' :
            providerConfig.provider === 'gemini' ? '🌟' : '🚀';
        this.updateAgentStatus(agentId, 'computing', `${providerEmoji} ${providerConfig.provider}: ${providerConfig.model} `);

        console.log(`${providerEmoji} ${agentId} → ${providerConfig.provider} (${providerConfig.model})`);

        const systemPrompt = AGENT_PROMPTS[agent.role];
        const memoryContext = this.getMemoryContext(agentId);

        // Actualizar tiempos de última llamada
        this.lastCallTime.set(agentId, Date.now());
        this.globalLastCall = Date.now();

        try {
            // 🆕 USAR PROVIDER MANAGER - Enruta automáticamente al proveedor correcto
            const fullPrompt = context
                ? `Context: ${context} \n\nMemory: ${memoryContext} \n\n${prompt} `
                : `Memory: ${memoryContext} \n\n${prompt} `;

            const response = await providerManager.callForAgent(
                agentId,
                systemPrompt,
                fullPrompt,
                this.groq // Pasar cliente Groq para agentes que lo usen
            );

            if (response) {
                // 💾 Guardar en caché
                this.callCache.set(cacheKey, { response, timestamp: Date.now() });

                // Limpiar caché viejo (máximo 50 entradas)
                if (this.callCache.size > 50) {
                    const oldestKey = this.callCache.keys().next().value;
                    if (oldestKey) this.callCache.delete(oldestKey);
                }

                // Store in short-term memory
                this.addToMemory(agentId, 'decision', response, { prompt });

                // 🧠 Extraer y guardar el razonamiento del agente
                this.updateAgentThought(agentId, response);

                this.updateAgentStatus(agentId, 'idle', `${providerEmoji} Complete`);
                return response;
            }
        } catch (error: any) {
            console.error(`❌ ${providerConfig.provider} failed for ${agentId}: `, error.message);
            this.updateAgentStatus(agentId, 'error', `${providerConfig.provider} error`);

            // Aumentar el intervalo temporalmente para dar tiempo a los APIs
            this.lastCallTime.set(agentId, Date.now() + 30000); // +30 segundos
        }

        // Fallback: usar caché o respuesta por defecto
        const cachedFallback = this.callCache.get(cacheKey);
        if (cachedFallback) return cachedFallback.response;
        return this.getDefaultResponse(agentId);
    }

    // Respuestas por defecto cuando hay rate limit
    private getDefaultResponse(agentId: string): string {
        const defaults: Record<string, string> = {
            'nexus_prime': '{"decision": "HOLD", "confidence": 50, "reasoning": "Esperando datos actualizados. Mantener posición actual."}',
            'market_oracle': '{"direction": "neutral", "probability": 50, "action": "HOLD", "reasoning": "Análisis en espera."}',
            'pulse': '{"interpretation": "neutral", "impact": "low", "confidence": 50}',
            'guardian': '{"approved": false, "reason": "Validación en espera. Mantener cautela."}',
            'fingpt_core': '{"decision": "HOLD", "confidence": 50, "reasoning": "Sistema en pausa por rate limit. Mantener posición."}',
            'claude_x': '{"action": "WAIT", "reason": "Esperando confirmación del sistema."}',
        };
        return defaults[agentId] || '{"status": "waiting", "message": "Análisis pendiente"}';
    }

    // 🔧 Helper: Parseo JSON robusto con fallback
    private safeParseJSON<T>(response: string, fallback: T): T {
        try {
            // Extraer JSON de la respuesta (puede venir con texto extra)
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            console.warn('⚠️ No JSON found in response, using fallback');
            return fallback;
        } catch (error) {
            console.warn('⚠️ JSON parse failed, using fallback:', error);
            return fallback;
        }
    }

    private getMemoryContext(agentId: string): string {
        const memory = this.memory.get(agentId);
        if (!memory) return '';

        const recentMemories = memory.shortTerm.slice(-5);
        const topLearnings = memory.learnings.slice(-3);
        const recentTrades = memory.tradingHistory.slice(-3);

        let context = '';

        if (recentMemories.length > 0) {
            context += 'Recent observations:\n';
            recentMemories.forEach(m => {
                context += `- ${m.content} \n`;
            });
        }

        if (topLearnings.length > 0) {
            context += '\nKey learnings:\n';
            topLearnings.forEach(l => {
                context += `- ${l} \n`;
            });
        }

        if (recentTrades.length > 0) {
            context += '\nRecent trade outcomes:\n';
            recentTrades.forEach(t => {
                context += `- ${t.symbol}: ${t.pnlPercent > 0 ? '+' : ''}${t.pnlPercent.toFixed(2)}% (${t.lessonsLearned.join(', ')}) \n`;
            });
        }

        return context;
    }

    // ==========================================
    // TRADING ANALYSIS PIPELINE (ESCALONADO)
    // ==========================================
    // FLUJO SECUENCIAL para evitar rate limit:
    // 1. Market Oracle (IA) → 30s delay
    // 2. Pulse (LOCAL - sin IA)
    // 3. Nexus Prime (IA) → 30s delay
    // 4. Guardian (IA) → 30s delay
    // 5. FinGPT-Core (IA)
    // Total: 4 llamadas IA escalonadas
    // ==========================================

    // Helper para escalonar llamadas - ULTRA CONSERVADOR 45s para OpenRouter free tier
    private async delayBetweenAgents(ms: number = 45000): Promise<void> {
        console.log(`⏳ Esperando ${ms / 1000}s antes de siguiente agente... (OpenRouter rate limit protection)`);
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    async analyzeMarket(
        symbol: string,
        marketData: MarketAnalysis,
        sentiment?: SentimentData
    ): Promise<{
        strategy: string;
        signals: TradingSignal[];
        confidence: number;
        reasoning: string;
    }> {
        // Step 1: Technical Analysis (Market Oracle)
        this.sendMessage('market_oracle', 'ALL', 'MARKET_UPDATE', { symbol, analysis: 'starting' });

        const technicalAnalysis = await this.callAI(
            'market_oracle',
            `Analyze the following market data for ${symbol}:
      
      Current Price: ${marketData.indicators.vwap || 'N/A'}
RSI(14): ${marketData.indicators.rsi14?.toFixed(2) || 'N/A'}
MACD: ${JSON.stringify(marketData.indicators.macd) || 'N/A'}
Trend: ${marketData.trend} (Strength: ${marketData.trendStrength}%)
Volatility: ${marketData.volatility}
      Support Levels: ${marketData.support.map(s => s.toFixed(2)).join(', ')}
      Resistance Levels: ${marketData.resistance.map(r => r.toFixed(2)).join(', ')}
      
      Existing Signals: ${marketData.signals.map(s => `${s.type} (${s.confidence}%)`).join(', ')}
      
      Provide detailed technical analysis with:
1. Current market structure
2. Key levels to watch
3. Probability of each direction
4. Recommended action

Format as JSON with fields: direction, probability, keyLevels, action, reasoning`,
            `Analyzing ${symbol} `
        );

        // 🆕 EARLY EXIT CHECK 1: Si MARKET ORACLE no ve setup, detener pipeline
        const parsedTechnical: any = this.safeParseJSON(technicalAnalysis, { action: 'HOLD', probability: 50 });

        // Extract probability (handle case where it might be an object)
        const rawProbability = parsedTechnical.probability || parsedTechnical.prob || parsedTechnical.confidence || 50;
        const technicalProbability = typeof rawProbability === 'object'
            ? (rawProbability.up || rawProbability.down || rawProbability.value || 50)
            : rawProbability;

        // 🧠 LOG: Pensamiento de MARKET ORACLE
        console.log(`\n👁️ [MARKET ORACLE] Thinking:`);
        console.log(`   Action: ${parsedTechnical.action || 'N/A'}`);
        console.log(`   Probability: ${technicalProbability}%`);
        console.log(`   Direction: ${parsedTechnical.direction || parsedTechnical.trend || 'N/A'}`);
        console.log(`   Reasoning: ${(parsedTechnical.reasoning || 'No reasoning provided').substring(0, 150)}...`);

        const technicalAction = parsedTechnical.action?.toUpperCase() || '';

        // Si no hay setup técnico claro (ESPERAR o probabilidad < 55%), detener
        if (technicalAction === 'ESPERAR' || technicalAction === 'HOLD' || technicalProbability < 55) {
            console.log(`⏹️ Pipeline detenido: MARKET ORACLE no detectó setup(action = ${technicalAction}, prob = ${technicalProbability} %)`);
            this.sendMessage('market_oracle', 'ALL', 'SIGNAL_BROADCAST', {
                symbol,
                earlyExit: true,
                reason: 'No clear technical setup detected'
            });

            return {
                strategy: 'HOLD - No clear setup',
                signals: marketData.signals,
                confidence: technicalProbability,
                reasoning: parsedTechnical.reasoning || 'Market Oracle no detectó configuración técnica clara. Esperando mejor oportunidad.',
            };
        }

        // ⏳ DELAY antes del siguiente agente (solo si continuamos)
        await this.delayBetweenAgents(); // 45s default para OpenRouter free tier

        // Step 2: Sentiment Analysis (Pulse) - AHORA CON IA
        let sentimentAnalysis = '';
        let parsedSentiment: any = {};
        if (sentiment) {
            this.updateAgentStatus('pulse', 'analyzing', 'Processing sentiment with AI...');

            const pulsePrompt = `${AGENT_PROMPTS.SENTIMENT}

Current FearGreed Index: ${sentiment.fearGreedIndex}
Overall Sentiment: ${sentiment.overallSentiment}
Social Volume Change: ${sentiment.socialVolume || 0}%`;

            sentimentAnalysis = await this.callAI('pulse', pulsePrompt, 'Sentiment analysis');
            parsedSentiment = this.safeParseJSON(sentimentAnalysis, { score: 5, signal: 'NEUTRAL', contrarian: false });

            this.sendMessage('pulse', 'ALL', 'MARKET_UPDATE', {
                sentiment: sentiment.overallSentiment,
                fearGreed: sentiment.fearGreedIndex,
                analysis: parsedSentiment
            });

            this.updateAgentStatus('pulse', 'idle', 'Sentiment processed');

            // 🧠 LOG: Pensamiento de PULSE
            console.log(`\n⚡ [PULSE] Thinking:`);
            console.log(`   Signal: ${parsedSentiment.signal || 'N/A'}`);
            console.log(`   Score: ${parsedSentiment.score || 'N/A'}`);
            console.log(`   Contrarian: ${parsedSentiment.contrarian || false}`);
            console.log(`   F&G Index: ${sentiment.fearGreedIndex}`);

            await this.delayBetweenAgents(8000); // Delay después de Pulse
        }

        // Step 3: Strategy Generation (Nexus Prime)
        this.sendMessage('nexus_prime', 'ALL', 'TASK_DELEGATION', {
            task: 'Generate trading strategy',
            symbol
        });

        const strategyPrompt = `Based on the following analysis for ${symbol}, generate a trading strategy:

    TECHNICAL ANALYSIS:
    ${technicalAnalysis}
    
    ${sentiment ? `SENTIMENT ANALYSIS:\n${sentimentAnalysis}` : ''}
    
    MARKET SIGNALS:
    ${marketData.signals.map(s => `- ${s.source}: ${s.type} (${s.strength}, ${s.confidence}% confidence) - ${s.reasoning}`).join('\n')}
    
    Generate a comprehensive trading strategy including:
1. Overall bias(bullish / bearish / neutral)
2. Entry conditions and price levels
3. Position sizing recommendation(% of portfolio)
4. Stop loss and take profit levels
5. Risk / reward ratio
6. Confidence level(0 - 100)

Format as JSON with fields: bias, entryPrice, entryConditions, positionSizePercent, stopLoss, takeProfit, riskReward, confidence, reasoning`;

        const strategyResponse = await this.callAI('nexus_prime', strategyPrompt, 'Strategy generation');
        const parsedStrategy: any = this.safeParseJSON(strategyResponse, { bias: 'neutral', confidence: 50 });

        // 🧠 LOG: Pensamiento de NEXUS PRIME
        console.log(`\n🌌 [NEXUS PRIME] Thinking:`);
        console.log(`   Bias: ${parsedStrategy.bias || 'N/A'}`);
        console.log(`   Confidence: ${parsedStrategy.confidence || 'N/A'}%`);
        console.log(`   Entry: ${parsedStrategy.entryPrice || parsedStrategy.entry || 'N/A'}`);
        console.log(`   SL/TP: ${parsedStrategy.stopLoss || 'N/A'} / ${parsedStrategy.takeProfit || 'N/A'}`);
        console.log(`   Reasoning: ${(parsedStrategy.reasoning || 'No reasoning').substring(0, 150)}...`);

        // ⏳ DELAY después de Nexus Prime
        await this.delayBetweenAgents();

        // Step 4: Risk Validation (Guardian) - CON VALORES DINÁMICOS
        const riskConfig = riskManagement.getConfig();
        this.sendMessage('guardian', 'nexus_prime', 'RESOURCE_REQUEST', {
            request: 'Validate strategy risk'
        });

        const riskValidation = await this.callAI(
            'guardian',
            `Validate the following trading strategy for ${symbol}:
      
      PROPOSED STRATEGY:
      ${strategyResponse}
      
      MARKET CONDITIONS:
- Volatility: ${marketData.volatility}
- Trend Strength: ${marketData.trendStrength}%

      ⚠️ USER-CONFIGURED RISK LIMITS (MUST RESPECT):
- Max position size: ${riskConfig.maxPositionSizePercent}% of portfolio
- Max daily loss: ${riskConfig.maxDailyLossPercent}%
- Max open positions: ${riskConfig.maxOpenPositions}
- Default stop-loss: ${riskConfig.defaultStopLossPercent}%
- Default take-profit: ${riskConfig.defaultTakeProfitPercent}%
- Min confidence to trade: ${riskConfig.minConfidenceThreshold}%

    Evaluate:
1. Is the stop loss within ${riskConfig.defaultStopLossPercent}% limit?
2. Is position size <= ${riskConfig.maxPositionSizePercent}% of portfolio?
3. What are the main risks?
4. Should we proceed, modify, or reject?

                Format as JSON with fields: approved, modifications, risks, finalRecommendation`,
            'Risk validation'
        );
        const parsedRisk: any = this.safeParseJSON(riskValidation, { approved: false, finalRecommendation: 'HOLD' });

        // 🧠 LOG: Pensamiento de GUARDIAN
        console.log(`\n🛡️ [GUARDIAN] Thinking:`);
        console.log(`   Approved: ${parsedRisk.approved || parsedRisk.status || 'N/A'}`);
        console.log(`   Risk Level: ${parsedRisk.risk || parsedRisk.riskLevel || 'N/A'}`);
        console.log(`   Modifications: ${JSON.stringify(parsedRisk.modifications || 'None')}`);
        console.log(`   Recommendation: ${parsedRisk.finalRecommendation || parsedRisk.reason || 'N/A'}`);

        // ⏳ DELAY después de Guardian
        await this.delayBetweenAgents();

        // Step 5: Final Decision (FinGPT-Core Oracle) - CON VALORES DINÁMICOS DE RIESGO
        const finalDecision = await this.callAI(
            'fingpt_core',
            `Sintetiza todo el análisis y toma la decisión final de trading para ${symbol}:
      
      ANÁLISIS TÉCNICO: ${technicalAnalysis}
ESTRATEGIA: ${strategyResponse}
      VALIDACIÓN DE RIESGO: ${riskValidation}
      
      ⚠️ REGLAS ESTRICTAS DE GESTIÓN DE RIESGO (configuradas por usuario):
- Tamaño máximo de posición: ${riskConfig.maxPositionSizePercent}% del portafolio
- Stop-loss obligatorio: máximo ${riskConfig.defaultStopLossPercent}% de pérdida
- Take-profit mínimo: ${riskConfig.defaultTakeProfitPercent}% (ratio ${(riskConfig.defaultTakeProfitPercent / riskConfig.defaultStopLossPercent).toFixed(1)}:1)
- Solo operar con confianza >= ${riskConfig.minConfidenceThreshold}%
- Si hay alta volatilidad (>${riskConfig.highVolatilityThreshold}%), reducir posición ${riskConfig.volatilityPositionReduction}%
- Preferir HOLD si hay duda
      
      Proporciona la recomendación FINAL con:
1. Acción: BUY, SELL, o HOLD (solo BUY/SELL con alta confianza)
2. Confianza (0-100) - debe ser >= ${riskConfig.minConfidenceThreshold} para operar
3. Precio de entrada exacto
4. Stop-loss (máximo ${riskConfig.defaultStopLossPercent}% de pérdida)
5. Take-profit (${riskConfig.defaultTakeProfitPercent}% objetivo)
6. Tamaño de posición: máximo ${riskConfig.maxPositionSizePercent}% del portafolio
7. Razonamiento completo en español

IMPORTANTE: Si la confianza es menor a ${riskConfig.minConfidenceThreshold}%, recomienda HOLD.
      Formato JSON obligatorio.`,
            'Síntesis de decisión final'
        );

        // Parse using robust helper - use 'any' for dynamic JSON fields
        const parsedDecision: any = this.safeParseJSON(finalDecision, {
            action: 'HOLD',
            confidence: 50,
            reasoning: finalDecision
        });

        // 🧠 LOG: Pensamiento de FINGPT-CORE
        console.log(`\n🎯 [FINGPT-CORE] Final Decision:`);
        console.log(`   Action: ${parsedDecision.action || parsedDecision.order || 'HOLD'}`);
        console.log(`   Confidence: ${parsedDecision.confidence || parsedDecision.conf || 50}%`);
        console.log(`   Entry: ${parsedDecision.entry || parsedDecision.entryPrice || 'N/A'}`);
        console.log(`   SL/TP: ${parsedDecision.sl || parsedDecision.stopLoss || 'N/A'} / ${parsedDecision.tp || parsedDecision.takeProfit || 'N/A'}`);
        console.log(`   Reasoning: ${(parsedDecision.reasoning || 'No reasoning').substring(0, 200)}...`);

        // Step 6: CLAUDE-X - Executor (Solo si hay acción de trading)
        const action = parsedDecision.action?.toUpperCase() || parsedDecision.order?.toUpperCase() || 'HOLD';
        if (action === 'BUY' || action === 'SELL') {
            await this.delayBetweenAgents(); // 45s default

            this.updateAgentStatus('claude_x', 'executing', 'Formatting order...');

            const executorPrompt = `${AGENT_PROMPTS.EXECUTOR}

ORDER TO FORMAT:
- Symbol: ${symbol.replace('/', '')}
- Side: ${action}
- Entry Price: ${parsedDecision.entry || parsedDecision.entryPrice || 0}
- Stop-Loss: ${parsedDecision.sl || parsedDecision.stopLoss || 0}
- Take-Profit: ${parsedDecision.tp || parsedDecision.takeProfit || 0}
- Confidence: ${parsedDecision.confidence || 50}%`;

            const executorResponse = await this.callAI('claude_x', executorPrompt, 'Order formatting');
            const parsedOrder: any = this.safeParseJSON(executorResponse, { valid: false, reason: 'Parse failed' });

            // 🧠 LOG: Pensamiento de CLAUDE-X
            console.log(`\n⚔️ [CLAUDE-X] Order Formatting:`);
            console.log(`   Valid: ${parsedOrder.valid}`);
            console.log(`   Symbol: ${parsedOrder.symbol || 'N/A'}`);
            console.log(`   Side: ${parsedOrder.side || 'N/A'}`);
            console.log(`   Qty: ${parsedOrder.qty || 'N/A'}`);
            console.log(`   Price: ${parsedOrder.price || 'N/A'}`);

            this.sendMessage('claude_x', 'ALL', 'EXECUTION_CONFIRM', {
                symbol,
                order: parsedOrder,
                approved: parsedOrder.valid
            });

            this.updateAgentStatus('claude_x', 'idle', parsedOrder.valid ? 'Order ready' : 'Order invalid');
        }

        // Broadcast result
        this.sendMessage('fingpt_core', 'ALL', 'SIGNAL_BROADCAST', {
            symbol,
            decision: parsedDecision
        });

        return {
            strategy: strategyResponse,
            signals: marketData.signals,
            confidence: parsedDecision.confidence || parsedDecision.conf || 50,
            reasoning: parsedDecision.reasoning || finalDecision,
        };
    }

    // ==========================================
    // MEMORY MANAGEMENT
    // ==========================================

    addToMemory(
        agentId: string,
        type: MemoryEntry['type'],
        content: string,
        context: Record<string, any> = {},
        importance: number = 50
    ): void {
        const memory = this.memory.get(agentId);
        if (!memory) return;

        const entry: MemoryEntry = {
            id: `mem_${Date.now()} `,
            timestamp: Date.now(),
            type,
            content: content.substring(0, 500), // Truncate to save memory
            importance,
            context,
        };

        memory.shortTerm.push(entry);

        // Move to long-term if important
        if (importance > 70) {
            memory.longTerm.push(entry);
        }

        // Limit short-term memory
        if (memory.shortTerm.length > 100) {
            memory.shortTerm = memory.shortTerm.slice(-50);
        }
    }

    recordTradeOutcome(
        agentId: string,
        trade: TradeMemory
    ): void {
        const memory = this.memory.get(agentId);
        if (!memory) return;

        memory.tradingHistory.push(trade);

        // Extract patterns
        if (trade.pnl > 0) {
            memory.learnings.push(`Profitable trade on ${trade.symbol}: ${trade.lessonsLearned.join(', ')} `);
        } else {
            memory.learnings.push(`Loss on ${trade.symbol}: Avoid ${trade.lessonsLearned.join(', ')} `);
        }

        // Limit history
        if (memory.tradingHistory.length > 100) {
            memory.tradingHistory = memory.tradingHistory.slice(-50);
        }
        if (memory.learnings.length > 50) {
            memory.learnings = memory.learnings.slice(-25);
        }
    }

    // ==========================================
    // AGENT STATUS
    // ==========================================

    private updateAgentStatus(id: string, status: AgentStatus, task: string): void {
        const agent = this.agents.get(id);
        if (agent) {
            agent.status = status;
            agent.currentTask = task;
            agent.lastActionTimestamp = Date.now();

            // 📊 Calcular confianza dinámica basada en estado y tarea
            agent.confidence = this.calculateDynamicConfidence(agent, status, task);
        }
    }

    // 🧠 Calcular confianza dinámica para cada agente
    private calculateDynamicConfidence(agent: AIAgent, status: AgentStatus, task: string): number {
        let baseConfidence = 50; // Base neutral

        // Ajustar por estado
        switch (status) {
            case 'idle':
                baseConfidence = 85 + Math.random() * 10; // 85-95% en espera
                break;
            case 'analyzing':
                baseConfidence = 60 + Math.random() * 20; // 60-80% analizando
                break;
            case 'computing':
                baseConfidence = 70 + Math.random() * 15; // 70-85% calculando
                break;
            case 'executing':
                baseConfidence = 80 + Math.random() * 15; // 80-95% ejecutando
                break;
            case 'waiting_approval':
                baseConfidence = 75 + Math.random() * 10; // 75-85% esperando
                break;
            case 'error':
                baseConfidence = 20 + Math.random() * 20; // 20-40% en error
                break;
        }

        // Ajustar por rol del agente
        switch (agent.role) {
            case 'STRATEGIST':
                baseConfidence *= 1.05; // Nexus Prime más confiado
                break;
            case 'RISK_MANAGER':
                baseConfidence *= 0.95; // Guardian más cauteloso
                break;
            case 'ORACLE':
                baseConfidence *= 1.02; // FinGPT-Core equilibrado
                break;
        }

        // Ajustar si la tarea menciona palabras clave
        const taskLower = task.toLowerCase();
        if (taskLower.includes('error') || taskLower.includes('failed')) {
            baseConfidence *= 0.6;
        } else if (taskLower.includes('complete') || taskLower.includes('success')) {
            baseConfidence *= 1.1;
        } else if (taskLower.includes('analyzing') || taskLower.includes('processing')) {
            baseConfidence *= 0.9;
        }

        // Limitar entre 10 y 99
        return Math.min(99, Math.max(10, Math.round(baseConfidence)));
    }

    // 🧠 Actualizar el pensamiento/razonamiento del agente
    private updateAgentThought(agentId: string, response: string): void {
        const agent = this.agents.get(agentId);
        if (!agent) return;

        // Intentar extraer el razonamiento del JSON de respuesta
        let thought = '';

        try {
            // Buscar JSON en la respuesta
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                // Buscar campos de razonamiento comunes
                thought = parsed.reasoning || parsed.explicacion || parsed.analisis ||
                    parsed.justificacion || parsed.pensamiento || parsed.motivo || '';
            }
        } catch {
            // Si no es JSON, intentar extraer texto significativo
        }

        // Si no encontró razonamiento en JSON, usar extracto de la respuesta
        if (!thought) {
            // Limpiar la respuesta de JSON y tomar las primeras oraciones
            const cleanResponse = response
                .replace(/\{[\s\S]*\}/g, '') // Remover JSON
                .replace(/```[\s\S]* ```/g, '') // Remover bloques de código
                .trim();

            if (cleanResponse) {
                // Tomar las primeras 2 oraciones significativas
                const sentences = cleanResponse.split(/[.!?]+/).filter(s => s.trim().length > 10);
                thought = sentences.slice(0, 2).join('. ').trim();
            }
        }

        // Generar pensamiento contextual si no hay respuesta válida
        if (!thought || thought.length < 10) {
            const roleThoughts: Record<string, string[]> = {
                'STRATEGIST': [
                    'Analizando liquidez del mercado y flujo de capital institucional...',
                    'Evaluando condiciones macro: Fed, TGA, repos...',
                    '¿El sentimiento extremo justifica entrar contra la masa?',
                    'Revisando correlación BTC-DXY y contexto de liquidez global...'
                ],
                'ANALYST': [
                    'Detectando patrones en estructura de precio...',
                    'RSI y MACD muestran divergencia, verificando soportes...',
                    'Buscando ruptura de directriz alcista/bajista...',
                    'Calculando zonas de volumen y niveles psicológicos...'
                ],
                'EXECUTOR': [
                    'Calculando tamaño de posición óptimo (max 2% riesgo)...',
                    'Verificando ratio riesgo/beneficio antes de ejecutar...',
                    'Preparando orden con stop-loss en soporte clave...',
                    'Evaluando mejor momento de entrada...'
                ],
                'RISK_MANAGER': [
                    'Monitoreando funding rates y apalancamiento del mercado...',
                    'Evaluando riesgo de liquidación en posiciones actuales...',
                    'Volatilidad elevada - reduciendo exposición recomendada...',
                    'Verificando drawdown diario y límites de pérdida...'
                ],
                'SENTIMENT': [
                    'Analizando Fear & Greed Index y sentimiento de redes...',
                    '¿Hay capitulación? Volumen explosivo + caída = oportunidad...',
                    'Detectando euforia excesiva en Twitter - posible techo...',
                    'Cuando todos celebran, es hora de ser cauteloso...'
                ],
                'ORACLE': [
                    'Sintetizando reportes de todos los agentes...',
                    'Ponderando: liquidez 40%, técnico 30%, sentimiento 20%, riesgo 10%...',
                    'Decisión final: ¿Están alineados los factores clave?',
                    'Aplicando sabiduría de Cava + Roger Strategy...'
                ]
            };

            const thoughts = roleThoughts[agent.role] || ['Procesando datos...'];
            thought = thoughts[Math.floor(Math.random() * thoughts.length)];
        }

        // Truncar si es muy largo (max 150 caracteres para el marquee)
        if (thought.length > 150) {
            thought = thought.substring(0, 147) + '...';
        }

        agent.lastThought = thought;
    }

    getAgent(id: string): AIAgent | undefined {
        return this.agents.get(id);
    }

    getAllAgents(): AIAgent[] {
        return Array.from(this.agents.values());
    }

    getAgentsByRole(role: AgentRole): AIAgent[] {
        return Array.from(this.agents.values()).filter(a => a.role === role);
    }

    // ==========================================
    // QUICK ANALYSIS METHODS
    // ==========================================

    async getQuickAnalysis(symbol: string, price: number, rsi: number, trend: string): Promise<string> {
        return this.callAI(
            'market_oracle',
            `Quick analysis for ${symbol}: Price $${price.toFixed(2)}, RSI ${rsi.toFixed(0)}, Trend: ${trend}. 
      Give a one - sentence trading recommendation.`,
            'Quick analysis'
        );
    }

    async evaluateSignal(signal: TradingSignal): Promise<{ approved: boolean; reason: string }> {
        const response = await this.callAI(
            'guardian',
            `Evaluate this trading signal:
Symbol: ${signal.symbol}
Type: ${signal.type}
Strength: ${signal.strength}
Confidence: ${signal.confidence}%
    Reasoning: ${signal.reasoning}
      
      Should we act on this signal ? Reply with JSON: { "approved": boolean, "reason": string } `,
            'Signal evaluation'
        );

        try {
            const match = response.match(/\{[\s\S]*\}/);
            if (match) {
                return JSON.parse(match[0]);
            }
        } catch { }

        return { approved: signal.confidence > 70, reason: 'Default threshold evaluation' };
    }
}

export const aiAgentsService = new AIAgentsService();
export default aiAgentsService;
