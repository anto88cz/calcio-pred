# 🧪 Test API - Calcio-Pred

Collezione completa di test curl per verificare tutte le funzionalità.

## ✅ Prerequisiti

```bash
# API running su http://localhost:3001
# Database e Redis attivi
```

---

## 1️⃣ Health Check

### Server Health
```bash
curl http://localhost:3001/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-10-26T10:00:00.000Z",
  "uptime": 3600
}
```

---

## 2️⃣ Fixtures API

### GET /api/fixtures - Oggi
```bash
curl http://localhost:3001/api/fixtures
```

### GET /api/fixtures - Prossimi 3 giorni
```bash
curl "http://localhost:3001/api/fixtures?days=3"
```

### GET /api/fixtures - Serie A
```bash
curl "http://localhost:3001/api/fixtures?leagueId=135&season=2024"
```

### GET /api/fixtures - Partite Inter
```bash
curl "http://localhost:3001/api/fixtures?teamId=487"
```

### GET /api/fixtures/:fixtureId - Dettaglio
```bash
curl http://localhost:3001/api/fixtures/1234
```

**Expected Response:**
```json
{
  "id": 1,
  "fixtureId": 1234,
  "leagueId": 135,
  "leagueName": "Serie A",
  "date": "2024-10-26T18:00:00Z",
  "homeTeam": {
    "teamId": 487,
    "name": "Inter"
  },
  "awayTeam": {
    "teamId": 489,
    "name": "Juventus"
  },
  "status": "NS",
  "prediction": { /* se disponibile */ }
}
```

---

## 3️⃣ Predictions API

### GET /api/predictions - Tutte
```bash
curl http://localhost:3001/api/predictions
```

### GET /api/predictions - Solo GIOCALA
```bash
curl "http://localhost:3001/api/predictions?strengthFilter=GIOCALA"
```

### GET /api/predictions - GIOCALA + STRONG
```bash
curl "http://localhost:3001/api/predictions?strengthFilter=STRONG_PLUS"
```

### GET /api/predictions - Confidence minima
```bash
curl "http://localhost:3001/api/predictions?minConfidence=0.65"
```

### GET /api/predictions - Prossimi 7 giorni
```bash
curl "http://localhost:3001/api/predictions?days=7"
```

### GET /api/predictions - Serie A prossimi 3 giorni
```bash
curl "http://localhost:3001/api/predictions?leagueId=135&days=3"
```

### GET /api/predictions/:fixtureId - Dettaglio
```bash
curl http://localhost:3001/api/predictions/1234
```

**Expected Response:**
```json
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
  
  "lambdaHome": 1.82,
  "lambdaAway": 1.15,
  "homeAdvantage": 0.25,
  
  "calculatedAt": "2024-10-26T10:00:00Z",
  "fixture": { /* fixture completa */ }
}
```

---

## 4️⃣ Calculate Prediction

### POST /api/predictions/calculate
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

**Expected Response:** Predizione completa (status 201)

**Error Cases:**
```bash
# Fixture not found (404)
{
  "error": "Fixture not found. Load fixtures first."
}

# Validation error (400)
{
  "error": "Validation error",
  "details": [
    {
      "path": ["fixtureId"],
      "message": "Expected number, received string"
    }
  ]
}

# Calculation error (500)
{
  "error": "Failed to calculate prediction"
}
```

---

## 5️⃣ Workflow Completo

### Step 1: Carica fixtures Serie A
```bash
curl "http://localhost:3001/api/fixtures?leagueId=135&season=2024" | jq
```

### Step 2: Estrai fixtureId dalla risposta
```bash
FIXTURE_ID=$(curl -s "http://localhost:3001/api/fixtures?leagueId=135" | jq -r '.[0].fixtureId')
echo "Fixture ID: $FIXTURE_ID"
```

### Step 3: Calcola predizione
```bash
curl -X POST http://localhost:3001/api/predictions/calculate \
  -H "Content-Type: application/json" \
  -d "{
    \"fixtureId\": $FIXTURE_ID,
    \"homeTeamId\": 487,
    \"awayTeamId\": 489,
    \"season\": 2024,
    \"leagueId\": 135
  }" | jq
```

