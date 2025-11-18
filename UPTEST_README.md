# 🔮 UPTEST - Sistema di Predizioni Future

Sistema per generare raccomandazioni di scommesse per date future specifiche.

## 📋 Utilizzo Base

```bash
node uptest-multiple.js <data>
```

### Esempi:

```bash
# Formato DD/MM/YYYY (italiano)
node uptest-multiple.js 22/11/2025

# Formato YYYY-MM-DD (internazionale)
node uptest-multiple.js 2025-11-22

# Per oggi
node uptest-multiple.js $(date +%d/%m/%Y)

# Per domani
node uptest-multiple.js $(date -d tomorrow +%d/%m/%Y)
```

## 🎯 Funzionalità

### Parametri Identici a Backtest
- **Target Odds**: 1.60 (quota obiettivo per multipla)
- **Range Odds**: 1.40 - 2.00 (quote accettabili)
- **Eventi Preferiti**: 2 (prova prima con 2 eventi)
- **Max Eventi**: 2 (massimo eventi nella multipla)

### Filtri Qualità
- **Min Confidence**: 65%
- **Min Expected Value**: 12%
- **Min Value Rating**: 3/5 stelle
- **Min Odds Single Event**: 1.42
- **Goal/NoGoal**: Abilitato

### Output
Lo script genera una schedina con:
- ⚽ Eventi selezionati con tutti i dettagli
- 📊 Quota totale della multipla
- 💰 Stake consigliato (30% del capitale)
- 💎 Metriche di qualità (confidence, EV, value rating, score)
- 🕐 Orari delle partite (fuso Europe/Rome)
- 💡 Reasoning per ogni raccomandazione

## 🔧 Configurazione

### Variabili Principali (nel file)

```javascript
const STAKE_PERCENTAGE = 0.3;       // 30% del capitale
const TARGET_ODDS = 1.6;            // Quota target
const MIN_ODDS = 1.4;               // Quota minima
const MAX_ODDS = 2.0;               // Quota massima
const MAX_EVENTS = 2;               // Max eventi per multipla
const PREFERRED_EVENTS = 2;         // Eventi preferiti

const MIN_CONFIDENCE = 65;          // Confidence minima
const MIN_EXPECTED_VALUE = 0.12;    // EV minimo (12%)
const MIN_VALUE_RATING = 3;         // Value rating minimo
```

## 📊 Interpretazione Output

### Esempio Output:
```
═══════════════════════════════════════════════════════
           🎯 SCHEDINA CONSIGLIATA
═══════════════════════════════════════════════════════

📅 Data: 2025-11-22
📊 Quota totale: 1.63
🎲 Eventi: 1
💰 Stake consigliato: 30% del capitale

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. FC Köln vs Eintracht Frankfurt
   🏆 Bundesliga
   🕐 Orario: 17:30
   ⚽ Scommessa: 1X @1.63
   📊 Confidence: 84.0%
   💎 Expected Value: 7.6%
   ⭐ Value Rating: 3/5
   🎲 Score: 27.9
   💡 [Reasoning del sistema]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 ESEMPIO CON CAPITALE €100.00:
   Stake: €30.00
   Vincita potenziale: €48.90
   Profitto potenziale: +€18.90 (+18.9%)
```

### Metriche Chiave:

- **Confidence**: Affidabilità della predizione (min 65%)
- **Expected Value**: Valore atteso del bet (min 12%)
- **Value Rating**: Stelle da 1 a 5 (min 3)
- **Score**: Punteggio composito per ranking
  - Formula: `valueRating * 0.4 + confidence * 0.3 + expectedValue * 0.2 + oddsBonus`

## ⚠️ Note Operative

### Prima di Giocare:
1. ✅ **Verifica quote attuali** - Le quote possono cambiare
2. ✅ **Controlla stato partite** - Verifica che siano ancora in programma
3. ✅ **Conferma orari** - Gli orari sono in fuso Europe/Rome
4. ✅ **Gestisci capitale** - Non superare lo stake consigliato

### Quando NON Giocare:
- ❌ Nessuna schedina trovata con i parametri
- ❌ Confidence < 65%
- ❌ Expected Value < 12%
- ❌ Quote fuori range (< 1.40 o > 2.00)

## 🔄 Differenze con Backtest

