# 🎯 Sistema di Raccomandazioni Intelligenti e Generatore Schedine

## 📋 Panoramica

Il sistema di raccomandazioni intelligenti analizza automaticamente i dati delle partite e suggerisce le migliori giocate basandosi su:
- **Probabilità** matematiche dei risultati
- **Confidence** della predizione
- **Value Rating** (rapporto qualità/rischio)
- **Strength** dell'analisi statistica

## ✨ Funzionalità Principali

### 1. **Raccomandazioni Intelligenti nella Pagina Analisi**

Quando analizzi una singola partita, vedrai una sezione dedicata con:

- **Top 5 raccomandazioni** ordinate per valore
- **Statistiche dettagliate** per ogni giocata:
  - Probabilità di successo (%)
  - Quota stimata
  - Value Rating (0-100)
  - Livello di rischio (LOW/MEDIUM/HIGH)
  - Reasoning (spiegazione del perché è consigliata)

#### Tipi di Scommesse Supportate:
- **1X2**: Risultato finale (1, X, 2)
- **Doppia Chance**: 1X, 12, X2
- **Over/Under**: 1.5, 2.5 goal
- **BTTS**: Goal/No Goal (entrambe segnano)
- **Combo**: 1+Goal, 1X+Over2.5, 2+Over1.5, ecc.

### 2. **Generatore Schedina Automatica**

Un sistema rivoluzionario che:
1. Analizza **TUTTE** le partite del giorno
2. Estrae le migliori giocate da ogni match
3. Genera una **schedina ottimizzata** con N eventi selezionati

#### Come Funziona:

**Passo 1**: Clicca su "🎰 Genera Schedina Automatica" nella home page

**Passo 2**: Configura i parametri:
- **Numero Eventi**: 2-10 (quanti eventi vuoi nella schedina)
- **Probabilità Minima**: 50%-90% (filtra per probabilità)
- **Rischio Massimo**: LOW/MEDIUM/HIGH
- **Quote**: Range min-max (es. 1.30-3.00)
- **Includi Combo**: SI/NO (scommesse combinate)

**Passo 3**: L'algoritmo:
1. Analizza tutte le partite del giorno (può richiedere 30-60 secondi)
2. Genera raccomandazioni per ogni match
3. Filtra in base ai tuoi parametri
4. Seleziona i migliori N eventi diversificando i match
5. Calcola quota totale, probabilità combinata e vincita stimata

**Passo 4**: Ricevi la schedina pronta con:
- Quota totale
- Probabilità combinata di vincita
- Vincita stimata su 10€
- Confidence media
- Dettagli per ogni evento

**Passo 5**: Copia negli appunti con un click!

## 🎲 Algoritmo di Selezione

### Calcolo Value Rating (0-100)

```typescript
valueRating = probabilità × confidence × strengthMultiplier
```

Dove:
- `probabilità`: 0-1 (es. 0.65 = 65%)
- `confidence`: 0-1 (affidabilità complessiva)
- `strengthMultiplier`: 
  - STRONG: 1.3x
  - MEDIUM: 1.15x
  - WEAK: 1.0x
  - ND: 0.8x

### Criteri di Raccomandazione

#### 1X2 (Risultato Finale)
- ✅ Raccomandato se: `prob ≥ 45%`
- 🟢 LOW risk se: `prob ≥ 60%`
- 🟡 MEDIUM risk se: `50% ≤ prob < 60%`
- 🔴 HIGH risk se: `prob < 50%`

#### Doppia Chance
- ✅ Raccomandato se: `prob ≥ 70%`
- Sempre LOW risk (copre 2 esiti su 3)

#### Over/Under 2.5
- ✅ Raccomandato se: `prob ≥ 60%`
- 🟢 LOW risk se: `prob ≥ 70%`

#### Over 1.5
- ✅ Raccomandato se: `prob ≥ 75%`
- Quasi sempre LOW risk

#### BTTS (Goal/No Goal)
- ✅ Raccomandato se: `prob ≥ 60%`
- 🟢 LOW risk se: `prob ≥ 70%`

#### Combo (Scommesse Combinate)
- **1 + Over 1.5**: Se `prob1 ≥ 50%` AND `probOver1.5 ≥ 70%`
- **1 + Goal**: Se `prob1 ≥ 50%` AND `probBTTS ≥ 60%`
- **1X + Over 2.5**: Se `prob1X ≥ 75%` AND `probOver2.5 ≥ 60%`
- Sempre MEDIUM risk (probabilità combinata più bassa)

## 📊 Esempi Pratici

### Esempio 1: Partita Scontata (Favorito Netto)
```
Real Madrid vs Granada
- Probabilità 1: 75%
- Confidence: 85%
- xG: 2.8 vs 0.9

Raccomandazioni:
1. ✅ Vittoria Casa (1) - Value: 95/100, Risk: LOW
   Prob: 75%, Quota: ~1.33
   
2. ✅ 1 + Over 1.5 - Value: 88/100, Risk: MEDIUM
   Prob: 68%, Quota: ~1.60
   
3. ✅ 12 (No Pareggio) - Value: 82/100, Risk: LOW
   Prob: 92%, Quota: ~1.09
```

