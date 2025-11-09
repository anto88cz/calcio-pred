# Piano Integrazione News e Formazioni - Sportmonks API

**Stato:** 📋 PIANIFICATO  
**Priorità:** 🔴 ALTA  
**Complessità:** 🟡 MEDIA  
**Tempo Stimato:** 4-6 ore

---

## 🎯 Obiettivo

Integrare informazioni real-time su **news pre-match**, **formazioni confermate**, **infortuni** e **squalifiche** per migliorare l'accuratezza delle previsioni, specialmente per i mercati **1X2** e **Goal/NoGoal**.

### Expected Impact:
- 📈 **Win Rate:** +2-3 punti percentuali
- 🎯 **Accuratezza 1X2:** Riduzione errori per assenze chiave
- 💡 **Confidence Adjustment:** Aggiustamenti dinamici basati su contesto

---

## 📡 API Sportmonks Disponibili

### 1. **News Pre-Match**

**Endpoint:** `GET /v3/football/fixtures/{fixture_id}/news`

**Include:** `news`

**Response Example:**
```json
{
  "data": [
    {
      "id": 12345,
      "title": "Cristiano Ronaldo out with injury",
      "content": "Star forward will miss the match due to ankle injury...",
      "type": "injury",
      "priority": "high",
      "created_at": "2025-11-08T10:30:00Z"
    },
    {
      "id": 12346,
      "title": "Defensive duo back in training",
      "content": "Both center-backs returned to full training...",
      "type": "lineup",
      "priority": "medium",
      "created_at": "2025-11-08T14:00:00Z"
    }
  ]
}
```

**Categorie News:**
- `injury` - Infortuni
- `suspension` - Squalifiche
- `lineup` - Aggiornamenti formazione
- `tactical` - Cambiamenti tattici
- `general` - Altre news

---

### 2. **Formazioni Confermate**

**Endpoint:** `GET /v3/football/fixtures/{fixture_id}/lineups`

**Include:** `lineups`

**Response Example:**
```json
{
  "data": [
    {
      "team_id": 85,
      "formation": "4-3-3",
      "starting_11": [
        {
          "player_id": 579,
          "player_name": "Cristiano Ronaldo",
          "position": 11,
          "jersey_number": 7
        },
        // ... altri 10 giocatori
      ],
      "substitutes": [
        {
          "player_id": 580,
          "player_name": "Karim Benzema",
          "position": 11,
          "jersey_number": 9
        }
      ]
    }
  ]
}
```

**Nota:** Le formazioni sono disponibili tipicamente **1-2 ore prima del match**.

---

### 3. **Giocatori Indisponibili**

**Endpoint:** `GET /v3/football/fixtures/{fixture_id}/sidelined`

**Include:** `sidelined`

**Response Example:**
```json
{
  "data": [
    {
      "player_id": 579,
      "player_name": "Cristiano Ronaldo",
      "team_id": 85,
      "reason": "Injured",
      "start_date": "2025-11-01",
      "end_date": "2025-11-15",
      "status": "Doubtful"
    },
    {
      "player_id": 601,
      "player_name": "Sergio Ramos",
      "team_id": 85,
      "reason": "Suspended",
      "start_date": "2025-11-09",
      "end_date": "2025-11-09",
      "status": "Confirmed"
    }
  ]
}
```

**Status possibili:**
- `Confirmed` - Sicuramente out
- `Doubtful` - Incerto
- `Expected back` - Previsto recupero

---

## 🏗️ Architettura Proposta

### 1. **Nuovo Service: `news-lineup.service.ts`**

