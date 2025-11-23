/**
 * TEST DIRECT LINEUPS SERVICE
 * Chiama direttamente Sportsmonks API per vedere la struttura dati
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from api folder
dotenv.config({ path: join(__dirname, 'api', '.env') });

const API_KEY = process.env.SPORTSMONKS_API_KEY;

async function testDirectLineups() {
  console.log('🧪 TEST DIRECT SPORTSMONKS LINEUPS API\n');
  
  if (!API_KEY) {
    console.error('❌ SPORTSMONKS_API_KEY not found in api/.env');
    return;
  }
  
  try {
    // 1. Get today's fixtures
    const today = new Date().toISOString().split('T')[0];
    console.log(`📅 Fetching fixtures for ${today}...`);
    
    const fixturesRes = await axios.get(`https://api.sportmonks.com/v3/football/fixtures/between/${today}/${today}`, {
      params: {
        api_token: API_KEY,
        include: 'participants',
        per_page: 10,
      },
    });
    
    const fixtures = fixturesRes.data?.data || [];
    console.log(`✅ Found ${fixtures.length} fixtures\n`);
    
    if (fixtures.length === 0) {
      console.log('❌ No fixtures today. Using fixture ID 19426635 (test fixture)');
      
      // Test with known fixture
      const testFixtureId = 19426635;
      await testFixtureLineups(testFixtureId);
      return;
    }
    
    // Test first 2 fixtures
    for (let i = 0; i < Math.min(2, fixtures.length); i++) {
      const fixture = fixtures[i];
      const participants = fixture.participants || [];
      const home = participants.find(p => p.meta?.location === 'home');
      const away = participants.find(p => p.meta?.location === 'away');
      
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🏟️  ${home?.name || 'Unknown'} vs ${away?.name || 'Unknown'}`);
      console.log(`   ID: ${fixture.id}`);
      
      await testFixtureLineups(fixture.id);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

async function testFixtureLineups(fixtureId) {
  try {
    console.log(`\n🔍 Fetching lineups for fixture ${fixtureId}...`);
    
    const response = await axios.get(`https://api.sportmonks.com/v3/football/fixtures/${fixtureId}`, {
      params: {
        api_token: API_KEY,
        include: 'lineups',
      },
    });
    
    const fixture = response.data?.data;
    const lineups = fixture?.lineups || [];
    
    console.log(`✅ Lineups found: ${lineups.length} records`);
    
    if (lineups.length === 0) {
      console.log('⚠️  No lineups available for this fixture (might be pre-match)');
      return;
    }
    
    // Parse lineups by team
    const teamsMap = new Map();
    
    lineups.forEach(player => {
      const teamId = player.team_id;
      if (!teamsMap.has(teamId)) {
        teamsMap.set(teamId, {
          teamId,
          starters: [],
          substitutes: [],
        });
      }
      
      const team = teamsMap.get(teamId);
      const playerInfo = {
        id: player.player_id,
        name: player.player_name,
        position: player.formation_field || 'Unknown',
        jersey: player.jersey_number,
      };
      
      // type_id: 11 = starter, 12 = substitute
      if (player.type_id === 11) {
        team.starters.push(playerInfo);
      } else if (player.type_id === 12) {
        team.substitutes.push(playerInfo);
      }
    });
    
    // Display results
    console.log(`\n📊 PARSED LINEUPS:`);
    
    for (const [teamId, team] of teamsMap) {
      console.log(`\n   Team ${teamId}:`);
      console.log(`   - Starters: ${team.starters.length}`);
      console.log(`   - Substitutes: ${team.substitutes.length}`);
      
      if (team.starters.length > 0) {
        console.log(`\n   Starting XI:`);
        team.starters.slice(0, 5).forEach(p => {
          console.log(`      ${p.jersey} - ${p.name} (${p.position})`);
        });
        if (team.starters.length > 5) {
          console.log(`      ... and ${team.starters.length - 5} more`);
        }
      }
    }
    
    // Check formation deduction
    const firstTeam = Array.from(teamsMap.values())[0];
    if (firstTeam && firstTeam.starters.length > 0) {
      const formations = firstTeam.starters
        .map(p => p.position)
        .filter(pos => pos && pos !== 'Unknown');
      
      console.log(`\n   Formation fields: ${formations.slice(0, 5).join(', ')}...`);
      
      // Try to deduce formation (simplified)
      const positionCounts = new Map();
      formations.forEach(pos => {
        const line = pos.split(':')[0]; // e.g., "2:3" -> "2"
        positionCounts.set(line, (positionCounts.get(line) || 0) + 1);
      });
      
      console.log(`   Position counts by line:`, Object.fromEntries(positionCounts));
    }
    
  } catch (error) {
    console.error(`❌ Error fetching lineups:`, error.response?.data || error.message);
  }
}

testDirectLineups().catch(console.error);
