# 🚀 GUÍA RÁPIDA: Primeras Acciones en SIMULACRUM

Esta guía te mostrará exactamente qué hacer para ejecutar las primeras acciones de trading.

---

## ⚡ INICIO RÁPIDO (5 minutos)

### Paso 1: Abrir la Aplicación

1. Abre tu navegador
2. Ve a: `http://localhost:5174/`
3. Deberías ver la interfaz SIMULACRUM con:
   - Header negro con el título **"SIMULACRUM | REAL TRADING"**
   - Modo **"🧪 PAPER"** activado (verde)
   - Botón de **Play** (▶) circular a la derecha
   - Panel izquierdo: "A2A NEURAL LINK"
   - Panel central: Grid de 6 agentes
   - Panel derecho: "Session Performance" y "Artifact Vault"

### Paso 2: Iniciar el Análisis

**Haz clic en el botón ▶ PLAY** (botón circular verde a la derecha del header)

**¿Qué va a pasar?**
El botón cambiará a ⏸ PAUSE (amarillo) y comenzarás a ver actividad:

```
┌─ A2A NEURAL LINK ──────────────────┐
│ market_oracle ➞ ALL                │
│ MARKET_UPDATE                      │
│ Fetching market data...            │
│ ────────────────────                │
│ pulse ➞ ALL                        │
│ MARKET_UPDATE                      │
│ Analyzing sentiment...             │
└────────────────────────────────────┘
```

### Paso 3: Observar los Agentes

Los **6 agentes** comenzarán a cambiar de estado:

```
┌────────────┐ ┌────────────┐ ┌────────────┐
│ Nexus      │ │ Market     │ │ Claude-X   │
│ Prime      │ │ Oracle     │ │            │
│ COMPUTING  │ │ ANALYZING  │ │ IDLE       │
│ ████░░     │ │ ███████░   │ │            │
└────────────┘ └────────────┘ └────────────┘

┌────────────┐ ┌────────────┐ ┌────────────┐
│ Guardian   │ │ Pulse      │ │ FinGPT     │
│            │ │            │ │ -Core      │
│ COMPUTING  │ │ COMPUTING  │ │ IDLE       │
│ █████░░    │ │ ████░░░    │ │            │
└────────────┘ └────────────┘ └────────────┘
```

**Estados que verás:**
- 🟢 **IDLE** - Esperando
- 🔵 **ANALYZING** - Analizando datos
- 🟣 **COMPUTING** - Procesando con IA
- 🟡 **WAITING_APPROVAL** - Esperando tu decisión
- 🟢 **EXECUTING** - Ejecutando acción

### Paso 4: Ver el Análisis Técnico

Después de ~10-15 segundos, aparecerá el panel de **Technical Indicators**:

```
┌─ Technical Indicators - BTC/USDT ──┐
│ RSI(14)    MACD      EMA(50)  ATR  │
│ 67.3       +0.42     $95,234  $892 │
│                                    │
│ ADX        BB Width  Stoch K  Vol Δ│
│ 28.4       2.3%      72.1     +15% │
└────────────────────────────────────┘
```

### Paso 5: Revisar el Sentimiento

También verás el análisis de **Market Sentiment**:

```
┌─ Market Sentiment ─────────────────┐
│ Overall  Fear/Greed  Social Vol    │
│  +45        62         +23%        │
│                                    │
│ #bullish #btc #cryptocurrency      │
└────────────────────────────────────┘
```

### Paso 6: Esperar la Señal de Trading

Si los agentes detectan una **oportunidad**, aparecerá un **modal de autorización**:

```
╔══════════════════════════════════════╗
║ ⚠️  HUMAN AUTHORIZATION REQUIRED     ║
║                                      ║
║ AI agents request permission to     ║
║ execute trade                        ║
╠══════════════════════════════════════╣
║                                      ║
║ BUY BTC/USDT              $95,234    ║
║                                      ║
║ Amount: 0.001 BTC                    ║
║ Value: $95.23                        ║
║                                      ║
║ Stop Loss: $93,281                   ║
║ Take Profit: $97,443                 ║
║                                      ║
║ AI Confidence: 78% ████████░░        ║
║                                      ║
║ AI Reasoning:                        ║
║ Strong bullish momentum with RSI    ║
║ showing strength but not overbought. ║
║ MACD positive crossover confirmed.   ║
║                                      ║
║ [REJECT]        [AUTHORIZE TRADE]    ║
╚══════════════════════════════════════╝
```

### Paso 7: Tomar una Decisión

**Tienes 2 opciones:**

#### Opción A: **AUTHORIZE TRADE** (Verde)
- Aprueba la acción propuesta
- En modo PAPER: Se registrará como simulación
- En modo LIVE: Ejecutará el trade real
- Verás el resultado en "Session Performance"

#### Opción B: **REJECT** (Gris)
- Rechaza la acción
- No se ejecuta nada
- Los agentes continuarán analizando

### Paso 8: Ver los Resultados

Después de autorizar, verás:

```
┌─ Session Performance ──────────────┐
│                                    │
│        $ +15.32                    │
│                                    │
│ Trades: 1           +1.53%         │
└────────────────────────────────────┘
```

Y en el **Artifact Vault**:

```
┌─ Artifact Vault ───────────────────┐
│ 📊 Analysis_BTC_USDT.json  [READY] │
│ 🎯 SIGNAL_BUY_BTC.json     [READY] │
│ 💹 TX_BUY_BTCUSDT         [DEPLOYED]│
└────────────────────────────────────┘
```

