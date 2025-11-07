/**
 * Tipi custom per il progetto
 * Estendono i tipi generati da Prisma
 */

import type { 
  Prediction, 
  Fixture, 
  Team, 
  MatchHistory,
  PredictionStrength,
  ConfidenceLevel,
  DataQuality 
} from '@prisma/client';

// Re-export tipi Prisma
export type { 
  PredictionStrength, 
  ConfidenceLevel, 
  DataQuality,
  Prediction,
  Fixture,
  Team,
  MatchHistory
};

// ============================================
// RESPONSE TYPES PER API
// ============================================

export interface FixtureWithTeams extends Fixture {
  homeTeam: Team;
  awayTeam: Team;
  prediction?: PredictionResponse | null;
}

export interface PredictionResponse {
  id: number;
  fixtureId: number;
  
  // Confidence
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  
  // Match info
  homeMatchesUsed: number;
  awayMatchesUsed: number;
  
  // 1X2
  market1X2: {
    empiric: { prob1: number; probX: number; prob2: number };
    poisson: { prob1: number; probX: number; prob2: number };
    final: { prob1: number; probX: number; prob2: number };
    strength: PredictionStrength;
  };
  
  // Under/Over
  marketUnderOver: {
    '0.5': UnderOverMarket & { strength: PredictionStrength };
    '1.5': UnderOverMarket & { strength: PredictionStrength };
    '2.5': UnderOverMarket & { strength: PredictionStrength };
    '3.5': UnderOverMarket & { strength: PredictionStrength };
    '4.5': UnderOverMarket & { strength: PredictionStrength };
  };
  
  // BTTS
  marketBTTS: {
    empiric: { yes: number; no: number };
    poisson: { yes: number; no: number };
    final: { yes: number; no: number };
    strength: PredictionStrength;
  };
  
  // Doppia Chance
  marketDoubleChance: {
    '1X': DoubleChanceMarket & { strength: PredictionStrength };
    '12': DoubleChanceMarket & { strength: PredictionStrength };
    'X2': DoubleChanceMarket & { strength: PredictionStrength };
  };
  
  // Poisson parameters
  poissonParams: {
    lambdaHome: number;
    lambdaAway: number;
    homeAdvantage: number;
  };
  
  // Form Momentum (ultimi 5 match)
  formMomentum: {
    home: {
      formScore: number;       // 0-1 (0=pessima, 1=perfetta)
      formFactor: number;      // 0.7-1.3 (moltiplicatore lambda)
      formLabel: string;       // HOT, GOOD, AVERAGE, COLD
      recentResults: string;   // Es: "W-W-D-L-W"
    };
    away: {
      formScore: number;
      formFactor: number;
      formLabel: string;
      recentResults: string;
    };
  };
  
  // Head-to-Head Analysis (optional - presente se ci sono scontri diretti)
  h2hAnalysis?: {
    totalMatches: number;      // Totale scontri diretti ultimi 5 anni
    homeWins: number;          // Vittorie squadra casa (nei ruoli attuali)
    awayWins: number;          // Vittorie squadra trasferta
    draws: number;             // Pareggi
    homeWinRate: number;       // 0-1 (% vittorie home)
    awayWinRate: number;       // 0-1 (% vittorie away)
    avgGoalsHome: number;      // Media gol squadra casa negli H2H
    avgGoalsAway: number;      // Media gol squadra trasferta negli H2H
    dominance: 'HOME' | 'AWAY' | 'BALANCED';  // Chi domina storicamente
    dominanceLevel: number;    // 0-1 (0=away dominant, 0.5=balanced, 1=home dominant)
    h2hFactor: {
      home: number;            // 0.85-1.15 (moltiplicatore lambda)
      away: number;            // 0.85-1.15 (moltiplicatore lambda)
    };
    recentResults: string;     // Es: "W-L-D-W-W" (dalla prospettiva home)
  };

