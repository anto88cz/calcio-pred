/**
 * Test Debug per Analisi
 * Verifica che il backend ritorni i dati corretti
 */

const API_URL = 'http://localhost:3001';

async function testAnalysis() {
  console.log('🔍 Test Analisi - Debug');
  console.log('================================\n');

  try {
    // Test 1: Chelsea vs Wolves
    console.log('📤 Richiesta: Chelsea vs Wolves');
    const response = await fetch(`${API_URL}/api/predictions/calculate-by-name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        homeTeamName: 'Chelsea',
        awayTeamName: 'Wolves',
      }),
    });

    console.log(`📡 Status: ${response.status} ${response.statusText}\n`);

    if (!response.ok) {
      const error = await response.json();
      console.log('❌ Errore ricevuto:');
      console.log(JSON.stringify(error, null, 2));
      return;
    }

    const data = await response.json();

    console.log('✅ Dati ricevuti:\n');

    // Verifica campi principali
    console.log('🎯 MARKET 1X2:');
    if (data.market1X2) {
      console.log(`  prob1: ${(data.market1X2.final?.prob1 * 100 || 0).toFixed(1)}%`);
      console.log(`  probX: ${(data.market1X2.final?.probX * 100 || 0).toFixed(1)}%`);
      console.log(`  prob2: ${(data.market1X2.final?.prob2 * 100 || 0).toFixed(1)}%`);
      console.log(`  strength: ${data.market1X2.strength}`);
    } else {
      console.log('  ❌ market1X2 non trovato!');
    }

    console.log('\n⚽ POISSON PARAMS:');
    if (data.poissonParams) {
      console.log(`  lambdaHome: ${data.poissonParams.lambdaHome?.toFixed(2) || '0.00'}`);
      console.log(`  lambdaAway: ${data.poissonParams.lambdaAway?.toFixed(2) || '0.00'}`);
      console.log(`  homeAdvantage: ${data.poissonParams.homeAdvantage?.toFixed(2) || '0.00'}`);
    } else {
      console.log('  ❌ poissonParams non trovato!');
    }

    console.log('\n🎚️ CONFIDENCE:');
    console.log(`  confidence: ${(data.confidence * 100 || 0).toFixed(1)}%`);
    console.log(`  confidenceLevel: ${data.confidenceLevel}`);

    console.log('\n📊 OVER/UNDER:');
    if (data.marketUnderOver) {
      Object.entries(data.marketUnderOver).forEach(([threshold, market]) => {
        const over = market?.final?.over || 0;
        const under = market?.final?.under || 0;
        console.log(`  O/U ${threshold}: Over ${(over * 100).toFixed(0)}% / Under ${(under * 100).toFixed(0)}%`);
      });
    } else {
      console.log('  ❌ marketUnderOver non trovato!');
    }

    console.log('\n🥅 BTTS:');
    if (data.marketBTTS) {
      console.log(`  yes: ${(data.marketBTTS.final?.yes * 100 || 0).toFixed(1)}%`);
      console.log(`  no: ${(data.marketBTTS.final?.no * 100 || 0).toFixed(1)}%`);
    } else {
      console.log('  ❌ marketBTTS non trovato!');
    }

    console.log('\n📈 FORM MOMENTUM:');
    if (data.formMomentum) {
      console.log(`  Home: ${data.formMomentum.home?.formLabel} (${(data.formMomentum.home?.formScore * 100 || 0).toFixed(0)}%)`);
      console.log(`  Away: ${data.formMomentum.away?.formLabel} (${(data.formMomentum.away?.formScore * 100 || 0).toFixed(0)}%)`);
    } else {
      console.log('  ❌ formMomentum non trovato!');
    }

    console.log('\n🤝 H2H ANALYSIS:');
    if (data.h2hAnalysis) {
      console.log(`  totalMatches: ${data.h2hAnalysis.totalMatches}`);
      console.log(`  homeWins: ${data.h2hAnalysis.homeWins}`);
      console.log(`  draws: ${data.h2hAnalysis.draws}`);
      console.log(`  awayWins: ${data.h2hAnalysis.awayWins}`);
    } else {
      console.log('  ⚠️ h2hAnalysis non trovato (opzionale)');
    }

    console.log('\n📋 TEAM STATS:');
    if (data.teamStats) {
      console.log(`  Home xG: ${data.teamStats.home?.xg?.toFixed(2) || '0.00'}`);
      console.log(`  Home xGA: ${data.teamStats.home?.xga?.toFixed(2) || '0.00'}`);
      console.log(`  Away xG: ${data.teamStats.away?.xg?.toFixed(2) || '0.00'}`);
      console.log(`  Away xGA: ${data.teamStats.away?.xga?.toFixed(2) || '0.00'}`);
    } else {
      console.log('  ❌ teamStats non trovato!');
    }

    console.log('\n================================');
    console.log('✅ Test completato!');
    console.log('\n📋 Raw Response (primo 1000 char):');
    console.log(JSON.stringify(data, null, 2).substring(0, 1000) + '...');

  } catch (err) {
    console.error('❌ Errore:', err.message);
  }
}

testAnalysis();
