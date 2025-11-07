# 🧪 Backtesting Framework

Framework per validare l'accuracy del sistema di predizione su match storici.

## 🚀 Quick Start

### Test Rapido (2-3 minuti)

```bash
# Dalla root del progetto
node test-quick-backtest.js
```

Testa ultimi 3 mesi di Europa League (20 fixtures).

---

## 📊 Backtest Completo

### 1. Backtest Singola League

```bash
cd api

# Premier League (ultimi 3 mesi, 50 match)
npx tsx src/scripts/run-backtest.ts \
  --start 2024-08-01 \
  --end 2024-11-01 \
  --leagues 39 \
  --limit 50
```

### 2. Backtest Multi-League

```bash
# Top 3 leagues
npx tsx src/scripts/run-backtest.ts \
  --start 2024-08-01 \
  --end 2024-11-01 \
  --leagues 39,135,140 \
  --limit 100
```

### 3. Full Season Backtest

```bash
# Intera stagione 2024/25 (no limit)
npx tsx src/scripts/run-backtest.ts \
  --start 2024-08-01 \
  --end 2025-05-31 \
  --leagues 39,135,140,78,61
```

**⚠️ Warning:** Full season senza limit può richiedere 1-2 ore (rate limit 6 sec/match).

---

## 📋 Parametri

| Parametro | Descrizione | Esempio | Default |
|-----------|-------------|---------|---------|
| `--start` | Data inizio (YYYY-MM-DD) | `2024-08-01` | Required |
| `--end` | Data fine (YYYY-MM-DD) | `2024-11-01` | Required |
| `--leagues` | League IDs (comma-separated) | `39,135,140` | `39` |
| `--limit` | Max fixtures da testare | `50` | Tutti |
| `--output` | File output JSON | `report.json` | `backtest-report.json` |

---

## 📊 Metriche

### 1. Accuracy 1X2

Percentuale predizioni corrette per strength level:

```
Overall: 67.2%
- GIOCALA:  75.3% ✅ (high confidence)
- FORTE:    68.9%
- MEDIO:    62.1%
- NEUTRALE: 52.4%
```

**Target:** Overall > 60%, GIOCALA > 70%

---

### 2. Brier Score

Qualità statistica delle probabilità (0 = perfect, 1 = worst):

```
Overall: 0.172 ✅
- Home Wins: 0.165
- Draws:     0.198
- Away Wins: 0.153
```

**Target:** < 0.18 (excellent), < 0.20 (good)

---

### 3. Calibration

Predicted probability vs actual frequency:

```
Range    | Predicted | Actual | Diff
---------|-----------|--------|---------
60-80%   |   68.5%   | 71.3%  | 2.8% ✅
80-100%  |   87.2%   | 83.1%  | 4.1% ⚠️
```

**Target:** < 5% average difference

---

### 4. ROI Simulation

Profitto simulato con diverse strategie:

```
Flat Betting (all):      +8.5%
Kelly Betting (all):     +12.3%
Flat (GIOCALA/FORTE):    +15.7% ✅ Best
Kelly (GIOCALA/FORTE):   +21.4%
```

**Target:** Positive ROI on filtered predictions

---

## 🎯 Use Cases

### 1. Validation Dopo Modifiche

```bash
# BEFORE implementing new feature
npx tsx src/scripts/run-backtest.ts --start 2024-08-01 --end 2024-10-01 --output before.json

# Implement feature (e.g., Match Importance Factor)

# AFTER implementing feature
npx tsx src/scripts/run-backtest.ts --start 2024-08-01 --end 2024-10-01 --output after.json

# Compare: accuracy, brierScore, roi
```

**Expected improvement:** +2-3% accuracy, -0.01 Brier Score

---

### 2. Parameter Tuning

Trova best configuration blend weights:

```bash
# Test empiric 50% / poisson 50%
# Modify calculationConfig.blendEmpiric/blendPoisson
npx tsx src/scripts/run-backtest.ts ... --output blend-50-50.json

# Test empiric 60% / poisson 40%
npx tsx src/scripts/run-backtest.ts ... --output blend-60-40.json

# Test empiric 70% / poisson 30%
npx tsx src/scripts/run-backtest.ts ... --output blend-70-30.json

# Compare results
```

