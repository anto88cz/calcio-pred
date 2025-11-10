/**
 * Machine Learning Prediction Service
 * 
 * Implements advanced statistical models for football match prediction:
 * - Dixon-Coles Poisson regression
 * - Expected Goals (xG) analysis
 * - Time-weighted form analysis
 * - Home advantage modeling
 * - Head-to-head analysis
 */

import type { MatchHistoryData } from './sportsmonks/statistics';
import { getLeagueHomeAdvantage } from '../config/supported-leagues';

interface TeamStrength {
  attack: number;  // Attack strength (goals scored rate)
  defense: number; // Defense strength (goals conceded rate)
  form: number;    // Recent form score (0-1)
  xgPerformance: number; // xG over/underperformance
}

interface PredictionFactors {
  homeStrength: TeamStrength;
  awayStrength: TeamStrength;
  homeAdvantage: number;
  formDifferential: number;
  h2hAdvantage: number;
}

interface MatchPrediction {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  expectedGoalsHome: number;
  expectedGoalsAway: number;
  confidence: number;
  factors: PredictionFactors;
  mostLikely: '1' | 'X' | '2';
  scorePredictions: Array<{
    score: string;
    probability: number;
  }>;
}

/**
 * Calculate time-weighted average with exponential decay
 * More recent matches have higher weight
 */
