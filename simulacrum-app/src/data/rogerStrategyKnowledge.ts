// ============================================
// ROGER STRATEGY KNOWLEDGE BASE
// Insights from Roger Strategy YouTube Channel
// For AI Trading System Enhancement
// ============================================

// Key insights extracted from 13 videos for crypto trading AI

export const ROGER_STRATEGY_KNOWLEDGE = {
    // From: "Por qué el 95% de la gente pierde dinero en CRYPTO"
    psychology: {
        commonMistakes: [
            "Holdear posiciones perdedoras demasiado tiempo",
            "Vender posiciones ganadoras demasiado pronto",
            "Coste de oportunidad: mantener monedas que underperformean",
            "Sesgo de confirmación: buscar noticias que justifiquen pérdidas",
            "Capital bloqueado en activos que no suben"
        ],
        winningStrategy: [
            "Solo necesitas 1-2 activos ganadores para ganar dinero",
            "Cortar pérdidas rápidamente",
            "Dejar correr las ganancias",
            "Pregúntate: 'Si tuviera este dinero ahora, ¿compraría esta moneda?'",
            "Los ganadores siguen ganando, los perdedores siguen perdiendo"
        ],
        sellSignals: [
            "Si la moneda underperformea vs el resto del mercado cuando sube su sector",
            "Si la tesis original se invalida (ej: cambio de equipo)",
            "Si mantenerla supone perder activos ganadores"
        ],
        buySignals: [
            "Cuando la tesis se está cumpliendo",
            "Retrocesos sanos dentro de tendencia alcista (ej: -80% después de x4)",
            "Cuando el activo rompe máximos históricos continuamente"
        ]
    },

    // From: "Ha empezado el BEAR MARKET en el mercado CRYPTO"
    bearMarketDetection: {
        technicalSignals: [
            "Ruptura de media móvil de 50 semanal = inicio fase bajista",
            "Distribución de ballenas durante 6-12 meses en ATH",
            "ETFs comprando pero no suficiente para absorber oferta"
        ],
        currentCycleVsPast: [
            "2021: Políticas Fed restrictivas + colapsos (FTX, Luna)",
            "2025-26: Políticas expansivas, QE, instituciones comprando",
            "Contexto macro actual es totalmente diferente a 2021"
        ],
        priceRanges: {
            bullish: "Mantiene 70,000+ si ETFs compran fuerte",
            moderate: "60,000-70,000 = mini bear market corto",
            bearish: "50,000-55,000 si macro empeora o hay colapsos"
        },
        keyDifference: "Bear market técnico ≠ Bear market tradicional (más corto, menos profundo)"
    },

    // From: "Construye un portafolio de inversiones profesional"
    portfolioConstruction: {
        investorProfiles: {
            conservative: {
                description: "Constructor de capital - rentabilidad a largo plazo",
                targetReturn: "x2-x4 en 3-5 años",
                riskLevel: "Bajo - difícil perder todo el capital",
                assets: ["SP500", "Bitcoin", "Tesla", "Amazon", "Coca-Cola"]
            },
            aggressive: {
                description: "Cazador de oportunidades extremas - x50 o x100",
                targetReturn: "x50-x100 pero 95% probabilidad de pérdida",
                riskLevel: "Muy alto - 40 de 50 monedas irán a cero",
                assets: ["Memecoins nuevas", "Proyectos early-stage"],
                holdingPeriod: "12-18 meses máximo (después empiezan a decaer)"
            }
        },
        riskAllocation: {
            conservative: { lowRisk: "85-100%", highRisk: "0-15%" },
            moderate: { lowRisk: "70-85%", highRisk: "15-25%" },
            aggressive: { lowRisk: "55-70%", highRisk: "25-40%" },
            yolo: { lowRisk: "0-55%", highRisk: "45-100%" }
        },
        endOfCycleStrategy: {
            recommendation: "90% bajo riesgo, 10% en USDT esperando oportunidad",
            reason: "Final de ciclo = no comprar más highRisk, guardar liquidez",
            action: "Ser agresivo con ventas, reducir exposición a altcoins"
        }
    },

    // From: "Pues nada… 3.000$ perdidos"
    lossManagement: {
        buyingDips: [
            "Comprar cuando Bitcoin cae 10% en un día = indicador de final de caída",
            "Comprar en 'miedo extremo' (Fear & Greed Index)",
            "Siempre mantener USDT para comprar dips"
        ],
        dcaStrategy: {
            initial: "50% en primera compra",
            reserve: "50% para mayores caídas",
            reason: "No saber cuándo es el fondo exacto"
        },
        realityCheck: [
            "Perder $3000 en un día es normal",
            "Tranquilidad - el mercado se recupera",
            "Comprar en sobreventa (oversold)"
        ]
    },

    // Keys to identify winning projects
    projectEvaluation: {
        winners: [
            "Equipo se adapta bien a condiciones de mercado (ej: Binance)",
            "Sacan updates relevantes (IA, NFTs, etc. cuando están de moda)",
            "Caídas se compran rápidamente",
            "No dan puntos de entrada fáciles",
            "Rompen máximos históricos continuamente"
        ],
        losers: [
            "Suben menos cuando el mercado sube en su sector",
            "Bajan más cuando el mercado baja",
            "No se adaptan a narrativas nuevas",
            "Capital bloqueado sin movimiento"
        ]
    }
};

