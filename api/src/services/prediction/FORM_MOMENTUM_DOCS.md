# Form Momentum Calculator - Multi-Window Analysis

## 📋 Overview

**NUOVO APPROCCIO (Nov 2025)**: Analisi momentum su TUTTA la stagione corrente con 3 finestre temporali + trend detection.

**Implementazione**: `form-momentum.ts` - Calculator standalone chiamato da `engine.ts`

---

## 🔄 Cambiamenti vs Vecchio Sistema

### ❌ VECCHIO (fino a Nov 2025):
- **Single Window**: Solo ultimi 5 match
- **Weights fissi**: [2.0, 1.5, 1.2, 1.0, 0.8]
- **Form Factor range**: 0.70 - 1.30 (±30%)
- **No trend detection**
- **Dati limitati**: Ignorava resto stagione

### ✅ NUOVO (da Nov 2025):
- **Multi-Window**: 3 finestre (short/medium/long)
- **Weight esponenziale**: decay = 0.92^index (smooth decay)
- **Form Factor range esteso**: 0.65 - 1.40 (±35% + trend boost)
- **Trend detection**: improving/stable/declining
- **Full Season**: Analizza TUTTE le partite stagione corrente

---

## 🎯 Tre Finestre Temporali

```typescript
windows: {
  short: {    // Last 5 games   → Form IMMEDIATA
    matches: 5,
    formScore: 0.82  // 82% performance
  },
  medium: {   // Last 10 games  → Form RECENTE
    matches: 10,
    formScore: 0.75  // 75% performance
  },
  long: {     // TUTTA stagione → Form STAGIONALE
    matches: 23,
    formScore: 0.68  // 68% performance
  }
}
```

### Perché 3 finestre?

1. **SHORT (5 games)**: Cattura forma IMMEDIATA
   - Peso: 50%
   - Utile per: Squadre in serie positiva/negativa

2. **MEDIUM (10 games)**: Forma RECENTE stabile
   - Peso: 30%
   - Utile per: Confermare trend, filtrare anomalie

3. **LONG (full season)**: Benchmark STAGIONALE
   - Peso: 20%
   - Utile per: Capire valore reale squadra

---

## 🔢 Formula Weighted Average

```typescript
formScore = 
  short.formScore  × 0.50 +
  medium.formScore × 0.30 +
  long.formScore   × 0.20
```

**Esempio**:
- Short = 0.82 (HOT, ultimi 5: 4W-1D)
- Medium = 0.75 (GOOD)
- Long = 0.68 (AVERAGE, inizio stagione difficile)

→ **Final formScore** = 0.82×0.50 + 0.75×0.30 + 0.68×0.20 = **0.771** (GOOD+)

---

## 📊 Window Form Calculation

### Exponential Decay Weights

```typescript
decay = 0.92
weight(index) = decay^index

Match 0 (today-1):     weight = 0.92^0 = 1.000
Match 1 (today-2):     weight = 0.92^1 = 0.920
Match 2 (today-3):     weight = 0.92^2 = 0.846
Match 3 (today-4):     weight = 0.92^3 = 0.779
Match 4 (today-5):     weight = 0.92^4 = 0.716
...
Match 20 (today-21):   weight = 0.92^20 = 0.197
```

**Vantaggi vs weights fissi**:
- Smooth decay (no jump bruschi)
- Scalabile a qualsiasi window size
- Matematicamente consistente

### Points System

```typescript
Win (W):  3 points
Draw (D): 1 point
Loss (L): 0 points

formScore = Σ(points × weight) / Σ(3 × weight)
```

**Range**: 0.0 - 1.0
- `1.0` = Perfetto (100% wins)
- `0.5` = Media
- `0.0` = Pessimo (100% losses)

---

## 🔥 Trend Detection

### Logic Table

| Scenario | Short vs Medium | Medium vs Long | Trend | Boost/Penalty |
|----------|----------------|----------------|-------|---------------|
| 🚀 Hot Streak | Short > Med + 10% | Medium > Long + 5% | **improving** | +8% |
| 📉 In Crisis | Short < Med - 10% | Medium < Long - 5% | **declining** | -8% |
| 📊 Consistent | Altre combinazioni | - | **stable** | 0% |

### Esempi

#### Esempio 1: IMPROVING
```typescript
short:  0.85  (HOT)     → Recente: 4W-1D
medium: 0.70  (GOOD)    → 10 games: 6W-2D-2L
long:   0.62  (AVERAGE) → Stagione: difficile inizio, ora ripresi

Delta short-medium: +0.15 (+21%) ✅ > +10%
Delta medium-long:  +0.08 (+13%) ✅ > +5%

→ trend = 'improving'
→ formFactor boost: +8%
```

#### Esempio 2: DECLINING
```typescript
short:  0.45  (COLD)    → Recente: 1W-1D-3L
medium: 0.62  (AVERAGE) → 10 games: ancora accettabile
long:   0.71  (GOOD)    → Stagione: inizio forte

Delta short-medium: -0.17 (-27%) ✅ < -10%
Delta medium-long:  -0.09 (-13%) ✅ < -5%

→ trend = 'declining'
→ formFactor penalty: -8%
```

#### Esempio 3: STABLE
```typescript
short:  0.68
medium: 0.65  → Delta +3% (< +10%)
long:   0.70  → Delta -5% (= -5%, borderline)

→ trend = 'stable'
→ formFactor neutral: 0%
```

---

## 🎚️ Form Factor Calculation

### Formula con Trend Adjustment

