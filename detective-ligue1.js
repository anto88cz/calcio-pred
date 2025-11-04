// 🔍 DETECTIVE API-FOOTBALL - Trova le partite Ligue 1 di oggi
const axios = require('axios');

class Ligue1Detective {
  constructor() {
    this.apiKey = '81d8ada776a8b5373697743a1c0c8ad6';
    this.baseURL = 'https://v3.football.api-sports.io';
    this.requestCount = 0;
  }

  async makeRequest(endpoint, params = {}) {
    this.requestCount++;
    console.log(`📡 Richiesta ${this.requestCount}: ${endpoint} ${JSON.stringify(params)}`);
    
    try {
      const response = await axios.get(`${this.baseURL}${endpoint}`, {
        headers: { 'x-rapidapi-key': this.apiKey },
        params,
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error(`❌ Errore richiesta: ${error.message}`);
      return null;
    }
  }

  async investigateToday() {
    console.log('🔍 ==========================================');
    console.log('🕵️ DETECTIVE MODE: Trova partite di oggi');
    console.log('📅 1 Novembre 2025');
    console.log('🔍 ==========================================\n');

    // 1. Test diverse stagioni Ligue 1
    console.log('1️⃣ Test stagioni diverse per Ligue 1...');
    const seasons = [2025, 2024, 2023];
    const today = '2025-11-01';

    for (const season of seasons) {
      console.log(`\n🔍 Stagione ${season}:`);
      const fixtures = await this.makeRequest('/fixtures', {
        league: 61, // Ligue 1
        season: season,
        date: today
      });

      if (fixtures && fixtures.response) {
        console.log(`   📊 Partite trovate: ${fixtures.response.length}`);
        if (fixtures.response.length > 0) {
          console.log('   ✅ TROVATO! Ecco le partite:');
          fixtures.response.forEach(f => {
            const time = new Date(f.fixture.date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            console.log(`      ${time} - ${f.teams.home.name} vs ${f.teams.away.name}`);
          });
          
          // Analizza con questa stagione
          return { season, fixtures: fixtures.response };
        }
      }
    }

    // 2. Test tutte le partite live
    console.log('\n2️⃣ Controllo partite LIVE ora...');
    const live = await this.makeRequest('/fixtures', { live: 'all' });
    
    if (live && live.response) {
      console.log(`   🔴 Partite LIVE totali: ${live.response.length}`);
      
      // Filtra Ligue 1
      const ligue1Live = live.response.filter(f => f.league.id === 61);
      console.log(`   ⚽ Ligue 1 LIVE: ${ligue1Live.length}`);
      
      ligue1Live.forEach(f => {
        console.log(`      🔴 ${f.teams.home.name} ${f.goals.home} - ${f.goals.away} ${f.teams.away.name} (${f.fixture.status.elapsed}min)`);
      });
    }

    // 3. Test prossime partite senza data specifica
    console.log('\n3️⃣ Prossime partite Ligue 1 (generale)...');
    const upcoming = await this.makeRequest('/fixtures', {
      league: 61,
      next: 10
    });

    if (upcoming && upcoming.response) {
      console.log(`   📅 Prossime partite: ${upcoming.response.length}`);
      upcoming.response.slice(0, 5).forEach(f => {
        const date = new Date(f.fixture.date);
        const dateStr = date.toLocaleDateString('it-IT');
        const timeStr = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        console.log(`      ${dateStr} ${timeStr} - ${f.teams.home.name} vs ${f.teams.away.name}`);
      });
      
      // Controlla se oggi c'è qualcosa
      const todayMatches = upcoming.response.filter(f => {
        const matchDate = new Date(f.fixture.date).toDateString();
        const todayDate = new Date('2025-11-01').toDateString();
        return matchDate === todayDate;
      });
      
      if (todayMatches.length > 0) {
        console.log('\n   🎯 TROVATE PARTITE DI OGGI nelle prossime:');
        return { season: 'next', fixtures: todayMatches };
      }
    }

    // 4. Test con date range
    console.log('\n4️⃣ Test range di date...');
    const yesterday = '2025-10-31';
    const tomorrow = '2025-11-02';
    
    const range = await this.makeRequest('/fixtures', {
      league: 61,
      season: 2024,
      from: yesterday,
      to: tomorrow
    });

    if (range && range.response) {
      console.log(`   📊 Partite nel range: ${range.response.length}`);
      range.response.forEach(f => {
        const date = new Date(f.fixture.date);
        const dateStr = date.toLocaleDateString('it-IT');
        const timeStr = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        console.log(`      ${dateStr} ${timeStr} - ${f.teams.home.name} vs ${f.teams.away.name}`);
      });
    }

    return null;
  }

  async testOtherLeagues() {
    console.log('\n🌍 ==========================================');
    console.log('🔍 TEST ALTRE LEGHE per oggi');
    console.log('🌍 ==========================================\n');

    const leagues = [
      { id: 39, name: 'Premier League' },
      { id: 140, name: 'La Liga' },
      { id: 78, name: 'Bundesliga' },
      { id: 135, name: 'Serie A' }
    ];

    const today = '2025-11-01';
    let foundMatches = [];

    for (const league of leagues) {
      console.log(`\n🏆 ${league.name}:`);
      const fixtures = await this.makeRequest('/fixtures', {
        league: league.id,
        season: 2024,
        date: today
      });

      if (fixtures && fixtures.response && fixtures.response.length > 0) {
        console.log(`   ✅ ${fixtures.response.length} partite trovate:`);
        fixtures.response.slice(0, 3).forEach(f => {
          const time = new Date(f.fixture.date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
          console.log(`      ${time} - ${f.teams.home.name} vs ${f.teams.away.name}`);
        });
        foundMatches.push({ league: league.name, matches: fixtures.response });
      } else {
        console.log(`   ❌ Nessuna partita`);
      }
    }

    return foundMatches;
  }

  async analyzeBestMatch(fixtures) {
    if (!fixtures || fixtures.length === 0) return;

    console.log('\n⚽ ==========================================');
    console.log('🧮 ANALISI PARTITA TROVATA');
    console.log('⚽ ==========================================\n');

    const fixture = fixtures[0];
    const homeTeam = fixture.teams.home;
    const awayTeam = fixture.teams.away;

    console.log(`🏠 ${homeTeam.name} vs ✈️ ${awayTeam.name}`);
    console.log(`🏆 ${fixture.league.name} - ${fixture.league.country}`);
    console.log(`🕐 ${new Date(fixture.fixture.date).toLocaleString('it-IT')}`);
    console.log(`🏟️ ${fixture.fixture.venue?.name || 'N/A'}\n`);

    // Simula predizione veloce
    console.log('🎯 PREDIZIONE RAPIDA (simulata):');
    const homeWin = 35 + Math.random() * 30;
    const draw = 25 + Math.random() * 15;
    const awayWin = 100 - homeWin - draw;

    console.log(`   🏠 Vittoria ${homeTeam.name}: ${homeWin.toFixed(1)}%`);
    console.log(`   🤝 Pareggio: ${draw.toFixed(1)}%`);
    console.log(`   ✈️ Vittoria ${awayTeam.name}: ${awayWin.toFixed(1)}%`);

    const maxProb = Math.max(homeWin, draw, awayWin);
    let badge = '🟡 MEDIO';
    if (maxProb > 60) badge = '🟢 FORTE';
    if (maxProb > 75) badge = '🟩 GIOCALA';

    console.log(`   ${badge}`);
  }

  async run() {
    // 1. Investigate oggi
    const result = await this.investigateToday();
    
    // 2. Se non trovato, test altre leghe
    if (!result) {
      console.log('\n🔄 Nessuna Ligue 1 oggi, controllo altre leghe...');
      const otherMatches = await this.testOtherLeagues();
      
      if (otherMatches.length > 0) {
        console.log('\n🎯 Analizziamo la prima partita trovata...');
        await this.analyzeBestMatch(otherMatches[0].matches);
      }
    } else {
      console.log(`\n🎯 Analizzo le partite Ligue 1 stagione ${result.season}...`);
      await this.analyzeBestMatch(result.fixtures);
    }

    console.log(`\n📊 Totale richieste API utilizzate: ${this.requestCount}`);
    console.log('🎉 Detective completato!');
  }
}

// Esegui investigazione
console.log('🕵️ Avvio Detective Mode...\n');
const detective = new Ligue1Detective();
detective.run();