function timeWeightedAverage(values: number[], dates: (Date | string)[], referenceDate?: Date): number {
  if (values.length === 0) return 0;
  
  const now = referenceDate ? referenceDate.getTime() : Date.now();
  const decayRate = 0.1; // Decay rate per month
  
  let weightedSum = 0;
  let totalWeight = 0;
  
  values.forEach((value, i) => {
    const matchDate = dates[i] instanceof Date ? dates[i] as Date : new Date(dates[i]);
    const daysSince = (now - matchDate.getTime()) / (1000 * 60 * 60 * 24);
    const monthsSince = daysSince / 30;
    const weight = Math.exp(-decayRate * monthsSince);
    
    weightedSum += value * weight;
    totalWeight += weight;
  });
  
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Calculate team strength metrics from match history
 */
export function calculateTeamStrength(
  matches: MatchHistoryData[],
  teamId: number,
  isHome: boolean,
  referenceDate?: Date // 🆕 Temporal constraint to prevent data leakage
): TeamStrength {
  // 🔧 FALLBACK MIGLIORATO per piano Free (senza dati storici)
  // Usiamo valori più realistici basati su medie statistiche del calcio
  const FALLBACK_ATTACK = 1.3;  // Media goal segnati per squadra
  const FALLBACK_DEFENSE = 1.3; // Media goal subiti per squadra
  
  if (matches.length === 0) {
    console.log(`⚠️ No historical data available - using fallback values (attack: ${FALLBACK_ATTACK}, defense: ${FALLBACK_DEFENSE})`);
    return {
      attack: FALLBACK_ATTACK,
      defense: FALLBACK_DEFENSE,
      form: 0.5, // Neutral form
      xgPerformance: 1.0,
    };
  }

  // Filter for home/away matches only
  const relevantMatches = matches.filter(m => m.isHome === isHome);
  
  // 🔧 Se non ci sono match specifici home/away, usa TUTTI i match come fallback
  // invece di restituire valori di default bassi
  if (relevantMatches.length === 0) {
    // Usa tutti i match disponibili invece di fallback fisso
    const allGoalsScored = matches.map(m => m.isHome ? m.homeGoals : m.awayGoals);
    const allGoalsConceded = matches.map(m => m.isHome ? m.awayGoals : m.homeGoals);
    const dates = matches.map(m => m.date);
    
    return {
      attack: Math.max(0.5, timeWeightedAverage(allGoalsScored, dates, referenceDate)) || FALLBACK_ATTACK,
      defense: Math.max(0.5, timeWeightedAverage(allGoalsConceded, dates, referenceDate)) || FALLBACK_DEFENSE,
      form: 0.5,
      xgPerformance: 1.0,
    };
  }

  // Calculate attack strength (goals scored per match)
  const goalsScored = relevantMatches.map(m => 
    m.isHome ? m.homeGoals : m.awayGoals
  );
  const dates = relevantMatches.map(m => m.date);
  const attack = timeWeightedAverage(goalsScored, dates, referenceDate);

  // Calculate defense strength (goals conceded per match)
  const goalsConceded = relevantMatches.map(m => 
    m.isHome ? m.awayGoals : m.homeGoals
  );
  const defense = timeWeightedAverage(goalsConceded, dates, referenceDate);

  // Calculate form (recent 5 matches)
  const recentMatches = relevantMatches.slice(0, 5);
  const formPoints: number[] = recentMatches.map(m => {
    const scored = m.isHome ? m.homeGoals : m.awayGoals;
    const conceded = m.isHome ? m.awayGoals : m.homeGoals;
    
    if (scored > conceded) return 1.0; // Win
    if (scored === conceded) return 0.5; // Draw
    return 0.0; // Loss
  });
  const form = formPoints.length > 0 
    ? formPoints.reduce((a: number, b: number) => a + b, 0) / formPoints.length 
    : 0.5;

  // xG performance (actual goals / expected goals)
  // For now, use goals as proxy (will improve when xG data is available)
  const xgPerformance = 1.0;

  return {
    attack: Math.max(0.1, attack), // Minimum 0.1 to avoid division by zero
    defense: Math.max(0.1, defense),
    form,
    xgPerformance,
  };
}

/**
 * Dixon-Coles adjustment for low-scoring matches
 * Adjusts probabilities for 0-0, 1-0, 0-1, 1-1 scores
 */
function dixonColesAdjustment(homeGoals: number, awayGoals: number, rho: number = -0.13): number {
  if (homeGoals === 0 && awayGoals === 0) return 1 - rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1.0;
}

/**
 * Calculate Poisson probability for specific score
 */
function poissonProbability(lambda: number, k: number): number {
  // P(X = k) = (λ^k * e^(-λ)) / k!
  let factorial = 1;
  for (let i = 2; i <= k; i++) {
    factorial *= i;
  }
  
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial;
}

/**
 * Calculate probability matrix for all possible scores (0-0 to 5-5)
 */
function calculateScoreProbabilities(
  lambdaHome: number,
  lambdaAway: number
): Array<{ score: string; probability: number; result: '1' | 'X' | '2' }> {
  const maxGoals = 5;
  const scores: Array<{ score: string; probability: number; result: '1' | 'X' | '2' }> = [];
  
  for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals++) {
    for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals++) {
      const probHome = poissonProbability(lambdaHome, homeGoals);
      const probAway = poissonProbability(lambdaAway, awayGoals);
      const dcAdjustment = dixonColesAdjustment(homeGoals, awayGoals);
      const probability = probHome * probAway * dcAdjustment;
      
      let result: '1' | 'X' | '2';
      if (homeGoals > awayGoals) result = '1';
      else if (homeGoals < awayGoals) result = '2';
      else result = 'X';
      
      scores.push({
        score: `${homeGoals}-${awayGoals}`,
        probability,
        result,
      });
    }
  }
  
  return scores.sort((a, b) => b.probability - a.probability);
}

/**
 * Calculate head-to-head advantage
 */
function calculateH2HAdvantage(h2hMatches: MatchHistoryData[], homeTeamId: number): number {
  if (h2hMatches.length === 0) return 0;
  
  const recentH2H = h2hMatches.slice(0, 5); // Last 5 H2H
  const homeResults: number[] = recentH2H.map(m => {
    const homeWon = m.homeTeamId === homeTeamId && m.homeGoals > m.awayGoals;
    const awayWon = m.awayTeamId === homeTeamId && m.awayGoals > m.homeGoals;
    const draw = m.homeGoals === m.awayGoals;
    
    if (homeWon || awayWon) return 1.0;
    if (draw) return 0.5;
    return 0.0;
  });
  
  return homeResults.reduce((a: number, b: number) => a + b, 0) / homeResults.length - 0.5; // -0.5 to 0.5 range
}

