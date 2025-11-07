/**
 * Sistema di raccomandazioni intelligenti per scommesse
 * Analizza i dati della predizione e suggerisce le migliori giocate
 */

export type BetType = '1' | 'X' | '2' | '1X' | '12' | 'X2' | 'OVER' | 'UNDER' | 'BTTS_YES' | 'BTTS_NO' | 'COMBO';

export interface BettingRecommendation {
  type: BetType;
  market: string;
  description: string;
  probability: number;
  confidence: number;
  strength: string;
  odds?: number; // Quota stimata dal modello
  realOdds?: number; // 🆕 Quota reale dai bookmaker
  valueRating: number; // 0-100
  expectedValue?: number; // 🆕 EV% se abbiamo quote reali
  reasoning: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  combo?: string[]; // Per scommesse combo
}

export interface AnalysisData {
  confidence: number;
  market1X2: {
    final: { prob1: number; probX: number; prob2: number };
    strength: string;
  };
  marketUnderOver: {
    [key: string]: { final: { over: number; under: number }; strength: string };
  };
  marketBTTS: {
    final: { yes: number; no: number };
    strength: string;
  };
  marketDoubleChance?: {
    '1X': { final: { prob: number }; strength: string };
    '12': { final: { prob: number }; strength: string };
    'X2': { final: { prob: number }; strength: string };
  };
  poissonParams: {
    lambdaHome: number;
    lambdaAway: number;
  };
  formMomentum?: {
    home: { formLabel: string; formScore: number };
    away: { formLabel: string; formScore: number };
  };
  // 🆕 Quote reali dai bookmaker
  realOdds?: {
    odds1X2: {
      home: number;
      draw: number;
      away: number;
      prob1: number;
      probX: number;
      prob2: number;
    };
    oddsOverUnder?: {
      over15: number;
      under15: number;
      over25: number;
      under25: number;
      over35: number;
      under35: number;
    };
    oddsBTTS?: {
      yes: number;
      no: number;
    };
    bookmakerCount: number;
    overround: number;
  };
}

/**
 * Genera raccomandazioni intelligenti basate sui dati
 */
