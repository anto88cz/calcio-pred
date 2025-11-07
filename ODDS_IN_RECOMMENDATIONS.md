# 📊 Quote Reali nelle Raccomandazioni - Implementazione

## ✅ Implementato

### 1. Backend - Quote Reali da API-Football

**File**: `api/src/services/api-football/odds.ts`
- Recupero automatico quote da API-Football
- Media di 10-20 bookmaker
- Cache Redis 30 minuti
- Mercati: 1X2, Over/Under, BTTS

**File**: `api/src/services/prediction/engine.ts`
- Integrazione automatica nel calcolo predizioni
- Calibrazione modello con quote mercato
- Detection value bets
- Campo `realOdds` aggiunto alla risposta API

### 2. Frontend - Visualizzazione Quote

#### A. Sistema Raccomandazioni Aggiornato

**File**: `frontend/src/lib/betting-recommendations.ts`

**Nuovi campi**:
```typescript
interface BettingRecommendation {
  realOdds?: number;      // Quota reale dai bookmaker
  expectedValue?: number; // EV% = (prob * quota) - 1
  // ...altri campi esistenti
}
```

**Calcolo automatico**:
- Per ogni raccomandazione (1, X, 2, Over, Under, BTTS)
- Se disponibili quote reali → calcola Expected Value
- Se EV > 0 → VALUE BET! 💎
- Aggiunge alert nel reasoning: "Value bet con EV +15.3%!"

#### B. Pagina Analisi - Nuove Sezioni

**File**: `frontend/src/app/analysis/AnalysisContent.tsx`

**🎲 Sezione Quote Bookmaker** (nuova):
- Box dedicato sotto l'intestazione partita
- Quote 1X2 con colori distintivi (blu/grigio/rosso)
- Comparazione Modello vs Bookmaker
- Badge "💎 VALUE" o "⚠️ SOPRAVVALUTATO"
- Quote Over/Under e BTTS
- Info: numero bookmaker e margine

**💡 Raccomandazioni Intelligenti** (aggiornata):
- Ogni card mostra:
  - Quota Bookmaker (se disponibile) con icona 📊
  - Expected Value con badge colorato
  - Alert "💎 VALUE BET!" se EV > 5%
  - EV positivo in verde, negativo in rosso

## 🎨 Interfaccia Utente

### Quote Bookmaker - Sezione Principale

```
┌─────────────────────────────────────────────────┐
│ 🎲 Quote Bookmaker                              │
│ 📊 15 bookmaker • Margine: 4.8%                 │
├─────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ 1 (Casa) │  │X (Pareg.)│  │2 (Trasf.)│     │
│  │   2.10   │  │   3.40   │  │   3.60   │     │
│  │ 44.2%    │  │ 28.6%    │  │ 27.2%    │     │
│  │ Modello: │  │ Modello: │  │ Modello: │     │
│  │  48.5%   │  │  25.3%   │  │  26.2%   │     │
│  │ 💎 VALUE │  │          │  │          │     │
│  └──────────┘  └──────────┘  └──────────┘     │
│                                                 │
│  ┌──────────────────┐  ┌──────────────────┐   │
│  │ Over/Under 2.5   │  │ Goal/No Goal      │   │
│  │ Over 2.5:  1.85  │  │ Goal (Si):  1.72  │   │
│  │ Under 2.5: 1.95  │  │ No Goal:    2.10  │   │
│  └──────────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Raccomandazione con Quote Reali

```
┌─────────────────────────────────────────────────┐
│ 🏠 Vittoria Casa (1)                    [LOW]   │
├─────────────────────────────────────────────────┤
│ Probabilità: 55%  │  Quota Bookmaker: 2.10 📊   │
├─────────────────────────────────────────────────┤
│ Expected Value: +15.5%  💎 VALUE BET!           │
├─────────────────────────────────────────────────┤
│ Value Rating: 85/100  [████████░░]              │
├─────────────────────────────────────────────────┤
│ La squadra di casa ha 55% di probabilità di     │
│ vincere. Value bet con EV +15.5%!               │
└─────────────────────────────────────────────────┘
```

### Raccomandazione COMBO con Quote

```
┌─────────────────────────────────────────────────┐
│ 🎯 1 + Over 1.5                         [MED]   │
├─────────────────────────────────────────────────┤
│ Probabilità: 38%  │  Quota Stimata: 2.92        │
├─────────────────────────────────────────────────┤
│ Combo:                                          │
│ • Vittoria Casa (1)  - Quota: 2.10              │
│ • Over 1.5 Goal      - Quota: 1.39              │
│ • Quota Combinata: ~2.92                        │
└─────────────────────────────────────────────────┘
```

## 🎯 Logica Value Betting

### Expected Value (EV)
```
EV = (Probabilità_Modello × Quota_Bookmaker) - 1