/**
 * Main prediction function
 */
export function predictMatch(
  homeMatches: MatchHistoryData[],
  awayMatches: MatchHistoryData[],
  h2hMatches: MatchHistoryData[],
  homeTeamId: number,
  awayTeamId: number,
  leagueAvgGoals: number = 2.7, // League average goals per match
  leagueName?: string // 🆕 League name for specific home advantage
): MatchPrediction {
  // Calculate team strengths
  const homeStrength = calculateTeamStrength(homeMatches, homeTeamId, true);
  const awayStrength = calculateTeamStrength(awayMatches, awayTeamId, false);
  
  // Home advantage factor - league-specific or default
  const homeAdvantage = leagueName 
    ? getLeagueHomeAdvantage(leagueName)
    : 1.1; // Default fallback
  
  // Calculate expected goals using strength-based approach
  const leagueAvgHome = leagueAvgGoals * 0.55; // Home teams score ~55% of total goals
  const leagueAvgAway = leagueAvgGoals * 0.45;
  
  // 🔧 FIX: Se usiamo fallback (valori ~1.3), questi rappresentano già goal per partita
  // Non dovrebbero essere moltiplicati ulteriormente come ratio
  const usingFallback = homeMatches.length === 0 || awayMatches.length === 0;
  
  let expectedGoalsHome: number;
  let expectedGoalsAway: number;
  
  if (usingFallback) {
    // Con fallback, i valori sono già expected goals diretti
    // Applichiamo solo l'home advantage
    expectedGoalsHome = homeStrength.attack * homeAdvantage; // ~1.3 * 1.2 = 1.56 goal
    expectedGoalsAway = awayStrength.attack;                  // ~1.3 goal
    
    console.log(`⚠️ Using fallback mode - Home xG: ${expectedGoalsHome.toFixed(2)}, Away xG: ${expectedGoalsAway.toFixed(2)}`);
  } else {
    // Con dati reali, i valori attack/defense sono GIÀ expected goals medi
    // NON dobbiamo moltiplicare per leagueAvg, sono già in quella scala!
    // Formula semplificata: xG = attack * (opponent_defense / league_avg) * home_advantage
    
    // Normalizza defense come ratio (1.0 = media di lega)
    const awayDefenseRatio = awayStrength.defense / leagueAvgAway; // >1 = difesa debole
    const homeDefenseRatio = homeStrength.defense / (leagueAvgHome / homeAdvantage);
    
    // Expected goals = attacco squadra * (difesa avversario normalizzata) * home advantage
    expectedGoalsHome = homeStrength.attack * awayDefenseRatio * homeAdvantage;
    expectedGoalsAway = awayStrength.attack * homeDefenseRatio;
    
    console.log(`✅ Using historical data - Home xG: ${expectedGoalsHome.toFixed(2)}, Away xG: ${expectedGoalsAway.toFixed(2)}`);
    console.log(`   Home: attack=${homeStrength.attack.toFixed(2)} * away_def_ratio=${awayDefenseRatio.toFixed(2)} * home_adv=${homeAdvantage.toFixed(2)}`);
    console.log(`   Away: attack=${awayStrength.attack.toFixed(2)} * home_def_ratio=${homeDefenseRatio.toFixed(2)}`);
  }
  
  // Calculate score probabilities using Poisson distribution
  const scoreProbabilities = calculateScoreProbabilities(expectedGoalsHome, expectedGoalsAway);
  
  // Aggregate probabilities for 1/X/2
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;
  
  scoreProbabilities.forEach(sp => {
    if (sp.result === '1') homeWinProb += sp.probability;
    else if (sp.result === 'X') drawProb += sp.probability;
    else awayWinProb += sp.probability;
  });
  
  // Normalize probabilities to sum to 1
  const total = homeWinProb + drawProb + awayWinProb;
  homeWinProb /= total;
  drawProb /= total;
  awayWinProb /= total;
  
  // Adjust probabilities based on form
  const formDifferential = homeStrength.form - awayStrength.form;
  const formAdjustment = formDifferential * 0.1; // Max 10% adjustment
  
  homeWinProb = Math.max(0.01, Math.min(0.99, homeWinProb + formAdjustment));
  awayWinProb = Math.max(0.01, Math.min(0.99, awayWinProb - formAdjustment));
  drawProb = Math.max(0.01, 1 - homeWinProb - awayWinProb);
  
  // Adjust based on H2H
  const h2hAdvantage = calculateH2HAdvantage(h2hMatches, homeTeamId);
  const h2hAdjustment = h2hAdvantage * 0.05; // Max 5% adjustment
  
  homeWinProb = Math.max(0.01, Math.min(0.99, homeWinProb + h2hAdjustment));
  awayWinProb = Math.max(0.01, Math.min(0.99, awayWinProb - h2hAdjustment));
  drawProb = Math.max(0.01, 1 - homeWinProb - awayWinProb);
  
  // Calculate confidence based on data quality
  const dataCompleteness = Math.min(1, (homeMatches.length + awayMatches.length) / 40);
  const formStability = 1 - Math.abs(homeStrength.form - 0.5) * 0.5;
  const confidence = dataCompleteness * formStability;
  
  // Determine most likely outcome
  let mostLikely: '1' | 'X' | '2';
  if (homeWinProb > drawProb && homeWinProb > awayWinProb) mostLikely = '1';
  else if (awayWinProb > drawProb && awayWinProb > homeWinProb) mostLikely = '2';
  else mostLikely = 'X';
  
  return {
    homeWinProb,
    drawProb,
    awayWinProb,
    expectedGoalsHome,
    expectedGoalsAway,
    confidence,
    factors: {
      homeStrength,
      awayStrength,
      homeAdvantage,
      formDifferential,
      h2hAdvantage,
    },
    mostLikely,
    scorePredictions: scoreProbabilities.slice(0, 10), // Top 10 most likely scores
  };
}