// Prompt enhancement snippets for agents
export const ROGER_STRATEGY_PROMPTS = {
    nexusPrime: `
CONOCIMIENTO ADICIONAL - Roger Strategy (Complementa a José Luis Cava):

CONSTRUCCIÓN DE PORTAFOLIO:
- Perfil Conservador: 85-100% bajo riesgo (BTC, SP500), objetivo x2-x4 en 3-5 años
- Perfil Agresivo: 55-70% bajo riesgo, 25-40% alto riesgo, objetivo x50-x100
- Final de ciclo: 90% bajo riesgo, 10% USDT esperando oportunidad

GESTIÓN DE PÉRDIDAS:
- Si la moneda underperformea su sector cuando éste sube = VENDER
- Pregunta clave: "¿Si tuviera este dinero ahora, compraría esta moneda?"
- Coste de oportunidad: mejor tener el capital en ganadores
`,

    marketOracle: `
CONOCIMIENTO ADICIONAL - Roger Strategy:

DETECCIÓN DE BEAR MARKET TÉCNICO:
- Ruptura de Media Móvil 50 semanal = posible fase bajista
- Bear market técnico ≠ tradicional (más corto, menos profundo)
- Rangos de suelo: 50k-55k (pesimista), 60k-70k (moderado), 70k+ (optimista)

IDENTIFICACIÓN DE PROYECTOS GANADORES:
- Rompen máximos históricos continuamente
- No dan puntos de entrada fáciles
- Las caídas se compran rápidamente
`,

    guardian: `
CONOCIMIENTO ADICIONAL - Roger Strategy:

GESTIÓN DE PÉRDIDAS Y RIESGO:
- Comprar cuando BTC cae 10% en un día = posible final de caída
- Siempre mantener USDT para oportunidades (mínimo 20-30%)
- El 95% pierde por holdear perdedores y vender ganadores

SEÑALES DE ALERTA:
- Distribución de ballenas en ATH durante 6-12 meses
- ETFs comprando pero precio no sube = presión vendedora fuerte
- Final de ciclo: ser agresivo con ventas, reducir exposición altcoins
`,

    pulse: `
CONOCIMIENTO ADICIONAL - Roger Strategy:

PSICOLOGÍA DEL MERCADO:
- El 95% pierde porque: holdea perdedores, vende ganadores pronto
- "Miedo extremo" en Fear & Greed = oportunidad de compra (si tendencia LP alcista)
- Sesgo de confirmación: buscar noticias que justifiquen posiciones perdedoras

SEÑALES DE CAPITULACIÓN:
- Caída de 10%+ en un día = posible suelo
- Sobreventa (oversold) en RSI + miedo extremo = señal fuerte
`,

    fingptCore: `
CONOCIMIENTO ADICIONAL - Roger Strategy (síntesis):

REGLAS CLAVE:
1. Solo necesitas 1-2 activos ganadores para ganar dinero
2. Cortar pérdidas rápido, dejar correr ganancias
3. Los ganadores siguen ganando, los perdedores siguen perdiendo
4. Pregunta: "¿Compraría esta moneda ahora con este dinero?"

TIMING DE MERCADO:
- Inicio de bullrun: comprar posiciones, reforzar ganadores
- Final de ciclo: ser agresivo vendiendo, guardar 90% bajo riesgo
- Bear market técnico: más corto y menos profundo que tradicional

PROYECTOS GANADORES:
- Se adaptan a narrativas (IA, NFTs, etc.)
- Rompen ATH continuamente
- No dan puntos de entrada fáciles
`
};
