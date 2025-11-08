/**
 * Test recupero quote reali da Sportsmonks
 * Testa con partite di campionati supportati
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001';

async function testPredictionWithOdds(homeTeam, awayTeam, league) {
  console.log(`\n🔍 Testing: ${homeTeam} vs ${awayTeam} (${league})`);
  console.log('='.repeat(60));
  
  try {
    const response = await axios.post(`${API_BASE}/api/predictions/calculate-by-name`, {
      homeTeamName: homeTeam,
      awayTeamName: awayTeam,
      leagueName: league,
      season: 2025
    });
    
    const data = response.data;
    
    console.log(`\n✅ Prediction received`);
    console.log(`   Confidence: ${(data.confidence * 100).toFixed(1)}%`);
    
    if (data.realOdds) {
      console.log(`\n🎲 REAL ODDS FOUND!`);
      console.log(`   Bookmakers: ${data.realOdds.bookmakerCount}`);
      console.log(`   Overround: ${((data.realOdds.overround - 1) * 100).toFixed(2)}%`);
      console.log(`\n   1X2 Odds:`);
      console.log(`   - Home (1): ${data.realOdds.odds1X2.home.toFixed(2)} (${(data.realOdds.odds1X2.prob1 * 100).toFixed(1)}%)`);
      console.log(`   - Draw (X): ${data.realOdds.odds1X2.draw.toFixed(2)} (${(data.realOdds.odds1X2.probX * 100).toFixed(1)}%)`);
      console.log(`   - Away (2): ${data.realOdds.odds1X2.away.toFixed(2)} (${(data.realOdds.odds1X2.prob2 * 100).toFixed(1)}%)`);
      
      if (data.realOdds.oddsOverUnder) {
        console.log(`\n   Over/Under 2.5:`);
        console.log(`   - Over: ${data.realOdds.oddsOverUnder.over25.toFixed(2)}`);
        console.log(`   - Under: ${data.realOdds.oddsOverUnder.under25.toFixed(2)}`);
      }
      
      if (data.realOdds.oddsBTTS) {
        console.log(`\n   BTTS:`);
        console.log(`   - Yes: ${data.realOdds.oddsBTTS.yes.toFixed(2)}`);
        console.log(`   - No: ${data.realOdds.oddsBTTS.no.toFixed(2)}`);
      }
      
      if (data.realOdds.lastUpdate) {
        console.log(`\n   Last Update: ${new Date(data.realOdds.lastUpdate).toLocaleString()}`);
      }
      
      // Comparazione con modello
      if (data.market1X2) {
        console.log(`\n📊 Model vs Bookmaker Comparison:`);
        const diff1 = (data.market1X2.final.prob1 - data.realOdds.odds1X2.prob1) * 100;
        const diffX = (data.market1X2.final.probX - data.realOdds.odds1X2.probX) * 100;
        const diff2 = (data.market1X2.final.prob2 - data.realOdds.odds1X2.prob2) * 100;
        
        console.log(`   - Home: Model ${(data.market1X2.final.prob1 * 100).toFixed(1)}% vs Bookmaker ${(data.realOdds.odds1X2.prob1 * 100).toFixed(1)}% (${diff1 > 0 ? '+' : ''}${diff1.toFixed(1)}%)`);
        if (Math.abs(diff1) > 5) console.log(`     ${diff1 > 0 ? '💎 VALUE BET!' : '⚠️ SOPRAVVALUTATO'}`);
        
        console.log(`   - Draw: Model ${(data.market1X2.final.probX * 100).toFixed(1)}% vs Bookmaker ${(data.realOdds.odds1X2.probX * 100).toFixed(1)}% (${diffX > 0 ? '+' : ''}${diffX.toFixed(1)}%)`);
        if (Math.abs(diffX) > 5) console.log(`     ${diffX > 0 ? '💎 VALUE BET!' : '⚠️ SOPRAVVALUTATO'}`);
        
        console.log(`   - Away: Model ${(data.market1X2.final.prob2 * 100).toFixed(1)}% vs Bookmaker ${(data.realOdds.odds1X2.prob2 * 100).toFixed(1)}% (${diff2 > 0 ? '+' : ''}${diff2.toFixed(1)}%)`);
        if (Math.abs(diff2) > 5) console.log(`     ${diff2 > 0 ? '💎 VALUE BET!' : '⚠️ SOPRAVVALUTATO'}`);
      }
      
    } else {
      console.log(`\n⚠️ NO REAL ODDS AVAILABLE`);
      console.log(`   Reason: Sportsmonks doesn't have bookmaker data for this match`);
      console.log(`   Try with upcoming matches from top leagues (Premier League, Serie A, etc.)`);
    }
    
  } catch (error) {
    console.error(`\n❌ ERROR:`, error.response?.data || error.message);
  }
}

async function main() {
  console.log('🎲 Testing Real Odds Integration from Sportsmonks');
  console.log('='.repeat(60));
  
  // Test con varie partite di campionati supportati
  const testCases = [
    { home: 'Liverpool', away: 'Aston Villa', league: 'Premier League' },
    { home: 'Inter', away: 'Napoli', league: 'Serie A' },
    { home: 'Barcelona', away: 'Real Madrid', league: 'La Liga' },
    { home: 'Bayern Munich', away: 'Borussia Dortmund', league: 'Bundesliga' },
    { home: 'PSG', away: 'Marseille', league: 'Ligue 1' },
  ];
  
  for (const test of testCases) {
    await testPredictionWithOdds(test.home, test.away, test.league);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Pausa 2s tra le richieste
  }
  
  console.log('\n✅ Test completed!');
}

main();
