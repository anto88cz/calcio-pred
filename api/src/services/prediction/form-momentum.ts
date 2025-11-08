/**
 * Form Momentum Calculator - Multi-Window Analysis
 * 
 * NUOVO APPROCCIO (Nov 2025):
 * - Analizza TUTTA la stagione corrente (non solo ultime 5 partite)
 * - 3 finestre temporali: SHORT (5), MEDIUM (10), LONG (stagione completa)
 * - Identifica TREND: improving/stable/declining
 * - Form factor range esteso: 0.65-1.40 (prima: 0.70-1.30)
 */

import { MatchHistoryData } from '../sportsmonks';
import logger from '../../utils/logger';

export interface FormMomentumResult {
  formScore: number;        // 0-1, weighted average delle 3 finestre
  formFactor: number;       // 0.65-1.40, multiplier per lambda
  formLabel: string;        // 'HOT' | 'GOOD' | 'AVERAGE' | 'COLD'
  recentResults: string;    // "W-W-D-L-W" (ultimi 5)
  trend: 'improving' | 'stable' | 'declining';
  windows: {
    short: { matches: number; formScore: number };   // Last 5
    medium: { matches: number; formScore: number };  // Last 10
    long: { matches: number; formScore: number };    // TUTTA stagione
  };
}

export class FormMomentumCalculator {
  /**
   * Calcola Form Momentum con analisi multi-window
   * 
   * @param history - Partite della stagione corrente (ordinate: recenti → vecchie)
   * @returns FormMomentumResult con trend analysis
   */
  calculate(history: MatchHistoryData[]): FormMomentumResult {
    if (history.length === 0) {
      return this.getDefaultResult();
    }

    // Calcola form per 3 finestre temporali
    const shortWindow = this.calculateWindowForm(history, 5);   // Last 5
    const mediumWindow = this.calculateWindowForm(history, 10); // Last 10
    const longWindow = this.calculateWindowForm(history, history.length); // TUTTA stagione

    // Analizza TREND confrontando le finestre
    const trend = this.analyzeTrend(shortWindow, mediumWindow, longWindow);

    // Form Score finale: Weighted average con più peso al recente
    // 50% short + 30% medium + 20% long
    const formScore = 
      shortWindow.formScore * 0.50 +
      mediumWindow.formScore * 0.30 +
      longWindow.formScore * 0.20;

    // Form factor per lambda adjustment (0.65 - 1.40)
    const formFactor = this.calculateFormFactor(formScore, trend);

    // Label descrittivo (basato su short-term immediate form)
    const formLabel = this.getFormLabel(shortWindow.formScore);

    // Recent results string (ultimi 5 per display)
    const recentResults = shortWindow.results.slice(0, 5).join('-') || '-';

    logger.debug({
      totalSeasonMatches: history.length,
      short: `${shortWindow.matches} matches, score: ${shortWindow.formScore.toFixed(2)}`,
      medium: `${mediumWindow.matches} matches, score: ${mediumWindow.formScore.toFixed(2)}`,
      long: `${longWindow.matches} matches, score: ${longWindow.formScore.toFixed(2)}`,
      trend,
      finalFormScore: formScore.toFixed(3),
      formFactor: formFactor.toFixed(3),
      formLabel,
      recentResults,
    }, 'Form momentum calculated (multi-window)');

    return {
      formScore,
      formFactor,
      formLabel,
      recentResults,
      trend,
      windows: {
        short: { 
          matches: shortWindow.matches, 
          formScore: shortWindow.formScore 
        },
        medium: { 
          matches: mediumWindow.matches, 
          formScore: mediumWindow.formScore 
        },
        long: { 
          matches: longWindow.matches, 
          formScore: longWindow.formScore 
        },
      },
    };
  }

  /**
   * Calcola form per una finestra temporale specifica
   */
  private calculateWindowForm(
    history: MatchHistoryData[],
    windowSize: number
  ): {
    matches: number;
    formScore: number;
    results: string[]; // ['W', 'D', 'L', ...]
  } {
    // Prendi finestra (max disponibili)
    const window = history.slice(0, Math.min(windowSize, history.length));
    
    if (window.length === 0) {
      return { matches: 0, formScore: 0.5, results: [] };
    }

    // Weight esponenziale: più recente = più peso
    // Formula: weight = decay^index (decay = 0.92)
    const decay = 0.92;
    
    let totalPoints = 0;
    let maxPossible = 0;
    const results: string[] = [];

    window.forEach((match, index) => {
      const weight = Math.pow(decay, index);
      
      // Determina risultato (W/D/L) e punti
      const { points, result } = this.getMatchResult(match);
      
      totalPoints += points * weight;
      maxPossible += 3 * weight; // Max 3 punti per match
      results.push(result);
    });

    // Form score normalizzato (0-1)
    const formScore = maxPossible > 0 ? totalPoints / maxPossible : 0.5;

    return {
      matches: window.length,
      formScore,
      results,
    };
  }

