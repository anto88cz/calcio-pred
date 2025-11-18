// 🔍 ANALISI APPROFONDITA PATTERN DRAW - Q1 2025
// Analizza in dettaglio le 9 partite finite in pareggio che abbiamo perso

const fs = require('fs');

// Le 9 partite perse per draw dal Q1 2025 backtest
const DRAW_LOSSES = [
  { date: '2025-01-11', home: 'Espanyol', away: 'Leganés', result: '1-1', prediction: '12', odds: 1.36, league: 'LaLiga' },
  { date: '2025-01-25', home: 'Burnley', away: 'Swansea City', result: '0-0', prediction: '12', odds: 1.39, league: 'Championship' },
  { date: '2025-02-02', home: 'Middlesbrough', away: 'Stoke City', result: '1-1', prediction: '12', odds: 1.38, league: 'Championship' },
  { date: '2025-02-08', home: 'Cesena', away: 'Pisa', result: '1-1', prediction: '12', odds: 1.41, league: 'Serie B' },
  { date: '2025-02-08', home: 'Vitoria Guimaraes SC', away: 'Gil Vicente', result: '0-0', prediction: '12', odds: 1.44, league: 'Primeira Liga' },
  { date: '2025-02-15', home: 'Palermo', away: 'Sampdoria', result: '1-1', prediction: '12', odds: 1.40, league: 'Serie B' },
  { date: '2025-02-22', home: 'West Bromwich Albion', away: 'Millwall', result: '1-1', prediction: '12', odds: 1.44, league: 'Championship' },
  { date: '2025-02-28', home: 'Luton Town', away: 'Millwall', result: '0-0', prediction: '12', odds: 1.40, league: 'Championship' },
  { date: '2025-03-15', home: 'Watford', away: 'Middlesbrough', result: '1-1', prediction: '12', odds: 1.45, league: 'Championship' },
];

// Le 7 partite perse per vittoria casa (quando prevedevamo 12/X2)
const HOME_WIN_LOSSES = [
  { date: '2025-01-18', home: 'Mallorca', away: 'Valencia', result: '2-1', prediction: 'X2', odds: 1.44, league: 'LaLiga' },
  { date: '2025-01-19', home: 'Roma', away: 'Genoa', result: '3-1', prediction: '12', odds: 1.40, league: 'Serie A' },
  { date: '2025-02-01', home: 'Burnley', away: 'Middlesbrough', result: '1-0', prediction: '12', odds: 1.51, league: 'Championship' },
  { date: '2025-02-08', home: 'Cremonese', away: 'Mantova', result: '1-0', prediction: 'X2', odds: 1.50, league: 'Serie B' },
  { date: '2025-02-15', home: 'Blackburn Rovers', away: 'Cardiff City', result: '3-0', prediction: '12', odds: 1.31, league: 'Championship' },
  { date: '2025-02-23', home: 'Derby County', away: 'Coventry City', result: '2-1', prediction: '12', odds: 1.50, league: 'Championship' },
  { date: '2025-03-08', home: 'Burnley', away: 'Derby County', result: '2-0', prediction: '12', odds: 1.36, league: 'Championship' },
];

// L'unica partita persa per vittoria trasferta
const AWAY_WIN_LOSS = [
  { date: '2025-02-09', home: 'Brescia', away: 'Spezia', result: '0-2', prediction: '1X', odds: 1.48, league: 'Serie B' },
];

function analyzeByLeague() {
  console.log('\n' + '═'.repeat(80));
  console.log('📊 ANALISI PER LEGA');
  console.log('═'.repeat(80));
  
  const leagueStats = {};
  
  [...DRAW_LOSSES, ...HOME_WIN_LOSSES, ...AWAY_WIN_LOSS].forEach(match => {
    if (!leagueStats[match.league]) {
      leagueStats[match.league] = {
        total: 0,
        draws: 0,
        homeWins: 0,
        awayWins: 0,
        avgOdds: [],
      };
    }
    
    leagueStats[match.league].total++;
    leagueStats[match.league].avgOdds.push(match.odds);
    
    if (DRAW_LOSSES.includes(match)) leagueStats[match.league].draws++;
    if (HOME_WIN_LOSSES.includes(match)) leagueStats[match.league].homeWins++;
    if (AWAY_WIN_LOSS.includes(match)) leagueStats[match.league].awayWins++;
  });
  
  // Ordina per numero totale di perdite
  const sorted = Object.entries(leagueStats).sort((a, b) => b[1].total - a[1].total);
  
  sorted.forEach(([league, stats]) => {
    const avgOdds = (stats.avgOdds.reduce((a, b) => a + b, 0) / stats.avgOdds.length).toFixed(2);
    const drawRate = ((stats.draws / stats.total) * 100).toFixed(1);
    
    console.log(`\n🏆 ${league}`);
    console.log(`   Perdite totali: ${stats.total}`);
    console.log(`   - Draw: ${stats.draws} (${drawRate}%)`);
    console.log(`   - Home Win: ${stats.homeWins}`);
    console.log(`   - Away Win: ${stats.awayWins}`);
    console.log(`   Quota media: ${avgOdds}`);
    
    if (stats.draws >= stats.total * 0.6) {
      console.log(`   ⚠️ PROBLEMA DRAW! ${drawRate}% delle perdite sono draw`);
    }
  });
  
  // Identifica la lega più problematica
  const mostProblematic = sorted[0];
  console.log(`\n🚨 LEGA PIÙ PROBLEMATICA: ${mostProblematic[0]}`);
  console.log(`   ${mostProblematic[1].total} perdite su 17 totali (${((mostProblematic[1].total / 17) * 100).toFixed(1)}%)`);
}