Esempio:
- Modello: Liverpool 55% di vincere
- Bookmaker: Liverpool @ 2.10
- EV = (0.55 × 2.10) - 1 = 0.155 = +15.5%

✅ Se EV > 0 → VALUE BET (modello vede più valore del mercato)
❌ Se EV < 0 → NO VALUE (mercato sopravvaluta)
```

### Classificazione

| EV%        | Badge          | Descrizione                    |
|------------|----------------|--------------------------------|
| > +10%     | 💎💎💎 SUPER  | Value bet eccellente          |
| +5% - +10% | 💎💎 VALUE     | Buon value bet                |
| +2% - +5%  | 💎 LIEVE       | Leggero value                 |
| -2% - +2%  | ⚖️ FAIR        | Quote equilibrate             |
| < -5%      | ⚠️ NO VALUE    | Mercato sopravvaluta          |

### Comparazione Modello vs Mercato

```typescript
// Nella sezione Quote Bookmaker
const diff = modelProb - marketProb;

if (diff > 0.05) {
  // +5% differenza → Il modello vede più probabilità
  → 💎 VALUE BET
} else if (diff < -0.05) {
  // -5% differenza → Il mercato vede più probabilità  
  → ⚠️ SOPRAVVALUTATO
}
```

## 📈 Esempi Reali

### Scenario 1: Value Bet Trovato

```
Match: Liverpool vs Manchester City

Modello:
- Liverpool 55% (quota implicita 1.82)
- Draw 25% (4.00)
- Man City 20% (5.00)

Bookmaker:
- Liverpool 2.10 (47.6%)
- Draw 3.40 (29.4%)
- Man City 3.60 (27.8%)

Result:
→ Liverpool 1: EV = (0.55 × 2.10) - 1 = +15.5% 💎💎 VALUE BET!
→ Draw X: EV = (0.25 × 3.40) - 1 = -15% ⚠️ NO VALUE
→ Man City 2: EV = (0.20 × 3.60) - 1 = -28% ⚠️ NO VALUE
```

### Scenario 2: Quote Equilibrate

```
Match: Atalanta vs Napoli

Modello:
- Atalanta 38% (2.63)
- Draw 29% (3.45)
- Napoli 33% (3.03)

Bookmaker:
- Atalanta 2.70 (37%)
- Draw 3.30 (30.3%)
- Napoli 3.10 (32.3%)

Result:
→ Tutte le quote ⚖️ FAIR (differenze < 3%)
→ Mercato e modello concordano
```

### Scenario 3: Combo Value

```
Match: Inter vs Juventus

Singole:
- Inter 1: modello 60%, quota 1.90 → EV +14% 💎
- Over 1.5: modello 75%, quota 1.35 → EV +1.25% 💎

Combo "1 + Over 1.5":
- Probabilità combinata: 60% × 75% = 45%
- Quota combinata: 1.90 × 1.35 = 2.56
- EV = (0.45 × 2.56) - 1 = +15.2% 💎💎
```

## 🚀 Test

1. **Riavvia Backend**:
   ```bash
   cd api
   npm run dev
   ```

2. **Analizza una Partita**:
   - Vai su una partita qualsiasi
   - Aspetta il caricamento
   - Vedrai la sezione "🎲 Quote Bookmaker"

3. **Controlla Raccomandazioni**:
   - Scorri fino a "💡 Raccomandazioni Intelligenti"
   - Ogni card mostrerà:
     - Quote reali con icona 📊
     - Expected Value colorato
     - Badge VALUE BET se EV > 5%

4. **Verifica Logs Backend**:
   ```
   🎲 Fetching real odds from API-Football
   ✅ Real odds fetched { bookmakers: 15, home: '2.10', ... }
   ```

## 🔧 Configurazione

### Soglie Value Bet

Modifica in `AnalysisContent.tsx` per cambiare quando mostrare "VALUE BET":

```typescript
{rec.expectedValue !== undefined && rec.expectedValue > 0.05 && (
  // Cambia 0.05 per soglia differente:
  // 0.03 = mostra da +3%
  // 0.10 = mostra solo da +10%
  <div>💎 VALUE BET!</div>
)}
```

### Colori Badge

```typescript
// Verde per value positivo, rosso per negativo
className={rec.expectedValue > 0 ? 'text-green-400' : 'text-red-400'}
```

---

**Implementato il**: 7 novembre 2025  
**Status**: ✅ Completato e testato
**Features**:
- ✅ Quote reali da API-Football
- ✅ Calcolo Expected Value automatico
- ✅ Detection value bets
- ✅ Comparazione modello vs mercato
- ✅ UI completa con badge e alert
