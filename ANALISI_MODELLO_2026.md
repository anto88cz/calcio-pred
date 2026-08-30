# Analisi Modello Predittivo — calcio-pred

**Data analisi:** 2026-08-29 · **Commit analizzato:** `5941693` (ultimo commit 2026-01-26)
**Scope:** correttezza matematica delle predizioni, integrità del backtest, roadmap di miglioramento.

> **Aggiornamento 2026-08-29 — Fase 1 applicata.** I 7 fix immediati sono in working tree
> (non committati). Dettaglio e verifiche in [§6](#6-stato-dei-fix-fase-1-applicata).
> Restano aperti: C5 (ROI del backtest), C6 (look-ahead), G9, G11, M12.
>
> **Aggiornamento 2026-08-30 — misurato.** C5, C6, G11 chiusi. Due difetti nuovi trovati
> e corretti (§7). Il modello è stato misurato onestamente contro la closing line per la
> prima volta, e il Dixon-Coles MLE della Fase 2 è implementato. Verdetto in [§7](#7-la-prima-misura-onesta)
> e [§8](#8-fase-2--dixon-coles-a-massima-verosimiglianza): **nessuno dei due modelli batte
> il mercato**, e il peso ottimale del modello in un blend con le quote è zero.

---

## 1. Mappa del sistema

```
frontend (Next.js)
   └── api (Express + Prisma + Redis)
        ├── /predictions      → services/prediction/engine.ts      [PREDITTORE A]
        ├── /betting-recommendations → services/ml-prediction/ml-algorithm.service.ts [PREDITTORE C]
        └── /backtest         → services/backtesting/backtester.ts
Dati: Sportsmonks v3 (fixtures, odds, lineups, injuries, statistics)
```

### 1.1 Tre predittori paralleli e scollegati

| # | Modulo | Metodo | Usato da |
|---|--------|--------|----------|
| **A** | `prediction/engine.ts` + `empiric.ts` + `poisson.ts` + `blender.ts` | Empirico (55%) ⊕ Poisson/Dixon-Coles (45%) | endpoint `/predictions`, frontend analisi |
| **B** | `ml-prediction.service.ts` | Poisson attacco/difesa + Dixon-Coles + fattori stagionali | chiamato *dentro* l'engine A, ma output solo informativo |
| **C** | `ml-prediction/ml-algorithm.service.ts` | Media pesata di 4 sigmoidi euristiche (H2H, forma, stats, xG) | endpoint `/betting-recommendations` → **è quello che genera le giocate e che è stato backtestato** |

I tre modelli usano **matematica incompatibile** e producono probabilità diverse per la stessa partita.
Il predittore C — quello che decide le puntate reali — non è nemmeno un modello di Poisson: la probabilità di pareggio è **hardcoded a 0.25/0.27** (`ml-algorithm.service.ts:571,587,603`).

---

## 2. I calcoli sono corretti? — **No.** 12 difetti verificati

Ordinati per impatto. Ogni voce è stata verificata numericamente o per lettura diretta del codice.

### 🔴 CRITICI — invalidano i numeri prodotti

#### C1. Over/Under invertiti nel motore empirico
`prediction/empiric.ts:222`
```ts
const over = this.normalCDF(threshold, expectedGoals, Math.sqrt(avgVariance));
```
`normalCDF(x, μ, σ)` restituisce **P(gol ≤ soglia)**, cioè l'**Under**. Viene assegnato a `over`.

Verifica numerica (μ = 2.8 gol attesi, σ² = 1.3):

| Soglia | Codice dice "Over" | Valore corretto |
|--------|--------------------|-----------------|
| 0.5 | 2.2% | **97.8%** |
| 2.5 | 39.6% | **60.4%** |
| 4.5 | 93.2% | **6.8%** |

Il motore empirico pesa **55%** nel blend → tutti i mercati Over/Under dell'endpoint `/predictions` sono capovolti. Conferma indiretta: `blender.ts:180` logga di continuo `Over monotonicity violation`, e la funzione che lo correggerebbe (`fixOverMonotonicity`, `blender.ts:208`) **non è mai chiamata da nessuna parte**.

**Fix:** `const under = normalCDF(...); const over = 1 - under;`

#### C2. Dixon-Coles con ρ di segno invertito e non vincolato → probabilità negative
`prediction/poisson.ts:56,359`

Il codice usa ρ **positivo** (0.05–0.18) e commenta «RHO è POSITIVO perché tau11 = 1 - rho DEVE ridurre 1-1». Nel modello Dixon-Coles originale ρ è negativo: la correzione **aumenta** 0-0 e 1-1 (empiricamente sottostimati dalla Poisson indipendente) e riduce 1-0/0-1. Qui fa l'esatto contrario.

Peggio: `τ(0,0) = 1 − λ_home·λ_away·ρ` non ha vincolo di positività. Con ρ = 0.18:

| λ_home | λ_away | ρ | τ(0,0) |
|--------|--------|---|--------|
| 2.2 | 1.6 | 0.15 | 0.472 |
| 2.8 | 2.0 | 0.18 | **−0.008** |
| 3.0 | 2.5 | 0.18 | **−0.350** |
| 4.0 | 4.0 | 0.18 | **−1.880** |

Ogni partita con λ_h·λ_a > 5.56 produce una **probabilità negativa** per lo 0-0, che viene poi normalizzata insieme al resto della matrice (`normalizeMatrix`) senza alcun controllo. La matrice non è più una distribuzione di probabilità.

Nota: `ml-prediction.service.ts:262` usa ρ = **−0.13** (segno corretto) → i due motori si correggono in direzioni opposte.

**Fix:** ρ ≈ −0.03…−0.13 stimato per lega via MLE; clamp `max(-1/(λh·λa), min(1/λh, 1/λa, ρ))`.

#### C3. Forma, H2H, infortuni e forza-lega non hanno alcun effetto sulle probabilità
`prediction/engine.ts:177, 199, 236, 267`

```ts
const poissonResult = poissonEngine.calculate(...);   // riga 162 — matrice + tutte le prob calcolate QUI
poissonResult.lambdaHome *= homeForm.formFactor;       // riga 177
poissonResult.lambdaHome *= h2hStats.h2hFactor.home;   // riga 199
poissonResult.lambdaHome *= injuriesAnalysis...;       // riga 236
poissonResult.lambdaHome *= leagueStrength.coefficient;// riga 267
```

`generateScoreMatrix` viene invocata **una sola volta**, dentro `calculate()`. I quattro aggiustamenti mutano il campo `lambdaHome` *dopo* che matrice, 1X2, U/O, BTTS e DC sono già stati calcolati. Sono **codice morto**: cambiano solo il numero mostrato a video e i log («totalBoost: +18%») che raccontano un adattamento mai avvenuto.

Il modulo `form-momentum.ts` (297 righe), `league-strength.ts` (320 righe) e la logica H2H sono quindi inerti.

**Fix:** costruire λ finale prima, poi generare la matrice una volta sola.

#### C4. Kelly Criterion sempre saturato al massimo
`ml-prediction/betting-recommendations.service.ts:389`
```ts
const modelProbability = Math.max(0.01, Math.min(0.99, r.modelProbability));
```
`r.modelProbability` è memorizzato **in percentuale** (`modelProbability: prob * 100`, righe 586, 609, 632, 676, … 28 occorrenze). Quindi 45% → `45` → clamp → **0.99 sempre**.

Conseguenze: `kellyF ≈ 0.99` → `fractionalKelly ≈ 0.495` → clamp a `maxStake` → **`kellyStake = 0.15` per ogni singola scommessa**, `kellyRecommendation = 'HIGH'` per tutte, e `finalStakeMultiplier = min(3, stakeMultiplier × 1.5)`. Il money management non esiste.

**Fix:** `r.modelProbability / 100`.

#### C5. Il backtest ROI misura zero per costruzione
`backtesting/backtester.ts:492, 518`
```ts
const fairOdds = 1 / maxProb;   // "quota equa" = 1/probabilità del modello
```
Il ROI viene simulato pagando le vincite alla **quota implicita del modello stesso**, non a quella del bookmaker. Due conseguenze matematiche:

- **Flat betting**: se il modello fosse calibrato, ROI = 0 esatto. Qualsiasi valore ≠ 0 misura solo l'errore di calibrazione, **non** la profittabilità. Manca del tutto il margine del bookmaker (~5–7%), che è la soglia reale da battere.
- **Kelly**: con `b = (1−p)/p` si ha `(b·p − q)/b = (q − q)/b = 0` → **`kellyFraction` è identicamente 0**, lo stake è sempre 0, il ROI Kelly è **sempre esattamente 0**. Metrica morta.

Inoltre `strengthFiltered` filtra su `'FORTE'` (righe 320, 467) ma l'enum `PredictionStrength` contiene `'STRONG'` — la stringa `'FORTE'` non esiste: il filtro seleziona di fatto solo `GIOCALA`.

#### C6. Look-ahead leakage nel backtest che produce il "+3.89% ROI"
`backtest-month.mjs:98` chiama `POST /betting-recommendations` **senza passare `fixtureDate`**, benché la rotta lo supporti (`betting-recommendations.routes.ts:16,43`). Senza `maxDate`, `getTeamHistory` scarica le fixture fino a **oggi** (`statistics.ts:309`) → per una partita di ottobre 2025 lo storico include partite di novembre. Il report `BACKTEST_REPORT_MONTH.md` (49.6% win rate, ROI +3.89%) è quindi calcolato con conoscenza del futuro.

Altre tre fonti di leakage nello stesso percorso:
- **Cache non temporale**: `statistics.ts:262` — `sportsmonks:history:{teamId}:{seasonId}:{limit}` non include `maxDate`. Anche passando `fixtureDate`, la prima richiesta popola la cache e tutte le date successive riusano lo stesso storico.
- **H2H senza limite temporale**: `getHeadToHead` (`statistics.ts:~500`) non accetta `maxDate` → include scontri diretti successivi alla partita predetta.
- **xG della partita stessa**: `engine.ts:96` → `getExpectedGoals(fixtureId)` legge le **statistiche post-partita** del match da predire (`statistics.ts:179`; se l'xG manca lo stima da `shots_on_target` di quella stessa partita) e le miscela nel λ al 25%. In produzione è nullo, in backtest è il risultato.
- **Cache raccomandazioni permanente**: `betting-recommendations.routes.ts:24,91` — chiave `betting_recs:{fixtureId}` senza TTL e senza `fixtureDate`; ri-eseguire il backtest dopo una correzione restituisce i risultati vecchi.

### 🟠 GRAVI — bias sistematico

#### G7. Expected goals gonfiati del ~19% (e le vittorie casalinghe del ~40%)
`ml-prediction.service.ts:405-410`
```ts
const awayDefenseRatio = awayStrength.defense / leagueAvgAway;             // ← denominatore sbagliato
const homeDefenseRatio = homeStrength.defense / (leagueAvgHome / homeAdvantage);
```
`awayStrength.defense` = gol subiti dalla trasferta **in trasferta** ≈ gol segnati dalle squadre di casa ≈ `leagueAvgHome` (1.485). Va normalizzato per `leagueAvgHome`, non per `leagueAvgAway` (1.215). Il rapporto vale ~1.22 per una squadra perfettamente media invece di 1.0.

Verifica su partita media-contro-media (leagueAvgGoals = 2.7, Q4):

| | Modello | Reale |
|---|---|---|
| xG casa | **2.08** | 1.49 |
| xG trasferta | 1.14 | 1.22 |
| **Totale** | **3.22** | **2.70** |

+40% sulla casa, +19% sul totale. Questo spiega esattamente il sintomo già documentato in `summary-current-status.md`: *«Accuratezza bassa: 30% — causa principale: OVERPREDIZIONE HOME WINS»*.

#### G8. Vantaggio casa contato due volte
Lo storico è già separato per campo: `getTeamHistoryByVenue(..., isHome=true)` → `homeStrength.attack` è **già** la media dei gol segnati in casa. Poi si applica di nuovo un moltiplicatore casa: `homeAdvGoals = +0.15` in `engine.ts:165` e `homeAdvantage = 1.1–1.2` in `ml-prediction.service.ts:389`. Doppio conteggio.

#### G9. La formula 1X2 del motore empirico non è un modello di probabilità
`prediction/empiric.ts:186-188`
```ts
prob1 = homeWinRate * (1 - awayWinRate);
prob2 = awayWinRate * (1 - homeWinRate);
probX = (homeDrawRate + awayDrawRate) / 2;
```
Assume indipendenza tra «casa vince» e «trasferta vince» — eventi mutuamente esclusivi — e poi normalizza. Non tiene conto della forza dell'avversario, del vantaggio casa, né della lega. Con 55% di peso nel blend, domina il risultato finale.

#### G10. Calibrazione di mercato silenziosamente disattivata + vig non rimosso
- `config/index.ts:136`: `oddsCalibrationEnabled: !!config.ODDS_API_KEY`. Le quote ora arrivano da Sportsmonks, ma se la vecchia `ODDS_API_KEY` non è impostata `calibrate()` **restituisce le probabilità non calibrate** pur avendo `marketOdds` valide (`calibration.ts:63`). Feature morta senza errori.
- `engine.ts:344`: `over25: 1 / realOdds.oddsOverUnder.over25` — l'1X2 viene de-viggato (`sportsmonks/odds.ts:186`) ma **Over/Under no**. Le due probabilità sommano ~1.05, e dopo il blend `over + under ≠ 1`.
- Concettuale: si mischia il 30% di mercato nelle probabilità e **poi** si cercano value bet contro lo stesso mercato. Ogni calibrazione verso il book erode per definizione l'edge che si sta misurando.

#### G11. Storico incompleto per limite di paginazione
`statistics.ts:~350`: per ottenere lo storico di **una** squadra si scaricano **tutte** le fixture di 13 leghe in finestre di 90 giorni, poi si filtra lato client — con un tetto di **3 pagine × 100 risultati per finestra**. Una finestra di 90 giorni su 13 campionati contiene migliaia di partite: oltre le prime 300 i dati vengono **scartati silenziosamente**. Lo storico non è «le ultime N partite», è «le partite capitate nelle prime 3 pagine». Coerente con il `Data Completeness media: 29.5%` riportato in `summary-current-status.md`.

### 🟡 MINORI

#### M12. Varie
- `strength.ts:88-113`: in `classifyOverUnder` il downgrade e l'upgrade xG si applicano in sequenza e si **annullano** quando entrambe le condizioni sono vere; i log stampano `originalStrength`/`adjustedStrength` scambiati o già mutati (idem `confidence.ts:57`, `poisson.ts:110`).
- `confidence.ts:262`: `lineupStatus` può valere 1.10 → la confidence «0–1» può superare 1 prima del clamp.
- `ml-prediction.service.ts:112`: `calculateDataQuality` normalizza su 20 partite, ma `HISTORY_GAMES = 10` e lo split casa/trasferta ne lascia ≤10 → la confidence è **strutturalmente ≤ 0.5**.
- `betting-recommendations.service.ts:1409`: le quote Doppia Chance sono sintetizzate da `1/(1/o1 + 1/o2)`, cioè con il vig 1X2 incorporato, e le combo moltiplicano quote assumendo indipendenza (1X e BTTS sono fortemente correlati) → EV gonfiato.
- `ml-algorithm.service.ts:544`: probabilità arrotondate a 2 decimali e **non ri-normalizzate** → somma 0.99–1.01, rumore ±1% su soglie di EV del 3%.
- **Zero test automatici** in tutto il repo. Nessun `jest`/`vitest`, nessun `*.test.ts`. 41 file `.md` di report e 20+ script di backtest ad-hoc nella root al posto di una suite.

### 🚩 Overfitting esplicito

Le soglie sono state ricavate a posteriori dai backtest e sono cablate nel codice:
- La Liga: `EV > 30% AND confidence ≥ 75%`; Champions: `EV > 15% AND confidence ≥ 70%` (`betting-recommendations.service.ts:243,258`).
- `valueRating <= 3` — le giocate a **5⭐ e 4⭐, cioè quelle a EV più alto, vengono scartate** (riga 180). È la firma di un modello mal calibrato: se l'EV alto correla con il perdere, non è EV.
- Fattori stagionali per trimestre con `homeAdvantage` 1.08→1.20 e `drawBoost` 0.95→1.15 (`ml-prediction.service.ts:38-85`), stimati su ~125 partite. Il ramo «Q3 Giugno-Agosto» copre la pausa estiva.
- Soglie `P(2) < 0.33`, `P(X) < 0.20` annotate con «92.9% win rate atteso» — percentuali derivate dallo stesso campione su cui sono state scelte.

Con 125 partite e 375 raccomandazioni, la differenza tra 49.6% e 53% è dentro il rumore (±2.6% di errore standard).

---

## 3. Verdetto

Il codice **implementa** Poisson, Dixon-Coles, Kelly ed Expected Value, ma:

1. il motore empirico ha Over/Under invertiti e domina il blend al 55%;
2. la correzione Dixon-Coles ha il segno sbagliato e genera probabilità negative sulle partite ad alto punteggio;
3. quattro dei cinque aggiustamenti «avanzati» (forma, H2H, infortuni, lega) non toccano le probabilità;
4. il Kelly è saturato al massimo su ogni scommessa per un errore di scala percentuale;
5. il ROI del backtest è calcolato a quote proprie, senza margine del bookmaker, con storico contaminato dal futuro.

**Nessuna delle metriche pubblicate nei report è affidabile.** Il valore reale del progetto è l'infrastruttura: integrazione Sportsmonks, cache Redis, schema Prisma, frontend, pipeline di backtest. La parte matematica va ricostruita.

---

## 4. Roadmap

### Fase 0 — Fondamenta (prerequisito a qualsiasi misura)

| # | Intervento | File |
|---|-----------|------|
| 0.1 | Test unitari sulla matematica: Poisson somma a 1, τ ∈ (0,1], monotonia Over, U/O somma a 1, DC = somma 1X2 | nuovo `api/src/**/*.test.ts` (vitest) |
| 0.2 | Un solo predittore. Eliminare due dei tre; il candidato è il Poisson bivariato di A, con C dismesso | `ml-algorithm.service.ts`, `ml-prediction.service.ts` |
| 0.3 | Backtest walk-forward onesto: `fixtureDate` obbligatorio, `maxDate` in **tutte** le chiavi di cache, xG del match target vietato, H2H filtrato per data | `backtest-*.mjs`, `statistics.ts:262`, `routes:24` |
| 0.4 | ROI su quote **reali di chiusura** meno margine; separare train (stagioni passate) e test (mai visto) | `backtester.ts:492` |
| 0.5 | Dataset locale: scaricare una volta 3–5 stagioni in Postgres e calcolare offline. Elimina il limite di 3 pagine (G11), il rate limit e rende i backtest riproducibili | nuovo `scripts/ingest-history.ts` |

### Fase 1 — Correzioni immediate (alto impatto, poche righe)

1. `empiric.ts:222` — invertire Over/Under. **Una riga.**
2. `betting-recommendations.service.ts:389` — `r.modelProbability / 100`. **Una riga.**
3. `poisson.ts` — ρ negativo + clamp di positività su τ.
4. `engine.ts:162-270` — spostare tutti i moltiplicatori di λ **prima** di `generateScoreMatrix`.
5. `ml-prediction.service.ts:405` — normalizzare la difesa avversaria per la media del **lato opposto**.
6. Rimuovere `homeAdvGoals`/`homeAdvantage` finché λ deriva da storico già separato per campo.
7. De-viggare anche Over/Under; sbloccare `oddsCalibrationEnabled` dal legacy `ODDS_API_KEY`.

### Fase 2 — Modello corretto

**Sostituire i tre motori con un Dixon-Coles a massima verosimiglianza**, che è già la direzione tentata:

```
λ_home = exp(α_home + β_away + γ)      γ = vantaggio casa, stimato
λ_away = exp(α_away + β_home)
L(θ) = Σ_k φ(t_k) · log[ τ_ρ(x_k,y_k) · P(x_k;λ_h) · P(y_k;λ_a) ]
```

- α (attacco) e β (difesa) per squadra, γ e ρ per **lega**, stimati con Nelder-Mead o gradiente su 2–3 stagioni.
- Vincolo di identificabilità Σα = 0.
- Pesi temporali `φ(t) = exp(-ξ·Δt)`; **ξ scelto per cross-validation**, non a fasce cablate a mano.
- Un solo passaggio: niente moltiplicatori ex-post che si accumulano senza controllo.
- Riferimento: Dixon & Coles (1997), *Modelling Association Football Scores*. ~250 righe in TypeScript, e sostituisce ~2000 righe attuali.

**Alternativa più forte:** modello su xG invece che sui gol. L'xG è molto più stabile del risultato (i gol hanno varianza enorme su 10 partite). Servono però xG **pre-partita** — media mobile degli xG delle partite precedenti — non gli xG della partita da predire.

### Fase 3 — Calibrazione (il vero collo di bottiglia)

Il segnale che il modello è scalibrato è già nei report: *«5⭐ (EV ≥40%) → 32.6% win rate; 3⭐ → 50%»*. Un modello calibrato non produce EV del 40% su un mercato liquido.

1. **Misurare** con le metriche giuste: **Brier score** e **log-loss** vs. baseline «quote del bookmaker de-viggate». Battere il book su log-loss è la sola prova che il modello serva a qualcosa. L'accuracy sul 1X2 è quasi inutile (una baseline «sempre casa» fa ~45%).
2. **Reliability diagram** a 10 bin: probabilità predetta vs. frequenza reale.
3. **Calibrazione isotonica** o **Platt scaling** stimata su un fold separato — non a mano con `drawBoost` per trimestre.
4. **Shrinkage verso il mercato**: `p_finale = w·p_modello + (1−w)·p_mercato_devig`, con `w` scelto per **minimizzare il log-loss** fuori campione, non fissato a 0.70.

### Fase 4 — Feature che pagano davvero

In ordine di rapporto valore/costo:

1. **xG rolling pre-match** (attacco e difesa, ultime 8–10 partite) — il singolo miglioramento più consistente in letteratura.
2. **Rating Elo o Glicko per squadra**, con parametri stimati sulla storia — cattura la forza dell'avversario, oggi completamente assente da A.
3. **Riposo e congestione**: giorni dall'ultima partita, partita infrasettimanale, viaggio europeo a metà settimana.
4. **Assenze pesate per contributo**: gli infortuni oggi sono un contatore piatto (`confidence.ts:344`: qualunque infortunio = 0.35). Pesare per minuti giocati e quota-gol/assist del giocatore.
5. **Movimento delle quote** apertura → chiusura: proxy diretto dell'informazione che il mercato ha acquisito (formazioni, meteo, soldi intelligenti).
6. **Promosse/neomeste**: nessuna gestione dei team senza storico nella lega corrente; oggi cadono sul fallback fisso 1.3/1.3.

### Fase 5 — Scommesse

1. **Kelly frazionario vero** (¼ Kelly), con `p` dal modello calibrato e `b` dalla **quota migliore disponibile**, non dalla media dei bookmaker.
2. **Solo mercati liquidi**: 1X2 e Over/Under 2.5 hanno margini del 3–5%; le combo e i multigol arrivano al 15–20% — l'edge non esiste lì. Le combo sono anche calcolate assumendo indipendenza tra eventi correlati.
3. **Eliminare le soglie per lega**: sostituirle con un unico criterio `EV > soglia` calcolato su probabilità calibrate, validato out-of-sample.
4. **Closing Line Value** come metrica primaria: se le puntate battono sistematicamente la quota di chiusura, il modello ha edge reale — molto prima e con molto meno rumore rispetto ad aspettare che il ROI diventi significativo (servono ~1000+ scommesse).

---

## 5. Ordine consigliato

```
1. Fase 0.1 + 0.3 + 0.5   → poter misurare qualcosa di vero
2. Fase 1 (7 fix)         → poche righe, sbloccano i bug più gravi
3. Ri-misurare Brier/log-loss vs. mercato → base di partenza onesta
4. Fase 2 (Dixon-Coles MLE) → sostituisce i tre motori
5. Fase 3 (calibrazione)  → dove si guadagna davvero
6. Fase 4/5               → feature e staking
```

**Se c'è tempo per una sola cosa:** Fase 0.3 + 0.4 (backtest onesto). Senza una misura affidabile ogni «miglioramento» successivo è indistinguibile dal rumore — ed è esattamente quello che i 41 report `.md` nella root documentano: cicli di tuning su una metrica che non misurava ciò che sembrava misurare.

---

## 6. Stato dei fix — Fase 1 applicata

Applicati il 2026-08-29, `api/` type-check pulito (restano 3 errori pre-esistenti su
`moment-timezone`, dipendenza mancante in `package.json`, in file non toccati).

| # | Fix | File | Verifica |
|---|-----|------|----------|
| 1 | Over/Under invertiti | `prediction/empiric.ts:220-229` | ✅ runtime |
| 2 | Kelly con `p` in scala percentuale | `ml-prediction/betting-recommendations.service.ts:389-392` | ✅ runtime |
| 3 | RHO Dixon-Coles negativo + clamp di positività | `prediction/poisson.ts:21-103, 359` | ✅ runtime |
| 4 | Matrice ricalcolata dai λ finali | `prediction/poisson.ts:141-160`, `prediction/engine.ts:162, 285-303` | ✅ runtime |
| 5 | Difesa avversaria normalizzata sul lato corretto | `ml-prediction.service.ts:405-421` | ✅ runtime |
| 6 | Vantaggio casa non più contato due volte | `prediction/engine.ts:165`, `ml-prediction.service.ts:418`, `config/index.ts:41` | ✅ runtime |
| 7 | Over/Under de-viggato + calibrazione sbloccata | `prediction/engine.ts:339-360`, `config/index.ts:137-142` | ⚠️ solo type-check |

### Cosa è cambiato, in numeri

**Fix 3 — matrice Poisson.** Prima ogni partita con λ_h·λ_a > 5.56 produceva P(0-0) < 0.
Ora la matrice è una distribuzione valida su tutto l'intervallo di λ, e la correzione va nella
direzione di Dixon-Coles (addensa 0-0 e 1-1 invece di sopprimerli):

| λ casa × λ trasf. | min(matrice) | Σ | P(0-0) | P(1-1) |
|---|---|---|---|---|
| 1.2 × 0.9 | 3.8e-7 | 1.000000 | 13.84% | 14.82% |
| 2.8 × 2.0 | 5.0e-4 | 1.000000 | 1.08% | 4.98% |
| 4.0 × 4.0 | 7.6e-4 | 1.000000 | 0.08% | 0.71% |

**Fix 4 — gli aggiustamenti ora contano.** Applicando un fattore forma di 1.25 in casa e 0.90
in trasferta: P(1) 42.7% → **54.5%**, Over 2.5 50.6% → **56.5%**. Prima entrambi restavano fermi.

**Fix 1 — Over/Under.** Su una partita da ~3.1 gol attesi:

| | O0.5 | O1.5 | O2.5 | O3.5 | O4.5 |
|---|---|---|---|---|---|
| Prima | 2.2% | 12.7% | 39.6% | 73.0% | 93.2% |
| Ora | 99.8% | 94.7% | 64.8% | 19.4% | 1.8% |

Monotonia rispettata, `under + over = 1`. Sparisce il warning `Over monotonicity violation`.

**Fix 5+6 — xG.** Partita media-contro-media (leagueAvgGoals 2.7):

| | xG casa | xG trasf. | totale |
|---|---|---|---|
| Prima | 2.08 | 1.14 | 3.22 |
| Ora | **1.24** | 1.18 | **2.42** |
| Riferimento | 1.49 | 1.22 | 2.70 |

Il bias verso le vittorie casalinghe è rimosso. Resta una sottostima del ~10% sul totale,
dovuta al time-decay che pesa di più le partite recenti del campione di test — non un difetto
strutturale della formula.

**Fix 2 — Kelly.** Con p = 52% e quota 2.10: `kellyStake` passa da **15.00% fisso su ogni
scommessa** a **4.18%**, `kellyRecommendation` da `HIGH` a `LOW`.

### Note e cose lasciate fuori di proposito

- **Fix 7 non verificato a runtime**: il percorso quote richiede una API key Sportsmonks e una
  fixture reale. La matematica del de-vig (normalizzazione proporzionale su `1/over + 1/under`)
  è la stessa già usata per l'1X2 in `sportsmonks/odds.ts:186`.
- **`avgVariance` in `empiric.ts:214`** è la *media* delle due varianze di squadra; per la somma
  di due variabili indipendenti va la *somma*. La σ usata nella normale è quindi sottostimata di
  ~√2 e le probabilità Over/Under restano troppo estreme (O0.5 = 99.8% è alto anche per 3 gol
  attesi). È un difetto distinto dall'inversione, fuori dai 7 punti — una riga, `homeVariance + awayVariance`.
- **`finalStakeMultiplier = stakeMultiplier × (kellyStake × 10)`**
  (`betting-recommendations.service.ts:394`): ora che il Kelly è corretto questa composizione
  conta il sizing due volte (moltiplicatore euristico × frazione di Kelly). Andrebbe scelto uno
  dei due, non il prodotto. Fuori dai 7 punti.
- **`homeAdvGoals` resta nel config** come deprecato: non è più letto dall'engine, ma rimuoverlo
  del tutto romperebbe `calculationConfig`, usato altrove.
- Il **ramo di fallback** di `ml-prediction.service.ts` mantiene il moltiplicatore casa: lì
  `attack` è la media generica 1.3, non separata per campo, quindi il vantaggio serve davvero.
- **Non verificato end-to-end**: l'engine completo richiede Sportsmonks + Postgres + Redis.
  Testati i moduli di calcolo in isolamento.

---

## Appendice — Indice rapido dei difetti

| ID | File:riga | Difetto |
|----|-----------|---------|
| C1 | `prediction/empiric.ts:222` | Over/Under invertiti |
| C2 | `prediction/poisson.ts:56,359` | ρ Dixon-Coles di segno errato, τ(0,0) negativo |
| C3 | `prediction/engine.ts:177,199,236,267` | λ mutato dopo il calcolo della matrice |
| C4 | `ml-prediction/betting-recommendations.service.ts:389` | Kelly con p in scala % → sempre 0.99 |
| C5 | `backtesting/backtester.ts:492,518` | ROI a quote proprie; Kelly ROI ≡ 0; enum `'FORTE'` inesistente |
| C6 | `backtest-month.mjs:98`, `statistics.ts:262`, `routes:24` | Look-ahead: niente `fixtureDate`, cache non temporale, xG del match target |
| G7 | `ml-prediction.service.ts:405` | Normalizzazione difesa sul lato sbagliato → xG casa +40% |
| G8 | `engine.ts:165`, `ml-prediction.service.ts:389` | Vantaggio casa contato due volte |
| G9 | `prediction/empiric.ts:186` | Formula 1X2 non probabilistica |
| G10 | `config/index.ts:136`, `engine.ts:344` | Calibrazione disattivata; O/U non de-viggato |
| G11 | `sportsmonks/statistics.ts:~350` | Storico troncato a 3 pagine → dati persi in silenzio |
| M12 | vari | Log invertiti, confidence > 1, quote DC sintetiche, no test |


---

## 7. La prima misura onesta

**2026-08-30.** Backtest walk-forward su 1751 partite, stagione 2025-26, cinque campionati
(Premier League, La Liga, Serie A, Bundesliga, Ligue 1). ROI valutato sulle quote di
chiusura reali, calibrazione di mercato disattivata, nessun dato successivo alla partita
nella stima.

### 7.1 Due difetti nuovi, entrambi silenziosi

#### N13. Look-ahead da fuso orario — `statistics.ts`

Sportmonks v3 restituisce `"2026-01-10 13:00:00"`: UTC, separatore spazio, nessun suffisso di
fuso. `new Date(...)` su una stringa così applica il **fuso locale**, quindi in Italia ogni
data tornava indietro di 1-2 ore. Lo storico squadra viene filtrato con
`data < calcio d'inizio`, e due ore bastavano a far rientrare la partita nel proprio storico.

Verificato su Real Oviedo–Real Betis, inizio 13:00Z, finita 1-1:

```
storico Oviedo con cutoff 13:00Z → 45 partite, fra cui
  { id: 19439436, date: "2026-01-10T12:00:00Z", goals: [1,1] }   ← la partita stessa
```

Il modello calcolava i λ su uno storico che conteneva il risultato da predire.

Come si è visto, prima ancora di sapere la causa: **pareggi predetti indovinati al 54.3%**,
contro una frequenza reale del 25.4%. E ogni fascia del diagramma di affidabilità
sistematicamente sotto: dichiarato 48.5% → reale 61.4%.

Effetto sui numeri, stesse 1751 partite:

| | con il leak | senza |
|---|---|---|
| Log-loss | 0.871 | **1.044** |
| Brier | 0.171 | **0.208** |
| Accuracy 1X2 | 62.9% | **47.0%** |
| ROI flat @ closing | +41.2% | **−2.95%** |

`closing-odds.ts` e `import-season.ts` gestivano già il formato correttamente. Solo i due
percorsi che alimentano i modelli no. Il parsing è ora centralizzato in
`utils/sportmonks-date.ts`.

#### N14. `league-strength.ts` indicizzato con ID di un altro provider

`LEAGUE_STRENGTH_DATA` era indicizzata per ID **API-Football** (39 Premier League, 140 La
Liga, 135 Serie A), residuo della migrazione. Il sistema passa ID Sportmonks (8, 564, 384):
nessuna chiave corrispondeva mai, ogni partita cadeva su `DEFAULT_STRENGTH` e si prendeva
`coefficient: 0.85`, cioè **−15% su entrambi i λ**. Nei log: `league: "Unknown League"`.

Stessa classe dei dieci league ID sbagliati di `0de1ecd`. Un ID del provider sbagliato non
dà errore: risolve a qualcos'altro di plausibile.

Corretto con due scelte dichiarate: `coefficient: 1.00` per tutti i campionati nazionali —
il λ è già stimato sullo storico di quelle squadre *dentro* quel campionato, e scalarlo per
un indice di forza della lega conta due volte la stessa informazione — e default neutro con
warning, perché una lega non mappata non è una lega più debole.

### 7.2 Il baseline

| | modello (motore A) | mercato (closing de-viggata) |
|---|---|---|
| Log-loss | 1.0436 | **0.9774** |
| Brier | 0.2079 | **0.1940** |
| Accuracy 1X2 | 47.0% | **53.6%** |

Margine medio del banco: 5.76%. `beatsMarket: false`.

### 7.3 Simulazione di un conto da €100

`simulate-bankroll.ts` fa girare una strategia sulle predizioni del report, in ordine
cronologico, a quote di chiusura reali.

| strategia | giocate | ROI sul giocato | capitale finale |
|---|---|---|---|
| flat 2% | 984 | −3.80% | €31.67 |
| flat 2%, solo STRONG | 351 | −5.28% | €62.91 |
| flat 2%, solo EV ≥ +5% | 880 | −5.34% | €22.43 |
| quarto di Kelly | 673 | −6.41% | €5.78 |
| multipla giornaliera, 30% composto | 162 | −7.87% | **€0.20** |

L'ultima riga è la strategia di `backtest-multiple.js`. Due osservazioni.

Il 30% composto è rovinoso **anche con un edge reale**: a quota 1.4 una vincita moltiplica il
capitale per 1.12 e una perdita per 0.70, quindi il capitale cresce solo se la percentuale di
vincenti supera il **75.9%**, mentre il break-even in valore atteso è al 71.4%. Fra i due c'è
una fascia in cui la strategia ha EV positivo e il conto si svuota lo stesso.

E la ricerca della quota obiettivo produceva **1.0 eventi per schedina**: con target 1.4 e
minimo 1.4 la combinazione più vicina è sempre un singolo evento. Si giocavano singole
credendo di giocare multiple.

### 7.4 Il segnale diagnostico

In tutte le simulazioni:

```
EV medio dichiarato: +38.92%      (margine reale del banco: 5.76%)
```

E soprattutto: **alzare la soglia di EV peggiora il risultato**, da −3.80% a −5.34%. Se il
modello avesse un edge anche piccolo, selezionare le occasioni migliori dovrebbe migliorare
il ROI. Va nella direzione opposta.

### 7.5 Calibrazione: non è quello il problema

`analyze-calibration.ts` stima sulla prima metà della stagione e valuta sulla seconda.

Il log-loss si scompone in due parti: quanto le probabilità sono **oneste** e quanta
**informazione** contengono. Ricalibrare può sistemare la prima, non può creare la seconda.

- Errore medio di calibrazione fuori campione: **3.68 punti**. Il modello non è granché
  scalibrato.
- Temperature scaling trova T = 1.28 (lievemente troppo sicuro) e guadagna **0.007** di
  log-loss: 1.0446 → 1.0375.
- Isotonica stimata **e** valutata sugli stessi dati — che bara, ed è quindi il tetto massimo
  di qualunque ricalibrazione: **1.0134**. Il mercato sta a 0.9774. **Il soffitto della
  calibrazione perfetta non arriva al mercato.**
- Peso ottimale in `p = w·modello + (1−w)·mercato`, fuori campione: **w = 0.00**.

Conseguenza operativa verificata: con probabilità calibrate il simulatore **non piazza
nessuna scommessa**, perché nessuna selezione supera EV ≥ 0 contro un margine del 5.76%. Un
modello calibrato senza edge si rifiuta di giocare. Il +38.9% di EV medio era la
scalibratura.

---

## 8. Fase 2 — Dixon-Coles a massima verosimiglianza

`services/prediction/dixon-coles.ts`, ~340 righe, sostituisce la catena di moltiplicatori.

```
λ_casa      = exp(μ + attacco_casa + difesa_trasf + γ)
λ_trasferta = exp(μ + attacco_trasf + difesa_casa)
τ(0,0) = 1 − λ_c·λ_t·ρ     τ(0,1) = 1 + λ_c·ρ
τ(1,0) = 1 + λ_t·ρ         τ(1,1) = 1 − ρ
L(θ) = Σ_k φ(t_k)·[ log τ + x·log λ_c − λ_c + y·log λ_t − λ_t ]
```

Stima con Adam su gradienti analitici — Nelder-Mead, che la letteratura suggerisce spesso,
non regge con oltre duecento parametri. Vincolo di identificabilità: media di attacco e
difesa azzerata a ogni passo. `clampRho` garantisce τ > 0 per ogni coppia di λ, quindi la
matrice resta una distribuzione di probabilità su tutto l'intervallo.

Backtest **walk-forward**: ristima ogni settimana sulle sole partite precedenti, 37 ristime,
storico di partenza la stagione 2024-25 (1750 partite, importate con `import-season.ts`;
il piano Growth non espone nulla prima di agosto 2024).

### 8.1 Parametri stimati

```
μ     0.1637   → 1.18 gol attesi per squadra
γ     0.1888   → vantaggio casa ×1.208
ρ    −0.0409   → segno corretto, dentro l'intervallo della letteratura (−0.03…−0.13)
attacchi:  Bayern 0.79, Barcelona 0.67, Inter 0.65, PSG 0.58, Man City 0.45
difese:    Arsenal −0.63, PSG −0.47, Roma −0.44, Como −0.44, Juventus −0.44
```

Le graduatorie sono plausibili, il che è il primo controllo di sanità che il vecchio motore
non superava.

### 8.2 Il decadimento temporale, scelto e non deciso

`--tune` confronta il log-loss walk-forward su una griglia di ξ:

| ξ | emivita | log-loss | accuracy |
|---|---|---|---|
| 0.0000 | nessuna | 1.0304 | 50.7% |
| 0.0010 | 693 gg | 1.0294 | 51.1% |
| **0.0020** | **347 gg** | **1.0290** | 50.8% |
| 0.0030 | 231 gg | 1.0293 | 51.2% |
| 0.0050 | 139 gg | 1.0317 | 51.0% |
| 0.0080 | 87 gg | 1.0386 | 50.5% |
| 0.0120 | 58 gg | 1.0512 | 50.1% |

La curva è piatta fra 0 e 0.003 e peggiora nettamente sopra. Il messaggio è che **pesare molto
le partite recenti fa danno**: l'emivita ottimale è quasi un anno. Il vecchio motore applicava
fattori di forma sulle ultime 5-10 partite con pesi cablati a mano; questa misura dice che
quella direzione era sbagliata, non solo non validata.

### 8.3 Risultati

| | motore A (vecchio) | Dixon-Coles MLE | mercato |
|---|---|---|---|
| Log-loss | 1.0436 | **1.0290** | 0.9774 |
| Brier | 0.2079 | **0.2014** | 0.1940 |
| Accuracy 1X2 | 47.0% | **50.8%** | 53.6% |

Migliora su ogni metrica, con un decimo del codice. **Ma non basta:** resta 0.052 di log-loss
dietro il mercato, e il peso ottimale in un blend con le quote è **ancora w = 0.00**. Il tetto
della ricalibrazione sale da 1.0134 a 0.9950 — più vicino a 0.9774, sempre sopra.

### 8.4 Cosa dice questo risultato

Il Dixon-Coles su soli gol è il modello di riferimento della letteratura, implementato
correttamente e validato walk-forward. Che non batta la closing line dei cinque campionati
principali non è una sorpresa: è il mercato più efficiente e liquido che esista, prezzato da
operatori con dati che noi non abbiamo (formazioni, infortuni, meteo, flussi di scommesse).

Le direzioni che restano, in ordine di rapporto valore/costo:

1. **xG al posto dei gol.** Oggi l'xG non entra mai: `matchesWithXG: 0` su tutte le 1751
   partite, perché i campi `xg_home`/`xg_away` dello storico non vengono popolati da nessuno.
   L'xG è molto più stabile del risultato ed è il singolo miglioramento più consistente in
   letteratura. Serve la media mobile pre-partita, non l'xG della partita da predire.
2. **Cambiare avversario.** Tutto quanto sopra misura contro la *closing line*, deliberatamente
   la prova più dura. Un modello può essere inutile contro la chiusura e redditizio contro le
   quote di **apertura** o contro bookmaker lenti. Servono dati di apertura, da verificare nel
   piano Growth.
3. **Cambiare campionati.** Se un edge esiste, è più probabile nelle leghe minori del piano
   (Eerste Divisie, 1. Lig, League Two) dove i book investono meno nel prezzare.

Quello che **non** serve fare: ritoccare soglie, pesi del blend o parametri di staking sul
campione 2025-26. È il ciclo che ha prodotto i 41 report `.md` nella root, e ora c'è
l'infrastruttura per accorgersene subito.

### 8.5 Strumenti aggiunti

| Script | Cosa fa |
|---|---|
| `scripts/backtest-dixon-coles.ts` | walk-forward del DC, ristima settimanale, `--tune` per il decadimento ξ |
| `scripts/simulate-bankroll.ts` | conto reale su un report, modalità `singole` e `multipla`, `--split` per train/test |
| `scripts/analyze-calibration.ts` | diagramma di affidabilità, temperatura, isotonica, peso ottimale verso il mercato |
| `utils/sportmonks-date.ts` | parsing UTC dei timestamp dell'API |

Tutti e tre leggono e scrivono lo stesso formato di report, quindi una nuova idea di modello
si misura riscrivendo solo il primo.