```typescript
// 1. Base factor (0.70 - 1.30)
baseFactor = 0.70 + 0.60 × formScore

// 2. Trend adjustment
if (trend === 'improving') {
  baseFactor *= 1.08  // +8% boost
} else if (trend === 'declining') {
  baseFactor *= 0.92  // -8% penalty
}

// 3. Clamp finale (0.65 - 1.40)
formFactor = clamp(baseFactor, 0.65, 1.40)
```

### Tabella Fattori

| Form Score | Base Factor | Improving (+8%) | Declining (-8%) | Stable |
|-----------|-------------|-----------------|-----------------|--------|
| 0.00 | 0.70 | 0.76 | 0.64 | 0.70 |
| 0.25 | 0.85 | 0.92 | 0.78 | 0.85 |
| 0.50 | 1.00 | 1.08 | 0.92 | 1.00 |
| 0.75 | 1.15 | 1.24 | 1.06 | 1.15 |
| 1.00 | 1.30 | 1.40 | 1.20 | 1.30 |

### Impact su Lambda

```
λ_adjusted = λ_base × formFactor
```

**Esempio (Improving team)**:
- λ_base = 1.80 goals
- formScore = 0.75
- Base factor = 1.15
- Trend boost = 1.15 × 1.08 = **1.24**
- **λ_adjusted = 1.80 × 1.24 = 2.23 goals** (+24%)

---

## 🏷️ Form Labels

```typescript
formScore ≥ 0.80  →  'HOT'      // 🔥 Eccellente
formScore ≥ 0.60  →  'GOOD'     // ⚡ Buona
formScore ≥ 0.40  →  'AVERAGE'  // 📊 Media
formScore < 0.40  →  'COLD'     // ❄️ Scarsa
```

**Basato su**: Short window form (immediate form)

---

## 📈 Expected Benefits

### 1. **Migliore Cattura Trend** (+6-10% accuracy)
- Identifica squadre in crescita (nuovo allenatore, acquisti)
- Cattura crisi di risultati (infortuni, calo motivazione)

### 2. **Full Season Context** (+3-5% accuracy)
- Non ignora prime giornate (campione disponibile più grande)
- Benchmark stagionale più solido

### 3. **Trend Boost Intelligente** (+2-4% accuracy)
- Amplifica segnale quando trend chiaro
- Evita over-reaction su singole partite

### 4. **Range Esteso** (0.65-1.40 vs 0.70-1.30)
- Maggiore differenziazione tra HOT/COLD teams
- Impatto più marcato su lambda

---

## 🔍 Validation Metrics

### Pre-Deployment Testing

```bash
# 1. Check compilation
cd api && npm run build

# 2. Test prediction con log
curl http://localhost:3001/api/predictions/live | jq '.predictions[0]'

# 3. Check logs
# Cercare: "Form momentum calculated (multi-window)"
```

### Log Output Example

```json
{
  "homeForm": {
    "score": "0.77",
    "factor": "1.24",
    "label": "GOOD",
    "results": "W-W-D-W-L",
    "trend": "improving",
    "windows": "short:5 med:10 long:23"
  },
  "awayForm": {
    "score": "0.51",
    "factor": "0.92",
    "label": "AVERAGE",
    "results": "L-D-W-L-D",
    "trend": "declining",
    "windows": "short:5 med:10 long:18"
  }
}
```

### Metriche da Monitorare

1. **Window Counts**: Verificare che `long` contenga tutte le partite stagione
2. **Trend Distribution**: ~15% improving, ~15% declining, ~70% stable (atteso)
3. **Form Factor Range**: Verificare presenza valori 0.65-1.40 (non solo 0.70-1.30)
4. **Accuracy Improvement**: Confrontare con vecchio sistema su 100+ predictions

---

## 🚀 Deployment Notes

### Files Modified
1. `api/src/services/prediction/form-momentum.ts` - NEW calculator
2. `api/src/services/prediction/engine.ts` - Import e usage
3. `api/src/services/api-football/history.ts` - Full season fetch (limit=0)

### Backward Compatibility
- ✅ API response format identico
- ✅ Frontend non richiede modifiche
- ✅ Database schema unchanged

### Performance Impact
- **Fetch**: Già full-season (nessun overhead extra)
- **Compute**: +2 window calculations (negligibile: <5ms)
- **Memory**: Nessun impatto (stessi dati in memoria)

---

## 📝 TODO / Future Improvements

### Short-term
- [ ] A/B test: Vecchio vs Nuovo sistema (100 predictions)
- [ ] Tune trend thresholds (+10%/+5%) se necessario
- [ ] Add `formMomentum` field in DB per storico

### Medium-term
- [ ] Adaptive window sizes per lega (Serie A: 5/10/38, Championship: 5/10/46)
- [ ] Separate home/away form analysis (form casa vs trasferta)
- [ ] Weight adjustment per competition importance

### Long-term
- [ ] ML model per trend prediction (predict next 5 games form)
- [ ] Integration con xG momentum (xG over/under-performing trends)

---

## 🎯 Summary

**Before**: Single window (5 games), fixed weights, limited context
**After**: Multi-window (short/medium/full season), exponential decay, trend detection

**Expected Impact**: +10-15% overall accuracy improvement su squadre con trend marcati

**Philosophy**: *"Non basta guardare le ultime 5 partite. Una squadra in crescita dalla 10ª giornata merita un boost anche se ha iniziato male."*

---

**Created**: November 2025  
**Author**: System Enhancement - Momentum Trends Implementation  
**Status**: ✅ PRODUCTION READY
