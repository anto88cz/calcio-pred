// 💰 ODDS-ENHANCED PREDICTOR con Value Betting
const axios = require('axios');

class ValueBettingPredictor {
  constructor() {
    this.apiKey = '81d8ada776a8b5373697743a1c0c8ad6';
    this.oddsProviders = ['Bet365', 'William Hill', '1xBet', 'Pinnacle'];
    this.minValueThreshold = 0.05; // 5% valore minimo per raccomandazione
  }

  // STEP 1: Recupero odds reali dal mercato
  async getMarketOdds(fixtureId) {
    console.log('💰 Recupero odds dal mercato...');
    
    try {
      const oddsResponse = await this.makeRequest('/odds', {
        fixture: fixtureId,
        bookmaker: '8', // Bet365 ID
      });

      if (oddsResponse.response.length === 0) {
        console.log('⚠️ Odds non disponibili per questo match');
        return null;
      }

      const odds = oddsResponse.response[0].bookmakers[0]?.bets?.find(bet => bet.name === 'Match Winner');
      
      if (!odds) return null;

      return {
        home: parseFloat(odds.values[0].odd),
        draw: parseFloat(odds.values[1].odd),
        away: parseFloat(odds.values[2].odd),
        provider: oddsResponse.response[0].bookmakers[0].name
      };
    } catch (error) {
      console.log('⚠️ Errore nel recupero odds:', error.message);
      return null;
    }
  }

  // STEP 2: Conversione odds in probabilità implicite
  oddsToImpliedProbabilities(odds) {
    const impliedHome = 1 / odds.home;
    const impliedDraw = 1 / odds.draw;
    const impliedAway = 1 / odds.away;
    
    const total = impliedHome + impliedDraw + impliedAway;
    const margin = total - 1; // Margine del bookmaker
    
    return {
      home: impliedHome / total,
      draw: impliedDraw / total,
      away: impliedAway / total,
      margin: margin * 100, // Margine in percentuale
      total
    };
  }

  // STEP 3: Calcolo Value Betting
  calculateValueBets(ourPrediction, marketOdds) {
    if (!marketOdds) return null;

    const implied = this.oddsToImpliedProbabilities(marketOdds);
    
    const values = {
      home: {
        ourProb: ourPrediction.prob1X2.prob1,
        impliedProb: implied.home,
        odds: marketOdds.home,
        value: ourPrediction.prob1X2.prob1 - implied.home,
        expectedValue: (ourPrediction.prob1X2.prob1 * marketOdds.home) - 1,
        recommend: false
      },
      draw: {
        ourProb: ourPrediction.prob1X2.probX,
        impliedProb: implied.draw,
        odds: marketOdds.draw,
        value: ourPrediction.prob1X2.probX - implied.draw,
        expectedValue: (ourPrediction.prob1X2.probX * marketOdds.draw) - 1,
        recommend: false
      },
      away: {
        ourProb: ourPrediction.prob1X2.prob2,
        impliedProb: implied.away,
        odds: marketOdds.away,
        value: ourPrediction.prob1X2.prob2 - implied.away,
        expectedValue: (ourPrediction.prob1X2.prob2 * marketOdds.away) - 1,
        recommend: false
      }
    };

    // Identifica value bets
    Object.keys(values).forEach(key => {
      const bet = values[key];
      bet.recommend = bet.value > this.minValueThreshold && bet.expectedValue > 0;
    });

    return {
      ...values,
      bookmakerMargin: implied.margin,
      bestValue: this.getBestValueBet(values)
    };
  }

  getBestValueBet(values) {
    let best = null;
    let maxValue = 0;

    Object.keys(values).forEach(key => {
      if (values[key].recommend && values[key].value > maxValue) {
        maxValue = values[key].value;
        best = {
          outcome: key,
          ...values[key]
        };
      }
    });

    return best;
  }

  // STEP 4: Sistema di Kelly Criterion per stake optimization
  calculateOptimalStake(bankroll, probability, odds, kellyFraction = 0.25) {
    // Kelly Criterion: f = (bp - q) / b
    // Dove: b = odds - 1, p = probabilità, q = 1 - p
    
    const b = odds - 1;
    const p = probability;
    const q = 1 - p;
    
    const kellyFraction_full = (b * p - q) / b;
    const kellyFraction_conservative = kellyFraction_full * kellyFraction; // Frazione conservativa
    
    const stake = Math.max(0, bankroll * kellyFraction_conservative);
    
    return {
      fullKelly: kellyFraction_full,
      conservativeKelly: kellyFraction_conservative,
      recommendedStake: stake,
      maxStake: bankroll * 0.05 // Mai più del 5% del bankroll
    };
  }

