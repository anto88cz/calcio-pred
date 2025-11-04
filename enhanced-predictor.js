// 🚀 ENHANCED PREDICTION ENGINE - Versione Migliorata
const axios = require('axios');

class EnhancedPredictor {
  constructor() {
    this.apiKey = '81d8ada776a8b5373697743a1c0c8ad6';
    this.baseURL = 'https://v3.football.api-sports.io';
    this.requestCount = 0;
  }

  async makeRequest(endpoint, params = {}) {
    this.requestCount++;
    console.log(`📡 Richiesta ${this.requestCount}: ${endpoint}`);
    
    const response = await axios.get(`${this.baseURL}${endpoint}`, {
      headers: { 'x-rapidapi-key': this.apiKey },
      params,
      timeout: 15000
    });
    
    return response.data;
  }

  // MIGLIORAMENTO 1: Analisi Head-to-Head (H2H)
  async getH2HData(homeTeamId, awayTeamId) {
    console.log('   📈 Recupero storico Head-to-Head...');
    
    const h2h = await this.makeRequest('/fixtures/headtohead', {
      h2h: `${homeTeamId}-${awayTeamId}`,
      last: 10 // Ultimi 10 scontri diretti
    });

    let homeWins = 0, draws = 0, awayWins = 0;
    let homeGoals = 0, awayGoals = 0;

    h2h.response.forEach(match => {
      const homeId = match.teams.home.id;
      const homeScore = match.goals.home;
      const awayScore = match.goals.away;

      if (homeId === homeTeamId) {
        // Match casa/trasferta corretto
        homeGoals += homeScore;
        awayGoals += awayScore;
        if (homeScore > awayScore) homeWins++;
        else if (homeScore < awayScore) awayWins++;
        else draws++;
      } else {
        // Match invertito
        homeGoals += awayScore;
        awayGoals += homeScore;
        if (awayScore > homeScore) homeWins++;
        else if (awayScore < homeScore) awayWins++;
        else draws++;
      }
    });

    const totalMatches = h2h.response.length;
    
    return {
      matches: totalMatches,
      homeWinRate: totalMatches > 0 ? homeWins / totalMatches : 0.33,
      drawRate: totalMatches > 0 ? draws / totalMatches : 0.33,
      awayWinRate: totalMatches > 0 ? awayWins / totalMatches : 0.33,
      avgHomeGoals: totalMatches > 0 ? homeGoals / totalMatches : 0,
      avgAwayGoals: totalMatches > 0 ? awayGoals / totalMatches : 0,
      factor: Math.min(1.0, totalMatches / 5) // Peso basato su quanti H2H abbiamo
    };
  }

  // MIGLIORAMENTO 2: Analisi Forma Recente (ultimi 5 match)
  async getRecentForm(teamId, leagueId, season) {
    console.log(`   📊 Analisi forma recente squadra ${teamId}...`);
    
    const fixtures = await this.makeRequest('/fixtures', {
      team: teamId,
      league: leagueId,
      season: season,
      last: 5
    });

    let points = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    let formArray = [];

    fixtures.response.forEach(match => {
      if (match.fixture.status.short === 'FT') {
        const isHome = match.teams.home.id === teamId;
        const teamGoals = isHome ? match.goals.home : match.goals.away;
        const opponentGoals = isHome ? match.goals.away : match.goals.home;

        goalsFor += teamGoals;
        goalsAgainst += opponentGoals;

        if (teamGoals > opponentGoals) {
          points += 3;
          formArray.push('W');
        } else if (teamGoals === opponentGoals) {
          points += 1;
          formArray.push('D');
        } else {
          formArray.push('L');
        }
      }
    });

    const matches = fixtures.response.length;
    
    return {
      matches,
      points,
      avgPoints: matches > 0 ? points / matches : 1.0,
      avgGoalsFor: matches > 0 ? goalsFor / matches : 1.0,
      avgGoalsAgainst: matches > 0 ? goalsAgainst / matches : 1.0,
      formString: formArray.join('-'),
      momentum: this.calculateMomentum(formArray)
    };
  }

