// 🔍 ANALISI DETTAGLIATA DELLE SCHEDINE PERSE
// Identifica pattern e problemi nelle predizioni fallite

require('dotenv').config({ path: './api/.env' });
const axios = require('axios');

const SPORTSMONKS_API_KEY = process.env.SPORTSMONKS_API_KEY;
const BASE_URL = 'https://api.sportmonks.com/v3/football';
const API_URL = 'http://localhost:3001';

// 5 schedine perse dal backtest
const LOST_BETS = [
  {
    date: '2025-10-01',
    match: 'Portsmouth vs Watford',
    prediction: '12',
    odds: 1.33,
    result: '2-2',
    analysis: 'Pareggio non previsto (X)'
  },
  {
    date: '2025-10-20',
    match: 'Eyüpspor vs Kasımpaşa',
    prediction: 'X2',
    odds: 1.52,
    result: '2-0',
    analysis: 'Vittoria casa non prevista (1)'
  },
  {
    date: '2025-10-23',
    match: 'Nottingham Forest vs Porto',
    prediction: 'X2',
    odds: 1.52,
    result: '2-0',
    analysis: 'Vittoria casa non prevista (1)'
  },
  {
    date: '2025-11-03',
    match: 'Real Oviedo vs Osasuna',
    prediction: '12',
    odds: 1.37,
    result: '0-0',
    analysis: 'Pareggio non previsto (X)'
  },
  {
    date: '2025-11-09',
    match: 'Fatih Karagümrük vs Konyaspor',
    prediction: 'X2',
    odds: 1.45,
    result: '2-0',
    analysis: 'Vittoria casa non prevista (1)'
  }
];

async function searchFixture(homeName, awayName, date) {
  try {
    console.log(`\n🔍 Cercando: ${homeName} vs ${awayName} il ${date}...`);
    
    const response = await axios.get(`${BASE_URL}/fixtures/date/${date}`, {
      params: {
        api_token: SPORTSMONKS_API_KEY,
        include: 'participants;scores;statistics;league'
      }
    });

    const fixtures = response.data.data;
    const found = fixtures.find(f => {
      const home = f.participants?.find(p => p.meta?.location === 'home')?.name || '';
      const away = f.participants?.find(p => p.meta?.location === 'away')?.name || '';
      
      return (
        home.toLowerCase().includes(homeName.toLowerCase()) ||
        homeName.toLowerCase().includes(home.toLowerCase())
      ) && (
        away.toLowerCase().includes(awayName.toLowerCase()) ||
        awayName.toLowerCase().includes(away.toLowerCase())
      );
    });

    return found;
  } catch (error) {
    console.error(`   ❌ Errore ricerca: ${error.message}`);
    return null;
  }
}

async function getMatchPrediction(fixtureId, homeTeamId, awayTeamId, leagueId, seasonId) {
  try {
    const response = await axios.get(`${API_URL}/api/predictions/generate`, {
      params: {
        fixtureId,
        homeTeamId,
        awayTeamId,
        leagueId,
        seasonId
      },
      timeout: 30000
    });

    return response.data;
  } catch (error) {
    console.error(`   ❌ Errore predizione: ${error.message}`);
    return null;
  }
}

