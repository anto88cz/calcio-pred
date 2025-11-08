async function diagnoseMatch() {
  try {
    const response = await fetch('http://localhost:3001/api/predictions/calculate-by-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        homeTeamName: 'Kudrivka',
        awayTeamName: 'Kolos Kovalivka'
      })
    });
    
    if (!response.ok) {
      console.error('Error:', response.status);
      return;
    }
    
    const data = await response.json();
    
    console.log('🔍 DIAGNOSI MATCH: Kudrivka vs Kolos Kovalivka');
    console.log('⚽ RISULTATO REALE: 1-3');
    console.log('='.repeat(80));
    
    console.log('\n📊 STATISTICHE SQUADRE:');
    console.log('Home (Kudrivka):');
    console.log('  Goals Scored:', data.teamStats?.home?.goals?.for || 'N/A');
    console.log('  Goals Conceded:', data.teamStats?.home?.goals?.against || 'N/A');
    console.log('  Matches:', data.teamStats?.home?.matches || 'N/A');
    console.log('  Avg Goals For:', data.teamStats?.home?.avg?.goals?.for || 'N/A');
    console.log('  Avg Goals Against:', data.teamStats?.home?.avg?.goals?.against || 'N/A');
    
    console.log('\nAway (Kolos Kovalivka):');
    console.log('  Goals Scored:', data.teamStats?.away?.goals?.for || 'N/A');
    console.log('  Goals Conceded:', data.teamStats?.away?.goals?.against || 'N/A');
    console.log('  Matches:', data.teamStats?.away?.matches || 'N/A');
    console.log('  Avg Goals For:', data.teamStats?.away?.avg?.goals?.for || 'N/A');
    console.log('  Avg Goals Against:', data.teamStats?.away?.avg?.goals?.against || 'N/A');
    
    console.log('\n🎲 PREDIZIONI MODELLO:');
    console.log('Expected Goals:', `${data.poissonParams?.homeExpected?.toFixed(2)} - ${data.poissonParams?.awayExpected?.toFixed(2)}`);
    console.log('1X2 Probabilities:');
    console.log(`  Home: ${(data.market1X2?.home * 100).toFixed(1)}%`);
    console.log(`  Draw: ${(data.market1X2?.draw * 100).toFixed(1)}%`);
    console.log(`  Away: ${(data.market1X2?.away * 100).toFixed(1)}%`);
    
    console.log('\nOver/Under 2.5:');
    console.log(`  Over: ${(data.marketUnderOver?.over25 * 100).toFixed(1)}%`);
    console.log(`  Under: ${(data.marketUnderOver?.under25 * 100).toFixed(1)}%`);
    
    console.log('\nBTTS:');
    console.log(`  Yes: ${(data.marketBTTS?.yes * 100).toFixed(1)}%`);
    console.log(`  No: ${(data.marketBTTS?.no * 100).toFixed(1)}%`);
    
    console.log('\nConfidence:', `${(data.confidence * 100).toFixed(1)}%`);
    
    console.log('\n📈 FORM MOMENTUM:');
    console.log('Home Form:', data.formMomentum?.home || 'N/A');
    console.log('Away Form:', data.formMomentum?.away || 'N/A');
    
    if (data.mlPrediction) {
      console.log('\n🤖 ML PREDICTION (Dixon-Coles):');
      console.log('Expected Goals:', `${data.mlPrediction.expectedGoals?.home?.toFixed(2)} - ${data.mlPrediction.expectedGoals?.away?.toFixed(2)}`);
      console.log('Probabilities:');
      console.log(`  Home: ${(data.mlPrediction.probabilities?.home * 100).toFixed(1)}%`);
      console.log(`  Draw: ${(data.mlPrediction.probabilities?.draw * 100).toFixed(1)}%`);
      console.log(`  Away: ${(data.mlPrediction.probabilities?.away * 100).toFixed(1)}%`);
      console.log('Most Likely Score:', data.mlPrediction.mostLikely);
      console.log('Confidence:', `${(data.mlPrediction.confidence * 100).toFixed(1)}%`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('❌ ERRORI RILEVATI:');
    
    const actualGoals = 4;
    const predictedGoals = data.poissonParams?.homeExpected + data.poissonParams?.awayExpected;
    const goalError = Math.abs(actualGoals - predictedGoals);
    
    console.log(`\n1. SOTTOSTIMA GOL: Previsti ${predictedGoals.toFixed(2)}, reali ${actualGoals} (errore: ${goalError.toFixed(2)})`);
    
    const actualResult = 'AWAY'; // 1-3
    const predictedResult = data.market1X2.home > data.market1X2.away && data.market1X2.home > data.market1X2.draw ? 'HOME' :
                            data.market1X2.away > data.market1X2.home && data.market1X2.away > data.market1X2.draw ? 'AWAY' : 'DRAW';
    
    if (actualResult !== predictedResult) {
      console.log(`2. RISULTATO ERRATO: Previsto ${predictedResult}, reale ${actualResult}`);
    }
    
    if (data.marketBTTS?.no > 0.9) {
      console.log(`3. BTTS SBAGLIATO: Previsto NO (${(data.marketBTTS.no * 100).toFixed(0)}%), ma entrambe hanno segnato`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

diagnoseMatch();
