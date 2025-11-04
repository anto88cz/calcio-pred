# Frontend - Calcio-Pred

Dashboard Next.js 14 per l'analisi predittiva delle partite di calcio.

## 🚀 Avvio Rapido

```bash
# Installa dipendenze
npm install

# Copia e configura le variabili d'ambiente
cp .env.example .env.local

# Avvia in modalità sviluppo
npm run dev
```

## 🔧 Configurazione

### Variabili d'Ambiente

Crea un file `.env.local` nella root del progetto frontend:

```bash
# API Backend URL
NEXT_PUBLIC_API_URL=http://localhost:3001

# App Configuration
NEXT_PUBLIC_APP_NAME=Calcio-Pred
NEXT_PUBLIC_APP_VERSION=1.0.0

# Features Toggle
NEXT_PUBLIC_DEFAULT_FILTER_GIOCALA=false
NEXT_PUBLIC_SHOW_CHARTS=true

# UI Configuration
NEXT_PUBLIC_AUTO_REFRESH_SECONDS=0
NEXT_PUBLIC_MATCHES_PER_PAGE=50
```

### Configurazione Centralizzata

Tutte le variabili d'ambiente sono gestite centralmente in `src/config/env.ts`:

```typescript
import { ENV } from '@/config/env';

// Usa ENV invece di process.env
console.log(ENV.API_URL);
console.log(ENV.APP_NAME);
```

**Vantaggi:**
- ✅ Type-safe (TypeScript autocomplete)
- ✅ Valori di default centralizzati
- ✅ Parsing automatico (boolean, number)
- ✅ Nessun URL hardcoded nel codice

## 📁 Struttura

```
frontend/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── page.tsx      # Homepage (dashboard partite)
│   │   ├── layout.tsx    # Layout principale
│   │   └── globals.css   # Stili globali Tailwind
│   ├── components/       # Componenti React
│   │   ├── PredictionsTable.tsx
│   │   ├── PredictionTooltip.tsx
│   │   └── StrengthBadge.tsx
│   ├── config/           # Configurazione
│   │   └── env.ts        # Variabili d'ambiente centralizzate
│   ├── lib/              # Utility e API client
│   │   └── api.ts        # TanStack Query hooks
│   └── types/            # TypeScript types
│       └── index.ts
├── public/               # File statici
├── .env.example          # Template variabili d'ambiente
├── .env.local           # Variabili d'ambiente locali (git-ignored)
├── next.config.js       # Configurazione Next.js
├── package.json
└── tsconfig.json
```

## 🎨 Features

### Dashboard Partite di Oggi
- ✅ Caricamento automatico partite del giorno
- ✅ Filtro per 7 competizioni top europee
- ✅ Emoji e badge per ogni competizione
- ✅ Analisi AI con un click

### Prediction Engine
- ✅ Calcolo probabilità 1X2
- ✅ Expected Goals (xG)
- ✅ Confidence score
- ✅ Value bets detection

### UI/UX
- ✅ Design moderno con Tailwind CSS
- ✅ Animazioni fluide
- ✅ Responsive (mobile, tablet, desktop)
- ✅ Loading states e error handling

## 🔌 API Backend

Il frontend comunica con il backend su `http://localhost:3001` (configurabile via `NEXT_PUBLIC_API_URL`).

### Endpoints Utilizzati

**GET /api/fixtures/today**
- Restituisce partite del giorno
- Filtrate per 7 competizioni principali
- Auto-salvataggio teams in database

**POST /api/predictions/calculate-by-name**
```json
{
  "homeTeamName": "Real Madrid",
  "awayTeamName": "Liverpool"
}
```

## 🐛 Troubleshooting

### Porta già in uso
Se la porta 3000 è occupata, Next.js proverà automaticamente 3001, 3002, ecc.

### Backend non raggiungibile
Verifica che:
1. Il backend sia avviato su `localhost:3001`
2. La variabile `NEXT_PUBLIC_API_URL` sia configurata correttamente
3. Non ci siano problemi CORS

### Variabili d'ambiente non caricate
Dopo aver modificato `.env.local`, riavvia il server dev:
```bash
# Ctrl+C per fermare
npm run dev
```

## 📦 Build Production

```bash
# Build ottimizzata
npm run build

# Start production server
npm start
```

## 🔗 Link Utili

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TanStack Query](https://tanstack.com/query/latest)
