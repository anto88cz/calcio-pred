// 🔍 ANALISI SEMPL IFICATA - Conta dati disponibili da Sportsmonks
// Controlla quanti historical matches sono disponibili per periodo

require('dotenv').config({ path: './api/.env' });
const axios = require('axios');
const moment = require('moment');

const SPORTSMONKS_API_KEY = process.env.SPORTSMONKS_API_KEY;
const BASE_URL = 'https://api.sportmonks.com/v3/football';

// Scegliamo una squadra rappresentativa per ogni periodo
const TEAMS_TO_CHECK = [
  { name: 'Espanyol', id: 720, league: 'LaLiga', checkDate: '2024-01-15', period: 'Q1-Early' },
  { name: 'Espanyol', id: 720, league: 'LaLiga', checkDate: '2024-10-01', period: 'Oct-Mid' },
  
  { name: 'Nottingham Forest', id: 390, league: 'Premier League', checkDate: '2024-02-15', period: 'Q1-Early' },
  { name: 'Nottingham Forest', id: 390, league: 'Premier League', checkDate: '2024-10-05', period: 'Oct-Mid' },
  
  { name: 'Pisa', id: 2833, league: 'Serie B', checkDate: '2024-02-10', period: 'Q1-Early' },
  { name: 'Pisa', id: 2833, league: 'Serie B', checkDate: '2024-10-01', period: 'Oct-Mid' },
];

async function countAvailableMatches(teamId, teamName, beforeDate) {
  try {
    // Usa lo stesso metodo del backend: /fixtures/between con chunk da 90 giorni
    const endDate = new Date(beforeDate);
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 12);
    
    // Dividi in chunk da 90 giorni (come fa il backend)
    const chunks = [];
    let current = new Date(startDate);
    while (current < endDate) {
      const chunkEnd = new Date(current);
      chunkEnd.setDate(chunkEnd.getDate() + 90);
      if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());
      
      chunks.push({
        start: new Date(current),
        end: new Date(chunkEnd)
      });
      
      current.setDate(current.getDate() + 90);
    }
    
    let allTeamFixtures = [];
    
    // Recupera fixtures per ogni chunk
    for (const chunk of chunks) {
      const startStr = chunk.start.toISOString().split('T')[0];
      const endStr = chunk.end.toISOString().split('T')[0];
      
      const response = await axios.get(`${BASE_URL}/fixtures/between/${startStr}/${endStr}`, {
        params: {
          api_token: SPORTSMONKS_API_KEY,
          include: 'participants;scores;statistics;state',
          per_page: 100
        },
        timeout: 10000
      });

      const allFixtures = response.data.data || [];
      
      // Filtra solo le partite della nostra squadra
      const teamFixtures = allFixtures.filter(f => {
        const participants = f.participants || [];
        return participants.some(p => p.id === teamId);
      });
      
      allTeamFixtures = allTeamFixtures.concat(teamFixtures);
      
      // Pausa tra chunk
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const finishedMatches = allTeamFixtures.filter(f => f.state?.short === 'FT' && f.scores?.length > 0);
    const withStats = finishedMatches.filter(f => f.statistics?.length > 0);
    
    return {
      total: allTeamFixtures.length,
      finished: finishedMatches.length,
      withStats: withStats.length,
      usableForTraining: Math.min(finishedMatches.length, 7) // Come fa il backend
    };
  } catch (error) {
    console.error(`   ❌ Errore per ${teamName}:`);
    if (error.response) {
      console.error(`      Status: ${error.response.status}`);
      console.error(`      Message: ${error.response.data?.message || error.response.statusText}`);
    } else {
      console.error(`      ${error.message}`);
    }
    return null;
  }
}

