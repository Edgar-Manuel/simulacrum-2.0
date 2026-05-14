# 🧠 GUÍA DE INGENIERÍA DE PROMPT - SIMULACRUM
## Sistema Multi-Agente de Trading Profesional
### Basado en la Metodología de José Luis Cava

---

## 📋 ÍNDICE

1. [Filosofía de Trading](#filosofía-de-trading)
2. [Arquitectura del Sistema Multi-Agente](#arquitectura-del-sistema)
3. [Prompts de Cada Agente](#prompts-de-cada-agente)
4. [Flujo de Decisión](#flujo-de-decisión)
5. [Reglas de Gestión de Riesgo](#reglas-de-gestión-de-riesgo)

---

## 🎯 FILOSOFÍA DE TRADING

### Las 3 Reglas de Oro

#### 1. LA LIQUIDEZ MANDA (40% del peso de decisión)
Bitcoin y las criptomonedas son **activos macro muy sensibles a la liquidez**. Su precio depende de la liquidez del USD con un **retardo de aproximadamente 90 días**.

**Indicadores de Liquidez a vigilar:**
- Balance de la Reserva Federal (Fed)
- Cuenta del Tesoro (TGA - Treasury General Account)
- Reservas bancarias
- Diferencia entre tipos de interés (Repos vs. Fed Funds)

> "Si la diferencia repos vs Fed Funds se dispara, falta liquidez"

#### 2. TEORÍA DE LA OPINIÓN CONTRARIA (20% del peso)
Identificar a la "Masa" (los "galeotes"): Si el consenso es extremadamente bajista pero la tendencia de fondo es alcista, es **oportunidad de compra**.

| Tendencia LP | Sentimiento | Acción |
|-------------|-------------|--------|
| Alcista | Bajista (Miedo) | **COMPRAR** |
| Bajista | Bajista (Miedo) | NO comprar |
| Alcista | Alcista (Euforia) | **Cuidado/Vender** |

> "Cuando tu taxista te hable de Bitcoin, vende"

#### 3. EL GRÁFICO ES LA VERDAD (30% del peso)
Ignora el ruido de noticias. Solo el precio y el volumen dicen la verdad.

> "Por sus hechos los conoceréis"

---

## 🏗️ ARQUITECTURA DEL SISTEMA

```
┌─────────────────────────────────────────────────────────────┐
│                    BINANCE API                               │
│               (Datos en tiempo real)                         │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              CAPA DE ANÁLISIS PARALELO                      │
├──────────────────┬──────────────────┬──────────────────────┤
│   MARKET ORACLE  │     PULSE        │     GUARDIAN         │
│   (Técnico)      │   (Sentimiento)  │   (Riesgo Macro)     │
├──────────────────┴──────────────────┴──────────────────────┤
│   Analiza precio   Detecta miedo/     Valida riesgos       │
│   y patrones       codicia extrema   sistémicos            │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    NEXUS PRIME                               │
│               (Estratega Macro - LÍDER)                      │
│   Sintetiza información y define estrategia macro            │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    FINGPT-CORE                               │
│                 (Oráculo Final)                              │
│   Toma la DECISIÓN FINAL: BUY/SELL/HOLD                     │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     CLAUDE-X                                 │
│              (Ejecutor con poder de VETO)                    │
│   Ejecuta orden o VETA si el riesgo es inaceptable          │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    BINANCE ORDER                             │
│               (Ejecución Real)                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🤖 PROMPTS DE CADA AGENTE

### 1. NEXUS PRIME - El Estratega Macro (LÍDER)

**Rol:** Decisor estratégico basado en liquidez y opinión contraria.

**Reglas clave:**
- La liquidez manda (retardo 90 días)
- Aplicar opinión contraria en extremos de sentimiento
- Ignorar ruido mediático

**Output:** `ACUMULAR` / `DISTRIBUIR` / `MANTENER LIQUIDEZ`

---

### 2. MARKET ORACLE - El Chartista

**Rol:** Análisis técnico puro, sin emociones ni noticias.

**Patrones a buscar (La "Biblia Cava"):**
- Pautas planas
- Recta directriz
- Hombro-Cabeza-Hombro invertido
- Doble suelo/techo
- Medias móviles (especialmente 200 sesiones)
- Divergencias RSI

**Output:** Tendencia + Soportes/Resistencias + Figuras detectadas

---

### 3. PULSE - El Ojeador de Sentimiento

**Rol:** Detectar capitulaciones y euforia para opinión contraria.

**Métricas:**
- Fear & Greed Index (0-100)
- Funding Rates
- Volumen relativo
- Sentimiento social

**Output:** Sentimiento (-100 a +100) + Alerta `CAPITULACIÓN` / `EUFORIA`

---

### 4. GUARDIAN - El Validador de Riesgo

**Rol:** Proteger el capital detectando peligros sistémicos.

**Alertas clave:**
- Contracción de liquidez
- Apalancamiento excesivo (Funding Rates > 0.1%)
- Volatilidad extrema (> 5% diaria)
- Cisnes negros

**Output:** Nivel de riesgo `BAJO` / `MEDIO` / `ALTO` / `CRÍTICO`

---

### 5. FINGPT-CORE - El Oráculo Final

**Rol:** Sintetizar TODA la información y dar la decisión final.

**Pesos de decisión:**
| Factor | Peso |
|--------|------|
| Liquidez (Nexus Prime) | 40% |
| Técnico (Market Oracle) | 30% |
| Sentimiento (Pulse) | 20% |
| Riesgo (Guardian) | 10% (VETO) |

**Output:**
```json
{
  "decision": "BUY/SELL/HOLD",
  "confidence": 0-100,
  "entry_price": número,
  "stop_loss": número,
  "take_profit": número,
  "position_size_percent": 1-2,
  "reasoning": "explicación en español"
}
```

---

### 6. CLAUDE-X - El Ejecutor (con poder de VETO)

**Rol:** Última línea de defensa. Ejecuta o VETA.

**Reglas inquebrantables:**
1. Máximo 1-2% del capital por operación
2. Stop Loss OBLIGATORIO
3. Ratio Riesgo:Beneficio mínimo 1:2
4. DCA táctico: 40% / 30% / 30%

**Output:** Orden JSON para Binance o `VETO + razón`

---

## 🔄 FLUJO DE DECISIÓN (Ejemplo)

**Situación:** Bitcoin cae 5% en un día

```
1. MARKET ORACLE reporta:
   "Precio ha caído a 94.000. Mecha larga inferior 
   (barrida de stops). Divergencia alcista en RSI."

2. PULSE reporta:
   "Detecto PÁNICO EXTREMO. Volumen explosivo 
   (capitulación). Funding Rates negativas."

3. GUARDIAN reporta:
   "Riesgo MEDIO. Volatilidad alta pero no hay 
   cambio en liquidez estructural."

4. NEXUS PRIME decide:
   "Veo pánico en los 'galeotes' pero la liquidez 
   no ha cambiado. Esto es OPINIÓN CONTRARIA. 
   Decisión: ACUMULAR."

5. FINGPT-CORE sintetiza:
   "DECISIÓN: COMPRAR. Confianza 78%. 
   Entrada: 94.200. Stop: 92.800. 
   Take Profit: 98.000. Posición: 2%."

6. CLAUDE-X ejecuta:
   "Riesgo aceptable (1.5%). Ratio R:B = 1:2.7. 
   EJECUTANDO orden de compra en Binance."
```

---

## ⚠️ REGLAS DE GESTIÓN DE RIESGO

### Tamaño de Posición
- **Máximo 2%** del capital por operación
- Reducir 50% en volatilidad extrema

### Stop Loss
- **SIEMPRE obligatorio**
- Basado en soportes técnicos
- Ratio R:B mínimo 1:2

### Límites Diarios
- Pérdida diaria máxima: **5%**
- Drawdown máximo: **15%**
- Posiciones simultáneas: **máximo 3**

### Trailing Stop
- Activar cuando beneficio > 3%
- Distancia: 1.5% del ATR

---

## 📚 GLOSARIO

| Término | Definición |
|---------|------------|
| **Galeotes** | La masa de traders que vende en pánico |
| **Manos fuertes** | Instituciones que compran en caídas |
| **Opinión contraria** | Ir contra el sentimiento extremo |
| **Pauta plana** | Consolidación lateral antes de ruptura |
| **Barrida de stops** | Movimiento brusco para liquidar posiciones |
| **TGA** | Treasury General Account - Cuenta del Tesoro |

---

## 🎯 MÉTRICAS DE ÉXITO

| Métrica | Objetivo |
|---------|----------|
| Win Rate | > 55% |
| Ratio R:B promedio | > 1:2 |
| Drawdown máximo | < 15% |
| Sharpe Ratio | > 1.5 |

---

*Documento creado para SIMULACRUM Trading System*
*Basado en la metodología de José Luis Cava*
*Última actualización: Diciembre 2025*
