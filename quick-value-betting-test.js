// 🚀 TEST RAPIDO VALUE BETTING - Versione Semplificata (senza TensorFlow)
const axios = require('axios');

class QuickValueBetting {
  constructor() {
    this.apiKey = '81d8ada776a8b5373697743a1c0c8ad6';
    this.baseURL = 'https://v3.football.api-sports.io';
  }

  async makeRequest(endpoint, params = {}) {
    const response = await axios.get(`${this.baseURL}${endpoint}`, {
      headers: { 'x-rapidapi-key': this.apiKey },
      params,
      timeout: 15000
    });
    return response.data;
  }

  // Simula odds di mercato realistici per test
  getSimulatedOdds(prediction) {
    // Simula come i bookmaker prezzerebbero questo match
    const { prob1, probX, prob2 } = prediction.prob1X2;
    
    // Aggiungi margine bookmaker ~5%
    const margin = 1.05;
    
    return {
      home: (1 / prob1) * margin,
      draw: (1 / probX) * margin,
      away: (1 / prob2) * margin,
      provider: 'Simulated Market'
    };
  }

  oddsToImpliedProbabilities(odds) {
    const impliedHome = 1 / odds.home;
    const impliedDraw = 1 / odds.draw;
    const impliedAway = 1 / odds.away;
    
    const total = impliedHome + impliedDraw + impliedAway;
    
    return {
      home: impliedHome / total,
      draw: impliedDraw / total,
      away: impliedAway / total,
      margin: (total - 1) * 100
    };
  }

  calculateValueBets(ourPrediction, marketOdds) {
    const implied = this.oddsToImpliedProbabilities(marketOdds);
    
    const values = {
      home: {
        ourProb: ourPrediction.prob1X2.prob1,
        marketProb: implied.home,
        odds: marketOdds.home,
        value: ourPrediction.prob1X2.prob1 - implied.home,
        expectedValue: (ourPrediction.prob1X2.prob1 * marketOdds.home) - 1,
        recommend: false
      },
      draw: {
        ourProb: ourPrediction.prob1X2.probX,
        marketProb: implied.draw,
        odds: marketOdds.draw,
        value: ourPrediction.prob1X2.probX - implied.draw,
        expectedValue: (ourPrediction.prob1X2.probX * marketOdds.draw) - 1,
        recommend: false
      },
      away: {
        ourProb: ourPrediction.prob1X2.prob2,
        marketProb: implied.away,
        odds: marketOdds.away,
        value: ourPrediction.prob1X2.prob2 - implied.away,
        expectedValue: (ourPrediction.prob1X2.prob2 * marketOdds.away) - 1,
        recommend: false
      }
    };

    // Identifica value bets (soglia 3% valore minimo)
    Object.keys(values).forEach(key => {
      const bet = values[key];
      bet.recommend = bet.value > 0.03 && bet.expectedValue > 0;
    });

    return values;
  }

  getBestValueBet(values) {
    let best = null;
    let maxValue = 0;

    Object.keys(values).forEach(key => {
      if (values[key].recommend && values[key].value > maxValue) {
        maxValue = values[key].value;
        best = { outcome: key, ...values[key] };
      }
    });

    return best;
  }

  calculateKellyStake(bankroll, probability, odds, conservativeFactor = 0.25) {
    const b = odds - 1;
    const p = probability;
    const q = 1 - p;
    
    const fullKelly = (b * p - q) / b;
    const conservativeKelly = fullKelly * conservativeFactor;
    
    return {
      fullKelly: Math.max(0, fullKelly),
      conservativeKelly: Math.max(0, conservativeKelly),
      recommendedStake: Math.max(0, bankroll * conservativeKelly),
      maxStake: bankroll * 0.05
    };
  }

