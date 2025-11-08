# ⚠️ SPORTSMONKS XG ISSUE

## Problema Rilevato

Gli Expected Goals (xG) **non sono disponibili** con il piano attuale di Sportsmonks.

### Documentazione Ufficiale

Dalla [documentazione Sportsmonks](https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/expected-xg):

> **Please note that the availability of xG values varies depending on the package you choose.**
> 
> - The Basic xG package offers access to the xG statistics 12 hours after the match finishes.
> - The Standard xG package offers access straight after the match has finished.
> - The Advanced xG package offers real-time availability to all xG statistics.
> 
> ***These xG packages are only available as an add-on and are not included in any of our default plans.***

### Verifica Tecnica

Test eseguito su fixture ID 19441727 (Epitsentr Dunayivtsi vs Obolon-Brovar):

**Statistiche disponibili:**
- ✅ Attacks
- ✅ Ball Possession %
- ✅ Corners
- ✅ Dangerous Attacks
- ✅ Fouls
- ✅ Free Kicks
- ✅ Goal Kicks
- ✅ Goals
- ✅ Offsides
- ✅ Penalties
- ✅ Saves
- ✅ Shots Off Target
- ✅ Shots On Target
- ✅ Shots Total
- ✅ Substitutions

**Statistiche NON disponibili:**
- ❌ Expected Goals (xG)
- ❌ Expected Goals on Target (xGOT)

### Impatto sul Sistema

Il prediction engine si basa pesantemente sugli xG per:
1. Calibrazione lambda Poisson
2. Calcolo confidence
3. Validazione predizioni
4. Market adjustment

**Senza xG il sistema funziona ma con ridotta accuratezza.**

### Soluzioni Possibili

#### Opzione 1: Acquistare xG Add-on (RACCOMANDATO)
- Costo: Verificare su https://www.sportmonks.com/blogs/xg-pricing-explained/
- Pro: Sistema funziona a piena capacità
- Contro: Costo aggiuntivo

#### Opzione 2: Usare dati sostitutivi
- Stimare xG da Shots On Target / Shots Total
- Formula empirica: `xG ≈ (shots_on_target * 0.35) + (shots_total * 0.05)`
- Pro: Gratis
- Contro: Molto meno accurato

#### Opzione 3: Disabilitare funzionalità xG
- Rimuovere calibrazione xG
- Basarsi solo su Poisson storico
- Pro: Sistema più semplice
- Contro: Predizioni meno accurate

### Raccomandazione

**Acquistare almeno il Basic xG package** per avere dati xG reali, anche con 12 ore di delay. Questo permette:
- Backtesting accurato
- Calibrazione lambda corretta
- Confidence calculation migliorato
- Sistema funziona come progettato

**Costo stimato:** $X/mese (verificare sul sito)
**ROI:** Miglioramento significativo accuratezza predizioni

### Stato Attuale

- ❌ xG non disponibili
- ✅ Storico partite funziona
- ✅ Statistiche base funzionano
- ✅ Quote funzionano
- ⚠️ Prediction engine funziona ma senza calibrazione xG
- ⚠️ Confidence calculation ridotto

### Prossimi Passi

1. Decidere se acquistare xG add-on
2. Se NO: Implementare stima xG da shots
3. Se SI: Aggiornare piano e testare
4. Aggiornare MIGRATION_STATUS.md con decisione