  // MIGLIORAMENTO 3: Calcolo Momentum (trend performance)
  calculateMomentum(formArray) {
    if (formArray.length === 0) return 0;

    let momentum = 0;
    const weights = [0.4, 0.3, 0.2, 0.1]; // Ultimi match pesano di più

    formArray.reverse().forEach((result, i) => {
      const weight = weights[i] || 0.05;
      if (result === 'W') momentum += 3 * weight;
      else if (result === 'D') momentum += 1 * weight;
      // L = 0 punti
    });

    return momentum;
  }

  // MIGLIORAMENTO 4: Predizione Avanzata con tutti i fattori
  async calculateEnhancedPrediction(homeTeamId, awayTeamId, leagueId, season) {
    console.log('\n🧮 CALCOLO PREDIZIONE AVANZATA...');

    // 1. Statistiche stagionali (base)
    const [homeStats, awayStats] = await Promise.all([
      this.makeRequest('/teams/statistics', { league: leagueId, season, team: homeTeamId }),
      this.makeRequest('/teams/statistics', { league: leagueId, season, team: awayTeamId })
    ]);

    // 2. Head-to-Head
    const h2h = await this.getH2HData(homeTeamId, awayTeamId);

    // 3. Forma recente
    const [homeForm, awayForm] = await Promise.all([
      this.getRecentForm(homeTeamId, leagueId, season),
      this.getRecentForm(awayTeamId, leagueId, season)
    ]);

    // 4. Calcolo predizione multi-fattore
    const prediction = this.blendAllFactors(homeStats.response, awayStats.response, h2h, homeForm, awayForm);

    return {
      ...prediction,
      h2h,
      homeForm,
      awayForm,
      confidence: this.calculateAdvancedConfidence(homeStats.response, awayStats.response, h2h, homeForm, awayForm)
    };
  }

  // MIGLIORAMENTO 5: Blending Multi-Fattore
  blendAllFactors(homeStats, awayStats, h2h, homeForm, awayForm) {
    // A. Predizione stagionale (50%)
    const seasonalPred = this.calculateSeasonalPrediction(homeStats, awayStats);

    // B. Predizione H2H (25%)
    const h2hPred = this.calculateH2HPrediction(h2h);

    // C. Predizione forma (25%)
    const formPred = this.calculateFormPrediction(homeForm, awayForm);

    // Blend pesato
    const homeGoals = (seasonalPred.homeGoals * 0.5) + (h2hPred.homeGoals * 0.25) + (formPred.homeGoals * 0.25);
    const awayGoals = (seasonalPred.awayGoals * 0.5) + (h2hPred.awayGoals * 0.25) + (formPred.awayGoals * 0.25);

    // Aggiusta per momentum
    const homeMomentumBoost = (homeForm.momentum - awayForm.momentum) * 0.1;
    const finalHomeGoals = Math.max(0.1, homeGoals + homeMomentumBoost);
    const finalAwayGoals = Math.max(0.1, awayGoals - homeMomentumBoost);

    return {
      homeGoals: finalHomeGoals,
      awayGoals: finalAwayGoals,
      totalGoals: finalHomeGoals + finalAwayGoals,
      prob1X2: this.calculateAdvancedProbabilities(finalHomeGoals, finalAwayGoals, h2h),
      components: { seasonal: seasonalPred, h2h: h2hPred, form: formPred }
    };
  }

  calculateSeasonalPrediction(homeStats, awayStats) {
    const homeGoalsFor = homeStats.goals?.for?.total?.total || 0;
    const homeGoalsAgainst = homeStats.goals?.against?.total?.total || 0;
    const homeMatches = homeStats.fixtures?.played?.total || 1;
    
    const awayGoalsFor = awayStats.goals?.for?.total?.total || 0;
    const awayGoalsAgainst = awayStats.goals?.against?.total?.total || 0;
    const awayMatches = awayStats.fixtures?.played?.total || 1;

    const homeAvgFor = homeGoalsFor / homeMatches;
    const homeAvgAgainst = homeGoalsAgainst / homeMatches;
    const awayAvgFor = awayGoalsFor / awayMatches;
    const awayAvgAgainst = awayGoalsAgainst / awayMatches;

    return {
      homeGoals: ((homeAvgFor + awayAvgAgainst) / 2) + 0.25, // home advantage
      awayGoals: (awayAvgFor + homeAvgAgainst) / 2
    };
  }