function analyzeByOddsRange() {
  console.log('\n\n' + '═'.repeat(80));
  console.log('📊 ANALISI PER RANGE DI QUOTA');
  console.log('═'.repeat(80));
  
  const ranges = {
    'Very Low (< 1.35)': { min: 0, max: 1.35, matches: [] },
    'Low (1.35-1.40)': { min: 1.35, max: 1.40, matches: [] },
    'Medium-Low (1.40-1.45)': { min: 1.40, max: 1.45, matches: [] },
    'Medium (1.45-1.50)': { min: 1.45, max: 1.50, matches: [] },
    'Medium-High (> 1.50)': { min: 1.50, max: 99, matches: [] },
  };
  
  [...DRAW_LOSSES, ...HOME_WIN_LOSSES, ...AWAY_WIN_LOSS].forEach(match => {
    for (const [rangeName, range] of Object.entries(ranges)) {
      if (match.odds > range.min && match.odds <= range.max) {
        range.matches.push(match);
        break;
      }
    }
  });
  
  Object.entries(ranges).forEach(([rangeName, range]) => {
    if (range.matches.length === 0) return;
    
    const draws = range.matches.filter(m => DRAW_LOSSES.includes(m)).length;
    const homeWins = range.matches.filter(m => HOME_WIN_LOSSES.includes(m)).length;
    const drawRate = ((draws / range.matches.length) * 100).toFixed(1);
    
    console.log(`\n📈 ${rangeName}`);
    console.log(`   Totale perdite: ${range.matches.length}`);
    console.log(`   - Draw: ${draws} (${drawRate}%)`);
    console.log(`   - Home Win: ${homeWins}`);
    console.log(`   - Away Win: ${range.matches.filter(m => AWAY_WIN_LOSS.includes(m)).length}`);
    
    if (draws >= range.matches.length * 0.5) {
      console.log(`   🚨 CRITICO! ${drawRate}% sono draw`);
    }
  });
  
  // Identifica il range più pericoloso per draw
  const dangerousRange = Object.entries(ranges)
    .map(([name, range]) => ({
      name,
      drawRate: range.matches.length > 0 ? (range.matches.filter(m => DRAW_LOSSES.includes(m)).length / range.matches.length) : 0,
      total: range.matches.length
    }))
    .filter(r => r.total > 0)
    .sort((a, b) => b.drawRate - a.drawRate)[0];
  
  console.log(`\n🎯 RANGE PIÙ PERICOLOSO PER DRAW: ${dangerousRange.name}`);
  console.log(`   ${(dangerousRange.drawRate * 100).toFixed(1)}% di draw rate`);
}

function analyzeByPredictionType() {
  console.log('\n\n' + '═'.repeat(80));
  console.log('📊 ANALISI PER TIPO DI PREDIZIONE');
  console.log('═'.repeat(80));
  
  const predTypes = {};
  
  [...DRAW_LOSSES, ...HOME_WIN_LOSSES, ...AWAY_WIN_LOSS].forEach(match => {
    if (!predTypes[match.prediction]) {
      predTypes[match.prediction] = {
        total: 0,
        draws: 0,
        homeWins: 0,
        awayWins: 0,
        avgOdds: [],
      };
    }
    
    predTypes[match.prediction].total++;
    predTypes[match.prediction].avgOdds.push(match.odds);
    
    if (DRAW_LOSSES.includes(match)) predTypes[match.prediction].draws++;
    if (HOME_WIN_LOSSES.includes(match)) predTypes[match.prediction].homeWins++;
    if (AWAY_WIN_LOSS.includes(match)) predTypes[match.prediction].awayWins++;
  });
  
  Object.entries(predTypes).forEach(([pred, stats]) => {
    const avgOdds = (stats.avgOdds.reduce((a, b) => a + b, 0) / stats.avgOdds.length).toFixed(2);
    const drawRate = ((stats.draws / stats.total) * 100).toFixed(1);
    
    console.log(`\n🎲 Predizione: ${pred}`);
    console.log(`   Perdite totali: ${stats.total}`);
    console.log(`   - Finita Draw: ${stats.draws} (${drawRate}%)`);
    console.log(`   - Finita Home Win: ${stats.homeWins}`);
    console.log(`   - Finita Away Win: ${stats.awayWins}`);
    console.log(`   Quota media: ${avgOdds}`);
    
    if (pred === '12' && stats.draws > stats.total * 0.5) {
      console.log(`   🚨 PROBLEMA CRITICO! ${pred} esclude il draw ma ${drawRate}% finisce in draw!`);
    }
  });
}

