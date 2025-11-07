/**
 * Script di test per verificare il recupero delle quote da API-Football
 */

import dotenv from 'dotenv';
dotenv.config();

import * as apiFootballOdds from './src/services/api-football/odds';

async function testOdds() {
  console.log('🧪 Testing API-Football Odds Service\n');

  // Test 1: Fetch by fixture ID (esempio: una partita di Champions League)
  console.log('📋 Test 1: Fetch odds by fixture ID');
  try {
    const fixtureId = 1388397; // Werder Bremen vs VfL Wolfsburg
    console.log(`   Fixture ID: ${fixtureId}`);
    
    const odds = await apiFootballOdds.fetchOddsByFixtureId(fixtureId);
    
    if (odds) {
      console.log('   ✅ Odds found!');
      console.log(`   🏠 Home: ${odds.odds1X2.home.toFixed(2)} (${(odds.odds1X2.prob1 * 100).toFixed(1)}%)`);
      console.log(`   ⚪ Draw: ${odds.odds1X2.draw.toFixed(2)} (${(odds.odds1X2.probX * 100).toFixed(1)}%)`);
      console.log(`   ✈️  Away: ${odds.odds1X2.away.toFixed(2)} (${(odds.odds1X2.prob2 * 100).toFixed(1)}%)`);
      console.log(`   📊 Bookmakers: ${odds.bookmakerCount}`);
      console.log(`   💰 Margin: ${((odds.overround - 1) * 100).toFixed(2)}%`);
    } else {
      console.log('   ⚠️  No odds found for this fixture');
    }
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log('\n');

  // Test 2: Fetch by team names
  console.log('📋 Test 2: Fetch odds by team names');
  try {
    const homeTeam = 'West Ham';
    const awayTeam = 'Burnley';
    console.log(`   Teams: ${homeTeam} vs ${awayTeam}`);
    
    const odds = await apiFootballOdds.fetchOddsByTeams(homeTeam, awayTeam);
    
    if (odds) {
      console.log('   ✅ Odds found!');
      console.log(`   🏠 Home: ${odds.odds1X2.home.toFixed(2)} (${(odds.odds1X2.prob1 * 100).toFixed(1)}%)`);
      console.log(`   ⚪ Draw: ${odds.odds1X2.draw.toFixed(2)} (${(odds.odds1X2.probX * 100).toFixed(1)}%)`);
      console.log(`   ✈️  Away: ${odds.odds1X2.away.toFixed(2)} (${(odds.odds1X2.prob2 * 100).toFixed(1)}%)`);
      console.log(`   📊 Bookmakers: ${odds.bookmakerCount}`);
      console.log(`   💰 Margin: ${((odds.overround - 1) * 100).toFixed(2)}%`);
    } else {
      console.log('   ⚠️  No odds found for these teams');
    }
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log('\n🏁 Test completed');
  process.exit(0);
}

testOdds();