  // Market Odds Calibration (optional - presente se ODDS_API attiva)
  marketCalibration?: {
    calibrated: boolean;                      // Indica se la calibrazione è stata applicata
    modelProbabilities: {                     // Probabilità originali del modello
      prob1: number;
      probX: number;
      prob2: number;
    };
    marketProbabilities?: {                   // Probabilità derivate dalle quote reali
      prob1: number;
      probX: number;
      prob2: number;
      bookmakerCount: number;                 // Numero di bookmaker utilizzati
      overround: number;                      // Margine bookmaker rimosso
    };
    calibratedProbabilities: {                // Probabilità finali calibrate (70% model + 30% market)
      prob1: number;
      probX: number;
      prob2: number;
    };
    agreement: number;                        // 0-1 (accordo modello/mercato - 0=disaccordo totale, 1=perfetto)
    confidenceBoost: number;                  // Boost confidence se agreement alto (0-0.10)
    valueBets: Array<{                        // Scommesse value (modello > mercato + 10%)
      market: '1' | 'X' | '2';
      modelProb: number;
      marketProb: number;
      difference: number;                     // Differenza model - market
      expectedValue: number;                  // EV = (modelProb * marketOdds) - 1
      marketOdds: number;
    }>;
  };

  // Injuries & Suspensions Analysis (optional - presente se disponibile)
  injuriesAnalysis?: {
    home: {
      teamId: number;
      teamName: string;
      players: Array<{
        playerId: number;
        playerName: string;
        playerPhoto: string;
        type: string;                         // 'Injury', 'Suspended', 'Missing', 'Doubtful'
        reason: string;                       // Injury reason
        position?: string;                    // Goalkeeper, Defender, Midfielder, Attacker
      }>;
      totalInjuries: number;
      severityScore: number;                  // 0-100 (higher = worse)
      impactFactor: {
        attacking: number;                    // Multiplier for lambda (0.7 = -30%)
        defensive: number;                    // Multiplier for xGA (1.2 = +20% more goals conceded)
      };
    };
    away: {
      teamId: number;
      teamName: string;
      players: Array<{
        playerId: number;
        playerName: string;
        playerPhoto: string;
        type: string;
        reason: string;
        position?: string;
      }>;
      totalInjuries: number;
      severityScore: number;
      impactFactor: {
        attacking: number;
        defensive: number;
      };
    };
    homeAdvantage: boolean;                   // true if away has more severe injuries
    awayAdvantage: boolean;                   // true if home has more severe injuries
    balanced: boolean;                        // true if similar injury situations
    impactDescription: string;                // Human-readable description in Italian
  };
  
  // Risultati esatti più probabili
  mostProbableScores: Array<{
    homeGoals: number;
    awayGoals: number;
    probability: number;
  }>;
  
  // Team xG/xGA stats from historical matches
  teamStats: {
    home: {
      xg: number;  // Expected Goals media (goal fatti)
      xga: number; // Expected Goals Against media (goal subiti)
    };
    away: {
      xg: number;
      xga: number;
    };
  };
  
  // xG Model (optional - presente solo se disponibile)
  xgModel?: {
    home: number | null;
    away: number | null;
    total: number;
    xgotHome: number | null;
    xgotAway: number | null;
  };
  
  // xG Flags (optional)
  xgFlags?: {
    missingXg: boolean;
  };
  
  // Metadata
  dataQuality: DataQuality;
  hasInjuries: boolean;
  hasLineup: boolean;
  provider: string;
  calculatedAt: Date;
  lastUpdate: Date;
}

export interface UnderOverMarket {
  empiric: { under: number; over: number };
  poisson: { under: number; over: number };
  final: { under: number; over: number };
}

export interface DoubleChanceMarket {
  empiric: { prob: number };
  poisson: { prob: number };
  final: { prob: number };
}

// ============================================
// CALCOLO TYPES
// ============================================

export interface TeamStats {
  teamId: number;
  matchesPlayed: number;
  
  // Casa
  homeGoalsScored: number;
  homeGoalsConceded: number;
  homeMatches: number;
  
  // Trasferta
  awayGoalsScored: number;
  awayGoalsConceded: number;
  awayMatches: number;
  
  // Forme recente (ultime N partite)
  recentForm: number[]; // Array di risultati (3=W, 1=D, 0=L)
  
  // Media gol
  avgGoalsScored: number;
  avgGoalsConceded: number;
}

export interface EmpiricResult {
  prob1: number;
  probX: number;
  prob2: number;
  
  // Under/Over
  underOver: {
    [key: string]: { under: number; over: number };
  };
  
  // BTTS
  btts: { yes: number; no: number };
  
  // Doppia Chance
  doubleChance: {
    '1X': number;
    '12': number;
    'X2': number;
  };
  
  // Metadata
  homeMatchesUsed: number;
  awayMatchesUsed: number;
  avgRecency: number; // Recenza media delle partite usate
}

export interface PoissonResult {
  prob1: number;
  probX: number;
  prob2: number;
  
