// Analizza le partite di oggi e simula il calcolo Poisson
const axios = require('axios');

async function analyzeMatches() {
  console.log('\n🔍 ANALYZING TODAY\'S MATCHES\n');
  console.log('='.repeat(100));
  
  const matches = [
    { home: 'Werder Bremen', away: 'VfL Wolfsburg', league: 'Bundesliga' },
    { home: 'Paris FC', away: 'Rennes', league: 'Ligue 1' },
    { home: 'Pisa', away: 'Cremonese', league: 'Serie B' },
    { home: 'Elche', away: 'Real Sociedad', league: 'La Liga' }
  ];
  
  for (const match of matches) {
    console.log(`\n\n📊 ${match.home} vs ${match.away} (${match.league})`);
    console.log('-'.repeat(100));
    
    console.log('\n🎯 POSSIBLE ISSUES:');
    console.log('   1. Teams have similar strength → λHome ≈ λAway');
    console.log('   2. Not enough match history → Default values used');
    console.log('   3. xG data missing → Fallback to simple goals/matches');
    console.log('   4. Dynamic RHO not working properly');
    
    console.log('\n💡 TO DIAGNOSE:');
    console.log('   Check in frontend console → Network tab → API calls');
    console.log('   Look for: /api/predictions/* responses');
    console.log('   Check lambdaHome and lambdaAway values');
  }
  
  console.log('\n\n' + '='.repeat(100));
  console.log('\n📋 DIAGNOSIS CHECKLIST:\n');
  console.log('   ☐ Are lambdaHome and lambdaAway values similar (e.g., both ~1.0)?');
  console.log('   ☐ Are homeMatchesUsed and awayMatchesUsed low (< 5)?');
  console.log('   ☐ Is confidence low (< 50%)?');
  console.log('   ☐ Is dataQuality = "LOW"?');
  console.log('   ☐ Are team stats (goalsScored, matchesPlayed) equal or very similar?');
  
  console.log('\n\n🔧 LIKELY CAUSES:\n');
  console.log('   1️⃣  INSUFFICIENT DATA');
  console.log('      - Teams don\'t have enough recent matches');
  console.log('      - Model falls back to league average (~1.0 goals)');
  console.log('      - Solution: Load more historical fixtures\n');
  
  console.log('   2️⃣  TEAM STATS NOT UPDATED');
  console.log('      - goalsScored/matchesPlayed are outdated or wrong');
  console.log('      - All teams look similar statistically');
  console.log('      - Solution: Recalculate team statistics\n');
  
  console.log('   3️⃣  XG DATA MISSING');
  console.log('      - Expected Goals not fetched from API');
  console.log('      - Poisson uses basic goals average instead');
  console.log('      - Solution: Ensure xG fetching is working\n');
  
  console.log('   4️⃣  DYNAMIC RHO OVER-CORRECTION');
  console.log('      - Momentum/form adjustments neutralize differences');
  console.log('      - All adjustments cancel out');
  console.log('      - Solution: Check formMomentum calculations\n');
  
  console.log('\n📍 NEXT STEPS:\n');
  console.log('   1. Open browser DevTools (F12)');
  console.log('   2. Go to Network tab');
  console.log('   3. Refresh the predictions page');
  console.log('   4. Look for API calls to /predictions/*');
  console.log('   5. Check the response JSON:');
  console.log('      - lambdaHome: ?');
  console.log('      - lambdaAway: ?');
  console.log('      - homeMatchesUsed: ?');
  console.log('      - awayMatchesUsed: ?');
  console.log('      - confidence: ?');
  console.log('      - dataQuality: ?');
  console.log('\n   Send me these values and I\'ll identify the exact issue!\n');
}

analyzeMatches();
