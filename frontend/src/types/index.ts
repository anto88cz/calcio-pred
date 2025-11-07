/**
 * Frontend TypeScript Types
 */

// ============================================
// ENUMS
// ============================================

export type PredictionStrength = 'GIOCALA' | 'FORTE' | 'MEDIO' | 'NEUTRALE' | 'ND';
export type ConfidenceLevel = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';
export type DataQuality = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'INSUFFICIENT';
export type FixtureStatus = 'TBD' | 'NS' | '1H' | 'HT' | '2H' | 'ET' | 'P' | 'FT' | 'AET' | 'PEN' | 'BT' | 'SUSP' | 'INT' | 'PST' | 'CANC' | 'ABD' | 'AWD' | 'WO';

// ============================================
// STRENGTH BADGES CONFIGURATION
// ============================================

export interface StrengthBadge {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const STRENGTH_BADGES: Record<PredictionStrength, StrengthBadge> = {
  GIOCALA: {
    label: 'GIOCALA',
    icon: '🟩',
    color: 'text-green-800',
    bgColor: 'bg-green-100',
    borderColor: 'border-green-300'
  },
  FORTE: {
    label: 'FORTE',
    icon: '🟢',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200'
  },
  MEDIO: {
    label: 'MEDIO',
    icon: '🟡',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200'
  },
  NEUTRALE: {
    label: 'NEUTRALE',
    icon: '⚪',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200'
  },
  ND: {
    label: 'ND',
    icon: '🔴',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200'
  }
};

// ============================================
// NEW TYPES FOR ENHANCED FRONTEND
// ============================================

export interface League {
  id: number;
  name: string;
  country: string;
  flag: string;
}

export interface ValueBet {
  market: string;
  selection: string;
  odds: number;
  probability: number;
  value: number;
  kelly: number;
  recommend: boolean;
}

export interface MatchPrediction {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  predictions: {
    homeGoals: number;
    awayGoals: number;
    totalGoals: number;
    prob1: number;
    probX: number;
    prob2: number;
  };
  // Over/Under markets
  overUnder?: {
    over05?: number;
    under05?: number;
    over15?: number;
    under15?: number;
    over25?: number;
    under25?: number;
    over35?: number;
    under35?: number;
    over45?: number;
    under45?: number;
  };
  // Exact Goals (probabilità per numero esatto di gol totali)
  exactGoals?: {
    [goals: string]: number; // "0", "1", "2", "3", ecc.
  };
  // BTTS (Both Teams To Score)
  btts?: {
    yes: number;
    no: number;
  };
  confidence: number;
  strength: string;
  valueBets?: ValueBet[];
}

// ============================================
// ENTITIES
// ============================================

export interface Team {
  teamId: number;
  name: string;
  logo: string;
  country?: string;
}

export interface Fixture {
  id: number;
  fixtureId: number;
  leagueId: number;
  leagueName: string;
  leagueCountry: string;
  season: number;
  round: string;
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  status: FixtureStatus;
  venue?: string;
  referee?: string;
  homeTeam: Team;
  awayTeam: Team;
  prediction?: Prediction;
}

export interface Prediction {
  id: number;
  fixtureId: number;
  
  // Confidence
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  
  // Metadata
  homeMatchesUsed: number;
  awayMatchesUsed: number;
  dataQuality: DataQuality;
  hasInjuries: boolean;
  hasLineup: boolean;
  
  // 1X2
  empiricProb1: number;
  empiricProbX: number;
  empiricProb2: number;
  poissonProb1: number;
  poissonProbX: number;
  poissonProb2: number;
  finalProb1: number;
  finalProbX: number;
  finalProb2: number;
  strength1X2: PredictionStrength;
  
  // Under/Over 0.5
  empiricUnder05: number;
  empiricOver05: number;
  poissonUnder05: number;
  poissonOver05: number;
  finalUnder05: number;
  finalOver05: number;
  strengthOver05: PredictionStrength;
  
  // Under/Over 1.5
  empiricUnder15: number;
  empiricOver15: number;
  poissonUnder15: number;
  poissonOver15: number;
  finalUnder15: number;
  finalOver15: number;
  strengthOver15: PredictionStrength;
  