export function generateRecommendations(data: AnalysisData): BettingRecommendation[] {
  const recommendations: BettingRecommendation[] = [];
  
  const { market1X2, marketUnderOver, marketBTTS, poissonParams, confidence } = data;
  
  // 1. ANALISI 1X2 (Risultato Finale)
  const highestProb = Math.max(market1X2.final.prob1, market1X2.final.probX, market1X2.final.prob2);
  
  if (market1X2.final.prob1 === highestProb && market1X2.final.prob1 >= 0.45) {
    const modelOdds = 1 / market1X2.final.prob1;
    const realOdds = data.realOdds?.odds1X2.home;
    const ev = realOdds ? calculateExpectedValue(market1X2.final.prob1, realOdds) : undefined;
    
    recommendations.push({
      type: '1',
      market: '1X2',
      description: 'Vittoria Casa (1)',
      probability: market1X2.final.prob1,
      confidence,
      strength: market1X2.strength,
      odds: modelOdds,
      realOdds, // 🆕 Quote reali
      expectedValue: ev, // 🆕 EV%
      valueRating: calculateValueRating(market1X2.final.prob1, confidence, market1X2.strength),
      reasoning: `La squadra di casa ha ${(market1X2.final.prob1 * 100).toFixed(0)}% di probabilità di vincere. ${getStrengthExplanation(market1X2.strength)}${ev !== undefined && ev > 0 ? ` Value bet con EV ${(ev * 100).toFixed(1)}%!` : ''}`,
      risk: market1X2.final.prob1 >= 0.60 ? 'LOW' : market1X2.final.prob1 >= 0.50 ? 'MEDIUM' : 'HIGH',
    });
  }
  
  if (market1X2.final.prob2 === highestProb && market1X2.final.prob2 >= 0.45) {
    const modelOdds = 1 / market1X2.final.prob2;
    const realOdds = data.realOdds?.odds1X2.away;
    const ev = realOdds ? calculateExpectedValue(market1X2.final.prob2, realOdds) : undefined;
    
    recommendations.push({
      type: '2',
      market: '1X2',
      description: 'Vittoria Trasferta (2)',
      probability: market1X2.final.prob2,
      confidence,
      strength: market1X2.strength,
      odds: modelOdds,
      realOdds, // 🆕 Quote reali
      expectedValue: ev, // 🆕 EV%
      valueRating: calculateValueRating(market1X2.final.prob2, confidence, market1X2.strength),
      reasoning: `La squadra in trasferta ha ${(market1X2.final.prob2 * 100).toFixed(0)}% di probabilità di vincere. ${getStrengthExplanation(market1X2.strength)}${ev !== undefined && ev > 0 ? ` Value bet con EV ${(ev * 100).toFixed(1)}%!` : ''}`,
      risk: market1X2.final.prob2 >= 0.60 ? 'LOW' : market1X2.final.prob2 >= 0.50 ? 'MEDIUM' : 'HIGH',
    });
  }
  
  // 2. DOPPIA CHANCE (se nessun risultato ha >50%)
  if (highestProb < 0.50 && data.marketDoubleChance) {
    const dc1X = data.marketDoubleChance['1X'].final.prob;
    const dc12 = data.marketDoubleChance['12'].final.prob;
    const dcX2 = data.marketDoubleChance['X2'].final.prob;
    
    const bestDC = Math.max(dc1X, dc12, dcX2);
    
    if (dc1X === bestDC && dc1X >= 0.70) {
      recommendations.push({
        type: '1X',
        market: 'Doppia Chance',
        description: '1X (Casa o Pareggio)',
        probability: dc1X,
        confidence,
        strength: data.marketDoubleChance['1X'].strength,
        odds: 1 / dc1X,
        valueRating: calculateValueRating(dc1X, confidence, data.marketDoubleChance['1X'].strength),
        reasoning: `Alta probabilità (${(dc1X * 100).toFixed(0)}%) che la partita non finisca con vittoria esterna.`,
        risk: 'LOW',
      });
    }
    
    if (dc12 === bestDC && dc12 >= 0.70) {
      recommendations.push({
        type: '12',
        market: 'Doppia Chance',
        description: '12 (Casa o Trasferta)',
        probability: dc12,
        confidence,
        strength: data.marketDoubleChance['12'].strength,
        odds: 1 / dc12,
        valueRating: calculateValueRating(dc12, confidence, data.marketDoubleChance['12'].strength),
        reasoning: `Alta probabilità (${(dc12 * 100).toFixed(0)}%) che la partita non finisca in pareggio.`,
        risk: 'LOW',
      });
    }
    
    if (dcX2 === bestDC && dcX2 >= 0.70) {
      recommendations.push({
        type: 'X2',
        market: 'Doppia Chance',
        description: 'X2 (Pareggio o Trasferta)',
        probability: dcX2,
        confidence,
        strength: data.marketDoubleChance['X2'].strength,
        odds: 1 / dcX2,
        valueRating: calculateValueRating(dcX2, confidence, data.marketDoubleChance['X2'].strength),
        reasoning: `Alta probabilità (${(dcX2 * 100).toFixed(0)}%) che la partita non finisca con vittoria casalinga.`,
        risk: 'LOW',
      });
    }
  }
  
  // 3. OVER/UNDER (Goal Totali)
  const totalExpectedGoals = poissonParams.lambdaHome + poissonParams.lambdaAway;
  
  // Over/Under 2.5
  const over25 = marketUnderOver['2.5']?.final?.over || 0;
  const under25 = marketUnderOver['2.5']?.final?.under || 0;
  const ou25Strength = marketUnderOver['2.5']?.strength || 'ND';
  
  if (over25 >= 0.60) {
    const modelOdds = 1 / over25;
    const realOdds = data.realOdds?.oddsOverUnder?.over25;
    const ev = realOdds ? calculateExpectedValue(over25, realOdds) : undefined;
    
    recommendations.push({
      type: 'OVER',
      market: 'Over/Under 2.5',
      description: 'Over 2.5 Goal',
      probability: over25,
      confidence,
      strength: ou25Strength,
      odds: modelOdds,
      realOdds, // 🆕
      expectedValue: ev, // 🆕
      valueRating: calculateValueRating(over25, confidence, ou25Strength),
      reasoning: `Si prevedono ${totalExpectedGoals.toFixed(1)} goal totali. Probabilità ${(over25 * 100).toFixed(0)}% di vedere almeno 3 goal.${ev !== undefined && ev > 0 ? ` Value bet EV ${(ev * 100).toFixed(1)}%!` : ''}`,
      risk: over25 >= 0.70 ? 'LOW' : 'MEDIUM',
    });
  }
  
  if (under25 >= 0.60) {
    const modelOdds = 1 / under25;
    const realOdds = data.realOdds?.oddsOverUnder?.under25;
    const ev = realOdds ? calculateExpectedValue(under25, realOdds) : undefined;
    
    recommendations.push({
      type: 'UNDER',
      market: 'Over/Under 2.5',
      description: 'Under 2.5 Goal',
      probability: under25,
      confidence,
      strength: ou25Strength,
      odds: modelOdds,
      realOdds, // 🆕
      expectedValue: ev, // 🆕
      valueRating: calculateValueRating(under25, confidence, ou25Strength),
      reasoning: `Si prevedono ${totalExpectedGoals.toFixed(1)} goal totali. Probabilità ${(under25 * 100).toFixed(0)}% di vedere al massimo 2 goal.${ev !== undefined && ev > 0 ? ` Value bet EV ${(ev * 100).toFixed(1)}%!` : ''}`,
      risk: under25 >= 0.70 ? 'LOW' : 'MEDIUM',
    });
  }
  
  // Over/Under 1.5
  const over15 = marketUnderOver['1.5']?.final?.over || 0;
  if (over15 >= 0.75) {
    recommendations.push({
      type: 'OVER',
      market: 'Over/Under 1.5',
      description: 'Over 1.5 Goal',
      probability: over15,
      confidence,
      strength: marketUnderOver['1.5']?.strength || 'ND',
      odds: 1 / over15,
      valueRating: calculateValueRating(over15, confidence, marketUnderOver['1.5']?.strength || 'ND'),
      reasoning: `Probabilità molto alta (${(over15 * 100).toFixed(0)}%) di almeno 2 goal nella partita.`,
      risk: 'LOW',
    });
  }
  
  // 4. BTTS (Both Teams To Score)
  const bttsYes = marketBTTS.final.yes;
  const bttsNo = marketBTTS.final.no;
  
  if (bttsYes >= 0.60) {
    const modelOdds = 1 / bttsYes;
    const realOdds = data.realOdds?.oddsBTTS?.yes;
    const ev = realOdds ? calculateExpectedValue(bttsYes, realOdds) : undefined;
    
    recommendations.push({
      type: 'BTTS_YES',
      market: 'Goal/No Goal',
      description: 'Goal (Entrambe Segnano)',
      probability: bttsYes,
      confidence,
      strength: marketBTTS.strength,
      odds: modelOdds,
      realOdds, // 🆕
      expectedValue: ev, // 🆕
      valueRating: calculateValueRating(bttsYes, confidence, marketBTTS.strength),
      reasoning: `Entrambe le squadre hanno alta probabilità (${(bttsYes * 100).toFixed(0)}%) di segnare almeno un goal.${ev !== undefined && ev > 0 ? ` Value bet EV ${(ev * 100).toFixed(1)}%!` : ''}`,
      risk: bttsYes >= 0.70 ? 'LOW' : 'MEDIUM',
    });
  }
  
  if (bttsNo >= 0.60) {
    const modelOdds = 1 / bttsNo;
    const realOdds = data.realOdds?.oddsBTTS?.no;
    const ev = realOdds ? calculateExpectedValue(bttsNo, realOdds) : undefined;
    
    recommendations.push({
      type: 'BTTS_NO',
      market: 'Goal/No Goal',
      description: 'No Goal (Almeno una non segna)',
      probability: bttsNo,
      confidence,
      strength: marketBTTS.strength,
      odds: modelOdds,
      realOdds, // 🆕
      expectedValue: ev, // 🆕
      valueRating: calculateValueRating(bttsNo, confidence, marketBTTS.strength),
      reasoning: `Alta probabilità (${(bttsNo * 100).toFixed(0)}%) che almeno una squadra non riesca a segnare.${ev !== undefined && ev > 0 ? ` Value bet EV ${(ev * 100).toFixed(1)}%!` : ''}`,
      risk: bttsNo >= 0.70 ? 'LOW' : 'MEDIUM',
    });
  }
  
  // 5. COMBO INTELLIGENTI
  // Combo 1: Risultato + Over/Under
  if (market1X2.final.prob1 >= 0.50 && over15 >= 0.70) {
    recommendations.push({
      type: 'COMBO',
      market: 'Combo',
      description: '1 + Over 1.5',
      probability: market1X2.final.prob1 * over15,
      confidence,
      strength: combineStrength(market1X2.strength, marketUnderOver['1.5']?.strength || 'ND'),
      odds: (1 / market1X2.final.prob1) * (1 / over15),
      valueRating: calculateValueRating(market1X2.final.prob1 * over15, confidence, market1X2.strength),
      reasoning: 'Vittoria casa con almeno 2 goal totali - combo sicura',
      risk: 'MEDIUM',
      combo: ['Vittoria Casa (1)', 'Over 1.5 Goal'],
    });
  }
  
  if (market1X2.final.prob2 >= 0.50 && over15 >= 0.70) {
    recommendations.push({
      type: 'COMBO',
      market: 'Combo',
      description: '2 + Over 1.5',
      probability: market1X2.final.prob2 * over15,
      confidence,
      strength: combineStrength(market1X2.strength, marketUnderOver['1.5']?.strength || 'ND'),
      odds: (1 / market1X2.final.prob2) * (1 / over15),
      valueRating: calculateValueRating(market1X2.final.prob2 * over15, confidence, market1X2.strength),
      reasoning: 'Vittoria trasferta con almeno 2 goal totali - combo sicura',
      risk: 'MEDIUM',
      combo: ['Vittoria Trasferta (2)', 'Over 1.5 Goal'],
    });
  }
  
  // Combo 2: Risultato + Goal
  if (market1X2.final.prob1 >= 0.50 && bttsYes >= 0.60) {
    recommendations.push({
      type: 'COMBO',
      market: 'Combo',
      description: '1 + Goal',
      probability: market1X2.final.prob1 * bttsYes,
      confidence,
      strength: combineStrength(market1X2.strength, marketBTTS.strength),
      odds: (1 / market1X2.final.prob1) * (1 / bttsYes),
      valueRating: calculateValueRating(market1X2.final.prob1 * bttsYes, confidence, market1X2.strength),
      reasoning: 'Vittoria casa con entrambe che segnano',
      risk: 'MEDIUM',
      combo: ['Vittoria Casa (1)', 'Goal'],
    });
  }
  
  // Combo 3: 1X + Over
  if (data.marketDoubleChance && data.marketDoubleChance['1X'].final.prob >= 0.75 && over25 >= 0.60) {
    recommendations.push({
      type: 'COMBO',
      market: 'Combo',
      description: '1X + Over 2.5',
      probability: data.marketDoubleChance['1X'].final.prob * over25,
      confidence,
      strength: combineStrength(data.marketDoubleChance['1X'].strength, ou25Strength),
      odds: (1 / data.marketDoubleChance['1X'].final.prob) * (1 / over25),
      valueRating: calculateValueRating(data.marketDoubleChance['1X'].final.prob * over25, confidence, ou25Strength),
      reasoning: 'Casa non perde + almeno 3 goal - combo bilanciata',
      risk: 'LOW',
      combo: ['1X (Casa o Pareggio)', 'Over 2.5 Goal'],
    });
  }
  
  // Ordina per value rating
  return recommendations.sort((a, b) => b.valueRating - a.valueRating);
}

