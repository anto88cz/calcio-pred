// 🚀 DEMO COMPLETO - Simulazione Calcio-Pred
// Simula tutto il flusso senza bisogno del backend
const axios = require('axios');

class CalcioPredDemo {
  constructor() {
    this.apiKey = 'd5f809551b3fa59226715bbcf64c90b5';
    this.baseURL = 'https://v3.football.api-sports.io';
  }

  async getHeaders() {
    return { 'x-rapidapi-key': this.apiKey };
  }

  // Simula il motore empirico
  calculateEmpiricPrediction(homeStats, awayStats) {
    const homeAvgScored = homeStats.goalsFor / homeStats.matches;
    const homeAvgConceded = homeStats.goalsAgainst / homeStats.matches;
    const awayAvgScored = awayStats.goalsFor / awayStats.matches;
    const awayAvgConceded = awayStats.goalsAgainst / awayStats.matches;
    
    // Predici gol casa e trasferta
    const homeGoals = (homeAvgScored + awayAvgConceded) / 2 + 0.25; // home advantage
    const awayGoals = (awayAvgScored + homeAvgConceded) / 2;
    
    return { homeGoals, awayGoals };
  }

  // Simula il motore Poisson
  calculatePoissonProbabilities(homeGoals, awayGoals) {
    // Semplificata: calcola probabilità 1X2
    const totalGoals = homeGoals + awayGoals;
    
    let prob1 = 0.33, probX = 0.33, prob2 = 0.34;
    
    if (homeGoals > awayGoals + 0.5) {
      prob1 = 0.50 + (homeGoals - awayGoals) * 0.1;
      probX = 0.25;
      prob2 = 1 - prob1 - probX;
    } else if (awayGoals > homeGoals + 0.5) {
      prob2 = 0.50 + (awayGoals - homeGoals) * 0.1;
      probX = 0.25;
      prob1 = 1 - prob2 - probX;
    }
    
    // Normalizza
    const sum = prob1 + probX + prob2;
    return {
      prob1: Math.min(0.85, prob1 / sum),
      probX: probX / sum,
      prob2: Math.min(0.85, prob2 / sum)
    };
  }

  // Simula calcolo confidence
  calculateConfidence(homeMatches, awayMatches) {
    const dataQuality = Math.min(homeMatches, awayMatches) / 20; // max 20 match
    const recency = 0.8; // simula dati recenti
    const stability = 0.7; // simula stabilità
    
    return Math.min(1.0, (dataQuality * 0.4 + recency * 0.3 + stability * 0.3));
  }

  // Classifica la forza della predizione
  classifyStrength(prob1, probX, prob2, confidence) {
    const maxProb = Math.max(prob1, probX, prob2);
    
    if (maxProb >= 0.80 && confidence >= 0.60) return '🟩 GIOCALA';
    if (maxProb >= 0.65) return '🟢 FORTE';
    if (maxProb >= 0.50) return '🟡 MEDIO';
    if (maxProb >= 0.35) return '⚪ NEUTRALE';
    return '🔴 ND';
  }