  // Under/Over 2.5
  empiricUnder25: number;
  empiricOver25: number;
  poissonUnder25: number;
  poissonOver25: number;
  finalUnder25: number;
  finalOver25: number;
  strengthOver25: PredictionStrength;
  
  // Under/Over 3.5
  empiricUnder35: number;
  empiricOver35: number;
  poissonUnder35: number;
  poissonOver35: number;
  finalUnder35: number;
  finalOver35: number;
  strengthOver35: PredictionStrength;
  
  // Under/Over 4.5
  empiricUnder45: number;
  empiricOver45: number;
  poissonUnder45: number;
  poissonOver45: number;
  finalUnder45: number;
  finalOver45: number;
  strengthOver45: PredictionStrength;
  
  // BTTS
  empiricBttsYes: number;
  empiricBttsNo: number;
  poissonBttsYes: number;
  poissonBttsNo: number;
  finalBttsYes: number;
  finalBttsNo: number;
  strengthBtts: PredictionStrength;
  
  // Doppia Chance
  empiric1X: number;
  poisson1X: number;
  final1X: number;
  strength1X: PredictionStrength;
  
  empiric12: number;
  poisson12: number;
  final12: number;
  strength12: PredictionStrength;
  
  empiricX2: number;
  poissonX2: number;
  finalX2: number;
  strengthX2: PredictionStrength;
  
  // Poisson params
  lambdaHome: number;
  lambdaAway: number;
  homeAdvantage: number;
  
  // Timestamps
  calculatedAt: string;
  lastUpdate: string;
  
  // Relazioni
  fixture?: Fixture;
}

// ============================================
// FILTERS
// ============================================

export type StrengthFilter = 'ALL' | 'GIOCALA' | 'STRONG_PLUS';

export interface PredictionsFilters {
  date?: string;
  days?: number;
  leagueId?: number;
  minConfidence?: number;
  strengthFilter?: StrengthFilter;
}

// ============================================
// UI HELPERS
// ============================================
// STRENGTH_BADGES configuration is defined above in the STRENGTH BADGES CONFIGURATION section

export const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  VERY_HIGH: 'text-green-600',
  HIGH: 'text-green-500',
  MEDIUM: 'text-yellow-500',
  LOW: 'text-orange-500',
  VERY_LOW: 'text-red-500',
};

export const DATA_QUALITY_LABELS: Record<DataQuality, string> = {
  EXCELLENT: 'Eccellente',
  GOOD: 'Buono',
  FAIR: 'Discreto',
  POOR: 'Scarso',
  INSUFFICIENT: 'Insufficiente',
};

// ============================================
// MARKET CALIBRATION
// ============================================

export interface ValueBet {
  market: string; // '1', 'X', '2', 'Over2.5', 'Under2.5'
  modelProb: number;
  marketProb: number;
  difference: number;
  expectedValue: number;
  marketOdds: number;
}

export interface MarketCalibration {
  calibrated: boolean;
  modelProbabilities: {
    prob1: number;
    probX: number;
    prob2: number;
  };
  marketProbabilities: {
    prob1: number;
    probX: number;
    prob2: number;
    bookmakerCount: number;
    overround: number;
  };
  calibratedProbabilities: {
    prob1: number;
    probX: number;
    prob2: number;
  };
  agreement: number; // 0-1 (0 = disaccordo, 1 = accordo perfetto)
  confidenceBoost: number; // 0-0.10
  valueBets: ValueBet[];
}

export interface InjuredPlayer {
  playerId: number;
  playerName: string;
  playerPhoto: string;
  type: string; // 'Injury', 'Suspended', 'Missing', 'Doubtful'
  reason: string;
  position?: string; // Goalkeeper, Defender, Midfielder, Attacker
}

export interface TeamInjuriesAnalysis {
  teamId: number;
  teamName: string;
  players: InjuredPlayer[];
  totalInjuries: number;
  severityScore: number; // 0-100 (higher = worse)
  impactFactor: {
    attacking: number; // Multiplier for lambda (0.7 = -30%)
    defensive: number; // Multiplier for xGA (1.2 = +20% more goals conceded)
  };
}

export interface InjuriesAnalysis {
  home: TeamInjuriesAnalysis;
  away: TeamInjuriesAnalysis;
  homeAdvantage: boolean;
  awayAdvantage: boolean;
  balanced: boolean;
  impactDescription: string;
}