```typescript
// api/src/services/news-lineup.service.ts

import axios from 'axios';
import { logger } from '../utils/logger';

interface FixtureNews {
  fixtureId: number;
  homeTeamNews: NewsItem[];
  awayTeamNews: NewsItem[];
  homeTeamInjuries: SidelinedPlayer[];
  awayTeamInjuries: SidelinedPlayer[];
  lineupConfirmed: boolean;
  homeTeamFormation?: string;
  awayTeamFormation?: string;
  homeTeamMissingKeyPlayers: string[];
  awayTeamMissingKeyPlayers: string[];
}

interface NewsItem {
  id: number;
  title: string;
  type: 'injury' | 'suspension' | 'lineup' | 'tactical' | 'general';
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
}

interface SidelinedPlayer {
  playerId: number;
  playerName: string;
  teamId: number;
  reason: string;
  status: 'Confirmed' | 'Doubtful' | 'Expected back';
}

export class NewsLineupService {
  private apiKey: string;
  private baseUrl = 'https://api.sportmonks.com/v3/football';
  
  constructor() {
    this.apiKey = process.env.SPORTMONKS_API_KEY!;
  }
  
  /**
   * Recupera tutte le informazioni news/lineup per una fixture
   */
  async getFixtureContext(fixtureId: number): Promise<FixtureNews> {
    try {
      const [news, sidelined, lineups] = await Promise.all([
        this.fetchNews(fixtureId),
        this.fetchSidelined(fixtureId),
        this.fetchLineups(fixtureId),
      ]);
      
      return {
        fixtureId,
        homeTeamNews: news.home,
        awayTeamNews: news.away,
        homeTeamInjuries: sidelined.home,
        awayTeamInjuries: sidelined.away,
        lineupConfirmed: lineups.confirmed,
        homeTeamFormation: lineups.homeFormation,
        awayTeamFormation: lineups.awayFormation,
        homeTeamMissingKeyPlayers: this.identifyKeyPlayers(sidelined.home),
        awayTeamMissingKeyPlayers: this.identifyKeyPlayers(sidelined.away),
      };
    } catch (error) {
      logger.error('Error fetching fixture context', { error, fixtureId });
      throw error;
    }
  }
  
  /**
   * Calcola impact factor basato su news e infortuni
   * Ritorna un moltiplicatore per la confidence (0.7 - 1.1)
   */
  calculateImpactFactor(context: FixtureNews, team: 'home' | 'away'): number {
    let factor = 1.0;
    
    const missingPlayers = team === 'home' 
      ? context.homeTeamMissingKeyPlayers 
      : context.awayTeamMissingKeyPlayers;
    
    const injuries = team === 'home'
      ? context.homeTeamInjuries
      : context.awayTeamInjuries;
    
    // Penalità per giocatori chiave assenti
    if (missingPlayers.length > 0) {
      factor -= 0.05 * missingPlayers.length; // -5% per giocatore chiave
    }
    
    // Penalità per infortuni confermati
    const confirmedOut = injuries.filter(i => i.status === 'Confirmed').length;
    if (confirmedOut > 2) {
      factor -= 0.10; // -10% se più di 2 giocatori out
    }
    
    // Penalità per incertezza su formazione
    if (!context.lineupConfirmed && this.isCloseToMatchTime()) {
      factor -= 0.05; // -5% se formazione non confermata vicino al match
    }
    
    // Bonus per formazione confermata e nessun problema
    if (context.lineupConfirmed && missingPlayers.length === 0) {
      factor += 0.05; // +5% se tutto ok
    }
    
    // Clamp tra 0.7 e 1.1
    return Math.max(0.7, Math.min(1.1, factor));
  }
  
  /**
   * Identifica se un giocatore è "chiave" basato su ruolo e statistiche
   */
  private identifyKeyPlayers(sidelined: SidelinedPlayer[]): string[] {
    // TODO: Integrare con database statistiche giocatori
    // Per ora, consideriamo tutti i giocatori confermati out come "chiave"
    return sidelined
      .filter(p => p.status === 'Confirmed')
      .map(p => p.playerName);
  }
  
  private async fetchNews(fixtureId: number) {
    // Implementation
  }
  
  private async fetchSidelined(fixtureId: number) {
    // Implementation
  }
  
  private async fetchLineups(fixtureId: number) {
    // Implementation
  }
  
  private isCloseToMatchTime(): boolean {
    // Check if current time is within 2 hours of match start
    return true; // TODO: implement
  }
}
```

---

### 2. **Integrazione in `betting-recommendations.service.ts`**

