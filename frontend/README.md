# 🎨 Frontend - Calcio-Pred

Dashboard Next.js per visualizzare predizioni calcio.

## 🚀 Tech Stack

- **Next.js 14** (App Router)
- **React 18**
- **TypeScript**
- **Tailwind CSS 3.3**
- **TanStack Query 5.14** (React Query)
- **Recharts 2.10** (grafici - opzionale)

---

## 📁 Struttura

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Home page (dashboard)
│   │   └── globals.css         # Tailwind CSS
│   ├── components/
│   │   ├── PredictionsTable.tsx     # Tabella principale
│   │   ├── StrengthBadge.tsx        # Badge forza (🟩🟢🟡⚪🔴)
│   │   └── PredictionTooltip.tsx    # Tooltip con dettagli
│   ├── lib/
│   │   └── api.ts              # TanStack Query hooks
│   └── types/
│       └── index.ts            # TypeScript types
├── public/
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
└── next.config.js
```

---

## 🎯 Features

### 1. **Tabella Predictions**
- Mostra partite con predizioni complete
- Colonne: Partita, Data/Ora, 1X2, Over 2.5, BTTS, Doppia Chance, Confidence
- Badge colorati per forza predizione
- Hover tooltip con dettagli

### 2. **Filtri**
- **Mostra:** Tutte / Solo GIOCALA / Forti + Giocala
- **Periodo:** Oggi / Domani / Prossimi 2-7 giorni
- Auto-refresh ogni 2 minuti

### 3. **Badge Forza**
| Badge | Criterio | Colore |
|-------|----------|--------|
| 🟩 GIOCALA | ≥80% + conf≥0.6 (solo 1X2) | Verde scuro |
| 🟢 FORTE | Alta probabilità | Verde |
| 🟡 MEDIO | Media probabilità | Giallo |
| ⚪ NEUTRALE | Bassa probabilità | Grigio |
| 🔴 ND | Dati insufficienti | Rosso |

### 4. **Tooltip Hover**
Mostra al passaggio del mouse:
- Match analizzati (casa/trasferta)
- Confidence (% + livello)
- Qualità dati
- Formazioni disponibili
- Infortuni presenti
- Sorgente: API-FOOTBALL
- Metodo: 60% Empirico + 40% Poisson

---

## 🔧 Configurazione

### Environment Variables

Crea `.env.local`:
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

In produzione (Docker):
```bash
NEXT_PUBLIC_API_URL=http://api:3001
```

---

## 🏃 Sviluppo

### Installazione
```bash
cd frontend
npm install
```

### Dev Server
```bash
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000)

### Build
```bash
npm run build
npm run start
```

---

## 📊 Componenti

### PredictionsTable
```tsx
import PredictionsTable from '@/components/PredictionsTable';

export default function Page() {
  return <PredictionsTable />;
}
```

**Features:**
- Filtri integrati (strength, days)
- Auto-refresh query (2 min)
- Loading/Error states
- Responsive design

---

### StrengthBadge
```tsx
import StrengthBadge from '@/components/StrengthBadge';

<StrengthBadge 
  strength="GIOCALA" 
  showIcon={true} 
  size="md" 
/>
```

**Props:**
- `strength`: 'GIOCALA' | 'STRONG' | 'MEDIUM' | 'NEUTRAL' | 'ND'
- `showIcon?`: boolean (default: true)
- `size?`: 'sm' | 'md' | 'lg' (default: 'md')

---

### PredictionTooltip
```tsx
import PredictionTooltip from '@/components/PredictionTooltip';

<PredictionTooltip prediction={prediction}>
  <div>Hover me</div>
</PredictionTooltip>
```

Mostra tooltip con:
- Match analizzati
- Confidence
- Qualità dati
- Infortuni/Lineup
- Sorgente/Metodo

---

## 🎨 Tailwind Customization

### Colors
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        giocala: '#10b981', // green-500
        strong: '#22c55e',  // green-400
        medium: '#eab308',  // yellow-500
        neutral: '#9ca3af', // gray-400
        nd: '#ef4444',      // red-500
      },
    },
  },
};
```

---

## 🔌 API Integration

### TanStack Query Hooks

#### usePredictions
```tsx
import { usePredictions } from '@/lib/api';

const { data, isLoading, error } = usePredictions({
  strengthFilter: 'GIOCALA',
  days: 3,
  minConfidence: 0.65,
});
```

#### useFixtures
```tsx
import { useFixtures } from '@/lib/api';

const { data } = useFixtures({
  date: '2024-10-26',
  leagueId: 135,
  season: 2024,
});
```

#### useCalculatePrediction
```tsx
import { useCalculatePrediction } from '@/lib/api';

const mutation = useCalculatePrediction();

mutation.mutate({
  fixtureId: 1234,
  homeTeamId: 487,
  awayTeamId: 489,
  season: 2024,
  leagueId: 135,
});
```

---

## 📱 Responsive Design

- **Desktop (≥1024px):** Tabella completa
- **Tablet (768-1023px):** Scroll orizzontale
- **Mobile (<768px):** Card layout (TODO)

---

## 🧪 Testing

```bash
# Unit tests (TODO)
npm run test

# E2E tests (TODO)
npm run test:e2e
```

---

## 🚀 Docker Build

```bash
cd frontend
docker build -t calcio-pred-frontend -f ../infra/Dockerfile.frontend .
docker run -p 3000:3000 calcio-pred-frontend
```

---

## 🎯 TODO Miglioramenti

- [ ] Dettaglio predizione singola (modal o pagina dedicata)
- [ ] Grafici con Recharts (distribuzione Poisson, confidence trend)
- [ ] Mobile-first card layout
- [ ] Dark mode
- [ ] Export CSV/PDF predizioni
- [ ] Filtri avanzati (lega, team, confidence range)
- [ ] Notifiche push per GIOCALA
- [ ] Storico predizioni vs risultati reali
- [ ] Heatmap calendario

---

**Status:** ✅ **COMPLETO** - Step 7/9