### Esempio 2: Partita Equilibrata (Molti Goal Attesi)
```
Liverpool vs Arsenal
- Probabilità 1: 42%, X: 28%, 2: 30%
- Confidence: 75%
- xG: 2.1 vs 1.9

Raccomandazioni:
1. ✅ Over 2.5 Goal - Value: 92/100, Risk: MEDIUM
   Prob: 68%, Quota: ~1.47
   
2. ✅ Goal (BTTS YES) - Value: 88/100, Risk: LOW
   Prob: 72%, Quota: ~1.39
   
3. ✅ 12 (No Pareggio) - Value: 85/100, Risk: LOW
   Prob: 72%, Quota: ~1.39
```

### Esempio 3: Partita Difensiva
```
Atletico Madrid vs Getafe
- Probabilità 1: 55%, X: 28%, 2: 17%
- Confidence: 70%
- xG: 1.4 vs 0.8

Raccomandazioni:
1. ✅ 1X (Casa non perde) - Value: 90/100, Risk: LOW
   Prob: 83%, Quota: ~1.20
   
2. ✅ Under 2.5 Goal - Value: 85/100, Risk: MEDIUM
   Prob: 65%, Quota: ~1.54
   
3. ✅ No Goal (BTTS NO) - Value: 78/100, Risk: MEDIUM
   Prob: 62%, Quota: ~1.61
```

## 🎯 Strategie Consigliate

### Strategia Conservativa (Sicurezza)
```
Config:
- Eventi: 3-4
- Prob Minima: 70%
- Rischio: LOW
- Quote: 1.20-1.80

Risultato tipico:
- Quota totale: 2.0-4.0
- Probabilità: 40-55%
- Vincita su 10€: 20-40€
```

### Strategia Bilanciata (Consigliata)
```
Config:
- Eventi: 4-5
- Prob Minima: 60%
- Rischio: MEDIUM
- Quote: 1.30-2.50

Risultato tipico:
- Quota totale: 5.0-10.0
- Probabilità: 25-35%
- Vincita su 10€: 50-100€
```

### Strategia Aggressiva (Alto Rischio/Rendimento)
```
Config:
- Eventi: 6-8
- Prob Minima: 55%
- Rischio: HIGH
- Quote: 1.40-3.00

Risultato tipico:
- Quota totale: 15.0-50.0
- Probabilità: 10-20%
- Vincita su 10€: 150-500€
```

## 💡 Consigli Utili

### ✅ DA FARE:
1. **Diversifica**: Non mettere troppi eventi della stessa lega
2. **Verifica la Confidence**: Schedine con confidence media >60% sono più affidabili
3. **Controlla gli xG**: Valori realistici indicano predizioni migliori
4. **Usa le Combo con saggezza**: Riducono la probabilità ma aumentano la quota
5. **Gioca responsabilmente**: Usa sempre una percentuale minima del bankroll

### ❌ DA EVITARE:
1. **Non esagerare con gli eventi**: >8 eventi = probabilità bassissima
2. **Non ignorare il rischio**: Schedine con troppi HIGH risk raramente vincono
3. **Non inseguire le quote alte**: Quote >5.0 per evento sono molto rischiose
4. **Non giocare senza verificare**: Controlla sempre l'analisi dettagliata
5. **Non giocare più di quanto puoi permetterti di perdere**

## 🔧 Parametri Avanzati

### Quote Minima e Massima
- **Quota Min (1.20-2.00)**: Filtra eventi troppo scontati
- **Quota Max (1.50-10.0)**: Filtra eventi troppo rischiosi

*Esempio*: Quote 1.30-2.50 = Eventi con probabilità 40-77%

### Includi Combo
- **SI**: Include scommesse combinate (es. 1+Goal)
  - Pro: Quote più alte, value migliore
  - Contro: Probabilità più bassa
- **NO**: Solo scommesse singole
  - Pro: Probabilità più alta, più sicuro
  - Contro: Quote più basse

## 📈 Statistiche e Tracking

Ogni schedina generata include:
- **Quota Totale**: Moltiplicazione di tutte le quote
- **Probabilità Combinata**: P(evento1) × P(evento2) × ... × P(eventoN)
- **Vincita Stimata**: Quota Totale × Importo Giocato (default 10€)
- **Confidence Media**: Media delle confidence di tutti gli eventi

## 🎓 Glossario

- **Value Rating**: Indice di convenienza (0-100). Più alto = migliore rapporto rischio/rendimento
- **Confidence**: Affidabilità della predizione (0-100%). Basata su qualità dati, consistency, ecc.
- **Strength**: Forza dell'analisi statistica (STRONG/MEDIUM/WEAK/ND)
- **Probability**: Probabilità matematica che l'evento si verifichi (0-100%)
- **Odds**: Quota stimata del bookmaker (1/probabilità)
- **Risk**: Livello di rischio (LOW/MEDIUM/HIGH)
- **xG**: Expected Goals - goal attesi statisticamente
- **BTTS**: Both Teams To Score - entrambe segnano
- **Combo**: Scommessa combinata (es. 1+Over2.5 = vittoria casa E almeno 3 goal)

## ⚠️ Disclaimer

Questo è un **sistema di analisi statistica** e **NON garantisce vincite**.

Le probabilità sono basate su:
- Dati storici
- Algoritmi di machine learning
- Modelli matematici (Poisson, Dixon-Coles)
- Form momentum
- Head-to-head
- Expected Goals (xG)

**GIOCA RESPONSABILMENTE**:
- Non giocare più di quanto puoi permetterti di perdere
- Le scommesse devono essere un divertimento, non una fonte di reddito
- Se hai problemi con il gioco, cerca aiuto professionale
- Questo sistema è solo un supporto decisionale, la scelta finale è sempre tua

---

**Made with ❤️ by CALCIO-PRED AI**
