/**
 * Test dello endpoint /api/predictions/calculate-by-name
 * per verificare cosa sta restituendo il backend
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function testAnalysisEndpoint() {
  console.log('🧪 Testing analysis endpoint...');
  console.log(`API URL: ${API_URL}`);
  
  // First, get today's real fixtures
  console.log('📅 Fetching today\'s fixtures to get real team names...\n');
  
  let testCases = [];
  
  try {
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/today`);
    if (fixturesResponse.ok) {
      const fixturesData = await fixturesResponse.json();
      const fixtures = fixturesData.matches || [];
      
      if (fixtures.length > 0) {
        console.log(`✅ Found ${fixtures.length} fixtures for today\n`);
        
        // Use the first 3 fixtures
        testCases = fixtures.slice(0, 3).map(f => ({
          homeTeamName: f.homeTeam,
          awayTeamName: f.awayTeam,
          league: f.competition,
        }));
        
        console.log('🏆 Will test these fixtures:');
        testCases.forEach((tc, idx) => {
          console.log(`  ${idx + 1}. ${tc.homeTeamName} vs ${tc.awayTeamName} (${tc.league})`);
        });
        console.log('');
      } else {
        console.log('⚠️  No fixtures found for today, using default test cases\n');
        testCases = [
          { homeTeamName: 'Werder Bremen', awayTeamName: 'VfL Wolfsburg' },
          { homeTeamName: 'Pisa', awayTeamName: 'Cremonese' },
        ];
      }
    } else {
      console.log('⚠️  Could not fetch fixtures, using default test cases\n');
      testCases = [
        { homeTeamName: 'Werder Bremen', awayTeamName: 'VfL Wolfsburg' },
        { homeTeamName: 'Pisa', awayTeamName: 'Cremonese' },
      ];
    }
  } catch (error) {
    console.log('⚠️  Error fetching fixtures:', error.message);
    console.log('Using default test cases\n');
    testCases = [
      { homeTeamName: 'Werder Bremen', awayTeamName: 'VfL Wolfsburg' },
      { homeTeamName: 'Pisa', awayTeamName: 'Cremonese' },
    ];
  }
  
  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📋 Test: ${testCase.homeTeamName} vs ${testCase.awayTeamName}`);
    console.log('='.repeat(80));
    
    try {
      const response = await fetch(`${API_URL}/api/predictions/calculate-by-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCase),
      });
      
      console.log(`\n📡 HTTP Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        
        console.log('\n✅ SUCCESS - Data received:');
        console.log('  - homeTeam:', data.homeTeam);
        console.log('  - awayTeam:', data.awayTeam);
        console.log('  - confidence:', data.confidence);
        console.log('  - confidenceLevel:', data.confidenceLevel);
        
        console.log('\n📊 Market 1X2:');
        if (data.market1X2) {
          console.log('  - prob1:', data.market1X2.final?.prob1, `(${(data.market1X2.final?.prob1 * 100).toFixed(1)}%)`);
          console.log('  - probX:', data.market1X2.final?.probX, `(${(data.market1X2.final?.probX * 100).toFixed(1)}%)`);
          console.log('  - prob2:', data.market1X2.final?.prob2, `(${(data.market1X2.final?.prob2 * 100).toFixed(1)}%)`);
          console.log('  - strength:', data.market1X2.strength);
        } else {
          console.log('  ❌ MISSING market1X2');
        }
        
        console.log('\n⚽ Poisson Params:');
        if (data.poissonParams) {
          console.log('  - lambdaHome:', data.poissonParams.lambdaHome?.toFixed(2));
          console.log('  - lambdaAway:', data.poissonParams.lambdaAway?.toFixed(2));
          console.log('  - homeAdvantage:', data.poissonParams.homeAdvantage?.toFixed(2));
        } else {
          console.log('  ❌ MISSING poissonParams');
        }
        
        console.log('\n📈 Over/Under 2.5:');
        if (data.marketUnderOver?.['2.5']) {
          console.log('  - over:', data.marketUnderOver['2.5'].final?.over, `(${(data.marketUnderOver['2.5'].final?.over * 100).toFixed(1)}%)`);
          console.log('  - under:', data.marketUnderOver['2.5'].final?.under, `(${(data.marketUnderOver['2.5'].final?.under * 100).toFixed(1)}%)`);
        } else {
          console.log('  ❌ MISSING marketUnderOver 2.5');
        }
        
        console.log('\n🥅 BTTS:');
        if (data.marketBTTS) {
          console.log('  - yes:', data.marketBTTS.final?.yes, `(${(data.marketBTTS.final?.yes * 100).toFixed(1)}%)`);
          console.log('  - no:', data.marketBTTS.final?.no, `(${(data.marketBTTS.final?.no * 100).toFixed(1)}%)`);
        } else {
          console.log('  ❌ MISSING marketBTTS');
        }
        
        console.log('\n🔥 Form Momentum:');
        if (data.formMomentum) {
          console.log('  - home:', data.formMomentum.home?.formLabel, `(${(data.formMomentum.home?.formScore * 100).toFixed(0)}%)`);
          console.log('  - away:', data.formMomentum.away?.formLabel, `(${(data.formMomentum.away?.formScore * 100).toFixed(0)}%)`);
        } else {
          console.log('  ❌ MISSING formMomentum');
        }
        
        console.log('\n📊 Team Stats:');
        if (data.teamStats) {
          console.log('  - home xG:', data.teamStats.home?.xg?.toFixed(2), '| xGA:', data.teamStats.home?.xga?.toFixed(2));
          console.log('  - away xG:', data.teamStats.away?.xg?.toFixed(2), '| xGA:', data.teamStats.away?.xga?.toFixed(2));
        } else {
          console.log('  ❌ MISSING teamStats');
        }
        
        console.log('\n🤝 H2H Analysis:');
        if (data.h2hAnalysis) {
          console.log('  - totalMatches:', data.h2hAnalysis.totalMatches);
          console.log('  - homeWins:', data.h2hAnalysis.homeWins);
          console.log('  - draws:', data.h2hAnalysis.draws);
          console.log('  - awayWins:', data.h2hAnalysis.awayWins);
          console.log('  - dominance:', data.h2hAnalysis.dominance);
        } else {
          console.log('  ℹ️  No H2H data available');
        }
        
        console.log('\n⚠️  CHECKING FOR ISSUES:');
        const issues = [];
        
        if (data.confidence === 0) issues.push('Confidence is 0');
        if (data.poissonParams?.lambdaHome === 0) issues.push('lambdaHome is 0');
        if (data.poissonParams?.lambdaAway === 0) issues.push('lambdaAway is 0');
        if (data.market1X2?.final?.prob1 === 0) issues.push('prob1 is 0');
        if (!data.market1X2) issues.push('market1X2 is missing');
        if (!data.poissonParams) issues.push('poissonParams is missing');
        
        if (issues.length > 0) {
          console.log('  ❌ ISSUES FOUND:');
          issues.forEach(issue => console.log(`     - ${issue}`));
        } else {
          console.log('  ✅ All data looks good!');
        }
        
      } else {
        const errorData = await response.json();
        console.log('\n❌ ERROR:', errorData);
      }
      
    } catch (error) {
      console.log('\n💥 EXCEPTION:', error.message);
      console.log('   Make sure the backend is running on', API_URL);
    }
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('🏁 Test completed');
  console.log('='.repeat(80));
}

// Run test
testAnalysisEndpoint().catch(console.error);