  // Matrice punteggi (0-6 gol)
  scoreMatrix: number[][];
  
  // Under/Over
  underOver: {
    [key: string]: { under: number; over: number };
  };
  
  // Probabilità per numero esatto di gol totali
  exactGoals: {
    [goals: string]: number;
  };
  
  // BTTS
  btts: { yes: number; no: number };
  
  // Doppia Chance
  doubleChance: {
    '1X': number;
    '12': number;
    'X2': number;
  };
  
  // Lambda
  lambdaHome: number;
  lambdaAway: number;
  homeAdvantage: number;
}

export interface BlendedResult {
  final: {
    prob1: number;
    probX: number;
    prob2: number;
    
    underOver: {
      [key: string]: { under: number; over: number };
    };
    
    exactGoals: {
      [goals: string]: number;
    };
    
    btts: { yes: number; no: number };
    
    doubleChance: {
      '1X': number;
      '12': number;
      'X2': number;
    };
  };
  
  empiric: EmpiricResult;
  poisson: PoissonResult;
}

export interface ConfidenceFactors {
  dataAvailability: number; // 0-1: Disponibilità dati storici
  recency: number; // 0-1: Quanto sono recenti i dati
  stability: number; // 0-1: Stabilità/consistenza risultati
  lineupStatus: number; // 0-1: Disponibilità formazioni
  injuryImpact: number; // 0-1: Impatto infortuni (1 = nessun infortunio)
  
  overall: number; // Confidence finale (0-1)
  level: ConfidenceLevel;
}

// ============================================
// STRENGTH CLASSIFICATION
// ============================================

export interface StrengthThresholds {
  // 1X2
  threshold1X2Strong: number;
  threshold1X2Medium: number;
  thresholdGiocala: number;
  
  // Binari (U/O, BTTS)
  thresholdBinaryStrong: number;
  thresholdBinaryMedium: number;
  
  // Doppia Chance
  thresholdDCStrong: number;
  thresholdDCMedium: number;
  
  // Confidence minima per GIOCALA
  confidenceMin: number;
}

// ============================================
// API-FOOTBALL RESPONSE TYPES
// ============================================

export interface APIFootballFixture {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;
    timestamp: number;
    periods: {
      first: number | null;
      second: number | null;
    };
    venue: {
      id: number | null;
      name: string | null;
      city: string | null;
    };
    status: {
      long: string;
      short: string;
      elapsed: number | null;
    };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string | null;
    season: number;
    round: string;
  };
  teams: {
    home: {
      id: number;
      name: string;
      logo: string;
      winner: boolean | null;
    };
    away: {
      id: number;
      name: string;
      logo: string;
      winner: boolean | null;
    };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
}

export interface APIFootballStatistics {
  team: {
    id: number;
    name: string;
    logo: string;
  };
  statistics: Array<{
    type: string;
    value: number | string | null;
  }>;
}

export interface APIFootballInjury {
  player: {
    id: number;
    name: string;
    photo: string;
    type: string;
    reason: string;
  };
  team: {
    id: number;
    name: string;
    logo: string;
  };
  fixture: {
    id: number;
    timezone: string;
    date: string;
    timestamp: number;
  };
  league: {
    id: number;
    season: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
  };
}

export interface APIFootballLineup {
  team: {
    id: number;
    name: string;
    logo: string;
    colors: {
      player: { primary: string; number: string; border: string };
      goalkeeper: { primary: string; number: string; border: string };
    };
  };
  formation: string;
  startXI: Array<{
    player: {
      id: number;
      name: string;
      number: number;
      pos: string;
      grid: string | null;
    };
  }>;
  substitutes: Array<{
    player: {
      id: number;
      name: string;
      number: number;
      pos: string;
      grid: string | null;
    };
  }>;
  coach: {
    id: number;
    name: string;
    photo: string;
  };
}

// ============================================
// UTILITY TYPES
// ============================================

export type MarketType = '1X2' | 'UNDER_OVER' | 'BTTS' | 'DOUBLE_CHANCE';

export interface CalculationConfig {
  historyGames: number;
  homeAdvGoals: number;
  confidenceMin: number;
  blendEmpiric: number;
  blendPoisson: number;
  thresholds: StrengthThresholds;
}

export interface JobResult {
  success: boolean;
  itemsProcessed: number;
  itemsFailed: number;
  errors: Array<{ item: string; error: string }>;
  durationMs: number;
}