  calculateH2HPrediction(h2h) {
    return {
      homeGoals: h2h.avgHomeGoals || 1.2,
      awayGoals: h2h.avgAwayGoals || 1.1
    };
  }

  calculateFormPrediction(homeForm, awayForm) {
    return {
      homeGoals: homeForm.avgGoalsFor + 0.15, // home boost
      awayGoals: awayForm.avgGoalsFor
    };
  }

  calculateAdvancedProbabilities(homeGoals, awayGoals, h2h) {
    const diff = homeGoals - awayGoals;
    
    // Base probabilities
    let prob1 = 0.33, probX = 0.33, prob2 = 0.34;
    
    // Adjust based on goal difference
    if (diff > 0.5) {
      prob1 = 0.45 + Math.min(0.30, diff * 0.15);
      probX = 0.28;
      prob2 = 1 - prob1 - probX;
    } else if (diff < -0.5) {
      prob2 = 0.45 + Math.min(0.30, Math.abs(diff) * 0.15);
      probX = 0.28;
      prob1 = 1 - prob2 - probX;
    }

    // Adjust based on H2H if we have enough data
    if (h2h.factor > 0.6) {
      prob1 = (prob1 * 0.7) + (h2h.homeWinRate * 0.3);
      probX = (probX * 0.7) + (h2h.drawRate * 0.3);
      prob2 = (prob2 * 0.7) + (h2h.awayWinRate * 0.3);
    }

    // Normalize
    const sum = prob1 + probX + prob2;
    return {
      prob1: prob1 / sum,
      probX: probX / sum,
      prob2: prob2 / sum
    };
  }

  calculateAdvancedConfidence(homeStats, awayStats, h2h, homeForm, awayForm) {
    let confidence = 0;

    // 1. Data availability (25%)
    const homeMatches = homeStats.fixtures?.played?.total || 0;
    const awayMatches = awayStats.fixtures?.played?.total || 0;
    const dataScore = Math.min(homeMatches, awayMatches) / 15;
    confidence += dataScore * 0.25;

    // 2. H2H availability (20%)
    confidence += h2h.factor * 0.20;

    // 3. Recent form completeness (20%)
    const formScore = (homeForm.matches + awayForm.matches) / 10;
    confidence += Math.min(1.0, formScore) * 0.20;

    // 4. Consistency (35%)
    const homeConsistency = this.calculateConsistency(homeStats);
    const awayConsistency = this.calculateConsistency(awayStats);
    const avgConsistency = (homeConsistency + awayConsistency) / 2;
    confidence += avgConsistency * 0.35;

    return Math.min(1.0, confidence);
  }

  calculateConsistency(stats) {
    // Calcola quanto sono prevedibili le performance
    const matches = stats.fixtures?.played?.total || 0;
    if (matches < 5) return 0.3;

    const wins = stats.fixtures?.wins?.total || 0;
    const draws = stats.fixtures?.draws?.total || 0;
    const losses = stats.fixtures?.loses?.total || 0;

    const winRate = wins / matches;
    const drawRate = draws / matches;
    const lossRate = losses / matches;

    // Shannon entropy per misurare la prevedibilità
    const entropy = -((winRate * Math.log(winRate + 0.001)) + 
                     (drawRate * Math.log(drawRate + 0.001)) + 
                     (lossRate * Math.log(lossRate + 0.001)));

    // Converte entropy in consistency score (0-1)
    return Math.max(0, 1 - (entropy / Math.log(3)));
  }