/**
 * Calculate implied odds from probability
 */
export function probabilityToOdds(probability: number, margin: number = 0.05): number {
  // Add bookmaker margin
  const impliedProb = probability * (1 - margin);
  return 1 / impliedProb;
}

/**
 * Format prediction for display
 */
export function formatPrediction(prediction: MatchPrediction) {
  return {
    probabilities: {
      home: `${(prediction.homeWinProb * 100).toFixed(1)}%`,
      draw: `${(prediction.drawProb * 100).toFixed(1)}%`,
      away: `${(prediction.awayWinProb * 100).toFixed(1)}%`,
    },
    impliedOdds: {
      home: probabilityToOdds(prediction.homeWinProb).toFixed(2),
      draw: probabilityToOdds(prediction.drawProb).toFixed(2),
      away: probabilityToOdds(prediction.awayWinProb).toFixed(2),
    },
    expectedGoals: {
      home: prediction.expectedGoalsHome.toFixed(2),
      away: prediction.expectedGoalsAway.toFixed(2),
      total: (prediction.expectedGoalsHome + prediction.expectedGoalsAway).toFixed(2),
    },
    confidence: `${(prediction.confidence * 100).toFixed(0)}%`,
    mostLikely: prediction.mostLikely,
    topScores: prediction.scorePredictions.slice(0, 5).map(sp => ({
      score: sp.score,
      probability: `${(sp.probability * 100).toFixed(1)}%`,
    })),
  };
}
