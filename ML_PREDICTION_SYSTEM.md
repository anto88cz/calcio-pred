# Sistema di Machine Learning per Predizioni Calcistiche

## 📊 Panoramica

Il sistema di predizione ML utilizza algoritmi statistici avanzati per generare predizioni accurate sui risultati delle partite di calcio, analizzando dati storici con approccio time-weighted e modelli probabilistici.

## 🤖 Algoritmi Implementati

### 1. **Dixon-Coles Poisson Regression**
Modello statistico che migliora la distribuzione di Poisson standard per predire i gol:
- Correzione per match a basso punteggio (0-0, 1-0, 0-1, 1-1)
- Parametro rho = -0.13 (ottimizzato su dati storici)
- Migliore accuratezza su risultati comuni

### 2. **Time-Weighted Analysis**
Sistema di pesatura temporale con decadimento esponenziale:
- Match recenti hanno peso maggiore
- Decay rate: 0.1 per mese
- Formula: `weight = exp(-0.1 * monthsSince)`

### 3. **Team Strength Metrics**
Calcolo della forza delle squadre basato su:
- **Attack Strength**: Media gol segnati (time-weighted)
- **Defense Strength**: Media gol subiti (time-weighted)  
- **Form Score**: Performance ultimi 5 match (W=1.0, D=0.5, L=0.0)
- **xG Performance**: Rapporto gol reali / gol attesi

### 4. **Home Advantage Modeling**
Fattore vantaggio casa applicato:
- Coefficiente standard: 1.2 (20% boost)
- Basato su analisi statistica delle performance casalinghe
- Separazione dati home/away per accuracy maggiore

### 5. **Head-to-Head Analysis**
Analisi degli scontri diretti (ultimi 5 H2H):
- Calcolo dominanza storica
- Adjustment factor: ±5% sulle probabilità
- Integrato con forme recenti

## 📐 Formule Chiave

### Expected Goals Calculation
```
xG_home = Attack_home × Defense_away × League_avg_home × Home_advantage
xG_away = Attack_away × Defense_home × League_avg_away
```

### Probability Matrix (Poisson)
```
P(homeGoals = h, awayGoals = a) = 
  Poisson(λ_home, h) × Poisson(λ_away, a) × Dixon-Coles_adjustment(h, a)
```

### Dixon-Coles Adjustment
```
adjustment(h, a) = {
  1 - ρ   if h=0, a=0
  1 + ρ   if h=0, a=1 or h=1, a=0
  1 - ρ   if h=1, a=1
  1       otherwise
}
```

### Form Score
```
form = Σ(results_i × weight_i) / Σ(weight_i)
where result ∈ {1.0 (win), 0.5 (draw), 0.0 (loss)}
```

## 🎯 Output del Sistema

### Probabilità 1X2
- Home Win (1)
- Draw (X)
- Away Win (2)

### Expected Goals
- xG Home
- xG Away
- Total Goals

### Confidence Score
Basato su:
- Completezza dati (match disponibili)
- Stabilità forma
- Range: 0-1 (0% - 100%)

### Top 5 Score Predictions
Risultati esatti più probabili con percentuale

### Implied Odds
Quote derivate dalle probabilità (con margine bookmaker 5%)

### Factors Breakdown
- Strength metrics per squadra
- Form differential
- Home advantage impact
- H2H advantage

## 🔄 Workflow di Calcolo

```
1. Fetch Historical Data
   ↓
2. Calculate Team Strengths (time-weighted)
   ↓
3. Apply Home Advantage
   ↓
4. Calculate Expected Goals (λ)
   ↓
5. Generate Probability Matrix (Poisson + Dixon-Coles)
   ↓
6. Aggregate to 1X2 Probabilities
   ↓
7. Apply Form Adjustment (±10%)
   ↓
8. Apply H2H Adjustment (±5%)
   ↓
9. Calculate Confidence
   ↓
10. Generate Top Scores
```

## 📊 Data Requirements