| Feature | Backtest | Uptest |
|---------|----------|--------|
| **Scopo** | Analisi storica | Predizioni future |
| **Input** | Range date passate | Singola data futura |
| **Filtro partite** | Solo FT (finite) | Solo in programma |
| **Output** | Report ROI/Win Rate | Schedina da giocare |
| **Verifica risultati** | ✅ Con score reali | ❌ Da giocare |
| **Capitale tracking** | ✅ Con compounding | ❌ Esempio illustrativo |

## 🎲 Strategia di Selezione

### Step 1: Raccolta Partite
- Carica tutte le partite della data specificata
- Filtra solo partite in programma (non ancora giocate)

### Step 2: Analisi Raccomandazioni
- Per ogni partita richiede raccomandazioni all'API
- Applica filtri di qualità (confidence, EV, value rating)
- Calcola score composito per ranking

### Step 3: Generazione Multipla
- Ordina eventi per score (migliori primi)
- Prova combinazioni da PREFERRED_EVENTS
- Cerca quota più vicina a TARGET_ODDS
- Rispetta range MIN_ODDS - MAX_ODDS

### Step 4: Output Schedina
- Visualizza eventi selezionati con dettagli completi
- Mostra calcolo stake e vincita potenziale
- Fornisce note operative e avvertenze

## 🛠️ Troubleshooting

### Nessuna partita trovata
```bash
⚠️  Nessuna partita trovata per 2025-11-22
```
**Causa**: Data senza partite programmate
**Soluzione**: Prova con un'altra data (weekend o infrasettimanale)

### Nessuna raccomandazione valida
```bash
⚠️  Nessun evento con raccomandazioni valide
```
**Causa**: Nessuna partita supera i filtri di qualità
**Soluzione**: 
- Riduci MIN_CONFIDENCE a 60%
- Riduci MIN_EXPECTED_VALUE a 0.10
- Riduci MIN_VALUE_RATING a 2

### API non risponde
```bash
❌ Errore: fetch failed
```
**Causa**: API non in esecuzione
**Soluzione**: 
```bash
cd api && npm run dev
```

## 📈 Performance Attese

Basato su backtest Set-Nov 2025:
- **Win Rate atteso**: 65-77%
- **ROI atteso**: Variabile (Q1: -28%, Q4: +736%)
- **Quote medie**: 1.60-1.65
- **Eventi per multipla**: 1-2

### ⚠️ Stagionalità
Il sistema mostra performance variabili per stagione:
- **Q4 (Set-Nov)**: ROI +736% ✅ OTTIMO
- **Q1 (Gen-Feb)**: ROI -28% ⚠️ CAUTELA
- **Q2 (Mar-Mag)**: ROI -85% ❌ EVITARE

**Raccomandazione**: Usa stake ridotto in Q1/Q2.

## 🔐 Sicurezza

- ✅ Nessun dato sensibile memorizzato
- ✅ Nessuna connessione a bookmaker
- ✅ Solo raccomandazioni, mai esecuzione automatica
- ✅ L'utente mantiene sempre il controllo

## 📝 Changelog

### v1.0.0 - 16/11/2025
- ✨ Release iniziale
- ✅ Supporto date future
- ✅ Filtri qualità identici a backtest
- ✅ Output formattato con colori
- ✅ Calcolo stake e vincite potenziali
- ✅ Note operative e avvertenze

## 🚀 Sviluppi Futuri

- [ ] Modalità multi-data (range date future)
- [ ] Export schedina in formato JSON/CSV
- [ ] Integrazione con API bookmaker per quote live
- [ ] Sistema di notifiche pre-partita
- [ ] Tracking storico delle schedine giocate
- [ ] Dashboard web per visualizzazione

## 📞 Support

Per problemi o domande:
1. Verifica che l'API sia in esecuzione
2. Controlla i log per errori specifici
3. Valida formato data e parametri
4. Testa con date diverse

## ⚖️ Disclaimer

**IMPORTANTE**: Questo è un sistema di supporto alle decisioni, NON un sistema di gioco automatico.

- ❌ Non garantisce vincite
- ❌ Non sostituisce l'analisi personale
- ❌ Non è consulenza finanziaria
- ✅ Usa sempre responsabilmente
- ✅ Gioca solo ciò che puoi permetterti di perdere
- ✅ Consulta esperti se hai problemi con il gioco

Il gioco d'azzardo può creare dipendenza. Gioca responsabilmente.