function analyzeByMonth() {
  console.log('\n\n' + '═'.repeat(80));
  console.log('📊 ANALISI PER MESE (PROGRESSIONE TEMPORALE)');
  console.log('═'.repeat(80));
  
  const months = {
    '01-Jan': [],
    '02-Feb': [],
    '03-Mar': [],
  };
  
  [...DRAW_LOSSES, ...HOME_WIN_LOSSES, ...AWAY_WIN_LOSS].forEach(match => {
    const month = match.date.substring(5, 7);
    const monthKey = month === '01' ? '01-Jan' : month === '02' ? '02-Feb' : '03-Mar';
    months[monthKey].push(match);
  });
  
  Object.entries(months).forEach(([month, matches]) => {
    if (matches.length === 0) return;
    
    const draws = matches.filter(m => DRAW_LOSSES.includes(m)).length;
    const drawRate = ((draws / matches.length) * 100).toFixed(1);
    
    console.log(`\n📅 ${month}`);
    console.log(`   Perdite totali: ${matches.length}`);
    console.log(`   - Draw: ${draws} (${drawRate}%)`);
    console.log(`   - Home Win: ${matches.filter(m => HOME_WIN_LOSSES.includes(m)).length}`);
    console.log(`   - Away Win: ${matches.filter(m => AWAY_WIN_LOSS.includes(m)).length}`);
    
    if (drawRate > 50) {
      console.log(`   ⚠️ Draw rate molto alto in questo periodo!`);
    }
  });
}

function analyzeSpecificTeams() {
  console.log('\n\n' + '═'.repeat(80));
  console.log('📊 ANALISI SQUADRE SPECIFICHE');
  console.log('═'.repeat(80));
  
  // Conta quante volte appaiono le stesse squadre
  const teamCounts = {};
  
  [...DRAW_LOSSES, ...HOME_WIN_LOSSES, ...AWAY_WIN_LOSS].forEach(match => {
    [match.home, match.away].forEach(team => {
      teamCounts[team] = (teamCounts[team] || 0) + 1;
    });
  });
  
  // Squadre che appaiono 2+ volte
  const repeatedTeams = Object.entries(teamCounts)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);
  
  console.log('\n🔄 SQUADRE CHE APPAIONO MULTIPLE VOLTE:');
  repeatedTeams.forEach(([team, count]) => {
    console.log(`   ${team}: ${count} volte`);
    
    // Trova le partite
    const teamMatches = [...DRAW_LOSSES, ...HOME_WIN_LOSSES, ...AWAY_WIN_LOSS]
      .filter(m => m.home === team || m.away === team);
    
    const teamDraws = teamMatches.filter(m => DRAW_LOSSES.includes(m)).length;
    
    teamMatches.forEach(m => {
      const outcome = DRAW_LOSSES.includes(m) ? 'DRAW' : HOME_WIN_LOSSES.includes(m) ? 'HOME' : 'AWAY';
      console.log(`      ${m.date}: ${m.home} vs ${m.away} → ${outcome} (${m.result})`);
    });
    
    if (teamDraws >= 2) {
      console.log(`      ⚠️ Squadra problematica per draw! ${teamDraws} draw su ${count} partite`);
    }
  });
}

