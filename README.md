# Simulacrum 2.0

AI-assisted crypto trading and market analysis platform. Combines a React/Vite
frontend with a Node.js backend that integrates with Binance via CCXT, plus
multi-provider LLM orchestration (Groq, Gemini, OpenRouter) for signal
generation.

> Educational / research project. **Not financial advice.** Trading crypto
> involves risk of total loss. Use paper trading mode until you have audited
> the risk controls yourself.

---

## Architecture

```
simulacrum-app/
  src/                   # React 19 + Vite frontend
    services/
      ai/                # Multi-provider LLM agents
      data/              # Market data (Binance, CoinGecko, CoinCap)
      defi/              # Uniswap/Sushiswap integration
      exchange/          # CEX (Binance) client
      risk/              # Risk management primitives
      sentiment/         # Social/sentiment scoring
      trading/           # Indicators, backtest, risk service
    store/               # Zustand store
    types/               # Shared TS types
  backend/
    src/server.js        # Express + WebSocket bridge to Binance via CCXT
```

The frontend talks to the backend over HTTP/WS. Exchange API secrets are held
**only on the backend** so they do not end up in the browser bundle.

---

## Getting started

### 1. Prerequisites

- Node.js 20+
- A Binance account if you want live trading (optional — paper trading and
  public market data work without keys)
- API keys from one or more LLM providers (Groq is enough to start)

### 2. Clone & install

```bash
git clone https://github.com/<your-user>/simulacrum-2.0.git
cd simulacrum-2.0/simulacrum-app
npm install
cd backend && npm install && cd ..
```

### 3. Configure environment

```bash
# Frontend
cp .env.example .env
# Backend
cp backend/.env.example backend/.env
```

Edit both `.env` files and fill in your keys. See the comments inside each
template for where to get them.

### 4. Run

```powershell
# Windows (PowerShell)
./start.ps1
```

or manually:

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
npm run dev
```

The frontend will be at <http://localhost:5173> and the backend at
<http://localhost:3001>.

---

## Security notes

This repo has been prepared for public release. A few things you should know:

- **Vite inlines `VITE_*` variables into the production bundle.** Anything you
  put in those keys is visible to anyone who downloads the built app. Treat
  them as public. Real exchange secrets must live in `backend/.env` only.
- **Never commit `.env`.** The `.gitignore` excludes it, but always
  double-check with `git status` before committing.
- **Limit exchange API permissions.** Disable withdrawals, restrict by IP,
  and start with small amounts.
- **Keep `VITE_PAPER_TRADING_MODE=true`** until you have read the order
  placement flow in [`backend/src/server.js`](simulacrum-app/backend/src/server.js)
  and are satisfied with it.

---

## Project status

This is an in-progress research project, not a production trading system.
Expect breaking changes, missing tests, and rough edges. PRs welcome.

---

## License

[Apache License 2.0](LICENSE).