---

## 🎮 CONTROLES PRINCIPALES

```
┌─────────────────────────────────────┐
│ Header - Barra Superior             │
├─────────────────────────────────────┤
│                                     │
│ [BTC/USDT ▼]  - Cambiar símbolo    │
│                                     │
│ [🟢 PAPER MODE] - Cambiar a LIVE   │
│   ⚠️ CUIDADO: Usará dinero real!   │
│                                     │
│ [Wallet: 0x1234...5678]            │
│   - Conectar/desconectar wallet    │
│                                     │
│ [▶ PLAY] / [⏸ PAUSE]              │
│   - Iniciar/detener análisis       │
│                                     │
└─────────────────────────────────────┘
```

---

## 🔧 ACCIONES MANUALES

### Forzar un Análisis
Haz clic en **"FORCE ANALYSIS"** en el panel derecho (abajo de Artifact Vault)

### Cambiar Símbolo
1. Haz clic en el selector **"BTC/USDT"** en el header
2. Selecciona: ETH/USDT, SOL/USDT, o AVAX/USDT
3. El análisis se reinicia automáticamente

### Limpiar Historial
Haz clic en **"CLEAR HISTORY"** para borrar mensajes y artifacts

### Ver Detalles de un Artifact
Haz clic en el ícono **👁️ (ojo)** junto a cualquier artifact para ver su contenido completo

---

## 📊 QUÉ ESPERAR

### Primera Ejecución
La primera vez que hagas clic en Play:

**0-5 segundos:**
- Conexión a APIs de mercado
- Descarga de datos históricos

**5-15 segundos:**
- Cálculo de indicadores técnicos
- Análisis de sentimiento
- Identificación de tendencias

**15-30 segundos:**
- Procesamiento con IA
- Generación de señales
- Evaluación de riesgo

**30-45 segundos:**
- Si hay señal válida: Modal de autorización
- Si no: Agentes vuelven a IDLE

### Análisis Continuo
- El ciclo se repite cada **1 minuto**
- Los datos se cachean por **10 segundos** (para no abusar de APIs)
- Los agentes actualizan su estado en tiempo real

---

## ⚠️ SOLUCIÓN DE PROBLEMAS

### "No aparece nada en A2A Neural Link"
**Solución:** Abre la consola del navegador (F12) y verifica errores. Probablemente GROQ_API_KEY no está configurada.

### "Los agentes se quedan en IDLE"
**Solución:** 
1. Verifica que el botón esté en PAUSE (⏸), no PLAY (▶)
2. Revisa la consola para errores de API
3. Haz clic en "FORCE ANALYSIS"

### "Error de CORS al obtener datos"
**Solución:** Las APIs públicas de Binance deberían funcionar sin problemas. Si persiste, verifica tu conexión a internet.

### "Modal de autorización no aparece"
**Causas posibles:**
- No hay señales válidas (mercado lateral/unclear)
- La confianza de IA es baja (<65%)
- El riesgo es demasiado alto

---

## 🎯 CONSEJOS PARA PRIMERAS PRUEBAS

1. **Empieza con BTC/USDT** - Tiene más liquidez y datos más confiables

2. **Deja correr 2-3 ciclos** - La primera señal puede tardar unos minutos

3. **Revisa los artifacts** - Haz clic en el ojo para ver el análisis completo en JSON

4. **Observa el sentiment** - Si está muy negativo/positivo, puede bloquear trades

5. **Modo PAPER siempre** - No cambies a LIVE sin haber probado extensively

---

## 📈 FLUJO VISUAL COMPLETO

```
INICIO
  ↓
[Hacer clic en PLAY]
  ↓
┌─────────────────────────┐
│ Agentes: IDLE → ANALYZING│
│ A2A: Fetching data...   │
└─────────────────────────┘
  ↓
┌─────────────────────────┐
│ Indicators aparecen     │
│ Sentiment aparece       │
│ Agentes: COMPUTING      │
└─────────────────────────┘
  ↓
┌─────────────────────────┐
│ Agentes procesan con IA │
│ A2A: AI analyzing...    │
└─────────────────────────┘
  ↓
    ┌────────────────┬────────────────┐
    │ SEÑAL VÁLIDA   │ NO HAY SEÑAL   │
    └────────────────┴────────────────┘
           ↓                    ↓
    ┌──────────────┐    ┌──────────────┐
    │ MODAL DE     │    │ Agentes →    │
    │ AUTORIZACIÓN │    │ IDLE         │
    └──────────────┘    │ Esperar 1min │
           ↓            └──────────────┘
    ┌─────────────┐           ↓
    │ AUTHORIZE?  │      [LOOP CONTINÚA]
    └─────────────┘
       ↓       ↓
    [SÍ]    [NO]
      ↓       ↓
   Trade   Cancel
   Logged    →
      ↓
  Artifact
  Creado
      ↓
  Performance
  Actualizado
```

---

## 🚀 ¡ADELANTE!

**Ahora estás listo para:**

1. ✅ Abrir `http://localhost:5174/`
2. ✅ Hacer clic en ▶ PLAY
3. ✅ Observar el análisis en tiempo real
4. ✅ Autorizar o rechazar señales
5. ✅ Aprender del comportamiento de los agentes

**¿Dudas?** Revisa `INTEGRATION_GUIDE.md` para más detalles técnicos.

**¡Buena suerte! 🎉**