function analyzeStatistics(fixture) {
  const stats = fixture.statistics || [];
  
  // Le statistiche sono un array piatto, non divise per location
  const getStatValue = (location, key) => {
    const stat = stats.find(s => 
      s.location === location && 
      (s.type?.name === key || s.type?.developer_name === key)
    );
    return stat ? parseFloat(stat.value?.all || stat.value || 0) : 0;
  };

  return {
    home: {
      possession: getStatValue('home', 'Ball Possession') || getStatValue('home', 'ball-possession'),
      shots: getStatValue('home', 'Shots Total') || getStatValue('home', 'shots-total'),
      shotsOnTarget: getStatValue('home', 'Shots On Target') || getStatValue('home', 'shots-on-target'),
      corners: getStatValue('home', 'Corner Kicks') || getStatValue('home', 'corner-kicks'),
      fouls: getStatValue('home', 'Fouls') || getStatValue('home', 'fouls'),
      yellowCards: getStatValue('home', 'Yellow Cards') || getStatValue('home', 'yellow-cards'),
      redCards: getStatValue('home', 'Red Cards') || getStatValue('home', 'red-cards'),
      attacks: getStatValue('home', 'Total Attacks') || getStatValue('home', 'attacks'),
      dangerousAttacks: getStatValue('home', 'Dangerous Attacks') || getStatValue('home', 'dangerous-attacks')
    },
    away: {
      possession: getStatValue('away', 'Ball Possession') || getStatValue('away', 'ball-possession'),
      shots: getStatValue('away', 'Shots Total') || getStatValue('away', 'shots-total'),
      shotsOnTarget: getStatValue('away', 'Shots On Target') || getStatValue('away', 'shots-on-target'),
      corners: getStatValue('away', 'Corner Kicks') || getStatValue('away', 'corner-kicks'),
      fouls: getStatValue('away', 'Fouls') || getStatValue('away', 'fouls'),
      yellowCards: getStatValue('away', 'Yellow Cards') || getStatValue('away', 'yellow-cards'),
      redCards: getStatValue('away', 'Red Cards') || getStatValue('away', 'red-cards'),
      attacks: getStatValue('away', 'Total Attacks') || getStatValue('away', 'attacks'),
      dangerousAttacks: getStatValue('away', 'Dangerous Attacks') || getStatValue('away', 'dangerous-attacks')
    }
  };
}

function identifyProblem(bet, prediction, statistics) {
  const problems = [];

  // PATTERN 1: X2 fallisce per vittoria casa
  if (bet.prediction === 'X2' && bet.result.startsWith('2-0')) {
    problems.push({
      type: 'UNDERESTIMATED_HOME',
      severity: 'HIGH',
      description: `Sottovalutata la forza della squadra casa`,
      evidence: [
        `Possesso palla casa: ${statistics.home.possession}%`,
        `Tiri casa: ${statistics.home.shots} (${statistics.home.shotsOnTarget} in porta)`,
        `Attacchi pericolosi casa: ${statistics.home.dangerousAttacks}`
      ]
    });
  }

  // PATTERN 2: 12 fallisce per pareggio
  if (bet.prediction === '12' && bet.result.includes('-') && 
      bet.result.split('-')[0] === bet.result.split('-')[1]) {
    problems.push({
      type: 'MISSED_DRAW',
      severity: 'MEDIUM',
      description: `Non identificato equilibrio tra le squadre`,
      evidence: [
        `Possesso equilibrato: ${statistics.home.possession}% vs ${statistics.away.possession}%`,
        `Tiri simili: ${statistics.home.shots} vs ${statistics.away.shots}`,
        `Risultato finale: ${bet.result}`
      ]
    });
  }

  // PATTERN 3: Confidence troppo alta per una partita equilibrata
  if (prediction && prediction.confidence > 0.70) {
    const homeScore = parseInt(bet.result.split('-')[0]);
    const awayScore = parseInt(bet.result.split('-')[1]);
    if (Math.abs(homeScore - awayScore) <= 1) {
      problems.push({
        type: 'OVERCONFIDENT',
        severity: 'HIGH',
        description: `Confidence troppo alta (${(prediction.confidence * 100).toFixed(1)}%) per una partita equilibrata`,
        evidence: [
          `Expected: ${prediction.predictedOutcome}`,
          `Reality: Match equilibrato (${bet.result})`,
          `Confidence: ${(prediction.confidence * 100).toFixed(1)}%`
        ]
      });
    }
  }

  // PATTERN 4: Statistiche in-game indicavano il contrario
  if (statistics.home.possession > 60 && bet.prediction.includes('2')) {
    problems.push({
      type: 'POSSESSION_MISMATCH',
      severity: 'MEDIUM',
      description: `Alta possesso palla casa (${statistics.home.possession}%) non riflessa nella predizione`,
      evidence: [
        `Possesso casa: ${statistics.home.possession}%`,
        `Predetto: ${bet.prediction}`,
        `Risultato: ${bet.result}`
      ]
    });
  }

  // PATTERN 5: Squilibrio nei tiri
  const shotRatio = statistics.home.shots / (statistics.away.shots || 1);
  if (shotRatio > 2 && bet.prediction.includes('2')) {
    problems.push({
      type: 'SHOT_DOMINANCE',
      severity: 'HIGH',
      description: `Casa ha dominato i tiri (ratio ${shotRatio.toFixed(2)})`,
      evidence: [
        `Tiri casa: ${statistics.home.shots}`,
        `Tiri trasferta: ${statistics.away.shots}`,
        `Ratio: ${shotRatio.toFixed(2)}`
      ]
    });
  }

  return problems;
}