```typescript
// api/src/services/ml-prediction/betting-recommendations.service.ts

import { NewsLineupService } from '../news-lineup.service';

export class BettingRecommendationsService {
  private newsLineupService: NewsLineupService;
  
  constructor() {
    this.newsLineupService = new NewsLineupService();
  }
  
  async generateRecommendations(
    mlData: MLPredictionData,
    odds: OddsData,
    homeTeam: string,
    awayTeam: string,
    fixtureId: number // NUOVO PARAMETRO
  ): Promise<BettingRecommendation[]> {
    const recs: BettingRecommendation[] = [];
    
    // NUOVO: Fetch news/lineup context
    let newsContext: FixtureNews | null = null;
    try {
      newsContext = await this.newsLineupService.getFixtureContext(fixtureId);
    } catch (error) {
      logger.warn('Failed to fetch news context, proceeding without', { error });
      // Continue without news data
    }
    
    // Calcola impact factors
    const homeImpact = newsContext 
      ? this.newsLineupService.calculateImpactFactor(newsContext, 'home')
      : 1.0;
    const awayImpact = newsContext
      ? this.newsLineupService.calculateImpactFactor(newsContext, 'away')
      : 1.0;
    
    // MODIFICARE: Aggiusta confidence per 1X2
    const adjusted1X2 = this.generate1X2Recommendations(
      mlData, 
      odds, 
      homeTeam, 
      awayTeam,
      homeImpact,  // NUOVO
      awayImpact   // NUOVO
    );
    recs.push(...adjusted1X2);
    
    // ... resto recommendations
    
    return recs;
  }
  
  private generate1X2Recommendations(
    mlData: MLPredictionData,
    odds: OddsData,
    homeTeam: string,
    awayTeam: string,
    homeImpact: number,  // NUOVO
    awayImpact: number   // NUOVO
  ): BettingRecommendation[] {
    const recs: BettingRecommendation[] = [];
    
    // MODIFICARE: Applica impact factor alla confidence
    const adjustedHomeWin = mlData.predictions.homeWin * homeImpact;
    const adjustedAwayWin = mlData.predictions.awayWin * awayImpact;
    
    // Vittoria Casa - con confidence adjusted
    if (adjustedHomeWin > 0.40) {
      const ev = this.calculateEV(adjustedHomeWin, odds.home);
      
      if (ev > 0.10 || (odds.home >= 2.0 && odds.home <= 3.5)) {
        recs.push({
          id: '1x2_home',
          type: 'result',
          name: '1 - Vittoria Casa',
          description: `${homeTeam} vince la partita`,
          prediction: '1',
          confidence: Math.round(adjustedHomeWin * 100), // USA ADJUSTED
          valueRating: this.calculateValueRating(ev),
          odds: odds.home,
          impliedProbability: this.oddsToProb(odds.home),
          modelProbability: adjustedHomeWin * 100,
          expectedValue: ev,
          reason: this.generateReason('home', mlData, ev, homeImpact), // AGGIUNTO impact
        });
      }
    }
    
    // ... stesso per away e draw
    
    return recs;
  }
  
  /**
   * MODIFICARE: Aggiunge contesto news alla reason
   */
  private generateReason(
    outcome: 'home' | 'away' | 'draw',
    mlData: MLPredictionData,
    ev: number,
    impact: number // NUOVO
  ): string {
    let reason = ''; // ... logica esistente
    
    // AGGIUNGERE: Contesto impact
    if (impact < 0.95) {
      reason += ` ⚠️ Confidence ridotta per assenze chiave.`;
    } else if (impact > 1.05) {
      reason += ` ✅ Formazione ottimale confermata.`;
    }
    
    return reason;
  }
}
```

---

### 3. **Modifica Controller**

```typescript
// api/src/controllers/fixtures.controller.ts

router.get('/analysis', async (req, res) => {
  const { homeTeam, awayTeam, fixtureId } = req.query;
  
  // ... existing code
  
  const recommendations = await bettingRecommendationsService.generateRecommendations(
    mlData,
    odds,
    homeTeam,
    awayTeam,
    Number(fixtureId) // PASSARE fixture ID
  );
  
  // ...
});
```

---

