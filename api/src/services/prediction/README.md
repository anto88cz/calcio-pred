# 🧠 Prediction Engine

Motore di calcolo delle percentuali di pronostico basato su **dati storici reali** (API-FOOTBALL).

## 📐 Architettura

```
prediction/
├── engine.ts        # Orchestratore principale
├── empiric.ts       # Calcolo empirico (time-decay)
├── poisson.ts       # Distribuzione Poisson + Dixon-Coles
├── confidence.ts    # Sistema confidence a 5 fattori
├── strength.ts      # Classificazione forza (GIOCALA/STRONG/MEDIUM/NEUTRAL/ND)
├── blender.ts       # Blend 60% Empirico + 40% Poisson
└── index.ts         # Exports
```

---

## 🚀 Utilizzo

```typescript
import { predictionEngine } from './services/prediction';

const prediction = await predictionEngine.calculatePrediction({
  fixtureId: 1234,
  homeTeamId: 33,
  awayTeamId: 40,
  season: 2024,
  leagueId: 135
});

console.log('Confidence:', prediction.confidence);
console.log('1X2:', prediction.market1X2.final);
console.log('Over 2.5:', prediction.marketUnderOver['2.5'].final.over);
console.log('Strength:', prediction.market1X2.strength);
```

---

## 📊 Output Structure

```typescript
{
  confidence: 0.72,
  confidenceLevel: 'HIGH',
  homeMatchesUsed: 20,
  awayMatchesUsed: 19,
  
  market1X2: {
    empiric: { prob1: 0.52, probX: 0.28, prob2: 0.20 },
    poisson: { prob1: 0.50, probX: 0.30, prob2: 0.20 },
    final: { prob1: 0.512, probX: 0.288, prob2: 0.20 },
    strength: 'STRONG'
  },
  
  marketUnderOver: {
    '2.5': {
      empiric: { under: 0.42, over: 0.58 },
      poisson: { under: 0.40, over: 0.60 },
      final: { under: 0.412, over: 0.588 },
      strength: 'MEDIUM'
    },
    // ... 0.5, 1.5, 3.5, 4.5
  },
  
  marketBTTS: {
    empiric: { yes: 0.65, no: 0.35 },
    poisson: { yes: 0.62, no: 0.38 },
    final: { yes: 0.638, no: 0.362 },
    strength: 'STRONG'
  },
  
  marketDoubleChance: {
    '1X': { final: { prob: 0.80 }, strength: 'GIOCALA' },
    '12': { final: { prob: 0.712 }, strength: 'MEDIUM' },
    'X2': { final: { prob: 0.488 }, strength: 'NEUTRAL' }
  },
  
  poissonParams: {
    lambdaHome: 1.82,
    lambdaAway: 1.15,
    homeAdvantage: 0.25
  },
  
  dataQuality: 'EXCELLENT',
  hasInjuries: true,
  hasLineup: true,
  provider: 'API-FOOTBALL'
}
```

---

## 🔬 Moduli

### 1. **Engine** (orchestratore)
Coordina tutti i moduli:
1. Fetch dati storici (ultimi 20 match)
2. Fetch infortuni e lineup
3. Valuta qualità dati
4. Calcola empirico
5. Calcola Poisson
6. Blend 60/40
7. Calcola confidence
8. Classifica forza
9. Costruisce response

**Data Quality:**
- `EXCELLENT`: ≥90% completezza
- `GOOD`: 70-89%
- `FAIR`: 50-69%
- `POOR`: 30-49%
- `INSUFFICIENT`: <30% → ritorna **ND**

---

### 2. **Empiric** (empirico)
Analisi storica con time-decay:

```typescript
weight = decayFactor^matchAge
```

- **Decay factor:** 0.95 (partite recenti pesano di più)
- **Partite analizzate:** ultimi 20 match per squadra
- **Output:** prob1, probX, prob2, U/O (0.5-4.5), BTTS, DC

**Under/Over:** Approssimazione normale con CDF:
```typescript
μ = avgGoals
σ = √variance
P(X > threshold) = 1 - Φ((threshold - μ) / σ)
```

---

### 3. **Poisson** (distribuzione)
Distribuzione Poisson con correzione Dixon-Coles:

```typescript
λ_home = avgGoalsScored_home × (1 + homeAdvantage)
λ_away = avgGoalsScored_away
```

- **Home advantage:** +0.25 gol
- **Matrice 7x7:** probabilità per ogni score (0-0 fino a 6-6)
- **Dixon-Coles correction (RHO = -0.1):** riduce sovrastima di 0-0, 1-0, 0-1, 1-1