async function analyzeLostBet(bet) {
  console.log('\n' + '='.repeat(70));
  console.log(`📉 ANALISI SCHEDINA PERSA #${LOST_BETS.indexOf(bet) + 1}`);
  console.log('='.repeat(70));
  
  console.log(`📅 Data: ${bet.date}`);
  console.log(`⚽ Match: ${bet.match}`);
  console.log(`🎯 Predizione: ${bet.prediction} @${bet.odds}`);
  console.log(`📊 Risultato: ${bet.result}`);
  console.log(`💡 Analisi: ${bet.analysis}`);

  // Cerca il fixture
  const [home, away] = bet.match.split(' vs ');
  const fixture = await searchFixture(home, away, bet.date);

  if (!fixture) {
    console.log('   ❌ Fixture non trovato');
    return null;
  }

  console.log(`   ✓ Fixture trovato: ID ${fixture.id}`);

  // Estrai statistiche partita
  const statistics = analyzeStatistics(fixture);
  
  console.log('\n📊 STATISTICHE PARTITA:');
  console.log(`   Possesso: ${statistics.home.possession}% - ${statistics.away.possession}%`);
  console.log(`   Tiri: ${statistics.home.shots} - ${statistics.away.shots}`);
  console.log(`   Tiri in porta: ${statistics.home.shotsOnTarget} - ${statistics.away.shotsOnTarget}`);
  console.log(`   Corner: ${statistics.home.corners} - ${statistics.away.corners}`);
  console.log(`   Attacchi pericolosi: ${statistics.home.dangerousAttacks} - ${statistics.away.dangerousAttacks}`);

  // Ottieni predizione ML
  const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
  const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');
  const leagueId = fixture.league?.id;
  const seasonId = fixture.season_id;

  let prediction = null;
  if (homeTeam && awayTeam) {
    prediction = await getMatchPrediction(
      fixture.id,
      homeTeam.id,
      awayTeam.id,
      leagueId,
      seasonId
    );

    if (prediction) {
      console.log('\n🤖 PREDIZIONE ML:');
      console.log(`   Outcome: ${prediction.predictedOutcome}`);
      console.log(`   Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
      console.log(`   Prob 1X2: ${(prediction.probabilities?.home * 100).toFixed(1)}% / ${(prediction.probabilities?.draw * 100).toFixed(1)}% / ${(prediction.probabilities?.away * 100).toFixed(1)}%`);
      
      if (prediction.recommendations?.length > 0) {
        console.log('\n   📋 Raccomandazioni:');
        prediction.recommendations.slice(0, 3).forEach((rec, idx) => {
          console.log(`      ${idx + 1}. ${rec.market}: ${rec.selection} @${rec.odds?.toFixed(2)} (Conf: ${(rec.confidence * 100).toFixed(1)}%)`);
        });
      }
    }
  }

  // Identifica problemi
  const problems = identifyProblem(bet, prediction, statistics);
  
  if (problems.length > 0) {
    console.log('\n🚨 PROBLEMI IDENTIFICATI:');
    problems.forEach((problem, idx) => {
      console.log(`\n   ${idx + 1}. [${problem.severity}] ${problem.type}`);
      console.log(`      ${problem.description}`);
      console.log(`      Evidence:`);
      problem.evidence.forEach(ev => console.log(`         - ${ev}`));
    });
  }

  return { bet, fixture, statistics, prediction, problems };
}

async function generateSummary(results) {
  console.log('\n\n' + '='.repeat(70));
  console.log('📊 SUMMARY ANALISI');
  console.log('='.repeat(70));

  // Conta problemi per tipo
  const problemCount = {};
  const allProblems = results.flatMap(r => r?.problems || []);
  
  allProblems.forEach(p => {
    problemCount[p.type] = (problemCount[p.type] || 0) + 1;
  });

  console.log('\n🔍 PATTERN IDENTIFICATI:');
  Object.entries(problemCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`   ${type}: ${count} occorrenze`);
    });

  // Raccomandazioni
  console.log('\n💡 RACCOMANDAZIONI PER MIGLIORARE:');

  if (problemCount.UNDERESTIMATED_HOME >= 2) {
    console.log('\n   1. 🏠 SOTTOVALUTAZIONE SQUADRA CASA');
    console.log('      Problema: Predizioni X2 falliscono quando la casa vince');
    console.log('      Soluzione: Aumentare homeAdvantage o ridurre confidence per X2');
    console.log('      Codice: Controllare lambda casa e fattore homeAdvantage nel motore');
  }

  if (problemCount.MISSED_DRAW >= 2) {
    console.log('\n   2. ⚖️  PAREGGI NON IDENTIFICATI');
    console.log('      Problema: Predizioni 12 falliscono per pareggio');
    console.log('      Soluzione: Migliorare identificazione match equilibrati');
    console.log('      Codice: Aggiustare threshold per drawProbability nel motore');
  }

  if (problemCount.OVERCONFIDENT >= 2) {
    console.log('\n   3. ⚠️  CONFIDENCE TROPPO ALTA');
    console.log('      Problema: Alta confidence su partite che si rivelano equilibrate');
    console.log('      Soluzione: Applicare penalty a confidence quando squadre sono simili');
    console.log('      Codice: Aggiungere confidenceFactor basato su differenza rating');
  }

  if (problemCount.POSSESSION_MISMATCH >= 1) {
    console.log('\n   4. 📊 POSSESSO PALLA IGNORATO');
    console.log('      Problema: Statistiche in-game non riflesse nella predizione');
    console.log('      Soluzione: Usare più dati real-time (forme recente, lineup)');
    console.log('      Codice: Integrare API lineup/injuries nei calcoli');
  }

  if (problemCount.SHOT_DOMINANCE >= 1) {
    console.log('\n   5. ⚽ DOMINANZA TIRI NON PREVISTA');
    console.log('      Problema: Non previsto dominio offensivo casa');
    console.log('      Soluzione: Dare più peso a xG nelle predizioni');
    console.log('      Codice: Aumentare peso xG expected nel calcolo lambda');
  }

  console.log('\n\n🎯 PRIORITÀ DI FIX:');
  const priorities = [
    { type: 'UNDERESTIMATED_HOME', count: problemCount.UNDERESTIMATED_HOME || 0, priority: 1 },
    { type: 'OVERCONFIDENT', count: problemCount.OVERCONFIDENT || 0, priority: 2 },
    { type: 'MISSED_DRAW', count: problemCount.MISSED_DRAW || 0, priority: 3 },
    { type: 'SHOT_DOMINANCE', count: problemCount.SHOT_DOMINANCE || 0, priority: 4 },
    { type: 'POSSESSION_MISMATCH', count: problemCount.POSSESSION_MISMATCH || 0, priority: 5 }
  ].filter(p => p.count > 0)
   .sort((a, b) => b.count - a.count);

  priorities.forEach((p, idx) => {
    console.log(`   ${idx + 1}. ${p.type} (${p.count} occorrenze) - Priority: ${p.priority === 1 ? 'HIGH' : p.priority === 2 ? 'MEDIUM' : 'LOW'}`);
  });
}

async function main() {
  console.log('🔍 ANALISI DETTAGLIATA DELLE 5 SCHEDINE PERSE\n');
  console.log('Obiettivo: Identificare pattern e problemi sistematici\n');

  const results = [];

  for (const bet of LOST_BETS) {
    const result = await analyzeLostBet(bet);
    if (result) results.push(result);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Pausa tra richieste
  }

  await generateSummary(results);

  console.log('\n\n✅ Analisi completata!');
  console.log('📝 Prossimi step: Implementare i fix suggeriti nel motore di predizione');
}

main().catch(console.error);
