const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'api', '.env') });

const API_KEY = process.env.SPORTSMONKS_API_KEY;

async function checkDirectStats() {
  console.log('🔍 Controllo Diretto Statistiche\n');
  
  try {
    // Juventus - season 25533
    console.log('=== JUVENTUS (625) - Season 25533 ===\n');
    const juvResponse = await axios.get(`https://api.sportmonks.com/v3/football/statistics/seasons/teams/625`, {
      params: {
        api_token: API_KEY,
        filters: 'seasonIds:25533',
        include: 'details.type'
      }
    });
    
    console.log(`Numero di record restituiti: ${juvResponse.data.data.length}\n`);
    
    juvResponse.data.data.forEach((record, index) => {
      console.log(`Record ${index + 1}:`);
      console.log(`  Season ID: ${record.season_id}`);
      console.log(`  League ID: ${record.league_id}`);
      console.log(`  Has Values: ${record.has_values}`);
      console.log(`  Participant ID: ${record.participant_id}`);
      
      if (record.has_values && record.details) {
        const wins = record.details.find(d => d.type?.code === 'team-wins');
        const draws = record.details.find(d => d.type?.code === 'team-draws');
        const losses = record.details.find(d => d.type?.code === 'team-lost');
        const games = record.details.find(d => d.type?.code === 'games-played');
        const goals = record.details.find(d => d.type?.code === 'goals');
        
        console.log(`  Games: ${games?.value?.total || 0}`);
        console.log(`  Record: ${wins?.value?.all?.count || 0}V-${draws?.value?.all?.count || 0}P-${losses?.value?.all?.count || 0}S`);
        console.log(`  Goals: ${goals?.value?.all?.count || 0}`);
      }
      console.log('');
    });
    
    // Torino - season 25533
    console.log('\n=== TORINO (613) - Season 25533 ===\n');
    const torResponse = await axios.get(`https://api.sportmonks.com/v3/football/statistics/seasons/teams/613`, {
      params: {
        api_token: API_KEY,
        filters: 'seasonIds:25533',
        include: 'details.type'
      }
    });
    
    console.log(`Numero di record restituiti: ${torResponse.data.data.length}\n`);
    
    torResponse.data.data.forEach((record, index) => {
      console.log(`Record ${index + 1}:`);
      console.log(`  Season ID: ${record.season_id}`);
      console.log(`  League ID: ${record.league_id}`);
      console.log(`  Has Values: ${record.has_values}`);
      console.log(`  Participant ID: ${record.participant_id}`);
      
      if (record.has_values && record.details) {
        const wins = record.details.find(d => d.type?.code === 'team-wins');
        const draws = record.details.find(d => d.type?.code === 'team-draws');
        const losses = record.details.find(d => d.type?.code === 'team-lost');
        const games = record.details.find(d => d.type?.code === 'games-played');
        const goals = record.details.find(d => d.type?.code === 'goals');
        
        console.log(`  Games: ${games?.value?.total || 0}`);
        console.log(`  Record: ${wins?.value?.all?.count || 0}V-${draws?.value?.all?.count || 0}P-${losses?.value?.all?.count || 0}S`);
        console.log(`  Goals: ${goals?.value?.all?.count || 0}`);
      }
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

checkDirectStats().catch(console.error);