  async testValueBettingOnMatch(homeTeamId, awayTeamId, homeTeamName, awayTeamName) {
    console.log('\n💰 ========================================');
    console.log('💰 VALUE BETTING TEST - CALCIO-PRED');
    console.log('💰 ========================================\n');

    // 1. Ottieniamo predizione Enhanced
    const EnhancedPredictor = require('./enhanced-predictor');
    const enhanced = new EnhancedPredictor();
    
    console.log(`🎯 Analizzando: ${homeTeamName} vs ${awayTeamName}`);
    console.log('📊 Calcolando predizione Enhanced...\n');

    const prediction = await enhanced.calculateEnhancedPrediction(homeTeamId, awayTeamId, 61, 2025);

    // 2. Simuliamo odds di mercato
    const marketOdds = this.getSimulatedOdds(prediction);

    console.log('🎯 NOSTRE PROBABILITÀ:');
    console.log(`   🏠 ${homeTeamName}: ${(prediction.prob1X2.prob1 * 100).toFixed(1)}%`);
    console.log(`   🤝 Pareggio: ${(prediction.prob1X2.probX * 100).toFixed(1)}%`);
    console.log(`   ✈️ ${awayTeamName}: ${(prediction.prob1X2.prob2 * 100).toFixed(1)}%`);

    console.log(`\n💰 ODDS SIMULATE DEL MERCATO:`);
    console.log(`   🏠 ${homeTeamName}: ${marketOdds.home.toFixed(2)}`);
    console.log(`   🤝 Pareggio: ${marketOdds.draw.toFixed(2)}`);
    console.log(`   ✈️ ${awayTeamName}: ${marketOdds.away.toFixed(2)}`);

    // 3. Calcolo value betting
    const valueBets = this.calculateValueBets(prediction, marketOdds);
    const implied = this.oddsToImpliedProbabilities(marketOdds);

    console.log(`\n📊 ANALISI VALUE BETTING:`);
    console.log(`   📈 Margine Bookmaker: ${implied.margin.toFixed(2)}%`);

    console.log(`\n💎 CONFRONTO VALUE:`);
    const outcomes = ['home', 'draw', 'away'];
    const labels = [homeTeamName, 'Pareggio', awayTeamName];
    
    let foundValue = false;
    
    outcomes.forEach((outcome, idx) => {
      const bet = valueBets[outcome];
      const valuePercentage = bet.value * 100;
      const evPercentage = bet.expectedValue * 100;
      
      if (bet.recommend) {
        foundValue = true;
        const kelly = this.calculateKellyStake(1000, bet.ourProb, bet.odds);
        
        console.log(`\n   🚨 VALUE BET TROVATO: ${labels[idx]}`);
        console.log(`      💰 Odds: ${bet.odds.toFixed(2)}`);
        console.log(`      📊 Nostra Prob: ${(bet.ourProb * 100).toFixed(1)}%`);
        console.log(`      📊 Market Prob: ${(bet.marketProb * 100).toFixed(1)}%`);
        console.log(`      💎 Value Edge: +${valuePercentage.toFixed(1)}%`);
        console.log(`      💵 Expected ROI: ${evPercentage.toFixed(1)}%`);
        console.log(`      🎯 Kelly Stake: €${kelly.recommendedStake.toFixed(0)}`);
        console.log(`      📊 Kelly %: ${(kelly.conservativeKelly * 100).toFixed(2)}% del bankroll`);
      } else {
        const status = valuePercentage > 0 ? '🟡' : '🔴';
        console.log(`   ${status} ${labels[idx]}: ${valuePercentage >= 0 ? '+' : ''}${valuePercentage.toFixed(1)}% value`);
      }
    });

    if (!foundValue) {
      console.log(`\n   ❌ Nessun value bet identificato (soglia 3%)`);
      console.log(`   💡 Raccomandazione: SALTA questo match`);
    }

    // 4. Best value summary
    const bestValue = this.getBestValueBet(valueBets);
    if (bestValue) {
      console.log(`\n🏆 MIGLIORE OPPORTUNITÀ:`);
      console.log(`   🎯 Scommetti su: ${bestValue.outcome.toUpperCase()}`);
      console.log(`   💎 Edge: +${(bestValue.value * 100).toFixed(1)}%`);
      console.log(`   💰 ROI Atteso: ${(bestValue.expectedValue * 100).toFixed(1)}%`);
      
      const kelly = this.calculateKellyStake(1000, bestValue.ourProb, bestValue.odds);
      console.log(`   💵 Stake Ottimale: €${kelly.recommendedStake.toFixed(0)} su bankroll €1000`);
    }

    console.log(`\n📈 PERFORMANCE SUMMARY:`);
    console.log(`   🎯 Enhanced Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
    console.log(`   💰 Market Edge: ${foundValue ? '✅ FOUND' : '❌ NONE'}`);
    console.log(`   🎲 Raccomandazione: ${foundValue ? 'GIOCA VALUE BET' : 'SALTA MATCH'}`);

    return {
      prediction,
      marketOdds,
      valueBets,
      bestValue,
      recommendation: foundValue ? 'BET' : 'SKIP'
    };
  }
}

// Test del sistema
async function runValueBettingTest() {
  console.log('🚀 Inizializzazione Value Betting Test System...\n');
  
  const valueBetting = new QuickValueBetting();
  
  try {
    // Test su PSG vs Nice
    await valueBetting.testValueBettingOnMatch(85, 103, 'PSG', 'Nice');
    
    console.log('\n' + '='.repeat(60));
    console.log('💡 SISTEMA VALUE BETTING IMPLEMENTATO CON SUCCESSO!');
    console.log('='.repeat(60));
    
    console.log('\n🎯 PROSSIMI MIGLIORAMENTI SUGGERITI:');
    console.log('   1️⃣ Integrazione odds API reali (Bet365, Pinnacle)');
    console.log('   2️⃣ Tracking storico value bets per ROI analysis');
    console.log('   3️⃣ Alert automatici quando viene trovato value');
    console.log('   4️⃣ Dashboard per monitoring value opportunities');
    console.log('   5️⃣ Machine Learning per pattern recognition');
    
  } catch (error) {
    console.error('❌ Errore durante test:', error.message);
  }
}

runValueBettingTest();