## 🎯 Logica di Adjustment

### Scenari e Adjustment:

| Scenario | Home Impact | Away Impact | Confidence Adjustment | Note |
|----------|-------------|-------------|----------------------|------|
| **Nessuna news** | 1.0 | 1.0 | Nessun cambio | Situazione normale |
| **1 giocatore chiave out (casa)** | 0.90 | 1.0 | -10% home win | Lieve penalità |
| **2+ giocatori chiave out (casa)** | 0.80 | 1.0 | -20% home win | Forte penalità |
| **Formazione confermata (entrambi)** | 1.05 | 1.05 | +5% confidence | Bonus certezza |
| **Incertezza formazione vicino match** | 0.95 | 0.95 | -5% tutti i mercati | Penalità incertezza |
| **Top scorer out** | 0.85 | 1.0 | -15% + penalizza Goal | Impatto doppio |
| **Difensore chiave out** | 1.0 | 0.90 | Bonus away win | Favorisce avversari |

### Esempi Pratici:

**Esempio 1: Attaccante Stella Out**
```
Scenario: Liverpool vs Brighton, Salah infortunato (confermato)
- mlData.predictions.homeWin = 0.60 (60%)
- homeImpact = 0.85 (giocatore chiave out)
- adjustedHomeWin = 0.60 * 0.85 = 0.51 (51%)
- Confidence scende da 60% a 51%
- Se confidence threshold è 0.40, passa comunque
- Ma EV si riduce, possibile non raccomandare
```

**Esempio 2: Formazione Ottimale Confermata**
```
Scenario: Real Madrid vs Getafe, tutti titolari disponibili
- mlData.predictions.homeWin = 0.65 (65%)
- homeImpact = 1.05 (formazione perfetta)
- adjustedHomeWin = 0.65 * 1.05 = 0.68 (68%)
- Confidence aumenta, EV migliora
- Raccomandazione più forte
```

**Esempio 3: Multipli Infortuni**
```
Scenario: Chelsea vs Arsenal, 3 difensori Chelsea out
- mlData.predictions.awayWin = 0.35 (35%)
- homeImpact = 0.70 (molti infortuni)
- awayImpact = 1.05 (formazione ok)
- adjustedAwayWin = 0.35 * 1.05 = 0.37 (37%)
- adjustedHomeWin = 0.40 * 0.70 = 0.28 (28%)
- Favorisce vittoria trasferta
```

---

## 📋 Implementation Checklist

### Phase 1: News Service (2-3 ore)
- [ ] Creare `api/src/services/news-lineup.service.ts`
- [ ] Implementare `fetchNews(fixtureId)`
- [ ] Implementare `fetchSidelined(fixtureId)`
- [ ] Implementare `fetchLineups(fixtureId)`
- [ ] Aggiungere caching (Redis) per evitare chiamate ripetute
- [ ] Test unitari per parsing response

### Phase 2: Impact Calculation (1-2 ore)
- [ ] Implementare `calculateImpactFactor()`
- [ ] Definire pesi per ogni tipo di assenza
- [ ] Implementare logica key players
- [ ] Test con scenari reali

### Phase 3: Integration (1-2 ore)
- [ ] Modificare `generateRecommendations()` per usare impact
- [ ] Aggiornare `generate1X2Recommendations()`
- [ ] Aggiornare `generateReason()` per includere contesto news
- [ ] Passare `fixtureId` da controller

### Phase 4: Testing & Validation (1 ora)
- [ ] Test con fixture reale con infortuni noti
- [ ] Verificare adjustment funziona correttamente
- [ ] Backtest su sample di 20 partite con news note
- [ ] Validare miglioramento win rate

---

## 🔧 Configurazione

### Environment Variables

Aggiungere in `.env`:

```bash
# News/Lineup Integration
ENABLE_NEWS_INTEGRATION=true  # Feature flag
NEWS_CACHE_TTL=1800  # 30 minuti
NEWS_FALLBACK_MODE=true  # Continue senza news se API fail
```

### Feature Flag

```typescript
// api/src/config/features.ts
export const FEATURES = {
  NEWS_INTEGRATION: process.env.ENABLE_NEWS_INTEGRATION === 'true',
};
```