### Minimo per predizione affidabile:
- **20+ match per squadra** (idealmente 40 totali)
- **Mix home/away** separato
- **Dati stagione corrente** preferiti
- **H2H opzionale** (migliora accuracy del 2-3%)

### Data Sources:
- **Sportsmonks API v3**
- Endpoint: `/fixtures/between/{start}/{end}/{team}`
- Include: participants, scores, state, league, season

## 🎲 Calibrazione con Mercato

Il sistema confronta le predizioni ML con le quote bookmaker reali:
- Se disponibili, applica calibrazione
- Identifica value bets (quando ML > Market)
- Boost confidence in caso di agreement

## 🔍 Esempio Output

```json
{
  "mlPrediction": {
    "probabilities": {
      "home": 0.487,
      "draw": 0.276,
      "away": 0.237
    },
    "expectedGoals": {
      "home": 1.85,
      "away": 1.23,
      "total": 3.08
    },
    "confidence": 0.78,
    "mostLikely": "1",
    "topScores": [
      { "score": "2-1", "probability": 0.142 },
      { "score": "1-1", "probability": 0.129 },
      { "score": "2-0", "probability": 0.118 },
      { "score": "1-0", "probability": 0.106 },
      { "score": "3-1", "probability": 0.087 }
    ],
    "impliedOdds": {
      "home": 2.05,
      "draw": 3.62,
      "away": 4.22
    },
    "factors": {
      "homeStrength": {
        "attack": 1.72,
        "defense": 1.15,
        "form": 0.70,
        "xgPerformance": 1.0
      },
      "awayStrength": {
        "attack": 1.38,
        "defense": 1.42,
        "form": 0.50,
        "xgPerformance": 1.0
      },
      "homeAdvantage": 1.2,
      "formDifferential": 0.20,
      "h2hAdvantage": 0.15
    }
  }
}
```

## 🚀 Performance & Accuracy

### Metriche Attese:
- **Accuracy 1X2**: ~52-55% (meglio del 33% random)
- **Correct Score**: ~15-18% top-1, ~35% top-3
- **Over/Under 2.5**: ~58-62%
- **BTTS**: ~60-65%

### Miglioramenti Futuri:
1. ✅ Time-weighted analysis (IMPLEMENTATO)
2. ✅ Dixon-Coles correction (IMPLEMENTATO)
3. ✅ H2H integration (IMPLEMENTATO)
4. ⏳ xG real data (quando add-on disponibile)
5. ⏳ Injuries impact modeling
6. ⏳ Lineup quality analysis
7. ⏳ Weather conditions
8. ⏳ Referee bias analysis
9. ⏳ Neural network ensemble

## 📖 References

1. Dixon, M. J., & Coles, S. G. (1997). "Modelling Association Football Scores and Inefficiencies in the Football Betting Market"
2. Karlis, D., & Ntzoufras, I. (2003). "Analysis of sports data by using bivariate Poisson models"
3. Baio, G., & Blangiardo, M. (2010). "Bayesian hierarchical model for the prediction of football results"

## 🔧 File Implementati

- `api/src/services/ml-prediction.service.ts` - Core ML engine
- `api/src/services/prediction/engine.ts` - Integrazione con sistema esistente
- `api/src/services/sportsmonks/statistics.ts` - Data fetching

## 📝 Note Tecniche

### Gestione Missing Data:
- Fallback a valori default (attack=1.0, defense=1.0, form=0.5)
- Minimum threshold: 0.1 per evitare divisione per zero
- Confidence penalizzata in base a completeness

### League Average Goals:
- Default: 2.7 gol/partita
- TODO: Implementare league-specific averages
- Serie A: ~2.6, Premier League: ~2.8, Bundesliga: ~3.1

### Rate Limiting:
- Cache Redis (1 ora TTL)
- Fetch sequenziale per evitare 429
- Graceful degradation se API fail

---

**Creato:** 7 Novembre 2025  
**Versione:** 1.0.0  
**Autore:** ML Prediction System