async function main() {
  console.log('🔍 ANALISI DISPONIBILITÀ DATI STORICI PER PERIODO\n');
  console.log('Confronto: Quanti dati storici sono disponibili Q1 vs Autunno\n');
  console.log('═'.repeat(80));
  
  const results = [];
  
  for (const team of TEAMS_TO_CHECK) {
    console.log(`\n📊 ${team.name} (${team.league})`);
    console.log(`📅 Check date: ${team.checkDate} (${team.period})`);
    
    const data = await countAvailableMatches(team.id, team.name, team.checkDate);
    
    if (data) {
      console.log(`   Totali trovate: ${data.total}`);
      console.log(`   Finite (FT): ${data.finished}`);
      console.log(`   Con statistiche: ${data.withStats}`);
      console.log(`   Usabili per training: ${data.usableForTraining}/7 ✅`);
      
      if (data.usableForTraining < 7) {
        console.log(`   ⚠️ ATTENZIONE: Solo ${data.usableForTraining}/7 partite disponibili!`);
      }
      
      results.push({
        ...team,
        ...data
      });
    }
    
    // Pausa per evitare rate limit
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Report comparativo
  console.log('\n\n' + '═'.repeat(80));
  console.log('📊 REPORT COMPARATIVO');
  console.log('═'.repeat(80));
  
  const q1Results = results.filter(r => r.period === 'Q1-Early');
  const octResults = results.filter(r => r.period === 'Oct-Mid');
  
  if (q1Results.length > 0) {
    console.log('\n📉 Q1 (Gen-Feb - Inizio Stagione):');
    const avgUsable = q1Results.reduce((sum, r) => sum + r.usableForTraining, 0) / q1Results.length;
    const avgWithStats = q1Results.reduce((sum, r) => sum + r.withStats, 0) / q1Results.length;
    console.log(`   Media partite usabili: ${avgUsable.toFixed(1)}/7`);
    console.log(`   Media con stats: ${avgWithStats.toFixed(1)}`);
    console.log(`   Completeness: ${(avgUsable / 7 * 100).toFixed(1)}%`);
    
    q1Results.forEach(r => {
      console.log(`      ${r.name}: ${r.usableForTraining}/7 ${r.usableForTraining < 7 ? '⚠️' : '✅'}`);
    });
  }
  
  if (octResults.length > 0) {
    console.log('\n📈 Ottobre (Metà Stagione):');
    const avgUsable = octResults.reduce((sum, r) => sum + r.usableForTraining, 0) / octResults.length;
    const avgWithStats = octResults.reduce((sum, r) => sum + r.withStats, 0) / octResults.length;
    console.log(`   Media partite usabili: ${avgUsable.toFixed(1)}/7`);
    console.log(`   Media con stats: ${avgWithStats.toFixed(1)}`);
    console.log(`   Completeness: ${(avgUsable / 7 * 100).toFixed(1)}%`);
    
    octResults.forEach(r => {
      console.log(`      ${r.name}: ${r.usableForTraining}/7 ${r.usableForTraining < 7 ? '⚠️' : '✅'}`);
    });
  }
  
  if (q1Results.length > 0 && octResults.length > 0) {
    const q1Avg = q1Results.reduce((sum, r) => sum + r.usableForTraining, 0) / q1Results.length;
    const octAvg = octResults.reduce((sum, r) => sum + r.usableForTraining, 0) / octResults.length;
    const diff = octAvg - q1Avg;
    
    console.log('\n📊 CONFRONTO:');
    console.log(`   Q1: ${q1Avg.toFixed(1)}/7 partite`);
    console.log(`   Oct: ${octAvg.toFixed(1)}/7 partite`);
    console.log(`   Differenza: ${diff > 0 ? '+' : ''}${diff.toFixed(1)} partite`);
    console.log(`   Differenza percentuale: ${diff > 0 ? '+' : ''}${(diff / 7 * 100).toFixed(1)}%`);
    
    if (Math.abs(diff) > 1) {
      console.log(`\n   🚨 PROBLEMA IDENTIFICATO!`);
      if (diff > 0) {
        console.log(`   Q1 ha ${Math.abs(diff).toFixed(1)} partite in MENO per training!`);
      } else {
        console.log(`   Oct ha ${Math.abs(diff).toFixed(1)} partite in MENO per training!`);
      }
      console.log(`   Questo spiega la differenza nelle performance!`);
      
      console.log(`\n   💡 RACCOMANDAZIONI:`);
      console.log(`   1. Implementare MIN_HISTORY_MATCHES filter nel backtest`);
      console.log(`   2. Skip partite con dati insufficienti (< 6 partite per squadra)`);
      console.log(`   3. Considerare di ridurre HISTORY_GAMES da 7 a 5 per periodi early-season`);
    } else {
      console.log(`\n   ✅ Dati comparabili`);
      console.log(`   Il problema NON è la disponibilità di dati storici`);
    }
  }
  
  console.log('\n✅ Analisi completata!');
}

main().catch(console.error);
