async function checkResults() {
  try {
    // Get today's finished matches
    const response = await fetch('http://localhost:3001/api/fixtures/sm/today');
    const data = await response.json();
    
    console.log('📊 VERIFICA PREDIZIONI vs RISULTATI REALI\n');
    console.log('='.repeat(80));
    
    if (!data.fixtures || data.fixtures.length === 0) {
      console.log('Nessuna partita trovata per oggi');
      return;
    }
    
    const finished = data.fixtures.filter(f => f.statusShort === 'FT' || f.statusShort === 'AET' || f.statusShort === 'PEN');
    
    console.log(`\nPartite finite oggi: ${finished.length} / ${data.fixtures.length}\n`);
    
    let correct = 0;
    let total = 0;
    
    for (const match of finished.slice(0, 10)) {
      console.log(`\n🏆 ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      console.log(`   League: ${match.league.name} (${match.league.country})`);
      console.log(`   Score: ${match.homeScore} - ${match.awayScore}`);
      
      // Get prediction for this match
      try {
        const predResponse = await fetch('http://localhost:3001/api/predictions/calculate-by-name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            homeTeamName: match.homeTeam.name,
            awayTeamName: match.awayTeam.name,
            fixtureId: match.id
          })
        });
        
        if (predResponse.ok) {
          const pred = await predResponse.json();
          
          console.log(`   `);
          console.log(`   📊 PREDIZIONI:`);
          console.log(`      1X2: H:${(pred.market1X2.home * 100).toFixed(0)}% D:${(pred.market1X2.draw * 100).toFixed(0)}% A:${(pred.market1X2.away * 100).toFixed(0)}%`);
          console.log(`      Expected Goals: ${pred.poissonParams.homeExpected.toFixed(2)} - ${pred.poissonParams.awayExpected.toFixed(2)}`);
          console.log(`      Confidence: ${(pred.confidence * 100).toFixed(0)}%`);
          
          // Check if prediction was correct
          const actualResult = match.homeScore > match.awayScore ? 'HOME' : match.homeScore < match.awayScore ? 'AWAY' : 'DRAW';
          const predictedResult = pred.market1X2.home > pred.market1X2.draw && pred.market1X2.home > pred.market1X2.away ? 'HOME' :
                                  pred.market1X2.away > pred.market1X2.draw && pred.market1X2.away > pred.market1X2.home ? 'AWAY' : 'DRAW';
          
          const isCorrect = actualResult === predictedResult;
          console.log(`      Predicted: ${predictedResult} | Actual: ${actualResult} | ${isCorrect ? '✅ CORRECT' : '❌ WRONG'}`);
          
          total++;
          if (isCorrect) correct++;
          
        } else {
          console.log(`   ⚠️ Predizione non disponibile (${predResponse.status})`);
        }
      } catch (err) {
        console.log(`   ⚠️ Errore predizione: ${err.message}`);
      }
      
      console.log(`   ${'─'.repeat(76)}`);
    }
    
    console.log(`\n\n📈 ACCURACY TOTALE: ${correct}/${total} (${total > 0 ? ((correct/total)*100).toFixed(1) : 0}%)\n`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkResults();
