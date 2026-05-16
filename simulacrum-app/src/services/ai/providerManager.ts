// ============================================
// PROVIDER MANAGER - Multi-Provider AI System
// OpenRouter (free) + Gemini + Groq
// ============================================

// ⚠️  DEVELOPMENT-ONLY: these VITE_* keys ship in the browser bundle.
// For any deployment beyond local prototyping move LLM calls behind the backend
// and pass a session token to the frontend. See README.
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';

// OpenRouter API endpoint
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// ==========================================
// AGENT → PROVIDER MAPPING (Cost Optimization)
// ==========================================
// PULSE & MARKET ORACLE → OpenRouter (FREE models)
// NEXUS PRIME → Gemini (free tier)
// GUARDIAN, CLAUDE-X → Groq (llama-3.1-8b-instant - fast)
// FINGPT-CORE → Groq (gpt-oss-120b - heavy reasoning)
// ==========================================

export type ProviderType = 'openrouter' | 'gemini' | 'groq';

export interface AgentProviderConfig {
    provider: ProviderType;
    model: string;
    fallbackModel?: string;
}

export const AGENT_PROVIDERS: Record<string, AgentProviderConfig> = {
    // 🔄 OpenRouter with KEY ROTATION (2 accounts for load balancing)
    'pulse': {
        provider: 'openrouter',
        model: 'nex-agi/deepseek-v3.1-nex-n1:free',
        fallbackModel: 'meta-llama/llama-3.1-8b-instruct:free',
    },
    'market_oracle': {
        provider: 'openrouter',
        model: 'tngtech/deepseek-r1t2-chimera:free',
        fallbackModel: 'nex-agi/deepseek-v3.1-nex-n1:free',
    },

    // 🌟 Gemini for macro analysis
    'nexus_prime': {
        provider: 'gemini',
        model: 'gemini-2.0-flash-lite',
    },

    // 🚀 Groq for validation and execution (fast)
    'guardian': {
        provider: 'groq',
        model: 'llama-3.1-8b-instant',
    },
    'claude_x': {
        provider: 'groq',
        model: 'llama-3.1-8b-instant',
    },

    // 🎯 Groq GPT-OSS for final synthesis (heavy reasoning with reasoning_effort: high)
    'fingpt_core': {
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        fallbackModel: 'openai/gpt-oss-20b',
    },
};

// ==========================================
// PROVIDER MANAGER CLASS
// ==========================================

class ProviderManager {
    private rateLimitCounters: Map<string, { count: number; resetTime: number }> = new Map();
    private readonly MAX_REQUESTS_PER_MINUTE = 10; // Ultra conservative for free tier

    // 🔄 API Key rotation for load balancing
    private openRouterKeyIndex = 0;
    private groqKeyIndex = 0;
    private geminiKeyIndex = 0;

    private getOpenRouterKeys(): string[] {
        const keys = [
            import.meta.env.VITE_OPENROUTER_API_KEY,
            import.meta.env.VITE_OPENROUTER_API_KEY_2,
        ].filter(k => k && k.length > 0);
        return keys.length > 0 ? keys : [];
    }

    private getGroqKeys(): string[] {
        const keys = [
            import.meta.env.VITE_GROQ_API_KEY,
            import.meta.env.VITE_GROQ_API_KEY_2,
        ].filter(k => k && k.length > 0);
        return keys.length > 0 ? keys : [];
    }

    private getGeminiKeys(): string[] {
        const keys = [
            import.meta.env.VITE_GEMINI_API_KEY,
            import.meta.env.VITE_GEMINI_API_KEY_2,
        ].filter(k => k && k.length > 0);
        return keys.length > 0 ? keys : [];
    }

    private getNextOpenRouterKey(): string {
        const keys = this.getOpenRouterKeys();
        if (keys.length === 0) return '';
        const key = keys[this.openRouterKeyIndex % keys.length];
        this.openRouterKeyIndex++;
        return key;
    }

    private getNextGroqKey(): string {
        const keys = this.getGroqKeys();
        if (keys.length === 0) return '';
        const key = keys[this.groqKeyIndex % keys.length];
        this.groqKeyIndex++;
        return key;
    }

    private getNextGeminiKey(): string {
        const keys = this.getGeminiKeys();
        if (keys.length === 0) return '';
        const key = keys[this.geminiKeyIndex % keys.length];
        this.geminiKeyIndex++;
        return key;
    }

