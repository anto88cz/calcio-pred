// 🚀 API ENDPOINT per analisi leghe dal frontend
const express = require('express');
const cors = require('cors');
const EnhancedPredictor = require('./enhanced-predictor');

const app = express();
app.use(cors());
app.use(express.json());

// Middleware per Enhanced Predictor
const enhancedPredictor = new EnhancedPredictor();

// 🌍 ENDPOINT: Analizza lega specifica
app.get('/api/predictions/league/:leagueId', async (req, res) => {
  try {
    const { leagueId } = req.params;
    const season = 2025;

    console.log(`🔍 Richiesta analisi lega ${leagueId}...`);

    // 1. Recupera fixtures di oggi per la lega
    const fixtures = await enhancedPredictor.makeRequest('/fixtures', {
      league: leagueId,
      season: season,
      date: new Date().toISOString().split('T')[0] // Oggi YYYY-MM-DD
    });

    if (!fixtures.response || fixtures.response.length === 0) {
      return res.json({
        success: true,
        message: `Nessuna partita oggi per lega ${leagueId}`,
        predictions: []
      });
    }

    console.log(`📊 Trovate ${fixtures.response.length} partite`);

    // 2. Analizza ogni partita con Enhanced Predictor
    const predictions = [];

    for (const fixture of fixtures.response) {
      try {
        const homeTeamId = fixture.teams.home.id;
        const awayTeamId = fixture.teams.away.id;
        const homeTeamName = fixture.teams.home.name;
        const awayTeamName = fixture.teams.away.name;

        console.log(`   🧮 Analizzando: ${homeTeamName} vs ${awayTeamName}`);

        // Calcola predizione Enhanced
        const prediction = await enhancedPredictor.calculateEnhancedPrediction(
          homeTeamId, 
          awayTeamId, 
          parseInt(leagueId), 
          season
        );

        // Simula value betting per demo
        const valueBets = [
          {
            market: '1X2',
            selection: 'HOME',
            odds: (1 / prediction.prob1X2.prob1) * 1.05, // Simula odds con margine
            probability: prediction.prob1X2.prob1 * 100,
            value: Math.random() * 8, // Simula value random per demo
            kelly: Math.random() * 5,
            recommend: Math.random() > 0.7 // 30% chance di value bet
          }
        ];

        predictions.push({
          id: `${homeTeamId}-${awayTeamId}-${Date.now()}`,
          homeTeam: homeTeamName,
          awayTeam: awayTeamName,
          league: fixture.league.name,
          date: fixture.fixture.date,
          predictions: {
            homeGoals: prediction.homeGoals,
            awayGoals: prediction.awayGoals,
            totalGoals: prediction.totalGoals,
            prob1: prediction.prob1X2.prob1 * 100,
            probX: prediction.prob1X2.probX * 100,
            prob2: prediction.prob1X2.prob2 * 100
          },
          confidence: prediction.confidence * 100,
          strength: enhancedPredictor.getEnhancedStrengthBadge(
            prediction.prob1X2.prob1,
            prediction.prob1X2.probX, 
            prediction.prob1X2.prob2,
            prediction.confidence
          ).replace(/🟩|🟢|🟡|⚪|🔴/g, '').trim(),
          valueBets
        });

      } catch (matchError) {
        console.error(`❌ Errore analisi ${fixture.teams.home.name} vs ${fixture.teams.away.name}:`, matchError.message);
      }
    }

    res.json({
      success: true,
      leagueId: parseInt(leagueId),
      predictions,
      summary: {
        totalMatches: predictions.length,
        valueBets: predictions.filter(p => p.valueBets?.some(vb => vb.recommend)).length,
        avgConfidence: predictions.length > 0 
          ? predictions.reduce((acc, p) => acc + p.confidence, 0) / predictions.length
          : 0
      }
    });

  } catch (error) {
    console.error('❌ Errore endpoint analisi lega:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Errore interno del server'
    });
  }
});

// 🏥 ENDPOINT: Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Calcio-Pred Enhanced API',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// 📊 ENDPOINT: Lista leghe disponibili
app.get('/api/leagues', (req, res) => {
  const leagues = [
    { id: 39, name: 'Premier League', country: 'England', flag: '🇬🇧' },
    { id: 140, name: 'La Liga', country: 'Spain', flag: '🇪🇸' },
    { id: 135, name: 'Serie A', country: 'Italy', flag: '🇮🇹' },
    { id: 78, name: 'Bundesliga', country: 'Germany', flag: '🇩🇪' },
    { id: 61, name: 'Ligue 1', country: 'France', flag: '🇫🇷' },
    { id: 94, name: 'Primeira Liga', country: 'Portugal', flag: '🇵🇹' },
    { id: 88, name: 'Eredivisie', country: 'Netherlands', flag: '🇳🇱' },
    { id: 203, name: 'Süper Lig', country: 'Turkey', flag: '🇹🇷' }
  ];

  res.json({
    success: true,
    leagues
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Enhanced API Server running on port ${PORT}`);
  console.log(`📊 Endpoints disponibili:`);
  console.log(`   GET  /api/health`);
  console.log(`   GET  /api/leagues`);
  console.log(`   GET  /api/predictions/league/:leagueId`);
  console.log(`🔗 Test: http://localhost:${PORT}/api/health`);
});

module.exports = app;