  async demonstrateFullPrediction() {
    console.log('🎯 ==========================================');
    console.log('🚀 DEMO COMPLETO CALCIO-PRED');
    console.log('🎯 ==========================================\n');

    try {
      // 1. Trova una partita live per la demo
      console.log('1️⃣ Ricerca partita live...');
      const liveResponse = await axios.get(`${this.baseURL}/fixtures`, {
        headers: await this.getHeaders(),
        params: { live: 'all' }
      });

      if (liveResponse.data.response.length === 0) {
        console.log('   ⚠️ Nessuna partita live, uso partita di esempio...\n');
        await this.demoWithMockData();
        return;
      }

      const fixture = liveResponse.data.response[0];
      console.log(`   ✅ Partita trovata: ${fixture.teams.home.name} vs ${fixture.teams.away.name}`);
      console.log(`   🕐 Status: ${fixture.fixture.status.long} (${fixture.fixture.status.elapsed || 0}min)\n`);

      // 2. Simula raccolta dati storici
      console.log('2️⃣ Simulazione raccolta dati storici...');
      const homeStats = {
        matches: 18,
        goalsFor: 25,
        goalsAgainst: 12,
        wins: 11,
        draws: 4,
        losses: 3
      };
      
      const awayStats = {
        matches: 17,
        goalsFor: 19,
        goalsAgainst: 16,
        wins: 8,
        draws: 5,
        losses: 4
      };

      console.log(`   📊 ${fixture.teams.home.name}: ${homeStats.matches} partite, ${homeStats.goalsFor} gol fatti, ${homeStats.goalsAgainst} subiti`);
      console.log(`   📊 ${fixture.teams.away.name}: ${awayStats.matches} partite, ${awayStats.goalsFor} gol fatti, ${awayStats.goalsAgainst} subiti\n`);

      // 3. Calcola predizione empirica
      console.log('3️⃣ Calcolo motore empirico...');
      const empiric = this.calculateEmpiricPrediction(homeStats, awayStats);
      console.log(`   🏠 Gol previsti ${fixture.teams.home.name}: ${empiric.homeGoals.toFixed(2)}`);
      console.log(`   ✈️ Gol previsti ${fixture.teams.away.name}: ${empiric.awayGoals.toFixed(2)}\n`);

      // 4. Calcola probabilità Poisson
      console.log('4️⃣ Calcolo motore Poisson...');
      const poisson = this.calculatePoissonProbabilities(empiric.homeGoals, empiric.awayGoals);
      console.log(`   1️⃣ Vittoria ${fixture.teams.home.name}: ${(poisson.prob1 * 100).toFixed(1)}%`);
      console.log(`   ❌ Pareggio: ${(poisson.probX * 100).toFixed(1)}%`);
      console.log(`   2️⃣ Vittoria ${fixture.teams.away.name}: ${(poisson.prob2 * 100).toFixed(1)}%\n`);

      // 5. Calcola confidence
      console.log('5️⃣ Calcolo confidence...');
      const confidence = this.calculateConfidence(homeStats.matches, awayStats.matches);
      console.log(`   🎯 Confidence Score: ${(confidence * 100).toFixed(1)}%\n`);

      // 6. Classificazione finale
      console.log('6️⃣ Classificazione finale...');
      const strength = this.classifyStrength(poisson.prob1, poisson.probX, poisson.prob2, confidence);
      console.log(`   ${strength}\n`);

      // 7. Mercati aggiuntivi
      console.log('7️⃣ Altri mercati...');
      const totalGoals = empiric.homeGoals + empiric.awayGoals;
      console.log(`   🎯 Over 2.5: ${totalGoals > 2.5 ? (65 + Math.random() * 20).toFixed(1) : (25 + Math.random() * 20).toFixed(1)}%`);
      console.log(`   ⚽ BTTS: ${empiric.homeGoals > 0.8 && empiric.awayGoals > 0.8 ? (60 + Math.random() * 25).toFixed(1) : (30 + Math.random() * 30).toFixed(1)}%\n`);

      console.log('🎉 ==========================================');
      console.log('✅ DEMO COMPLETATO CON SUCCESSO!');
      console.log('🎉 ==========================================');

    } catch (error) {
      console.error('❌ Errore durante la demo:', error.message);
      console.log('\n💡 Provo con dati mock...\n');
      await this.demoWithMockData();
    }
  }

  async demoWithMockData() {
    console.log('🔄 DEMO CON DATI MOCK - Inter vs Juventus\n');
    
    const homeStats = { matches: 20, goalsFor: 32, goalsAgainst: 10, wins: 15, draws: 3, losses: 2 };
    const awayStats = { matches: 20, goalsFor: 28, goalsAgainst: 14, wins: 12, draws: 6, losses: 2 };

    console.log('📊 Dati storici:');
    console.log(`   🔵 Inter: 20 partite, 32 gol fatti, 10 subiti (15V-3P-2S)`);
    console.log(`   ⚪ Juventus: 20 partite, 28 gol fatti, 14 subiti (12V-6P-2S)\n`);

    const empiric = this.calculateEmpiricPrediction(homeStats, awayStats);
    const poisson = this.calculatePoissonProbabilities(empiric.homeGoals, empiric.awayGoals);
    const confidence = this.calculateConfidence(homeStats.matches, awayStats.matches);
    const strength = this.classifyStrength(poisson.prob1, poisson.probX, poisson.prob2, confidence);

    console.log('🎯 RISULTATO PREDIZIONE:');
    console.log(`   🔵 Vittoria Inter: ${(poisson.prob1 * 100).toFixed(1)}%`);
    console.log(`   ❌ Pareggio: ${(poisson.probX * 100).toFixed(1)}%`);
    console.log(`   ⚪ Vittoria Juventus: ${(poisson.prob2 * 100).toFixed(1)}%`);
    console.log(`   🎯 Confidence: ${(confidence * 100).toFixed(1)}%`);
    console.log(`   ${strength}\n`);

    console.log('✅ Demo completata!');
  }
}

// Avvia la demo
const demo = new CalcioPredDemo();
demo.demonstrateFullPrediction();