Uso nel service:

```typescript
if (FEATURES.NEWS_INTEGRATION) {
  newsContext = await this.newsLineupService.getFixtureContext(fixtureId);
} else {
  newsContext = null; // Skip news fetch
}
```

---

## 🎓 Best Practices

### 1. **Graceful Degradation**
Se l'API news fallisce, il sistema deve continuare a funzionare con i dati ML base.

```typescript
try {
  newsContext = await this.newsLineupService.getFixtureContext(fixtureId);
} catch (error) {
  logger.warn('News API failed, using default impact', { error });
  newsContext = null; // Sistema continua senza news
}
```

### 2. **Caching Aggressivo**
Le news non cambiano frequentemente. Cache per almeno 30 minuti.

```typescript
const cacheKey = `news:${fixtureId}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

// ... fetch from API
await redis.setex(cacheKey, 1800, JSON.stringify(result));
```

### 3. **Rate Limiting**
Sportmonks ha rate limits. Batch requests quando possibile.

```typescript
// Invece di N chiamate singole per N fixtures:
const allFixtureIds = [1234, 1235, 1236, ...];
const allNewsContexts = await Promise.all(
  allFixtureIds.map(id => this.getFixtureContext(id))
);
```

### 4. **Monitoring**
Traccia l'impatto delle news sulle raccomandazioni.

```typescript
logger.info('News impact applied', {
  fixtureId,
  homeImpact,
  awayImpact,
  originalHomeWin: mlData.predictions.homeWin,
  adjustedHomeWin,
  changePercent: ((adjustedHomeWin / mlData.predictions.homeWin) - 1) * 100,
});
```

---

## 📊 Expected Results

### Metriche da Monitorare:

| Metrica | Pre-News | Target Post-News | Delta |
|---------|----------|-----------------|-------|
| **1X2 Win Rate** | 45% (post-optimizations) | 47-48% | +2-3pp |
| **Falsi Positivi Ridotti** | - | -15-20% | Meno errori per assenze |
| **Confidence Accuracy** | - | +5pp | Confidence più calibrata |
| **ROI** | 5% (target) | 6-7% | +1-2pp |

### A/B Test:

Confrontare per 50 partite:
- **Gruppo A:** Raccomandazioni con news integration
- **Gruppo B:** Raccomandazioni senza news (solo ML)

Misurare:
- Win rate differenza
- ROI differenza
- Accuracy by team strength
- User satisfaction

---

## 🚀 Deployment Plan

### Rollout Graduale:

1. **Week 1:** Feature flag OFF, deploy in shadow mode (log impact ma non applicare)
2. **Week 2:** Feature flag ON per 10% utenti (A/B test)
3. **Week 3:** Analisi risultati, adjustment pesi
4. **Week 4:** Full rollout se risultati positivi

### Rollback Plan:

Se i risultati peggiorano:
```typescript
ENABLE_NEWS_INTEGRATION=false
```

Restart backend, sistema torna alla versione precedente immediatamente.

---

## 📚 Risorse

### Sportmonks Documentation:
- News API: https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/fixtures/get-news-by-fixture-id
- Lineups API: https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/fixtures/get-lineups-by-fixture-id
- Sidelined API: https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/fixtures/get-sidelined-by-fixture-id

### Internal Docs:
- `IMPROVEMENTS_IMPLEMENTED.md` - Ottimizzazioni attuali
- `BACKTEST_REPORT_MONTH.md` - Analisi performance
- `api/src/services/ml-prediction/betting-recommendations.service.ts` - Codice attuale

---

## ✅ Success Criteria

L'integrazione news è considerata **SUCCESS** se:

1. ✅ **Win rate 1X2 aumenta di almeno +2pp**
2. ✅ **Nessun degrado performance altri mercati**
3. ✅ **Sistema rimane stabile (no crashes per API failures)**
4. ✅ **Latency <500ms aggiuntivi per richiesta**
5. ✅ **User feedback positivo su qualità raccomandazioni**

---

*Documento tecnico - Ready for implementation* 🚀
