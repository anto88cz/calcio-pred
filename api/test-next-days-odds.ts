/**
 * Script per trovare partite con quote disponibili nei prossimi giorni
 */

import dotenv from 'dotenv';
dotenv.config();

import apiFootballClient from './src/services/api-football/client';

async function testNextDaysOdds() {
  console.log('🧪 Testing fixtures in next 7 days for odds availability\n');

  try {
    // Genera le date per i prossimi 7 giorni
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    
    console.log(`📅 Checking dates: ${dates[0]} to ${dates[dates.length - 1]}\n`);

    const mainLeagues = [39, 135, 140, 78, 61]; // Premier, Serie A, La Liga, Bundesliga, Ligue 1
    let allFixtures: any[] = [];

    // Raccogli tutte le partite
    for (const date of dates) {
      const response = await apiFootballClient.request<{ response: any[] }>(
        `/fixtures`,
        { date }
      );
      
      if (response.response) {
        const dayFixtures = response.response.filter((f: any) => 
          mainLeagues.includes(f.league.id)
        );
        allFixtures = allFixtures.concat(dayFixtures);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`📊 Found ${allFixtures.length} fixtures in main leagues\n`);

    // Testa le prime 10 per vedere se hanno quote
    const fixturesWithOdds: any[] = [];
    
    for (const fixture of allFixtures.slice(0, 10)) {
      const fixtureId = fixture.fixture.id;
      const home = fixture.teams.home.name;
      const away = fixture.teams.away.name;
      const league = fixture.league.name;
      const time = fixture.fixture.date;

      console.log(`\n🔍 ${home} vs ${away}`);
      console.log(`   ID: ${fixtureId} | ${league}`);
      console.log(`   ${new Date(time).toLocaleString()}`);

      // Prova a recuperare le quote
      const oddsResponse = await apiFootballClient.request<{ response: any[] }>(
        `/odds`,
        { fixture: fixtureId }
      );

      if (oddsResponse.response && oddsResponse.response.length > 0) {
        const bookmakers = oddsResponse.response[0].bookmakers || [];
        if (bookmakers.length > 0) {
          console.log(`   ✅ ${bookmakers.length} bookmakers available`);
          fixturesWithOdds.push({ fixtureId, home, away, bookmakers: bookmakers.length });
        } else {
          console.log(`   ❌ No odds`);
        }
      } else {
        console.log(`   ❌ No odds`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n\n🎯 SUMMARY:');
    console.log(`Found ${fixturesWithOdds.length} fixtures with odds:\n`);
    
    fixturesWithOdds.forEach(f => {
      console.log(`✅ Fixture ${f.fixtureId}: ${f.home} vs ${f.away} (${f.bookmakers} bookmakers)`);
    });

    if (fixturesWithOdds.length > 0) {
      console.log('\n💡 Use these fixture IDs to test the odds system!');
    } else {
      console.log('\n⚠️ No fixtures found with odds. Try checking later or with different leagues.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testNextDaysOdds();