function generateRecommendations() {
  console.log('\n\n' + '═'.repeat(80));
  console.log('💡 RACCOMANDAZIONI BASATE SULL\'ANALISI');
  console.log('═'.repeat(80));
  
  // Calcola statistiche chiave
  const totalLosses = DRAW_LOSSES.length + HOME_WIN_LOSSES.length + AWAY_WIN_LOSS.length;
  const drawRate = (DRAW_LOSSES.length / totalLosses * 100).toFixed(1);
  
  const championshipLosses = [...DRAW_LOSSES, ...HOME_WIN_LOSSES].filter(m => m.league === 'Championship').length;
  const championshipDraws = DRAW_LOSSES.filter(m => m.league === 'Championship').length;
  
  const lowOddsDraws = DRAW_LOSSES.filter(m => m.odds <= 1.40).length;
  const pred12Draws = DRAW_LOSSES.filter(m => m.prediction === '12').length;
  
  console.log('\n📊 STATISTICHE CHIAVE:');
  console.log(`   • ${drawRate}% delle perdite sono draw (${DRAW_LOSSES.length}/${totalLosses})`);
  console.log(`   • Championship: ${championshipLosses} perdite, ${championshipDraws} sono draw`);
  console.log(`   • ${lowOddsDraws}/${DRAW_LOSSES.length} draw avevano odds ≤ 1.40`);
  console.log(`   • ${pred12Draws}/${DRAW_LOSSES.length} draw erano predizioni "12" (no draw)`);
  
  console.log('\n\n🎯 RACCOMANDAZIONI PRIORITARIE:\n');
  
  console.log('1️⃣ FILTRO ANTI-DRAW PER QUOTE BASSE (PRIORITÀ ALTA)');
  console.log('   ✅ GIÀ IMPLEMENTATO: MIN_ODDS_SINGLE_EVENT = 1.42');
  console.log('   ✅ Questo dovrebbe eliminare ${lowOddsDraws} dei ${DRAW_LOSSES.length} draw');
  console.log('   📝 Verifica: Esegui backtest con fix e controlla se effettivamente skippa queste partite\n');
  
  console.log('2️⃣ CHAMPIONSHIP RICHIEDE ATTENZIONE SPECIALE (PRIORITÀ ALTA)');
  console.log(`   • ${championshipLosses} perdite su ${totalLosses} totali (${(championshipLosses/totalLosses*100).toFixed(1)}%)`);
  console.log(`   • ${championshipDraws} draw su ${championshipLosses} perdite Championship (${(championshipDraws/championshipLosses*100).toFixed(1)}%)`);
  console.log('   ✅ IMPLEMENTATO: homeAdvantage 1.15 → 1.18');
  console.log('   💡 SUGGERIMENTO: Considera filtro aggiuntivo per Championship con prediction "12"\n');
  
  console.log('3️⃣ PREDIZIONE "12" È MOLTO RISCHIOSA (PRIORITÀ MEDIA)');
  console.log(`   • ${pred12Draws}/${DRAW_LOSSES.length} draw erano "12" (esclude draw)`);
  console.log(`   • Quando diciamo "no draw" (12), nel ${(pred12Draws/DRAW_LOSSES.length*100).toFixed(1)}% finisce in draw!`);
  console.log('   💡 SUGGERIMENTO: Evitare "12" se odds < 1.45 O in Championship\n');
  
  console.log('4️⃣ SERIE B HA PATTERN SIMILE (PRIORITÀ MEDIA)');
  const serieBLosses = [...DRAW_LOSSES, ...HOME_WIN_LOSSES].filter(m => m.league === 'Serie B');
  const serieBDraws = DRAW_LOSSES.filter(m => m.league === 'Serie B');
  console.log(`   • ${serieBLosses.length} perdite, ${serieBDraws.length} draw`);
  console.log('   ✅ IMPLEMENTATO: homeAdvantage 1.12 → 1.15');
  console.log('   💡 Stesso approccio del Championship potrebbe funzionare\n');
  
  console.log('5️⃣ SQUADRE RIPETUTE (PRIORITÀ BASSA)');
  console.log('   • Burnley, Middlesbrough, Millwall appaiono 2+ volte');
  console.log('   💡 Possibile blacklist per squadre "draw-prone" nel Q1?\n');
  
  console.log('\n📋 PROSSIMI STEP:');
  console.log('   1. Testa fix attuale con backtest Q1');
  console.log('   2. Se ancora problemi draw, implementa filtro specifico Championship+12');
  console.log('   3. Considera aumentare MIN_ODDS anche per eventi multipli (attualmente solo singoli)');
  console.log('   4. Monitora se problema draw persiste in altri periodi o è specifico Q1\n');
}

console.log('🔍 ANALISI APPROFONDITA PATTERN DRAW - Q1 2025\n');
console.log(`Analizzando ${DRAW_LOSSES.length} draw, ${HOME_WIN_LOSSES.length} home wins, ${AWAY_WIN_LOSS.length} away win\n`);

analyzeByLeague();
analyzeByOddsRange();
analyzeByPredictionType();
analyzeByMonth();
analyzeSpecificTeams();
generateRecommendations();

console.log('\n✅ Analisi completata!\n');
