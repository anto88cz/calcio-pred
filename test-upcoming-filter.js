/**
 * Test del filtro per partite ancora da giocare
 * Verifica che l'endpoint /api/fixtures/sm/today ritorni solo partite future
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3001';

async function testUpcomingFilter() {
  console.log('='.repeat(80));
  console.log('🧪 TEST FILTRO PARTITE ANCORA DA GIOCARE');
  console.log('='.repeat(80) + '\n');
  
  try {
    console.log('📡 Chiamata: GET /api/fixtures/sm/today\n');
    
    const response = await axios.get(`${API_BASE}/api/fixtures/sm/today`);
    const { count, fixtures } = response.data;
    
    console.log(`✅ Risposta ricevuta: ${count} partite\n`);
    
    if (count === 0) {
      console.log('⚠️  Nessuna partita trovata per oggi (o tutte già finite)\n');
      return;
    }
    
    // Analizza ogni partita
    const now = new Date();
    console.log(`🕐 Ora corrente: ${now.toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}\n`);
    console.log('-'.repeat(80) + '\n');
    
    let allUpcoming = true;
    
    fixtures.forEach((fixture, index) => {
      const fixtureTime = new Date(fixture.date);
      const hoursDiff = (fixtureTime - now) / (1000 * 60 * 60);
      const isUpcoming = fixtureTime > now && !['FT', 'LIVE', 'HT'].includes(fixture.statusShort);
      
      if (!isUpcoming) {
        allUpcoming = false;
      }
      
      console.log(`[${index + 1}/${count}] ${isUpcoming ? '✅' : '❌'} ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`);
      console.log(`    Campionato: ${fixture.league.name}`);
      console.log(`    Orario: ${fixtureTime.toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}`);
      console.log(`    Status: ${fixture.statusShort}`);
      console.log(`    Tra: ${hoursDiff > 0 ? '+' : ''}${hoursDiff.toFixed(1)} ore`);
      console.log();
    });
    
    console.log('='.repeat(80));
    console.log('📊 RISULTATO TEST');
    console.log('='.repeat(80) + '\n');
    
    if (allUpcoming) {
      console.log('✅ SUCCESSO: Tutte le partite sono ancora da giocare!\n');
    } else {
      console.log('❌ ERRORE: Alcune partite sono già finite o in corso!\n');
    }
    
    // Statistiche
    const statusCount = fixtures.reduce((acc, f) => {
      acc[f.statusShort] = (acc[f.statusShort] || 0) + 1;
      return acc;
    }, {});
    
    console.log('📋 Status delle partite:');
    Object.entries(statusCount).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });
    console.log();
    
    // Partite per campionato
    const leagueCount = fixtures.reduce((acc, f) => {
      acc[f.league.name] = (acc[f.league.name] || 0) + 1;
      return acc;
    }, {});
    
    console.log('🏆 Partite per campionato:');
    Object.entries(leagueCount).forEach(([league, count]) => {
      console.log(`   ${league}: ${count}`);
    });
    console.log();
    
  } catch (error) {
    console.error('\n❌ ERRORE:', error.response?.data || error.message);
    console.error('\nDettagli completi:', error);
  }
  
  console.log('='.repeat(80));
  console.log('✅ Test completato!');
  console.log('='.repeat(80) + '\n');
}

// Esegui il test
testUpcomingFilter().catch(console.error);