  /**
   * Determina risultato di un match (W/D/L) e punti
   */
  private getMatchResult(match: MatchHistoryData): { points: number; result: string } {
    let points = 0;
    let result = '';
    
    if (match.isHome) {
      if (match.homeGoals > match.awayGoals) {
        points = 3;
        result = 'W';
      } else if (match.homeGoals === match.awayGoals) {
        points = 1;
        result = 'D';
      } else {
        points = 0;
        result = 'L';
      }
    } else {
      if (match.awayGoals > match.homeGoals) {
        points = 3;
        result = 'W';
      } else if (match.awayGoals === match.homeGoals) {
        points = 1;
        result = 'D';
      } else {
        points = 0;
        result = 'L';
      }
    }

    return { points, result };
  }

  /**
   * Analizza TREND confrontando le 3 finestre
   */
  private analyzeTrend(
    short: { formScore: number },
    medium: { formScore: number },
    long: { formScore: number }
  ): 'improving' | 'stable' | 'declining' {
    // Improving: short > medium > long (in crescita)
    // Delta threshold: +10% short vs medium, +5% medium vs long
    if (short.formScore > medium.formScore + 0.10 && 
        medium.formScore > long.formScore + 0.05) {
      return 'improving';
    }
    
    // Declining: short < medium < long (in calo)
    // Delta threshold: -10% short vs medium, -5% medium vs long
    if (short.formScore < medium.formScore - 0.10 && 
        medium.formScore < long.formScore - 0.05) {
      return 'declining';
    }

    // Altrimenti: stable
    return 'stable';
  }

  /**
   * Calcola form factor con trend adjustment
   */
  private calculateFormFactor(formScore: number, trend: 'improving' | 'stable' | 'declining'): number {
    // Base factor (0.70 - 1.30)
    let baseFactor = 0.70 + 0.60 * formScore;
    
    // Trend adjustment
    if (trend === 'improving') {
      baseFactor *= 1.08; // +8% boost se in crescita
    } else if (trend === 'declining') {
      baseFactor *= 0.92; // -8% penalità se in calo
    }
    
    // Clamp finale (0.65 - 1.40)
    return Math.max(0.65, Math.min(1.40, baseFactor));
  }

  /**
   * Get form label basato su form score
   */
  private getFormLabel(formScore: number): string {
    if (formScore >= 0.80) return 'HOT';      // 🔥 Forma eccellente
    if (formScore >= 0.60) return 'GOOD';     // ⚡ Buona forma
    if (formScore >= 0.40) return 'AVERAGE';  // 📊 Forma media
    return 'COLD';                             // ❄️ Forma scarsa
  }

  /**
   * Result di default quando nessuna partita disponibile
   */
  private getDefaultResult(): FormMomentumResult {
    return {
      formScore: 0.5,
      formFactor: 1.0,
      formLabel: 'UNKNOWN',
      recentResults: '-',
      trend: 'stable',
      windows: {
        short: { matches: 0, formScore: 0.5 },
        medium: { matches: 0, formScore: 0.5 },
        long: { matches: 0, formScore: 0.5 },
      },
    };
  }

  /**
   * 🏠 Calcola Form Momentum per squadra IN CASA
   * Filtra SOLO partite giocate in casa prima di calcolare
   * 
   * @param history - Tutte le partite della squadra (casa + trasferta)
   * @param teamId - ID della squadra per identificare partite in casa
   * @returns FormMomentumResult basato solo su performance casalinghe
   */
  calculateHomeForm(history: MatchHistoryData[], teamId: number): FormMomentumResult {
    // Filtra solo partite giocate IN CASA
    const homeMatches = history.filter(match => match.homeTeamId === teamId);
    
    logger.debug({
      teamId,
      totalMatches: history.length,
      homeMatches: homeMatches.length,
    }, '🏠 Calculating HOME form (filtered)');
    
    // Calcola form usando solo partite in casa
    return this.calculate(homeMatches);
  }

  /**
   * 🛫 Calcola Form Momentum per squadra IN TRASFERTA
   * Filtra SOLO partite giocate in trasferta prima di calcolare
   * 
   * @param history - Tutte le partite della squadra (casa + trasferta)
   * @param teamId - ID della squadra per identificare partite in trasferta
   * @returns FormMomentumResult basato solo su performance esterne
   */
  calculateAwayForm(history: MatchHistoryData[], teamId: number): FormMomentumResult {
    // Filtra solo partite giocate IN TRASFERTA
    const awayMatches = history.filter(match => match.awayTeamId === teamId);
    
    logger.debug({
      teamId,
      totalMatches: history.length,
      awayMatches: awayMatches.length,
    }, '🛫 Calculating AWAY form (filtered)');
    
    // Calcola form usando solo partite in trasferta
    return this.calculate(awayMatches);
  }
}

// Export singleton instance
export const formMomentumCalculator = new FormMomentumCalculator();
