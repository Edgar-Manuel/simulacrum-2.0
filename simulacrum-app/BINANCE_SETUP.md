# 🔐 Guía de Configuración de Binance API

## Paso 1: Obtener API Keys de Binance

### Para TESTNET (Recomendado para empezar):

1. **Ir a Binance Testnet**: https://testnet.binance.vision/
2. Hacer clic en "Generate HMAC_SHA256 Key"
3. Copiar tus claves:
   - **API Key**: Tu clave pública
   - **Secret Key**: Tu clave secreta (¡guárdala, solo se muestra una vez!)

### Para LIVE (Trading Real):

1. **Iniciar sesión en Binance**: https://www.binance.com/
2. Ir a **Perfil** → **API Management**
3. Crear nueva API Key:
   - Dale un nombre descriptivo (ej: "Simulacrum Trading Bot")
   - Habilitar **verificación 2FA**
4. **Permisos necesarios**:
   - ✅ Enable Reading
   - ✅ Enable Spot & Margin Trading
   - ❌ Enable Withdrawals (NO recomendado por seguridad)
5. **Restricción de IP** (Muy recomendado):
   - Añade tu IP pública para mayor seguridad
6. Copiar tus claves

---

## Paso 2: Configurar el Backend

### Editar el archivo: `backend/.env`

```env
BINANCE_API_KEY=tu_api_key_aqui
BINANCE_API_SECRET=tu_secret_key_aqui
BACKEND_PORT=3001
```

### Ejemplo con Testnet:
```env
BINANCE_API_KEY=vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgaGp3k...
BINANCE_API_SECRET=NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjIn...
BACKEND_PORT=3001
```

---

## Paso 3: Iniciar el Backend

```bash
cd backend
npm run dev
```

Deberías ver:
```
╔═══════════════════════════════════════════════════════════╗
║   🚀 SIMULACRUM TRADING BACKEND                          ║
║   Server running on: http://localhost:3001               ║
╚═══════════════════════════════════════════════════════════╝
✅ Exchange auto-initialized in TESTNET mode
```

---

## Paso 4: Probar la Conexión

### Desde el navegador:
1. Abrir http://localhost:5174
2. Hacer clic en "🟢 PAPER MODE" para cambiar a "🔴 LIVE MODE"
3. Confirmar el warning
4. Deberías ver: "✅ Connected to Binance!"

### Desde la terminal (opcional):
```bash
curl http://localhost:3001/api/health
```

---

## 🚨 Seguridad IMPORTANTE:

1. **NUNCA** compartas tus API keys
2. **NUNCA** commitees las keys a Git
3. Usa **Testnet primero** para probar
4. Habilita **restricción de IP** en Binance
5. **NO** habilites permisos de retiro
6. Empieza con **cantidades pequeñas**

---

## 💰 Financiar tu cuenta Testnet

El Testnet de Binance te da BTC y ETH falsos para probar:
1. Ir a https://testnet.binance.vision/
2. Tu cuenta ya tiene fondos de prueba
3. Puedes hacer trading real sin riesgo

---

## 📊 Endpoints Disponibles

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/health` | GET | Estado del servidor |
| `/api/exchange/connect` | POST | Conectar a Binance |
| `/api/portfolio` | GET | Ver balances |
| `/api/ticker/:symbol` | GET | Precio actual |
| `/api/candles/:symbol` | GET | Velas OHLCV |
| `/api/orders` | GET | Órdenes abiertas |
| `/api/order` | POST | Crear orden |
| `/api/order/:id` | DELETE | Cancelar orden |

---

## 🎯 Flujo de Trading

1. **PAPER MODE**: Los trades son simulados, no se ejecutan
2. **LIVE MODE**: 
   - Conecta al backend → Binance API
   - Las órdenes se ejecutan REALMENTE
   - El dinero es REAL (o Testnet coins)

¡Buena suerte con tu trading! 🚀
