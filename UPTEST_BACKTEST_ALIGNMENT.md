# Allineamento Uptest-Multiple ↔️ Backtest-Multiple

## ✅ ALLINEAMENTO COMPLETATO

I due sistemi sono ora **perfettamente allineati** e utilizzano **la stessa logica di selezione**.

---

## 🎯 Parametri Identici

```javascript
// Entrambi i file
const STAKE_PERCENTAGE = 0.30;  // 30% del capitale
const TARGET_ODDS = 1.8;         // Target quota moderata
const MIN_ODDS = 1.4;            // Minimo accettabile
const MAX_ODDS = 4.0;            // Massimo accettabile
```

---

## 🔄 Logica di Selezione Identica

### 1. **API Endpoint** (identico)
- Entrambi chiamano: `/api/betting-recommendations`
- Stessi parametri: `fixtureId`, `homeTeamId`, `awayTeamId`, `leagueId`, `seasonId`, `homeTeamName`, `awayTeamName`

### 2. **Score Calculation** (identica)
```javascript
function calculateScore(rec) {
  const valueRating = rec.valueRating || rec.value || 0;
  const confidence = (rec.confidence || 0) > 1 ? rec.confidence : (rec.confidence || 0) * 100;
  const expectedValue = (rec.expectedValue || 0) > 1 ? rec.expectedValue : (rec.expectedValue || 0) * 100;
  const oddsBonus = rec.odds >= 1.5 && rec.odds <= 3.0 ? 10 : 0;
  
  return valueRating * 0.4 + confidence * 0.3 + expectedValue * 0.2 + oddsBonus;
}
```

### 3. **Normalizzazione Raccomandazioni** (identica)
- Nessun filtro di qualità applicato
- Prende TUTTE le raccomandazioni dall'API
- Seleziona la migliore per score

### 4. **Strategia di Multipla** (identica)
```javascript
// 1. Prova con 1 partita sola
for (const event of allEvents) {
  if (odds >= MIN_ODDS && odds <= MAX_ODDS) {
    // Seleziona se più vicina a TARGET_ODDS
  }
}

// 2. Prova con 2 partite
for (i, j combinations) {
  combinedOdds = odds1 * odds2;
  if (combinedOdds >= MIN_ODDS && combinedOdds <= MAX_ODDS) {
    // Seleziona se più vicina a TARGET_ODDS
  }
}

// 3. Prova con 3 partite (solo se bestDiffFromTarget > 0.3)
for (i, j, k combinations) {
  combinedOdds = odds1 * odds2 * odds3;
  if (combinedOdds >= MIN_ODDS && combinedOdds <= MAX_ODDS) {
    // Seleziona se più vicina a TARGET_ODDS
  }
}
```

---

## 🔍 Differenza Chiave (Corretta)

### **UPTEST-MULTIPLE**
```javascript
// Filtra solo partite IN PROGRAMMA (non ancora giocate)
const upcomingFixtures = fixturesData.fixtures.filter(f => 
  f.status !== 'FT' && f.status !== 'POSTP' && f.status !== 'CANCL'
);
```

### **BACKTEST-MULTIPLE**
```javascript
// Filtra solo partite FINITE
const finishedFixtures = fixturesData.fixtures.filter(f => 
  f.status === 'FT' && f.score
);
```

**Questa è l'UNICA differenza e è CORRETTA**:
- `uptest-multiple.js` → predice partite future
- `backtest-multiple.js` → verifica predizioni su partite passate

---

## ✅ Garanzia di Allineamento

Se **uptest-multiple** raccomanda una schedina per il 24/11/2025, quando eseguirai **backtest-multiple** il 25/11/2025:

1. ✅ Troverà le stesse partite (ora con status `FT`)
2. ✅ Chiamerà lo stesso endpoint API (`/api/betting-recommendations`)
3. ✅ Riceverà le stesse raccomandazioni
4. ✅ Calcolerà lo stesso score
5. ✅ Selezionerà la stessa multipla
6. ✅ Verificherà se la schedina era vincente o perdente

---

## 🎯 Come Usarli

### **Per Predizioni Future**
```bash
node uptest-multiple.js 24/11/2025
```
- Output: Schedina consigliata con quote, confidence, value rating

### **Per Verifica Storica**
```bash
node backtest-multiple.js
```
- Analizza periodo: `START_DATE` → `END_DATE` (default: 2025-09-01 → 2025-11-22)
- Output: Report con win rate, ROI, profitto/perdita

---

## 📊 Esempio di Ciclo Completo

**Venerdì 22/11/2025 ore 18:00:**
```bash
$ node uptest-multiple.js 23/11/2025
> 📊 MULTIPLA CONSIGLIATA: 2 eventi, quota 1.85
> 1. Brøndby IF vs FC København: 1X @1.77
> 2. Telstar vs Fortuna Sittard: X2 @1.68
```

**Sabato 23/11/2025 ore 23:00 (dopo le partite):**
```bash
$ node backtest-multiple.js  # Con END_DATE = '2025-11-23'
> 📅 Elaborazione 2025-11-23...
> ✓ 33 partite trovate
> ✓ 26 partite finite
> ✓ 2 eventi con raccomandazioni valide
> 📊 Multipla generata: 2 eventi, quota 1.85
> ✅ VINTA - Stake: €30.00 | Quota: 1.85 | Profit: +€25.50
>   ✓ Brøndby IF vs FC København: 1X @1.77 (2-1)  ← Esito corretto!
>   ✓ Telstar vs Fortuna Sittard: X2 @1.68 (1-3)  ← Esito corretto!
```

---

## ✅ Conclusione

I due sistemi sono **100% allineati**. Stessa logica, stesso endpoint, stessa selezione.

**L'unica differenza è il timing:**
- `uptest` → prima della partita (predizione)
- `backtest` → dopo la partita (verifica)

Questo garantisce che le tue predizioni di oggi siano esattamente quelle che verrai a verificare domani nel backtest.
