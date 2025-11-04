# 🛣️ API Routes

REST API per fixtures e predizioni.

## 📋 Endpoints

### **Fixtures**

#### `GET /api/fixtures`
Lista fixtures con filtri opzionali.

**Query Parameters:**
```typescript
{
  date?: string;           // YYYY-MM-DD (default: oggi)
  days?: number;           // Giorni successivi (0-7, default: 0)
  leagueId?: number;       // Filtra per lega
  teamId?: number;         // Filtra per squadra (home o away)
  season?: number;         // Stagione (es: 2024)
}
```

**Response:**
```json
[
  {
    "id": 1,
    "fixtureId": 1234,
    "leagueId": 135,
    "leagueName": "Serie A",
    "leagueCountry": "Italy",
    "season": 2024,
    "round": "Regular Season - 10",
    "date": "2024-10-26T18:00:00Z",
    "homeTeamId": 487,
    "awayTeamId": 489,
    "status": "NS",
    "venue": "San Siro",
    "referee": "Daniele Orsato",
    "homeTeam": {
      "teamId": 487,
      "name": "Inter",
      "logo": "https://..."
    },
    "awayTeam": {
      "teamId": 489,
      "name": "Juventus",
      "logo": "https://..."
    },
    "prediction": { /* se disponibile */ }
  }
]
```

**Esempi:**
```bash
# Fixtures di oggi
curl http://localhost:3001/api/fixtures

# Prossimi 3 giorni
curl http://localhost:3001/api/fixtures?days=3

# Serie A oggi
curl http://localhost:3001/api/fixtures?leagueId=135

# Partite Inter
curl http://localhost:3001/api/fixtures?teamId=487
```

---

#### `GET /api/fixtures/:fixtureId`
Dettaglio singola fixture.

**Response:**
```json
{
  "id": 1,
  "fixtureId": 1234,
  "leagueName": "Serie A",
  "date": "2024-10-26T18:00:00Z",
  "homeTeam": { "name": "Inter" },
  "awayTeam": { "name": "Juventus" },
  "prediction": { /* predizione completa */ }
}
```

---

### **Predictions**

#### `GET /api/predictions`
Lista predizioni con filtri.

**Query Parameters:**
```typescript
{
  date?: string;                              // YYYY-MM-DD (default: oggi)
  days?: number;                              // Giorni successivi (0-7, default: 0)
  leagueId?: number;                          // Filtra per lega
  minConfidence?: number;                     // Confidence minima (0-1)
  strengthFilter?: 'ALL' | 'GIOCALA' | 'STRONG_PLUS';  // Default: 'ALL'
}
```

**Filtri Forza:**
- `ALL`: Tutte le predizioni
- `GIOCALA`: Solo partite con almeno un mercato GIOCALA (≥80% + conf≥0.6)
- `STRONG_PLUS`: Partite con GIOCALA o STRONG

**Response:**
```json
[
  {
    "id": 1,
    "fixtureId": 1234,
    "confidence": 0.72,
    "confidenceLevel": "HIGH",
    "homeMatchesUsed": 20,
    "awayMatchesUsed": 19,
    
    "finalProb1": 0.512,
    "finalProbX": 0.288,
    "finalProb2": 0.200,
    "strength1X2": "STRONG",
    
    "finalOver25": 0.588,
    "finalUnder25": 0.412,
    "strengthOver25": "MEDIUM",
    
    "finalBttsYes": 0.638,
    "finalBttsNo": 0.362,
    "strengthBtts": "STRONG",
    
    "final1X": 0.80,
    "strength1X": "GIOCALA",
    
    "dataQuality": "EXCELLENT",
    "hasInjuries": true,
    "hasLineup": true,
    
    "calculatedAt": "2024-10-26T10:00:00Z",
    "lastUpdate": "2024-10-26T10:00:00Z",
    
    "fixture": {
      "homeTeam": { "name": "Inter" },
      "awayTeam": { "name": "Juventus" },
      "date": "2024-10-26T18:00:00Z"
    }
  }
]
```

**Esempi:**
```bash
# Tutte le predizioni di oggi
curl http://localhost:3001/api/predictions

# Solo GIOCALA
curl http://localhost:3001/api/predictions?strengthFilter=GIOCALA

# GIOCALA + STRONG
curl http://localhost:3001/api/predictions?strengthFilter=STRONG_PLUS

# Confidence minima 0.65
curl http://localhost:3001/api/predictions?minConfidence=0.65

# Serie A prossimi 3 giorni
curl http://localhost:3001/api/predictions?leagueId=135&days=3
```

---

#### `GET /api/predictions/:fixtureId`
Dettaglio completo predizione singola.