  // STEP 5: Analisi completa con value betting
  async analyzeWithValueBetting(homeTeamId, awayTeamId, homeTeamName, awayTeamName, fixtureId, bankroll = 1000) {
    console.log('\n💰 ========================================');
    console.log('💰 VALUE BETTING ANALYSIS - CALCIO-PRED');
    console.log('💰 ========================================\n');

    // 1. Predizione normale
    const enhancedPredictor = new (require('./enhanced-predictor'))();
    const prediction = await enhancedPredictor.calculateEnhancedPrediction(homeTeamId, awayTeamId, 61, 2025);

    // 2. Recupero odds di mercato
    const marketOdds = await this.getMarketOdds(fixtureId);

    console.log(`🏠 ${homeTeamName} vs ✈️ ${awayTeamName}\n`);

    console.log('🎯 NOSTRE PROBABILITÀ:');
    console.log(`   🏠 ${homeTeamName}: ${(prediction.prob1X2.prob1 * 100).toFixed(1)}%`);
    console.log(`   🤝 Pareggio: ${(prediction.prob1X2.probX * 100).toFixed(1)}%`);
    console.log(`   ✈️ ${awayTeamName}: ${(prediction.prob1X2.prob2 * 100).toFixed(1)}%`);

    if (marketOdds) {
      console.log(`\n💰 ODDS DI MERCATO (${marketOdds.provider}):`);
      console.log(`   🏠 ${homeTeamName}: ${marketOdds.home}`);
      console.log(`   🤝 Pareggio: ${marketOdds.draw}`);
      console.log(`   ✈️ ${awayTeamName}: ${marketOdds.away}`);

      const valueBets = this.calculateValueBets(prediction, marketOdds);
      
      console.log(`\n📊 ANALISI VALUE BETTING:`);
      console.log(`   📈 Margine Bookmaker: ${valueBets.bookmakerMargin.toFixed(2)}%`);

      console.log(`\n💎 VALUE OPPORTUNITIES:`);
      
      const outcomes = ['home', 'draw', 'away'];
      const labels = [homeTeamName, 'Pareggio', awayTeamName];
      
      let foundValue = false;
      
      outcomes.forEach((outcome, idx) => {
        const bet = valueBets[outcome];
        if (bet.recommend) {
          foundValue = true;
          const kelly = this.calculateOptimalStake(bankroll, bet.ourProb, bet.odds);
          
          console.log(`\n   🚨 VALUE BET TROVATO: ${labels[idx]}`);
          console.log(`      💰 Odds: ${bet.odds}`);
          console.log(`      📊 Nostra Prob: ${(bet.ourProb * 100).toFixed(1)}%`);
          console.log(`      📊 Implied Prob: ${(bet.impliedProb * 100).toFixed(1)}%`);
          console.log(`      💎 Value: +${(bet.value * 100).toFixed(1)}%`);
          console.log(`      💵 Expected Value: ${(bet.expectedValue * 100).toFixed(1)}%`);
          console.log(`      🎯 Kelly Stake: €${kelly.recommendedStake.toFixed(0)} (max €${kelly.maxStake.toFixed(0)})`);
        }
      });

      if (!foundValue) {
        console.log(`   ❌ Nessun value bet identificato`);
        console.log(`   💡 Aspetta odds migliori o salta questo match`);
      }

      // Best value summary
      if (valueBets.bestValue) {
        console.log(`\n🏆 MIGLIORE OPPORTUNITÀ:`);
        console.log(`   🎯 ${valueBets.bestValue.outcome.toUpperCase()}`);
        console.log(`   💎 Value: +${(valueBets.bestValue.value * 100).toFixed(1)}%`);
        console.log(`   💵 ROI Atteso: ${(valueBets.bestValue.expectedValue * 100).toFixed(1)}%`);
      }

    } else {
      console.log('\n⚠️ Odds di mercato non disponibili');
      console.log('📋 Raccomandazione basata solo su probabilità interne');
      
      // Fallback: raccomandazione basata su confidence
      const maxProb = Math.max(prediction.prob1X2.prob1, prediction.prob1X2.probX, prediction.prob1X2.prob2);
      if (maxProb >= 0.60 && prediction.confidence >= 0.70) {
        console.log('🟢 MATCH INTERESSANTE per scommessa tradizionale');
      } else {
        console.log('🟡 MATCH INCERTO - considera di saltare');
      }
    }

    return {
      prediction,
      marketOdds,
      valueBets: marketOdds ? this.calculateValueBets(prediction, marketOdds) : null,
      recommendation: this.getTradeRecommendation(prediction, marketOdds)
    };
  }

  getTradeRecommendation(prediction, marketOdds) {
    if (!marketOdds) {
      return {
        action: 'MONITOR',
        reason: 'Odds non disponibili - monitorare il mercato'
      };
    }

    const valueBets = this.calculateValueBets(prediction, marketOdds);
    
    if (valueBets.bestValue) {
      return {
        action: 'BET',
        outcome: valueBets.bestValue.outcome,
        value: valueBets.bestValue.value,
        reason: `Value bet del ${(valueBets.bestValue.value * 100).toFixed(1)}%`
      };
    }

    if (valueBets.bookmakerMargin < 3) {
      return {
        action: 'WAIT',
        reason: 'Margine bookmaker troppo basso - aspettare odds migliori'
      };
    }

    return {
      action: 'SKIP',
      reason: 'Nessun valore identificato - saltare questo match'
    };
  }

  async makeRequest(endpoint, params = {}) {
    const response = await axios.get(`https://v3.football.api-sports.io${endpoint}`, {
      headers: { 'x-rapidapi-key': this.apiKey },
      params,
      timeout: 15000
    });
    return response.data;
  }
}

module.exports = ValueBettingPredictor;