    // ==========================================
    // OPENROUTER CLIENT (Free models)
    // ==========================================
    async callOpenRouter(
        model: string,
        systemPrompt: string,
        userPrompt: string,
        fallbackModel?: string
    ): Promise<string> {
        const requestBody = {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 800,
        };

        try {
            const apiKey = this.getNextOpenRouterKey();
            if (!apiKey) throw new Error('No OpenRouter API key available');

            console.log(`🌐 OpenRouter: Calling ${model}...`);

            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://simulacrum.trading',
                    'X-Title': 'Simulacrum Trading AI',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error(`❌ OpenRouter error ${response.status}:`, errorData);

                // If rate limited and fallback available, try fallback
                if (response.status === 429 && fallbackModel) {
                    console.log(`🔄 Rate limited, trying fallback: ${fallbackModel}`);
                    return this.callOpenRouter(fallbackModel, systemPrompt, userPrompt);
                }

                throw new Error(`OpenRouter error: ${response.status}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';

            console.log(`✅ OpenRouter response received (${content.length} chars)`);
            return content;

        } catch (error: any) {
            console.error(`❌ OpenRouter failed:`, error.message);
            throw error;
        }
    }

    // ==========================================
    // GEMINI CLIENT
    // ==========================================
    async callGemini(
        model: string,
        systemPrompt: string,
        userPrompt: string
    ): Promise<string> {
        const apiKey = this.getNextGeminiKey();
        if (!apiKey) throw new Error('No Gemini API key available');

        const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: `${systemPrompt}\n\n---\n\n${userPrompt}` }]
                }
            ],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 800,
            }
        };

        try {
            console.log(`🌟 Gemini: Calling ${model}...`);

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status}`);
            }

            const data = await response.json();
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

            console.log(`✅ Gemini response received (${content.length} chars)`);
            return content;

        } catch (error: any) {
            console.error(`❌ Gemini failed:`, error.message);
            throw error;
        }
    }

    // ==========================================
    // UNIFIED CALL METHOD
    // ==========================================
    async callForAgent(
        agentId: string,
        systemPrompt: string,
        userPrompt: string,
        groqClient?: any // Groq SDK instance passed from agentService
    ): Promise<string> {
        const config = AGENT_PROVIDERS[agentId];

        if (!config) {
            throw new Error(`Unknown agent: ${agentId}`);
        }

        // Check rate limiting
        if (this.isRateLimited(config.provider)) {
            console.log(`⏳ ${config.provider} rate limited, waiting...`);
            await this.waitForRateLimit(config.provider);
        }

        this.incrementRateLimit(config.provider);

        switch (config.provider) {
            case 'openrouter':
                return this.callOpenRouter(config.model, systemPrompt, userPrompt, config.fallbackModel);

            case 'gemini':
                return this.callGemini(config.model, systemPrompt, userPrompt);

            case 'groq':
                if (!groqClient) {
                    throw new Error('Groq client not provided');
                }
                return this.callGroq(groqClient, config.model, systemPrompt, userPrompt, config.fallbackModel);

            default:
                throw new Error(`Unknown provider: ${config.provider}`);
        }
    }

    // ==========================================
    // GROQ CLIENT (Wrapper for SDK calls)
    // ==========================================
    async callGroq(
        groqClient: any,
        model: string,
        systemPrompt: string,
        userPrompt: string,
        fallbackModel?: string
    ): Promise<string> {
        try {
            console.log(`🚀 Groq: Calling ${model}...`);

            const completion = await groqClient.chat.completions.create({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                model,
                temperature: 0.3,
                max_completion_tokens: 800,
                ...(model.includes('gpt-oss') ? { reasoning_effort: 'high' } : {}),
            });

            const message = completion.choices[0]?.message;
            const content = message?.content || (message as any)?.reasoning || '';

            console.log(`✅ Groq response received (${content.length} chars)`);
            return content;

        } catch (error: any) {
            console.error(`❌ Groq ${model} failed:`, error.message);

            // Try fallback model if available
            if (fallbackModel && error.status === 429) {
                console.log(`🔄 Rate limited, trying fallback: ${fallbackModel}`);
                return this.callGroq(groqClient, fallbackModel, systemPrompt, userPrompt);
            }

            throw error;
        }
    }

    // ==========================================
    // RATE LIMITING HELPERS
    // ==========================================
    private isRateLimited(provider: ProviderType): boolean {
        const counter = this.rateLimitCounters.get(provider);
        if (!counter) return false;

        if (Date.now() > counter.resetTime) {
            this.rateLimitCounters.delete(provider);
            return false;
        }

        return counter.count >= this.MAX_REQUESTS_PER_MINUTE;
    }

    private incrementRateLimit(provider: ProviderType): void {
        const now = Date.now();
        const counter = this.rateLimitCounters.get(provider);

        if (!counter || now > counter.resetTime) {
            this.rateLimitCounters.set(provider, {
                count: 1,
                resetTime: now + 60000, // Reset after 1 minute
            });
        } else {
            counter.count++;
        }
    }

    private async waitForRateLimit(provider: ProviderType): Promise<void> {
        const counter = this.rateLimitCounters.get(provider);
        if (!counter) return;

        const waitTime = counter.resetTime - Date.now();
        if (waitTime > 0) {
            console.log(`⏳ Waiting ${Math.ceil(waitTime / 1000)}s for ${provider} rate limit reset...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    // ==========================================
    // UTILITY: Check if provider is available
    // ==========================================
    isProviderConfigured(provider: ProviderType): boolean {
        switch (provider) {
            case 'openrouter':
                return !!OPENROUTER_API_KEY;
            case 'gemini':
                return !!GEMINI_API_KEY;
            case 'groq':
                return !!GROQ_API_KEY;
            default:
                return false;
        }
    }

    getProviderForAgent(agentId: string): AgentProviderConfig | undefined {
        return AGENT_PROVIDERS[agentId];
    }
}

export const providerManager = new ProviderManager();
export default providerManager;