**Formula:**
```typescript
P(home=i, away=j) = (e^-λh × λh^i / i!) × (e^-λa × λa^j / j!)
```

---

### 4. **Blender** (fusione)
Blend pesato: **60% Empirico + 40% Poisson**

```typescript
final = empiric × 0.60 + poisson × 0.40
```

**Validazioni:**
- ✅ Somma 1X2 = 1.0
- ✅ Somma U/O = 1.0 per ogni soglia
- ✅ Somma BTTS = 1.0
- ✅ Monotonia Over: Over(0.5) > Over(1.5) > ... > Over(4.5)

Se monotonia violata → fix automatico con interpolazione.

---

### 5. **Confidence** (affidabilità)
Sistema a **5 fattori** (somma = 1.0):

| Fattore | Peso | Descrizione |
|---------|------|-------------|
| **Data Availability** | 30% | Completezza storico (20 match = max) |
| **Recency** | 20% | Freschezza dati (≤30 giorni = max) |
| **Stability** | 25% | Bassa varianza + entropia equilibrata |
| **Lineup Status** | 15% | Formazioni confermate |
| **Injury Impact** | 10% | Assenze pesanti (titolari/star) |

**Livelli output:**
- `VERY_HIGH`: ≥0.80
- `HIGH`: 0.65-0.79
- `MEDIUM`: 0.50-0.64
- `LOW`: 0.35-0.49
- `VERY_LOW`: <0.35

---

### 6. **Strength** (forza)
Classifica basata su **probabilità + confidence**:

#### 1X2 (max prob):
- 🟩 **GIOCALA**: ≥80% + conf ≥0.60
- 🟢 **STRONG**: 50-79%
- 🟡 **MEDIUM**: 42-49%
- ⚪ **NEUTRAL**: <42%
- 🔴 **ND**: dati insufficienti

#### Binary (U/O, BTTS):
- 🟢 **STRONG**: ≥62%
- 🟡 **MEDIUM**: 55-61%
- ⚪ **NEUTRAL**: <55%

#### Doppia Chance:
- 🟢 **STRONG**: ≥75%
- 🟡 **MEDIUM**: 65-74%
- ⚪ **NEUTRAL**: <65%

---

## ⚙️ Configurazione

```typescript
// api/src/config/index.ts
export const calculationConfig = {
  historyGames: 20,          // Match storici analizzati
  homeAdvGoals: 0.25,        // Vantaggio casalingo
  blendEmpiric: 0.60,        // Peso empirico
  blendPoisson: 0.40,        // Peso Poisson
  decayFactor: 0.95,         // Decay time-decay
  poissonRho: -0.1,          // Dixon-Coles correction
  
  thresholds: {
    giocala1X2Prob: 0.80,    // Soglia GIOCALA per 1X2
    giocalaConfidence: 0.60, // Confidence minima GIOCALA
    strong1X2: 0.50,         // Soglia STRONG per 1X2
    medium1X2: 0.42,         // Soglia MEDIUM per 1X2
    strongBinary: 0.62,      // Soglia STRONG binaria (U/O, BTTS)
    mediumBinary: 0.55,      // Soglia MEDIUM binaria
    strongDC: 0.75,          // Soglia STRONG doppia chance
    mediumDC: 0.65,          // Soglia MEDIUM doppia chance
  }
};
```

---

## 🧪 Testing

```bash
# Test singola partita
curl http://localhost:3001/api/predictions/1234

# Calcola e salva
curl -X POST http://localhost:3001/api/predictions/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "fixtureId": 1234,
    "homeTeamId": 33,
    "awayTeamId": 40,
    "season": 2024,
    "leagueId": 135
  }'
```

---

## 📝 Note Implementazione

1. **Time-decay:** Partite recenti pesano di più (0.95^età)
2. **Dixon-Coles:** Corregge sovrastima score bassi (0-0, 1-0, 0-1, 1-1)
3. **Blend 60/40:** Empirico domina (cattura trend), Poisson stabilizza
4. **Confidence multi-fattore:** Non solo sample size, ma anche recency/stability/lineup/injury
5. **Monotonia Over:** Garantita automaticamente (Over 0.5 sempre > Over 4.5)
6. **ND fallback:** Se dati <30% → ritorna probabilità neutre (33/34/33 per 1X2)

---

## 🚧 Estensioni Future
- [ ] Machine Learning (XGBoost) come 3° motore
- [ ] Analisi scontri diretti (head-to-head)
- [ ] Form recente (ultimi 5 match)
- [ ] Analisi momentum (sequenze vittorie/sconfitte)
- [ ] Pesi dinamici per blend (invece di fisso 60/40)

---

**Status:** ✅ **COMPLETO** - Step 5/9