  getEnhancedStrengthBadge(prob1, probX, prob2, confidence) {
    const maxProb = Math.max(prob1, probX, prob2);
    
    if (maxProb >= 0.75 && confidence >= 0.80) return '🟩 GIOCALA PRO';
    if (maxProb >= 0.70 && confidence >= 0.70) return '🟩 GIOCALA';
    if (maxProb >= 0.60 && confidence >= 0.60) return '🟢 FORTE';
    if (maxProb >= 0.50) return '🟡 MEDIO';
    if (maxProb >= 0.35) return '⚪ NEUTRALE';
    return '🔴 ND';
  }

  // Esempio di utilizzo
  async analyzeMatch(homeTeamId, awayTeamId, homeTeamName, awayTeamName) {
    console.log('🚀 ==========================================');
    console.log('🧮 ANALISI AVANZATA CALCIO-PRED v2.0');
    console.log('🚀 ==========================================\n');

    console.log(`🏠 ${homeTeamName} vs ✈️ ${awayTeamName}`);

    const prediction = await this.calculateEnhancedPrediction(homeTeamId, awayTeamId, 61, 2025);

    // Mostra risultati dettagliati
    console.log('\n📊 COMPONENTI PREDIZIONE:');
    console.log(`   🏆 Stagionale: ${prediction.components.seasonal.homeGoals.toFixed(2)} - ${prediction.components.seasonal.awayGoals.toFixed(2)}`);
    console.log(`   🤝 Head-to-Head: ${prediction.components.h2h.homeGoals.toFixed(2)} - ${prediction.components.h2h.awayGoals.toFixed(2)}`);
    console.log(`   🔥 Forma: ${prediction.components.form.homeGoals.toFixed(2)} - ${prediction.components.form.awayGoals.toFixed(2)}`);

    console.log('\n🎯 PREDIZIONE FINALE:');
    console.log(`   ${homeTeamName}: ${prediction.homeGoals.toFixed(2)} gol`);
    console.log(`   ${awayTeamName}: ${prediction.awayGoals.toFixed(2)} gol`);
    console.log(`   Totale: ${prediction.totalGoals.toFixed(2)} gol`);

    console.log('\n🏆 PROBABILITÀ:');
    console.log(`   🏠 Vittoria ${homeTeamName}: ${(prediction.prob1X2.prob1 * 100).toFixed(1)}%`);
    console.log(`   🤝 Pareggio: ${(prediction.prob1X2.probX * 100).toFixed(1)}%`);
    console.log(`   ✈️ Vittoria ${awayTeamName}: ${(prediction.prob1X2.prob2 * 100).toFixed(1)}%`);

    const badge = this.getEnhancedStrengthBadge(
      prediction.prob1X2.prob1, 
      prediction.prob1X2.probX, 
      prediction.prob1X2.prob2, 
      prediction.confidence
    );

    console.log(`\n🎯 VALUTAZIONE: ${badge}`);
    console.log(`📊 Confidence Avanzato: ${(prediction.confidence * 100).toFixed(1)}%`);

    console.log(`\n📈 DETTAGLI ANALISI:`);
    console.log(`   H2H: ${prediction.h2h.matches} scontri - Trend: ${homeTeamName} ${(prediction.h2h.homeWinRate * 100).toFixed(0)}% | Pareggi ${(prediction.h2h.drawRate * 100).toFixed(0)}% | ${awayTeamName} ${(prediction.h2h.awayWinRate * 100).toFixed(0)}%`);
    console.log(`   Forma: ${homeTeamName} [${prediction.homeForm.formString}] vs ${awayTeamName} [${prediction.awayForm.formString}]`);
    console.log(`   Momentum: ${homeTeamName} ${prediction.homeForm.momentum.toFixed(2)} vs ${awayTeamName} ${prediction.awayForm.momentum.toFixed(2)}`);

    console.log(`\n📊 Richieste API utilizzate: ${this.requestCount}`);
  }
}

// Test del sistema migliorato
console.log('🚀 Sistema Calcio-Pred v2.0 Enhanced\n');

// Esempio: PSG vs Nice
// const enhanced = new EnhancedPredictor();
// enhanced.analyzeMatch(85, 103, 'PSG', 'Nice');

module.exports = EnhancedPredictor;