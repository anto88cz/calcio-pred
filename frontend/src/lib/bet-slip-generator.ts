/**
 * Generatore automatico di schedine
 * Analizza tutti i match e seleziona i migliori eventi
 */

import { BettingRecommendation, generateRecommendations, filterByRisk } from './betting-recommendations';
import { BetSlipConfig } from '@/components/BetSlipModal';

export interface MatchData {
  id: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  // Dati per analisi
  market1X2: any;
  marketUnderOver: any;
  marketBTTS: any;
  marketDoubleChance?: any;
  poissonParams: any;
  confidence: number;
  formMomentum?: any;
}

export interface BetSlipEvent {
  match: string;
  recommendation: BettingRecommendation;
}

export interface GeneratedBetSlip {
  events: BetSlipEvent[];
  totalOdds: number;
  totalProbability: number;
  estimatedReturn: number; // Su 10€
  averageConfidence: number;
}

/**
 * Genera una schedina automatica ottimizzata
 */
export async function generateAutomaticBetSlip(
  matches: MatchData[],
  config: BetSlipConfig
): Promise<GeneratedBetSlip> {
  
  console.log(`🎰 Generating bet slip with ${matches.length} matches...`);
  console.log('Config:', config);

  // 1. Per ogni match, genera raccomandazioni
  const allRecommendations: Array<{ match: string; recommendation: BettingRecommendation }> = [];
  
  for (const match of matches) {
    try {
      const recommendations = generateRecommendations(match);
      
      // Filtra per rischio
      const filtered = filterByRisk(recommendations, config.maxRisk);
      
      // Filtra per probabilità minima
      const probabilityFiltered = filtered.filter(
        r => r.probability >= (config.minProbability / 100)
      );
      
      // Filtra per range quote
      const oddsFiltered = probabilityFiltered.filter(
        r => !r.odds || (r.odds >= config.minOdds && r.odds <= config.maxOdds)
      );
      
      // Filtra combo se non richieste
      const comboFiltered = config.includeCombo 
        ? oddsFiltered 
        : oddsFiltered.filter(r => r.type !== 'COMBO');
      
      // Prendi le migliori per questo match
      const best = comboFiltered.slice(0, 2); // Max 2 per match
      
      best.forEach(rec => {
        allRecommendations.push({
          match: `${match.homeTeam} vs ${match.awayTeam}`,
          recommendation: rec,
        });
      });
      
    } catch (error) {
      console.error(`Error analyzing match ${match.homeTeam} vs ${match.awayTeam}:`, error);
    }
  }
  
  console.log(`✅ Generated ${allRecommendations.length} recommendations from ${matches.length} matches`);
  
  if (allRecommendations.length === 0) {
    throw new Error('Nessun evento trovato con i criteri specificati');
  }
  
  // 2. Ordina per value rating (già ordinati da generateRecommendations)
  const sorted = allRecommendations.sort(
    (a, b) => b.recommendation.valueRating - a.recommendation.valueRating
  );
  
  // 3. Seleziona i migliori N eventi
  // Strategia: diversifica i match per evitare dipendenze
  const selected: BetSlipEvent[] = [];
  const usedMatches = new Set<string>();
  
  // Prima passata: prendi i top senza duplicare match
  for (const item of sorted) {
    if (selected.length >= config.numEvents) break;
    
    if (!usedMatches.has(item.match)) {
      selected.push(item);
      usedMatches.add(item.match);
    }
  }
  
  // Se non abbiamo abbastanza eventi, aggiungi anche duplicati da match diversi
  if (selected.length < config.numEvents) {
    for (const item of sorted) {
      if (selected.length >= config.numEvents) break;
      
      if (!selected.includes(item)) {
        selected.push(item);
      }
    }
  }
  
  // Se ancora non abbiamo abbastanza, errore
  if (selected.length < config.numEvents) {
    throw new Error(
      `Trovati solo ${selected.length} eventi validi, ne servono ${config.numEvents}. ` +
      `Prova ad abbassare i filtri (min probabilità, rischio, ecc.)`
    );
  }
  
  // 4. Calcola statistiche finali
  let totalOdds = 1;
  let totalProbability = 1;
  let totalConfidence = 0;
  
  selected.forEach(event => {
    totalOdds *= (event.recommendation.odds || 1.5);
    totalProbability *= event.recommendation.probability;
    totalConfidence += event.recommendation.confidence;
  });
  
  const averageConfidence = totalConfidence / selected.length;
  const estimatedReturn = totalOdds * 10; // Su 10€
  
  console.log('📊 Bet slip stats:', {
    events: selected.length,
    totalOdds: totalOdds.toFixed(2),
    totalProbability: (totalProbability * 100).toFixed(2) + '%',
    estimatedReturn: estimatedReturn.toFixed(2) + '€',
    averageConfidence: (averageConfidence * 100).toFixed(0) + '%',
  });
  
  return {
    events: selected,
    totalOdds,
    totalProbability,
    estimatedReturn,
    averageConfidence,
  };
}

/**
 * Formatta la schedina per il clipboard
 */
export function formatBetSlipForClipboard(betSlip: GeneratedBetSlip): string {
  let text = '🎫 SCHEDINA GENERATA AUTOMATICAMENTE\n';
  text += '=' .repeat(50) + '\n\n';
  
  betSlip.events.forEach((event, idx) => {
    text += `${idx + 1}. ${event.match}\n`;
    text += `   ├─ ${event.recommendation.description}\n`;
    text += `   ├─ Probabilità: ${(event.recommendation.probability * 100).toFixed(0)}%\n`;
    text += `   ├─ Quota: ~${event.recommendation.odds?.toFixed(2) || 'N/A'}\n`;
    text += `   └─ ${event.recommendation.reasoning}\n\n`;
  });
  
  text += '=' .repeat(50) + '\n';
  text += `📊 RIEPILOGO\n`;
  text += `Quota Totale: ${betSlip.totalOdds.toFixed(2)}\n`;
  text += `Probabilità Combinata: ${(betSlip.totalProbability * 100).toFixed(1)}%\n`;
  text += `Vincita Stimata (su 10€): ${betSlip.estimatedReturn.toFixed(2)}€\n`;
  text += `Confidence Media: ${(betSlip.averageConfidence * 100).toFixed(0)}%\n`;
  text += '\n⚠️ Gioca responsabilmente. Questa è solo un\'indicazione statistica.\n';
  
  return text;
}