/**
 * Calcola un rating di valore (0-100) basato su probabilità, confidence e strength
 */
/**
 * Calcola Expected Value (rendimento atteso)
 * EV% = (probabilità * quota) - 1
 */
function calculateExpectedValue(probability: number, odds: number): number {
  return (probability * odds) - 1;
}

/**
 * Calcola value rating basato su probabilità e confidence
 */
function calculateValueRating(probability: number, confidence: number, strength: string): number {
  let baseRating = probability * 100;
  
  // Boost da confidence
  baseRating *= (0.5 + confidence * 0.5); // 0.5-1.0x multiplier
  
  // Boost da strength
  const strengthBoost = {
    'STRONG': 1.3,
    'MEDIUM': 1.15,
    'WEAK': 1.0,
    'ND': 0.8,
  }[strength] || 1.0;
  
  baseRating *= strengthBoost;
  
  return Math.min(100, Math.max(0, baseRating));
}

/**
 * Spiega il significato della forza
 */
function getStrengthExplanation(strength: string): string {
  const explanations = {
    'STRONG': 'Predizione molto affidabile.',
    'MEDIUM': 'Predizione con buona affidabilità.',
    'WEAK': 'Predizione con affidabilità moderata.',
    'ND': 'Dati insufficienti per una predizione affidabile.',
  };
  return explanations[strength as keyof typeof explanations] || '';
}

/**
 * Combina due valori di strength
 */
function combineStrength(s1: string, s2: string): string {
  const hierarchy = { 'STRONG': 3, 'MEDIUM': 2, 'WEAK': 1, 'ND': 0 };
  const v1 = hierarchy[s1 as keyof typeof hierarchy] || 0;
  const v2 = hierarchy[s2 as keyof typeof hierarchy] || 0;
  
  const avg = (v1 + v2) / 2;
  
  if (avg >= 2.5) return 'STRONG';
  if (avg >= 1.5) return 'MEDIUM';
  if (avg >= 0.5) return 'WEAK';
  return 'ND';
}

/**
 * Filtra le raccomandazioni in base al rischio massimo accettato
 */
export function filterByRisk(recommendations: BettingRecommendation[], maxRisk: 'LOW' | 'MEDIUM' | 'HIGH'): BettingRecommendation[] {
  const riskLevels = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3 };
  const maxLevel = riskLevels[maxRisk];
  
  return recommendations.filter(r => riskLevels[r.risk] <= maxLevel);
}

/**
 * Ottieni le top N raccomandazioni
 */
export function getTopRecommendations(recommendations: BettingRecommendation[], n: number = 3): BettingRecommendation[] {
  return recommendations.slice(0, n);
}