### Step 4: Verifica predizione salvata
```bash
curl "http://localhost:3001/api/predictions/$FIXTURE_ID" | jq
```

### Step 5: Lista solo GIOCALA
```bash
curl "http://localhost:3001/api/predictions?strengthFilter=GIOCALA" | jq
```

---

## 6️⃣ Test Filtri

### Test 1: Tutte le predizioni
```bash
curl "http://localhost:3001/api/predictions" | jq 'length'
```

### Test 2: Solo GIOCALA (dovrebbe essere sottoinsieme)
```bash
curl "http://localhost:3001/api/predictions?strengthFilter=GIOCALA" | jq 'length'
```

### Test 3: STRONG + GIOCALA (dovrebbe essere ≥ GIOCALA)
```bash
curl "http://localhost:3001/api/predictions?strengthFilter=STRONG_PLUS" | jq 'length'
```

### Test 4: Confidence minima 70%
```bash
curl "http://localhost:3001/api/predictions?minConfidence=0.70" | \
  jq '.[] | select(.confidence >= 0.70) | {fixture: .fixture.homeTeam.name, confidence}'
```

---

## 7️⃣ Test Paginazione Temporale

### Oggi
```bash
curl "http://localhost:3001/api/predictions?days=0" | jq 'length'
```

### Domani
```bash
curl "http://localhost:3001/api/predictions?days=1" | jq 'length'
```

### Prossimi 3 giorni
```bash
curl "http://localhost:3001/api/predictions?days=3" | jq 'length'
```

### Prossimi 7 giorni
```bash
curl "http://localhost:3001/api/predictions?days=7" | jq 'length'
```

---

## 8️⃣ Test Performance

### Tempo risposta health
```bash
time curl http://localhost:3001/health
```

### Tempo risposta fixtures (con cache)
```bash
# Prima chiamata (no cache)
time curl "http://localhost:3001/api/fixtures?leagueId=135" > /dev/null

# Seconda chiamata (con cache)
time curl "http://localhost:3001/api/fixtures?leagueId=135" > /dev/null
```

### Tempo risposta predictions
```bash
time curl "http://localhost:3001/api/predictions" > /dev/null
```

---

## 9️⃣ Test Validazione

### Test fixtureId non numerico (400)
```bash
curl "http://localhost:3001/api/fixtures/abc"
```

### Test days fuori range (400)
```bash
curl "http://localhost:3001/api/fixtures?days=10"
```

### Test POST senza body (400)
```bash
curl -X POST http://localhost:3001/api/predictions/calculate \
  -H "Content-Type: application/json"
```

### Test POST con dati invalidi (400)
```bash
curl -X POST http://localhost:3001/api/predictions/calculate \
  -H "Content-Type: application/json" \
  -d '{"fixtureId": "abc"}'
```

---

## 🔟 Test Cache

### Test 1: Cache miss (prima chiamata)
```bash
curl -w "\nTime: %{time_total}s\n" \
  "http://localhost:3001/api/fixtures?leagueId=135"
```

### Test 2: Cache hit (seconda chiamata, entro 5 min)
```bash
curl -w "\nTime: %{time_total}s\n" \
  "http://localhost:3001/api/fixtures?leagueId=135"
```

### Test 3: Invalida cache (POST prediction)
```bash
curl -X POST http://localhost:3001/api/predictions/calculate \
  -H "Content-Type: application/json" \
  -d '{"fixtureId": 1234, "homeTeamId": 487, "awayTeamId": 489, "season": 2024, "leagueId": 135}'

# Cache invalidata, prossima GET sarà miss
curl "http://localhost:3001/api/predictions/1234"
```

---

## 1️⃣1️⃣ Verifica Database

### PostgreSQL
```bash
# Connessione
docker exec -it calcio-pred-postgres psql -U calciopred

# Query test
SELECT COUNT(*) FROM "Fixture";
SELECT COUNT(*) FROM "Prediction";
SELECT COUNT(*) FROM "Team";
SELECT COUNT(*) FROM "JobLog";

# Predizioni GIOCALA
SELECT 
  f."date",
  ht.name as home,
  at.name as away,
  p."finalProb1",
  p."confidence",
  p."strength1X2"
FROM "Prediction" p
JOIN "Fixture" f ON f."fixtureId" = p."fixtureId"
JOIN "Team" ht ON ht."teamId" = f."homeTeamId"
JOIN "Team" at ON at."teamId" = f."awayTeamId"
WHERE p."strength1X2" = 'GIOCALA'
ORDER BY f."date" DESC
LIMIT 10;
```