---

### 3. League-Specific Analysis

```bash
# Premier League tuning
npx tsx src/scripts/run-backtest.ts --leagues 39 --limit 100

# Champions League (smaller sample)
npx tsx src/scripts/run-backtest.ts --leagues 2 --limit 30

# Serie A validation
npx tsx src/scripts/run-backtest.ts --leagues 135 --limit 80
```

---

## 📈 Output

### Console Output

```
🎯 BACKTEST RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 SUMMARY:
   Total Matches:  133
   Elapsed Time:   824.3s

✅ ACCURACY:
   Overall 1X2:    67.67%
   - GIOCALA:      75.00%
   - FORTE:        71.43%

📈 BRIER SCORE:
   Overall:        0.1724 ✅ EXCELLENT

💰 ROI SIMULATION:
   Flat (GIOCALA/FORTE):   +15.67%

🏆 BY LEAGUE:
   Premier League | Accuracy: 69.2% | Matches: 42
   Serie A        | Accuracy: 66.8% | Matches: 38

💾 Full report saved to: backtest-report.json
```

### JSON Report

```json
{
  "summary": {
    "totalMatches": 133,
    "dateRange": "2024-08-01 to 2024-11-01"
  },
  "accuracy": {
    "overall1X2": 67.67,
    "byStrength": {
      "GIOCALA": 75.00,
      "FORTE": 71.43
    }
  },
  "brierScore": {
    "overall": 0.1724
  },
  "roi": {
    "strengthFiltered": {
      "flatBetting": 15.67
    }
  },
  "results": [ ... ] // Detailed per-match results
}
```

---

## ⚠️ Important Notes

### Rate Limiting

- Delay 6 sec tra predizioni (rate limit API-FOOTBALL)
- 50 fixtures ≈ 5 minuti
- 100 fixtures ≈ 10 minuti
- 200 fixtures ≈ 20 minuti

### Data Requirements

Fixtures must be:
- ✅ Status: `FT` (Finished)
- ✅ homeGoals/awayGoals not null
- ✅ Historical data available (min 3 matches per team)

### Caching

- First run: Fetches from API-FOOTBALL
- Subsequent runs: Uses Redis cache (1h TTL for history)

---

## 🔍 Troubleshooting

### "No fixtures found"

```bash
# Check if fixtures are loaded in DB
cd api
npx tsx src/scripts/load-fixtures.ts 2

# Then retry backtest
```

### "Rate limit exceeded"

Increase delay between predictions:
```typescript
// In backtester.ts
await new Promise(resolve => setTimeout(resolve, 8000)); // 8 sec instead of 6
```

### "Historical data insufficient"

Team has < 3 matches in current season. Filter will skip these fixtures automatically.

---

## 📚 Documentation

Full documentation: `api/src/services/backtesting/BACKTESTING_GUIDE.md`

---

## 🎯 Recommended Workflow

1. **Baseline Backtest** (current system)
   ```bash
   npx tsx src/scripts/run-backtest.ts --start 2024-08-01 --end 2024-10-31 --leagues 39 --limit 50 --output baseline.json
   ```

2. **Implement improvement** (e.g., Match Importance Factor)

3. **A/B Backtest** (same period, same fixtures)
   ```bash
   npx tsx src/scripts/run-backtest.ts --start 2024-08-01 --end 2024-10-31 --leagues 39 --limit 50 --output improved.json
   ```

4. **Compare metrics:**
   - Accuracy improvement: Target +2-3%
   - Brier Score reduction: Target -0.01
   - ROI increase: Target +3-5%

5. **Deploy if improvement confirmed** ✅

---

## 📊 Success Criteria

**Good System:**
- ✅ Accuracy > 60%
- ✅ Brier Score < 0.18
- ✅ Calibration error < 5%
- ✅ Positive ROI on filtered predictions

**System Ready for Production:**
- ✅ GIOCALA accuracy > 70%
- ✅ Consistent performance across leagues
- ✅ ROI > +10% on GIOCALA/FORTE

---

**Created:** November 7, 2025  
**Status:** ✅ PRODUCTION READY
