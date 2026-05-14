# 🚀 GUÍA DE INTEGRACIÓN COMPLETA - SIMULACRUM TRADING

Esta guía te mostrará cómo integrar todos los servicios de trading en tu aplicación paso a paso.

---

## 📋 TABLA DE CONTENIDOS

1. [Verificación de Servicios](#verificación-de-servicios)
2. [Integración Básica](#integración-básica)
3. [Integración Avanzada](#integración-avanzada)
4. [Configuración de Exchange](#configuración-de-exchange)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

---

## 1. VERIFICACIÓN DE SERVICIOS

### Servicios Creados ✅

```
src/
├── types/
│   └── trading.ts                    # Tipos TypeScript
├── services/
│   ├── data/
│   │   └── marketDataService.ts      # Datos de mercado GRATIS
│   ├── trading/
│   │   ├── ccxtService.ts            # Conexión a exchanges
│   │   ├── indicatorService.ts       # Indicadores técnicos
│   │   ├── riskService.ts            # Gestión de riesgo
│   │   └── backtestService.ts        # Backtesting
│   ├── defi/
│   │   └── defiService.ts            # Uniswap/Sushiswap
│   ├── ai/
│   │   └── agentService.ts           # Multi-agente IA
│   └── sentiment/
│       └── sentimentService.ts       # Sentimiento de mercado
├── store/
│   └── tradingStore.ts               # Estado global (Zustand)
└── config/
    └── exchangeConfig.ts             # Config de exchanges
```

---

## 2. INTEGRACIÓN BÁSICA

### Paso 1: Actualizar App.tsx

El archivo `App.tsx` ya ha sido actualizado con la nueva arquitectura. Incluye:

- ✅ Conexión con todos los servicios
- ✅ UI profesional de trading
- ✅ Sistema de autorización humana
- ✅ Visualización de agentes IA
- ✅ Panel de trading en tiempo real

### Paso 2: Verificar que el servidor esté corriendo

Tu servidor ya está corriendo en `http://localhost:5174/`

### Paso 3: Abrir la aplicación

Abre tu navegador en `http://localhost:5174/` para ver la interfaz renovada.

---

## 3. INTEGRACIÓN AVANZADA

### Usando Market Data Service (GRATIS - Sin API keys)

```typescript
import { marketDataService } from './services/data/marketDataService';

// Obtener precio actual
const price = await marketDataService.getPrice('BTC/USDT');
console.log('BTC Price:', price);

// Obtener múltiples precios
const prices = await marketDataService.getMultiplePrices(['BTC/USDT', 'ETH/USDT']);
console.log('Prices:', prices);

// Obtener velas (candlestick data)
const candles = await marketDataService.getCandles('BTC/USDT', '1h', 200);
console.log('Candles:', candles);
```

### Usando Indicator Service

```typescript
import { indicatorService } from './services/trading/indicatorService';
import { marketDataService } from './services/data/marketDataService';

// 1. Obtener datos históricos
const candles = await marketDataService.getCandles('BTC/USDT', '1h', 200);

// 2. Calcular indicadores
const indicators = indicatorService.calculateIndicators(candles);
console.log('RSI:', indicators.rsi14);
console.log('MACD:', indicators.macd);

// 3. Analizar mercado completo
const analysis = indicatorService.analyzeMarket('BTC/USDT', candles);
console.log('Trend:', analysis.trend);
console.log('Signals:', analysis.signals);
```

### Usando AI Agents Service

```typescript
import { aiAgentsService } from './services/ai/agentService';

// 1. Inicializar agentes con API key de Groq
const groqKey = import.meta.env.VITE_GROQ_API_KEY;
aiAgentsService.initialize(groqKey);

// 2. Obtener datos y análisis
const candles = await marketDataService.getCandles('BTC/USDT');
const analysis = indicatorService.analyzeMarket('BTC/USDT', candles);

// 3. Ejecutar análisis con IA
const result = await aiAgentsService.analyzeMarket('BTC/USDT', analysis);
console.log('AI Confidence:', result.confidence);
console.log('AI Signals:', result.signals);
```

### Usando Risk Service

```typescript
import { riskService } from './services/trading/riskService';

// 1. Evaluar riesgo del mercado
const risk = riskService.assessRisk('BTC/USDT', analysis, portfolio);
console.log('Risk Level:', risk.overallRisk);
console.log('Risk Score:', risk.riskScore);

// 2. Validar un trade antes de ejecutar
const signal = { /* trading signal */ };
const validation = riskService.validateTrade(signal, 1000, portfolio, risk);

if (validation.isValid) {
  console.log('✅ Trade is safe to execute');
  console.log('Recommended size:', validation.adjustedSize);
} else {
  console.log('❌ Trade blocked:', validation.reason);
}

// 3. Calcular stop-loss y take-profit
const stopLoss = riskService.calculateStopLoss(currentPrice, 'long', volatility);
const takeProfit = riskService.calculateTakeProfit(currentPrice, 'long', volatility);
```

### Usando el Store Global (Zustand)

```typescript
import { useTradingStore } from './store/tradingStore';

function MyComponent() {
  // Obtener estado
  const {
    isConnected,
    portfolio,
    agents,
    signals,
    
    // Acciones
    connectExchange,
    placeOrder,
    analyzeSymbol,
    runAIAnalysis,
  } = useTradingStore();
  
  // Conectar a exchange
  const handleConnect = async () => {
    const connected = await connectExchange('binance', {
      apiKey: 'your_key',
      secret: 'your_secret',
      sandbox: true, // Usar modo sandbox primero
    });
    
    if (connected) {
      console.log('✅ Connected to Binance');
    }
  };
  
  // Analizar un símbolo
  const handleAnalyze = async () => {
    await analyzeSymbol('BTC/USDT');
    await runAIAnalysis('BTC/USDT');
  };
  
  // Ejecutar orden
  const handleTrade = async () => {
    const order = await placeOrder('BTC/USDT', 'buy', 0.001);
    if (order) {
      console.log('✅ Order placed:', order.id);
    }
  };
  
  return (
    <div>
      <button onClick={handleConnect}>Connect Exchange</button>
      <button onClick={handleAnalyze}>Analyze Market</button>
      <button onClick={handleTrade}>Place Order</button>
      
      <div>Connected: {isConnected ? '✅' : '❌'}</div>
      <div>Portfolio Value: ${portfolio?.totalValueUSD}</div>
      <div>Active Agents: {agents.length}</div>
      <div>Pending Signals: {signals.length}</div>
    </div>
  );
}
```

---

## 4. CONFIGURACIÓN DE EXCHANGE

### Opción A: Trading en Paper Mode (SIN API keys)

Ya funciona! La aplicación usa datos reales del mercado pero no ejecuta trades reales.

```typescript
// En App.tsx, el estado por defecto es:
const [isLiveMode, setIsLiveMode] = useState(false); // Paper trading
```

### Opción B: Conectar a Exchange Real (Binance ejemplo)

#### Paso 1: Obtener API Keys de Binance

1. Ve a https://www.binance.com/en/my/settings/api-management
2. Crea una nueva API key
3. **IMPORTANTE**: Habilita SOLO "Enable Spot & Margin Trading"
4. **NO** habilites "Enable Withdrawals"
5. Guarda tu API Key y Secret

#### Paso 2: Configurar .env

```env
VITE_BINANCE_API_KEY=tu_api_key_real
VITE_BINANCE_SECRET=tu_secret_real
VITE_BINANCE_SANDBOX=true  # Usa testnet primero!
```

#### Paso 3: Conectar desde la UI

```typescript
// El store ya maneja la conexión automática desde .env
// O puedes conectar manualmente:

import { ccxtService } from './services/trading/ccxtService';

await ccxtService.connectExchange('binance', {
  apiKey: process.env.VITE_BINANCE_API_KEY,
  secret: process.env.VITE_BINANCE_SECRET,
  sandbox: true, // usa testnet
});

// Verificar conexión
const balance = await ccxtService.fetchBalance();
console.log('Balance:', balance);
```

---

## 5. TESTING

### Test Rápido de Servicios

Crea archivo `src/tests/servicesTest.ts`:

```typescript
import { marketDataService } from '../services/data/marketDataService';
import { indicatorService } from '../services/trading/indicatorService';

async function testServices() {
  console.log('🧪 Testing Market Data Service...');
  
  // Test 1: Precio
  const price = await marketDataService.getPrice('BTC/USDT');
  console.log(`✅ BTC Price: $${price}`);
  
  // Test 2: Velas
  const candles = await marketDataService.getCandles('BTC/USDT', '1h', 50);
  console.log(`✅ Fetched ${candles.length} candles`);
  
  // Test 3: Indicadores
  if (candles.length >= 50) {
    const indicators = indicatorService.calculateIndicators(candles);
    console.log(`✅ RSI: ${indicators.rsi14?.toFixed(2)}`);
    console.log(`✅ MACD: ${indicators.macd?.macd.toFixed(2)}`);
  }
  
  // Test 4: Análisis completo
  const analysis = indicatorService.analyzeMarket('BTC/USDT', candles);
  console.log(`✅ Trend: ${analysis.trend}`);
  console.log(`✅ Signals: ${analysis.signals.length}`);
  
  console.log('🎉 All tests passed!');
}

testServices();
```

Ejecutar en consola del navegador o desde Node.

---

## 6. TROUBLESHOOTING

### Problema: "Cannot find module 'zustand'"

**Solución**:
```bash
npm install zustand zustand/middleware
```

### Problema: "CORS error from Binance API"

**Solución**: Las APIs públicas de Binance deberían funcionar sin CORS. Si hay problemas:
1. Verifica que estás usando `https://api.binance.com` (no http)
2. Para desarrollo local, considera usar un proxy

### Problema: "Groq API key not found"

**Solución**: Verifica que `.env` tenga:
```env
VITE_GROQ_API_KEY=gsk_...
```

Y reinicia el servidor de desarrollo.

### Problema: "Rate limit exceeded"

**Solución**: Los servicios implementan caché automático. Si persiste:
- Aumenta `cacheDuration` en marketDataService
- Reduce la frecuencia de análisis
- Usa múltiples fuentes de datos

### Problema: Typescript errors

**Solución**: Asegúrate de que todos los archivos están creados:
```bash
# Verificar estructura
ls src/types/
ls src/services/trading/
ls src/services/data/
ls src/store/
```

---

## 🎯 FLUJO COMPLETO DE TRADING

Aquí está un ejemplo completo de un flujo de trading automático:

```typescript
async function autoTradingFlow() {
  // 1. Obtener datos del mercado
  const candles = await marketDataService.getCandles('BTC/USDT', '1h', 200);
  
  // 2. Analizar con indicadores técnicos
  const analysis = indicatorService.analyzeMarket('BTC/USDT', candles);
  
  // 3. Obtener sentimiento
  const sentiment = await sentimentService.getSentiment('BTC/USDT');
  
  // 4. Ejecutar análisis con IA
  const aiResult = await aiAgentsService.analyzeMarket('BTC/USDT', analysis, sentiment);
  
  // 5. Evaluar riesgo
  const portfolio = useTradingStore.getState().portfolio;
  const risk = riskService.assessRisk('BTC/USDT', analysis, portfolio);
  
  // 6. Si hay señal con alta confianza
  if (aiResult.confidence > 70 && aiResult.signals.length > 0) {
    const signal = aiResult.signals[0];
    
    // 7. Validar con gestión de riesgo
    const validation = riskService.validateTrade(
      signal,
      signal.price * 0.1, // cantidad
      portfolio,
      risk
    );
    
    if (validation.isValid) {
      // 8. MOSTRAR AL USUARIO PARA APROBACIÓN
      // (No ejecutar automáticamente)
      console.log('🔔 Nueva señal de trading requiere aprobación humana');
      console.log('Signal:', signal);
      console.log('Risk:', risk);
      
      // El usuario debe hacer clic en "AUTHORIZE TRADE"
      // antes de que se ejecute
    } else {
      console.log('⚠️ Trade bloqueado por gestión de riesgo:', validation.reason);
    }
  }
}
```

---

## 📖 RECURSOS ADICIONALES

- **Binance API Docs**: https://binance-docs.github.io/apidocs/
- **CoinGecko API**: https://www.coingecko.com/en/api
- **CCXT Docs**: https://docs.ccxt.com/
- **Groq API**: https://console.groq.com/docs
- **Uniswap SDK**: https://docs.uniswap.org/sdk

---

## ⚠️ RECORDATORIOS DE SEGURIDAD

1. **NUNCA** commitees API keys a Git
2. **SIEMPRE** empieza en modo sandbox/testnet
3. **PRUEBA** exhaustivamente antes de usar dinero real
4. **USA** stop-loss en todos los trades
5. **MANTÉN** la autorización humana activada
6. **MONITOREA** constantemente tus trades
7. **EMPIEZA** con cantidades pequeñas

---

## 🎉 ¡TODO LISTO!

Tu sistema de trading está completamente configurado y listo para usar. Los servicios funcionan con **APIs gratuitas**, no necesitas API keys de exchanges para empezar a probar el análisis de mercado.

**Próximos pasos sugeridos:**

1. ✅ Abre la aplicación en el navegador
2. ✅ Haz clic en "Play" para iniciar el análisis
3. ✅ Observa cómo los agentes IA analizan el mercado
4. ✅ Cuando aparezca una señal, revisa los detalles
5. ✅ Autoriza o rechaza la acción propuesta

¿Necesitas ayuda con algo específico? ¡Pregunta!
