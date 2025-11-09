const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'api', '.env') });

const API_KEY = process.env.SPORTSMONKS_API_KEY;

async function testXGData() {
  console.log('🔍 Test xG Data per Union Berlin e Bayern München\n');
  
  try {
    // Union Berlin (team ID che dovremmo trovare)
    console.log('=== Cerco partite recenti con xG per Union Berlin ===\n');
    
    const unionResponse = await axios.get(`https://api.sportmonks.com/v3/football/fixtures`, {
      params: {
        api_token: API_KEY,
        filters: 'fixtureSeasons:25533', // Stagione 2025/2026
        include: 'participants;scores;statistics.type',
      }
    });

    console.log(`Trovate ${unionResponse.data.data.length} partite per la stagione 25533\n`);
    
    // Filtra per Union Berlin o Bayern
    const relevantFixtures = unionResponse.data.data.filter(f => {
      const participants = f.participants || [];
      const hasUnion = participants.some(p => p.name && p.name.includes('Union Berlin'));
      const hasBayern = participants.some(p => p.name && p.name.includes('Bayern'));
      return hasUnion || hasBayern;
    }).slice(0, 5);

    console.log(`Trovate ${relevantFixtures.length} partite rilevanti\n`);

    for (const fixture of relevantFixtures) {
      console.log(`\nFixture ID: ${fixture.id}`);
      console.log(`  Nome: ${fixture.name}`);
      console.log(`  Data: ${fixture.starting_at}`);
      console.log(`  State: ${fixture.state_id}`);
      
      // Controlla se ha statistiche xG
      const stats = fixture.statistics || [];
      const xgStats = stats.filter(s => s.type?.code?.includes('xg') || s.type?.code?.includes('expected'));
      
      console.log(`  Statistiche totali: ${stats.length}`);
      console.log(`  Statistiche xG trovate: ${xgStats.length}`);
      
      if (xgStats.length > 0) {
        console.log(`  xG Stats:`);
        xgStats.forEach(xg => {
          console.log(`    - Type: ${xg.type?.code}, Value: ${xg.data?.value}`);
        });
      }
    }

    // Ora proviamo a cercare specificatamente per team con l'endpoint /teams/{id}/fixtures
    console.log('\n\n=== Test endpoint /teams/{teamId}/fixtures ===\n');
    
    // Cerca Union Berlin team ID
    const teamsSearch = await axios.get(`https://api.sportmonks.com/v3/football/teams/search/Union Berlin`, {
      params: {
        api_token: API_KEY,
      }
    });

    if (teamsSearch.data.data && teamsSearch.data.data.length > 0) {
      const unionTeam = teamsSearch.data.data[0];
      console.log(`Union Berlin Team ID: ${unionTeam.id} - ${unionTeam.name}\n`);
      
      // Ottieni fixtures per questo team
      const teamFixtures = await axios.get(`https://api.sportmonks.com/v3/football/teams/${unionTeam.id}`, {
        params: {
          api_token: API_KEY,
          include: 'latest.statistics.type',
        }
      });

      console.log('Ultime partite con statistiche:');
      if (teamFixtures.data.data.latest) {
        teamFixtures.data.data.latest.forEach(fixture => {
          console.log(`\n  Fixture: ${fixture.id} - ${fixture.name}`);
          console.log(`  Data: ${fixture.starting_at}`);
          
          const stats = fixture.statistics || [];
          const xgStats = stats.filter(s => {
            const code = s.type?.code || '';
            return code.includes('xg') || code.includes('expected');
          });
          
          console.log(`  xG Stats (${xgStats.length}):`);
          xgStats.forEach(xg => {
            console.log(`    - ${xg.type?.code}: ${JSON.stringify(xg.data)}`);
          });
        });
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testXGData().catch(console.error);
