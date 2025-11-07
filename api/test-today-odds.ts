/**
 * Script per testare quali partite di oggi hanno quote disponibili
 */

import dotenv from 'dotenv';
dotenv.config();

import apiFootballClient from './src/services/api-football/client';

async function testTodayOdds() {
  console.log('🧪 Testing which fixtures have odds available\n');

  try {
    // Prendi le partite di oggi
    const today = new Date().toISOString().split('T')[0];
    console.log(`📅 Date: ${today}\n`);

    const response = await apiFootballClient.request<{ response: any[] }>(
      `/fixtures`,
      { date: today }
    );

    const fixtures = response.response || [];
    console.log(`📊 Found ${fixtures.length} fixtures today\n`);

    // Filtra solo le leghe principali (Premier League, Serie A, La Liga, Bundesliga, Ligue 1, Champions League)
    const mainLeagues = [39, 135, 140, 78, 61, 2];
    const mainFixtures = fixtures.filter(f => mainLeagues.includes(f.league.id));

    console.log(`🏆 ${mainFixtures.length} fixtures in main leagues\n`);

    // Testa le prime 5 per vedere se hanno quote
    for (const fixture of mainFixtures.slice(0, 5)) {
      const fixtureId = fixture.fixture.id;
      const home = fixture.teams.home.name;
      const away = fixture.teams.away.name;
      const league = fixture.league.name;
      const time = fixture.fixture.date;

      console.log(`\n🔍 Testing: ${home} vs ${away}`);
      console.log(`   League: ${league}`);
      console.log(`   Fixture ID: ${fixtureId}`);
      console.log(`   Time: ${new Date(time).toLocaleString()}`);

      // Prova a recuperare le quote
      const oddsResponse = await apiFootballClient.request<{ response: any[] }>(
        `/odds`,
        { fixture: fixtureId }
      );

      if (oddsResponse.response && oddsResponse.response.length > 0) {
        const bookmakers = oddsResponse.response[0].bookmakers || [];
        console.log(`   ✅ ODDS AVAILABLE - ${bookmakers.length} bookmakers`);
        
        // Mostra i primi 3 bookmaker
        const bookmakerNames = bookmakers.slice(0, 3).map(b => b.name).join(', ');
        if (bookmakerNames) {
          console.log(`   📊 Bookmakers: ${bookmakerNames}...`);
        }
      } else {
        console.log(`   ❌ NO ODDS`);
      }

      // Pausa per evitare rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n\n🎯 SUMMARY:');
    console.log('Use fixtures with ✅ ODDS AVAILABLE for testing real odds in the app!');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }

  process.exit(0);
}

testTodayOdds();