**Response:**
```json
{
  "id": 1,
  "fixtureId": 1234,
  "confidence": 0.72,
  "confidenceLevel": "HIGH",
  
  // 1X2 - Completo (empirico, poisson, finale)
  "empiricProb1": 0.52,
  "empiricProbX": 0.28,
  "empiricProb2": 0.20,
  "poissonProb1": 0.50,
  "poissonProbX": 0.30,
  "poissonProb2": 0.20,
  "finalProb1": 0.512,
  "finalProbX": 0.288,
  "finalProb2": 0.200,
  "strength1X2": "STRONG",
  
  // Under/Over 0.5 - 4.5 (tutti i threshold)
  "empiricOver25": 0.58,
  "empiricUnder25": 0.42,
  "poissonOver25": 0.60,
  "poissonUnder25": 0.40,
  "finalOver25": 0.588,
  "finalUnder25": 0.412,
  "strengthOver25": "MEDIUM",
  
  // BTTS
  "empiricBttsYes": 0.65,
  "empiricBttsNo": 0.35,
  "poissonBttsYes": 0.62,
  "poissonBttsNo": 0.38,
  "finalBttsYes": 0.638,
  "finalBttsNo": 0.362,
  "strengthBtts": "STRONG",
  
  // Doppia Chance
  "empiric1X": 0.80,
  "poisson1X": 0.80,
  "final1X": 0.80,
  "strength1X": "GIOCALA",
  
  "empiric12": 0.72,
  "poisson12": 0.70,
  "final12": 0.712,
  "strength12": "MEDIUM",
  
  "empiricX2": 0.48,
  "poissonX2": 0.50,
  "finalX2": 0.488,
  "strengthX2": "NEUTRAL",
  
  // Poisson params
  "lambdaHome": 1.82,
  "lambdaAway": 1.15,
  "homeAdvantage": 0.25,
  
  // Metadata
  "homeMatchesUsed": 20,
  "awayMatchesUsed": 19,
  "dataQuality": "EXCELLENT",
  "hasInjuries": true,
  "hasLineup": true,
  
  "calculatedAt": "2024-10-26T10:00:00Z",
  "lastUpdate": "2024-10-26T10:00:00Z",
  
  "fixture": {
    "homeTeam": { "name": "Inter", "logo": "..." },
    "awayTeam": { "name": "Juventus", "logo": "..." },
    "date": "2024-10-26T18:00:00Z",
    "leagueName": "Serie A"
  }
}
```

---

#### `POST /api/predictions/calculate`
Calcola e salva nuova predizione.

**Request Body:**
```json
{
  "fixtureId": 1234,
  "homeTeamId": 487,
  "awayTeamId": 489,
  "season": 2024,
  "leagueId": 135
}
```

**Response:** Predizione completa (come GET /:fixtureId)

**Status Codes:**
- `201`: Predizione creata
- `400`: Validazione fallita
- `404`: Fixture non trovata (caricare prima con /api/fixtures)
- `500`: Errore calcolo

**Esempio:**
```bash
curl -X POST http://localhost:3001/api/predictions/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "fixtureId": 1234,
    "homeTeamId": 487,
    "awayTeamId": 489,
    "season": 2024,
    "leagueId": 135
  }'
```

---

## 🔒 Validazione

Tutti gli endpoint usano **Zod** per validare input.

Errori di validazione ritornano:
```json
{
  "error": "Validation error",
  "details": [
    {
      "path": ["days"],
      "message": "Number must be less than or equal to 7"
    }
  ]
}
```

---

## 💾 Caching

- **Fixtures:** 5 minuti Redis cache
- **Predictions:** 2 minuti Redis cache
- **Cache key format:** `fixtures:{start}:{end}:{leagueId}:{teamId}`

---

## 🛡️ Security

- **Helmet**: Security headers
- **CORS**: Configurabile via `CORS_ORIGIN` env
- **Rate Limiting**: TODO (Step 8)
- **Body Limit**: 10MB max

---

## 🧪 Testing

### Health Check
```bash
curl http://localhost:3001/health
```

### Workflow Completo
```bash
# 1. Carica fixtures Serie A oggi
curl "http://localhost:3001/api/fixtures?leagueId=135&season=2024"

# 2. Calcola predizione per una partita
curl -X POST http://localhost:3001/api/predictions/calculate \
  -H "Content-Type: application/json" \
  -d '{"fixtureId": 1234, "homeTeamId": 487, "awayTeamId": 489, "season": 2024, "leagueId": 135}'

# 3. Vedi predizioni GIOCALA
curl "http://localhost:3001/api/predictions?strengthFilter=GIOCALA"

# 4. Dettaglio predizione
curl http://localhost:3001/api/predictions/1234
```

---

## 📊 Response Fields

### Strength Values
- `GIOCALA` 🟩: ≥80% + confidence ≥0.60 (solo 1X2)
- `STRONG` 🟢: Alta probabilità
- `MEDIUM` 🟡: Media probabilità
- `NEUTRAL` ⚪: Bassa probabilità
- `ND` 🔴: Dati insufficienti

### Confidence Levels
- `VERY_HIGH`: ≥0.80
- `HIGH`: 0.65-0.79
- `MEDIUM`: 0.50-0.64
- `LOW`: 0.35-0.49
- `VERY_LOW`: <0.35

### Data Quality
- `EXCELLENT`: ≥90% completezza storico
- `GOOD`: 70-89%
- `FAIR`: 50-69%
- `POOR`: 30-49%
- `INSUFFICIENT`: <30%

---

**Status:** ✅ **COMPLETO** - Step 6/9