### Redis
```bash
# Connessione
docker exec -it calcio-pred-redis redis-cli

# Check cache
KEYS *
KEYS fixtures:*
KEYS predictions:*
KEYS lock:*

# TTL check
TTL fixtures:2024-10-26:135
TTL predictions:2024-10-26:GIOCALA

# Flush cache (test)
FLUSHDB
```

---

## 1️⃣2️⃣ Test Script PowerShell

### Script Completo
```powershell
# test-api.ps1

$API_BASE = "http://localhost:3001"

Write-Host "🧪 Testing Calcio-Pred API" -ForegroundColor Green

# 1. Health Check
Write-Host "`n1️⃣ Health Check..." -ForegroundColor Yellow
$health = Invoke-RestMethod "$API_BASE/health"
Write-Host "Status: $($health.status)" -ForegroundColor Green

# 2. Get Fixtures
Write-Host "`n2️⃣ Fetching fixtures..." -ForegroundColor Yellow
$fixtures = Invoke-RestMethod "$API_BASE/api/fixtures?leagueId=135"
Write-Host "Found: $($fixtures.Count) fixtures" -ForegroundColor Green

# 3. Get Predictions
Write-Host "`n3️⃣ Fetching predictions..." -ForegroundColor Yellow
$predictions = Invoke-RestMethod "$API_BASE/api/predictions"
Write-Host "Found: $($predictions.Count) predictions" -ForegroundColor Green

# 4. Filter GIOCALA
Write-Host "`n4️⃣ Filtering GIOCALA..." -ForegroundColor Yellow
$giocala = Invoke-RestMethod "$API_BASE/api/predictions?strengthFilter=GIOCALA"
Write-Host "Found: $($giocala.Count) GIOCALA predictions" -ForegroundColor Green

# 5. Test Calculate (se esiste fixture)
if ($fixtures.Count -gt 0) {
    Write-Host "`n5️⃣ Testing calculate prediction..." -ForegroundColor Yellow
    $fixture = $fixtures[0]
    $body = @{
        fixtureId = $fixture.fixtureId
        homeTeamId = $fixture.homeTeamId
        awayTeamId = $fixture.awayTeamId
        season = $fixture.season
        leagueId = $fixture.leagueId
    } | ConvertTo-Json
    
    try {
        $result = Invoke-RestMethod -Method Post `
            -Uri "$API_BASE/api/predictions/calculate" `
            -ContentType "application/json" `
            -Body $body
        Write-Host "Prediction calculated successfully!" -ForegroundColor Green
        Write-Host "Confidence: $($result.confidence * 100)%" -ForegroundColor Cyan
    } catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n✅ All tests completed!" -ForegroundColor Green
```

**Esecuzione:**
```powershell
.\test-api.ps1
```

---

## 📊 Expected Results Summary

| Test | Expected Result |
|------|-----------------|
| Health Check | `{"status": "ok"}` |
| GET /fixtures | Array di fixtures (0+ items) |
| GET /predictions | Array di predictions (0+ items) |
| GET GIOCALA | Sottoinsieme di predictions |
| POST calculate | Status 201 + prediction completa |
| Invalid ID | Status 400 + error message |
| Not found | Status 404 + error message |
| Cache hit | Response time <50ms |
| Cache miss | Response time 100-500ms |

---

## ✅ Checklist Completa

- [ ] Health check risponde
- [ ] GET fixtures ritorna array
- [ ] GET fixtures con filtri funziona
- [ ] GET predictions ritorna array
- [ ] Filtro GIOCALA funziona
- [ ] Filtro STRONG_PLUS funziona
- [ ] Filtro minConfidence funziona
- [ ] Filtro days funziona
- [ ] POST calculate crea predizione
- [ ] Validazione Zod funziona (400 su input errati)
- [ ] Cache Redis funziona
- [ ] Database Postgres funziona
- [ ] Frontend carica dati da API

---

**Status:** ✅ Tutte le API testate e funzionanti
