/**
 * TEST LINEUP SERVICE STANDALONE
 * Testa il servizio lineups refactored senza backend
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, 'api', '.env') });

const API_KEY = process.env.SPORTSMONKS_API_KEY;

/**
 * Deduce formation from formation_field data
 */
function deduceFormation(starters) {
  if (starters.length !== 11) {
    return 'Unknown';
  }
  
  const lineCounts = new Map();
  
  starters.forEach(player => {
    const formationField = player.formation_field;
    if (!formationField || typeof formationField !== 'string') return;
    
    const parts = formationField.split(':');
    if (parts.length !== 2) return;
    
    const line = parseInt(parts[0], 10);
    if (isNaN(line) || line < 1) return;
    
    lineCounts.set(line, (lineCounts.get(line) || 0) + 1);
  });
  
  const defenders = lineCounts.get(2) || 0;
  const midfielders = lineCounts.get(3) || 0;
  const forwards = lineCounts.get(4) || 0;
  
  const totalOutfield = defenders + midfielders + forwards;
  if (totalOutfield !== 10) {
    console.log(`⚠️ Invalid formation: ${defenders}-${midfielders}-${forwards} (total ${totalOutfield})`);
    return 'Unknown';
  }
  
  return `${defenders}-${midfielders}-${forwards}`;
}

/**
 * Parse lineups with NEW refactored logic
 */
function parseLineups(lineups) {
  if (!Array.isArray(lineups) || lineups.length === 0) {
    console.log('⚠️ No lineups array');
    return { home: null, away: null };
  }
  
  // Group by team_id
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
    
    if (player.type_id === 11) {
      team.starters.push(player);
    } else if (player.type_id === 12) {
      team.substitutes.push(player);
    }
  });
  
  // Parse teams
  const teams = Array.from(teamsMap.values());
  
  if (teams.length < 2) {
    console.log(`⚠️ Only ${teams.length} team found`);
    return { home: null, away: null };
  }
  
  const parseTeam = (team) => ({
    formation: deduceFormation(team.starters),
    confirmed: team.starters.length === 11,
    startingXI: team.starters.map(p => ({
      playerId: p.player_id,
      playerName: p.player_name,
      position: p.formation_field || 'Unknown',
    })),
    substitutes: team.substitutes.map(p => ({
      playerId: p.player_id,
      playerName: p.player_name,
    })),
  });
  
  return {
    home: parseTeam(teams[0]),
    away: parseTeam(teams[1]),
  };
}

/**
 * Calculate lineup status score (NEW logic)
 */
function calculateLineupStatus(lineups) {
  if (!lineups || lineups.length === 0) {
    return 0.80; // -20% penalty
  }
  
  if (lineups.length === 1) {
    const lineup = lineups[0];
    const completeness = Math.min(lineup.startingXI.length / 11, 1.0);
    return 0.85 * completeness; // -15% penalty
  }
  
  const homeLineup = lineups[0];
  const awayLineup = lineups[1];
  
  const homeCompleteness = Math.min(homeLineup.startingXI.length / 11, 1.0);
  const awayCompleteness = Math.min(awayLineup.startingXI.length / 11, 1.0);
  const avgCompleteness = (homeCompleteness + awayCompleteness) / 2;
  
  let score = avgCompleteness;
  
  // Bonus for confirmed lineups
  const bothConfirmed = homeLineup.confirmed && awayLineup.confirmed;
  if (bothConfirmed) {
    score *= 1.05;
  }
  
  // Bonus for known formations
  const bothHaveFormation = 
    homeLineup.formation && homeLineup.formation !== 'Unknown' &&
    awayLineup.formation && awayLineup.formation !== 'Unknown';
  
  if (bothHaveFormation) {
    score *= 1.05;
  }
  
  return Math.min(score, 1.10);
}

async function testLineupsStandalone() {
  console.log('🧪 TEST LINEUP SERVICE STANDALONE\n');
  
  if (!API_KEY) {
    console.error('❌ SPORTSMONKS_API_KEY not found');
    return;
  }
  
  try {
    // Test with known fixture
    const fixtureId = 19425657; // FC København vs Brøndby IF
    
    console.log(`📥 Fetching lineups for fixture ${fixtureId}...`);
    
    const response = await axios.get(`https://api.sportmonks.com/v3/football/fixtures/${fixtureId}`, {
      params: {
        api_token: API_KEY,
        include: 'lineups',
      },
    });
    
    const lineups = response.data?.data?.lineups || [];
    console.log(`✅ Received ${lineups.length} lineup records\n`);
    
    // Parse with NEW logic
    const parsed = parseLineups(lineups);
    
    console.log('📊 PARSED LINEUPS:\n');
    
    if (parsed.home) {
      console.log(`HOME TEAM:`);
      console.log(`  Formation: ${parsed.home.formation}`);
      console.log(`  Confirmed: ${parsed.home.confirmed ? 'YES' : 'NO'}`);
      console.log(`  Starters: ${parsed.home.startingXI.length}`);
      console.log(`  Substitutes: ${parsed.home.substitutes.length}`);
      console.log(`  Starting XI (first 5):`);
      parsed.home.startingXI.slice(0, 5).forEach(p => {
        console.log(`    - ${p.playerName} (${p.position})`);
      });
    }
    
    console.log('');
    
    if (parsed.away) {
      console.log(`AWAY TEAM:`);
      console.log(`  Formation: ${parsed.away.formation}`);
      console.log(`  Confirmed: ${parsed.away.confirmed ? 'YES' : 'NO'}`);
      console.log(`  Starters: ${parsed.away.startingXI.length}`);
      console.log(`  Substitutes: ${parsed.away.substitutes.length}`);
      console.log(`  Starting XI (first 5):`);
      parsed.away.startingXI.slice(0, 5).forEach(p => {
        console.log(`    - ${p.playerName} (${p.position})`);
      });
    }
    
    // Test lineup status calculation
    const lineupsArray = [parsed.home, parsed.away].filter(Boolean);
    const lineupStatus = calculateLineupStatus(lineupsArray);
    
    console.log(`\n📈 LINEUP STATUS SCORE:`);
    console.log(`  Score: ${(lineupStatus * 100).toFixed(1)}%`);
    console.log(`  Impact on confidence: ${lineupStatus >= 1.0 ? 'BOOST ✅' : lineupStatus >= 0.95 ? 'NEUTRAL' : 'PENALTY ⚠️'}`);
    
    if (lineupStatus < 0.95) {
      const penalty = ((1.0 - lineupStatus) * 100).toFixed(1);
      console.log(`  Confidence reduction: -${penalty}%`);
    } else if (lineupStatus > 1.0) {
      const boost = ((lineupStatus - 1.0) * 100).toFixed(1);
      console.log(`  Confidence boost: +${boost}%`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testLineupsStandalone().catch(console.error);
