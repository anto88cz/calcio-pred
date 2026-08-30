/**
 * Backtesting Framework
 * 
 * Valida accuracy del sistema di predizione su match storici.
 * Calcola metriche chiave: Brier Score, Accuracy, ROI, Calibration
 * 
 * USAGE:
 * const report = await backtester.runBacktest({
 *   startDate: '2024-08-01',
 *   endDate: '2024-11-01',
 *   leagues: [39, 135, 140], // Premier, Serie A, La Liga
 *   limit: 100
 * });
 */

import { predictionEngine } from '../prediction/engine';
import prisma from '../../lib/prisma';
import logger from '../../utils/logger';
import { FixtureStatus } from '@prisma/client';
import { fetchClosingOdds1X2, type ClosingOdds1X2 } from './closing-odds';

export interface BacktestConfig {
  startDate: string;      // ISO date
  endDate: string;        // ISO date
  leagues: number[];      // League IDs
  limit?: number;         // Max fixtures to test (default: all)
  strengthFilter?: string; // 'GIOCALA' | 'STRONG' | 'ALL'
  /** Pausa tra una partita e l'altra, per non saturare il rate limit. */
  delayMs?: number;
  /**
   * Calibrazione sulle quote di mercato dentro l'engine. Default: false.
   *
   * Va tenuta spenta per misurare il modello: il ROI si calcola sulla closing
   * line, e con la calibrazione attiva il 30% della probabilita' finale viene
   * proprio da quella quota. Attivarla solo per rispondere alla domanda
   * diversa "quanto rende il sistema in produzione", sapendo che il numero
   * non e' una misura del modello.
   */
  marketCalibration?: boolean;
}

export interface BacktestResult {
  fixtureId: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  
  // Risultato reale
  actualResult: {
    homeGoals: number;
    awayGoals: number;
    outcome: '1' | 'X' | '2'; // 1=Home, X=Draw, 2=Away
  };
  
  // Predizione
  prediction: {
    prob1: number;
    probX: number;
    prob2: number;
    predictedOutcome: '1' | 'X' | '2';
    confidence: number;
    strength: string;
    /** P(Over 2.5). Under = 1 - over. */
    over25: number;
    /** P(entrambe segnano) */
    bttsYes: number;
  };
  
  // Quote di chiusura reali del bookmaker (null se non disponibili).
  // Senza queste il ROI non e' calcolabile: vedi calculateROI.
  closingOdds: ClosingOdds1X2 | null;

  // Metriche
  correct1X2: boolean;
  correctOver25: boolean;
  correctBtts: boolean;
  brierScore: number;
}

export interface BacktestReport {
  config: BacktestConfig;
  summary: {
    totalMatches: number;
    dateRange: string;
    leagues: string[];
  };
  
  // Accuracy metrics
  accuracy: {
    overall1X2: number;           // % predizioni 1X2 corrette
    byStrength: {
      GIOCALA: number;
      STRONG: number;
      MEDIUM: number;
      NEUTRAL: number;
    };
    overUnder25: number;          // % predizioni O/U 2.5 corrette
    btts: number;                 // % predizioni BTTS corrette
  };
  
  // Statistical quality
  brierScore: {
    overall: number;              // Overall Brier Score (target < 0.18)
    by1X2: {
      home: number;
      draw: number;
      away: number;
    };
  };
  
  // Calibration (prob predetta vs reale)
  calibration: {
    buckets: Array<{
      range: string;              // "60-70%"
      predictedProb: number;      // Media prob predetta
      actualFreq: number;         // Frequenza reale
      count: number;
    }>;
    calibrationError: number;     // Mean absolute difference
  };
  
  // ROI simulation
  roi: {
    flatBetting: number;          // Se scommetti 1€ su ogni predizione
    kellyBetting: number;         // Con Kelly Criterion
    strengthFiltered: {           // Solo GIOCALA/FORTE
      flatBetting: number;
      kellyBetting: number;
    };
  };
  
  /**
   * Confronto con il mercato: la sola misura che dice se il modello serve.
   *
   * L'accuracy sull'1X2 non basta ("sempre casa" fa ~45%), e un Brier basso in
   * assoluto non dice niente se le quote de-viggate lo fanno meglio. Il
   * confronto e' sullo stesso sottoinsieme di partite: solo quelle con closing
   * line disponibile.
   */
  marketComparison: {
    matchesWithOdds: number;
    /** margine medio del bookmaker: overround - 1 */
    avgMargin: number;
    model: { brier: number; logLoss: number; accuracy: number };
    market: { brier: number; logLoss: number; accuracy: number };
    /** modello - mercato: negativo = il modello e' migliore */
    delta: { brier: number; logLoss: number };
    beatsMarket: boolean;
  };

  // Detailed results
  results: BacktestResult[];
  
  // Performance by league
  byLeague: Record<string, {
    matches: number;
    accuracy: number;
    brierScore: number;
  }>;
}

export class Backtester {
  /**
   * Esegue backtest completo
   */
  async runBacktest(config: BacktestConfig): Promise<BacktestReport> {
    logger.info({ config }, '🧪 Starting backtest');
    
    const startTime = Date.now();
    
    // 1. Fetch fixtures storici nel range
    const fixtures = await this.fetchHistoricalFixtures(config);
    
    if (fixtures.length === 0) {
      throw new Error('No fixtures found in date range');
    }
    
    logger.info({ count: fixtures.length }, 'Fixtures loaded for backtesting');
    
    // 2. Calcola predizioni per ogni fixture
    const results: BacktestResult[] = [];
    
    for (let i = 0; i < fixtures.length; i++) {
      const fixture = fixtures[i];
      
      try {
        logger.debug({ 
          progress: `${i + 1}/${fixtures.length}`,
          fixture: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
        }, 'Processing fixture');
        
        const result = await this.backtestSingleFixture(fixture, config);
        results.push(result);
        
        // Progress log ogni 10 fixtures
        if ((i + 1) % 10 === 0) {
          logger.info({ 
            progress: `${i + 1}/${fixtures.length}`,
            elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
          }, 'Backtest progress');
        }
        
        // Pausa tra predizioni. 6s fissi erano ~3 ore di sola attesa su una
        // stagione intera; ora e' configurabile e il grosso del costo sono le
        // chiamate vere, non l'attesa.
        const delayMs = config.delayMs ?? 300;
        if (delayMs > 0 && i < fixtures.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
      } catch (error) {
        logger.error({ 
          error, 
          fixtureId: fixture.id,
          fixture: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
        }, 'Failed to backtest fixture');
        // Continue con prossimo fixture
      }
    }
    
    // 3. Calcola metriche aggregate
    const report = this.generateReport(config, results, fixtures);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info({ 
      totalMatches: results.length,
      accuracy: `${report.accuracy.overall1X2.toFixed(1)}%`,
      brierScore: report.brierScore.overall.toFixed(3),
      elapsed: `${elapsed}s`,
    }, '✅ Backtest completed');
    
    return report;
  }
  
  /**
   * Fetch fixtures storici finiti (status FT)
   */
  private async fetchHistoricalFixtures(config: BacktestConfig) {
    const fixtures = await prisma.fixture.findMany({
      where: {
        date: {
          gte: new Date(config.startDate),
          lte: new Date(config.endDate),
        },
        leagueId: {
          in: config.leagues,
        },
        status: FixtureStatus.FINISHED, // Usa enum Prisma
        homeGoals: { not: null },
        awayGoals: { not: null },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: {
        date: 'asc',
      },
      take: config.limit || undefined,
    });
    
    return fixtures;
  }
  
  /**
   * Backtest singolo fixture
   */
  private async backtestSingleFixture(
    fixture: any,
    config: BacktestConfig
  ): Promise<BacktestResult> {
    // Calcola predizione usando dati PRE-MATCH.
    //
    // fixtureId dev'essere l'ID Sportmonks (apiId), non la chiave primaria di
    // Postgres: l'engine lo usa per interrogare l'API. Prima si passava
    // fixture.id, quindi ogni chiamata a xG/quote puntava a una partita diversa.
    //
    // fixtureDate e' cio' che attiva il taglio temporale in fetchHistoricalData:
    // senza, lo storico squadre parte da OGGI e include partite giocate dopo
    // quella da predire.
    const prediction = await predictionEngine.calculatePrediction({
      fixtureId: fixture.apiId,
      homeTeamId: fixture.homeTeam.apiId,
      awayTeamId: fixture.awayTeam.apiId,
      leagueId: fixture.leagueId,
      season: fixture.leagueSeason,
      homeTeamName: fixture.homeTeam.name,
      awayTeamName: fixture.awayTeam.name,
      leagueName: fixture.leagueName,
      fixtureDate: fixture.date,
      // Senza questo il modello riceverebbe la quota contro cui viene poi
      // misurato, e per giunta mediata su righe aggiornate a partita in corso.
      skipMarketCalibration: !config.marketCalibration,
    });

    // Quote di chiusura reali: il ROI va calcolato su quello che il bookmaker
    // pagava davvero, non su 1/probabilita' del modello.
    const closingOdds = await fetchClosingOdds1X2(fixture.apiId, fixture.date);

    const totalGoals = fixture.homeGoals + fixture.awayGoals;
    const bothScored = fixture.homeGoals > 0 && fixture.awayGoals > 0;

    // Determina outcome reale
    const actualOutcome = 
      fixture.homeGoals > fixture.awayGoals ? '1' :
      fixture.homeGoals < fixture.awayGoals ? '2' : 'X';
    
    // Determina predicted outcome (max prob)
    const probs = {
      '1': prediction.market1X2.final.prob1,
      'X': prediction.market1X2.final.probX,
      '2': prediction.market1X2.final.prob2,
    };
    const predictedOutcome = Object.entries(probs).reduce((a, b) => 
      probs[a[0] as '1' | 'X' | '2'] > probs[b[0] as '1' | 'X' | '2'] ? a : b
    )[0] as '1' | 'X' | '2';
    
    // Calcola Brier Score per questo match
    const brierScore = this.calculateBrierScore(
      { '1': probs['1'], 'X': probs['X'], '2': probs['2'] },
      actualOutcome
    );
    
    return {
      fixtureId: fixture.id,
      date: fixture.date.toISOString().split('T')[0],
      homeTeam: fixture.homeTeam.name,
      awayTeam: fixture.awayTeam.name,
      league: fixture.leagueName,
      
      actualResult: {
        homeGoals: fixture.homeGoals,
        awayGoals: fixture.awayGoals,
        outcome: actualOutcome,
      },
      
      prediction: {
        prob1: probs['1'],
        probX: probs['X'],
        prob2: probs['2'],
        predictedOutcome,
        confidence: prediction.confidence,
        strength: prediction.market1X2.strength,
        over25: prediction.marketUnderOver['2.5'].final.over,
        bttsYes: prediction.marketBTTS.final.yes,
      },
      
      closingOdds,

      correct1X2: predictedOutcome === actualOutcome,
      correctOver25: (prediction.marketUnderOver['2.5'].final.over >= 0.5) === (totalGoals > 2.5),
      correctBtts: (prediction.marketBTTS.final.yes >= 0.5) === bothScored,
      brierScore,
    };
  }
  
  /**
   * Calcola Brier Score
   * Formula: (1/N) * Σ(predicted - actual)^2
   * Range: 0 (perfect) - 1 (worst)
   */
  private calculateBrierScore(
    predicted: { '1': number; 'X': number; '2': number },
    actual: '1' | 'X' | '2'
  ): number {
    const actualVector = {
      '1': actual === '1' ? 1 : 0,
      'X': actual === 'X' ? 1 : 0,
      '2': actual === '2' ? 1 : 0,
    };
    
    const score = 
      Math.pow(predicted['1'] - actualVector['1'], 2) +
      Math.pow(predicted['X'] - actualVector['X'], 2) +
      Math.pow(predicted['2'] - actualVector['2'], 2);
    
    return score / 3; // Normalizza per 3 outcomes
  }
  
  /**
   * Genera report finale
   */
  private generateReport(
    config: BacktestConfig,
    results: BacktestResult[],
    _fixtures: any[]
  ): BacktestReport {
    // Overall accuracy
    const correct = results.filter(r => r.correct1X2).length;
    const accuracy = (correct / results.length) * 100;
    
    // Accuracy by strength
    // I valori sono quelli dell'enum Prisma PredictionStrength.
    // Prima si filtrava su 'FORTE'/'MEDIO'/'NEUTRALE', stringhe che il codice
    // non produce mai: quei conteggi erano sempre vuoti.
    const byStrength = {
      GIOCALA: this.calculateAccuracyByStrength(results, 'GIOCALA'),
      STRONG: this.calculateAccuracyByStrength(results, 'STRONG'),
      MEDIUM: this.calculateAccuracyByStrength(results, 'MEDIUM'),
      NEUTRAL: this.calculateAccuracyByStrength(results, 'NEUTRAL'),
    };
    
    // Overall Brier Score
    const avgBrier = results.reduce((sum, r) => sum + r.brierScore, 0) / results.length;
    
    // Brier Score by outcome
    const brierBy1X2 = {
      home: this.calculateBrierByOutcome(results, '1'),
      draw: this.calculateBrierByOutcome(results, 'X'),
      away: this.calculateBrierByOutcome(results, '2'),
    };
    
    // Calibration analysis
    const calibration = this.calculateCalibration(results);
    
    // ROI simulation
    const roi = this.calculateROI(results);
    
    // Confronto col mercato
    const marketComparison = this.compareWithMarket(results);

    // By league analysis
    const byLeague = this.analyzeByLeague(results);
    
    // Leagues info
    const leagueNames = [...new Set(results.map(r => r.league))];
    
    return {
      config,
      summary: {
        totalMatches: results.length,
        dateRange: `${config.startDate} to ${config.endDate}`,
        leagues: leagueNames,
      },
      accuracy: {
        overall1X2: accuracy,
        byStrength,
        overUnder25: (results.filter(r => r.correctOver25).length / results.length) * 100,
        btts: (results.filter(r => r.correctBtts).length / results.length) * 100,
      },
      brierScore: {
        overall: avgBrier,
        by1X2: brierBy1X2,
      },
      calibration,
      roi,
      marketComparison,
      results,
      byLeague,
    };
  }
  
  /**
   * De-vig proporzionale: 1/quota include il margine del banco, le tre
   * probabilita' implicite sommano a ~1.05. Si normalizza per la somma.
   *
   * E' il metodo piu' semplice e assume che il margine sia distribuito in
   * proporzione alla probabilita'. Sul favorito tende a sovrastimare un po'
   * (favourite-longshot bias), ma per un confronto di log-loss e' adeguato.
   */
  private devig(odds: ClosingOdds1X2): { '1': number; 'X': number; '2': number } {
    const raw1 = 1 / odds.home;
    const rawX = 1 / odds.draw;
    const raw2 = 1 / odds.away;
    const sum = raw1 + rawX + raw2;
    return { '1': raw1 / sum, 'X': rawX / sum, '2': raw2 / sum };
  }

  /**
   * Log-loss di una singola predizione: -ln(p assegnata all'esito avvenuto).
   *
   * Perche' non basta il Brier: il log-loss punisce molto piu' duramente la
   * sicurezza sbagliata, ed e' la metrica su cui si confrontano i modelli
   * probabilistici. Clip a 1e-15 per non produrre Infinity su p = 0.
   */
  private logLoss(probs: { '1': number; 'X': number; '2': number }, actual: '1' | 'X' | '2'): number {
    return -Math.log(Math.max(probs[actual], 1e-15));
  }

  /**
   * Modello contro closing line de-viggata, sulle stesse partite.
   */
  private compareWithMarket(results: BacktestResult[]): BacktestReport['marketComparison'] {
    const withOdds = results.filter(r => r.closingOdds !== null);

    const empty = {
      matchesWithOdds: 0,
      avgMargin: 0,
      model: { brier: 0, logLoss: 0, accuracy: 0 },
      market: { brier: 0, logLoss: 0, accuracy: 0 },
      delta: { brier: 0, logLoss: 0 },
      beatsMarket: false,
    };
    if (withOdds.length === 0) return empty;

    let modelBrier = 0, modelLL = 0, modelHits = 0;
    let marketBrier = 0, marketLL = 0, marketHits = 0;
    let margin = 0;

    for (const r of withOdds) {
      const actual = r.actualResult.outcome as '1' | 'X' | '2';
      const modelProbs = { '1': r.prediction.prob1, 'X': r.prediction.probX, '2': r.prediction.prob2 };
      const marketProbs = this.devig(r.closingOdds!);

      modelBrier += this.brierFromProbs(modelProbs, actual);
      modelLL += this.logLoss(modelProbs, actual);
      if (r.prediction.predictedOutcome === actual) modelHits++;

      marketBrier += this.brierFromProbs(marketProbs, actual);
      marketLL += this.logLoss(marketProbs, actual);
      const marketPick = (['1', 'X', '2'] as const).reduce((a, b) => (marketProbs[a] >= marketProbs[b] ? a : b));
      if (marketPick === actual) marketHits++;

      margin += r.closingOdds!.overround - 1;
    }

    const n = withOdds.length;
    const model = {
      brier: modelBrier / n,
      logLoss: modelLL / n,
      accuracy: (modelHits / n) * 100,
    };
    const market = {
      brier: marketBrier / n,
      logLoss: marketLL / n,
      accuracy: (marketHits / n) * 100,
    };

    return {
      matchesWithOdds: n,
      avgMargin: margin / n,
      model,
      market,
      delta: {
        brier: model.brier - market.brier,
        logLoss: model.logLoss - market.logLoss,
      },
      beatsMarket: model.logLoss < market.logLoss,
    };
  }

  /**
   * Alias di calculateBrierScore: modello e mercato devono usare la stessa
   * definizione, inclusa la normalizzazione per 3 esiti, o il confronto non
   * significa niente.
   */
  private brierFromProbs(
    probs: { '1': number; 'X': number; '2': number },
    actual: '1' | 'X' | '2'
  ): number {
    return this.calculateBrierScore(probs, actual);
  }

  /**
   * Calcola accuracy per strength level
   */
  private calculateAccuracyByStrength(
    results: BacktestResult[],
    strength: string
  ): number {
    const filtered = results.filter(r => r.prediction.strength === strength);
    if (filtered.length === 0) return 0;
    
    const correct = filtered.filter(r => r.correct1X2).length;
    return (correct / filtered.length) * 100;
  }
  
  /**
   * Calcola Brier Score per outcome specifico
   */
  private calculateBrierByOutcome(
    results: BacktestResult[],
    outcome: '1' | 'X' | '2'
  ): number {
    const filtered = results.filter(r => r.actualResult.outcome === outcome);
    if (filtered.length === 0) return 0;
    
    const avgBrier = filtered.reduce((sum, r) => sum + r.brierScore, 0) / filtered.length;
    return avgBrier;
  }
  
  /**
   * Analizza calibrazione (prob predetta vs frequenza reale)
   */
  private calculateCalibration(results: BacktestResult[]) {
    const buckets = [
      { range: '0-20%', min: 0, max: 0.20 },
      { range: '20-40%', min: 0.20, max: 0.40 },
      { range: '40-60%', min: 0.40, max: 0.60 },
      { range: '60-80%', min: 0.60, max: 0.80 },
      { range: '80-100%', min: 0.80, max: 1.00 },
    ];
    
    const calibrationBuckets = buckets.map(bucket => {
      // Filtra predizioni in questo bucket (usando max prob)
      const inBucket = results.filter(r => {
        const maxProb = Math.max(r.prediction.prob1, r.prediction.probX, r.prediction.prob2);
        return maxProb >= bucket.min && maxProb < bucket.max;
      });
      
      if (inBucket.length === 0) {
        return {
          range: bucket.range,
          predictedProb: (bucket.min + bucket.max) / 2,
          actualFreq: 0,
          count: 0,
        };
      }
      
      const avgPredicted = inBucket.reduce((sum, r) => {
        const maxProb = Math.max(r.prediction.prob1, r.prediction.probX, r.prediction.prob2);
        return sum + maxProb;
      }, 0) / inBucket.length;
      
      const correct = inBucket.filter(r => r.correct1X2).length;
      const actualFreq = correct / inBucket.length;
      
      return {
        range: bucket.range,
        predictedProb: avgPredicted,
        actualFreq,
        count: inBucket.length,
      };
    });
    
    // Calibration error (mean absolute difference)
    const calibrationError = calibrationBuckets
      .filter(b => b.count > 0)
      .reduce((sum, b) => sum + Math.abs(b.predictedProb - b.actualFreq), 0) / 
      calibrationBuckets.filter(b => b.count > 0).length;
    
    return {
      buckets: calibrationBuckets,
      calibrationError,
    };
  }
  
  /**
   * Simula ROI con diverse strategie
   */
  private calculateROI(results: BacktestResult[]) {
    // Flat betting: 1€ su ogni predizione
    const flatBetting = this.simulateFlatBetting(results);
    
    // Kelly betting: stake proporzionale a edge
    const kellyBetting = this.simulateKellyBetting(results);
    
    // Strength filtered (solo GIOCALA/FORTE)
    const strongPredictions = results.filter(r =>
      r.prediction.strength === 'GIOCALA' || r.prediction.strength === 'STRONG'
    );
    
    return {
      flatBetting,
      kellyBetting,
      strengthFiltered: {
        flatBetting: strongPredictions.length > 0 ? this.simulateFlatBetting(strongPredictions) : 0,
        kellyBetting: strongPredictions.length > 0 ? this.simulateKellyBetting(strongPredictions) : 0,
      },
    };
  }
  
  /**
   * Flat betting: 1 unita' sull'esito piu' probabile, pagata alla quota REALE.
   *
   * Prima si pagava a `fairOdds = 1 / maxProb`, cioe' alla quota implicita del
   * modello stesso. Due conseguenze: (a) se il modello fosse calibrato il ROI
   * sarebbe 0 esatto per costruzione, quindi il numero misurava l'errore di
   * calibrazione e non la profittabilita'; (b) spariva il margine del
   * bookmaker (~5-7%), che e' la soglia vera da battere.
   *
   * Le partite senza quote pre-match vengono SALTATE, non contate come stake:
   * includerle a quota fittizia falserebbe di nuovo il risultato.
   */
  private simulateFlatBetting(results: BacktestResult[]): number {
    const oddsFor = (r: BacktestResult): number | null => {
      if (!r.closingOdds) return null;
      if (r.prediction.predictedOutcome === '1') return r.closingOdds.home;
      if (r.prediction.predictedOutcome === 'X') return r.closingOdds.draw;
      return r.closingOdds.away;
    };

    let staked = 0;
    let returned = 0;

    results.forEach(r => {
      const odds = oddsFor(r);
      if (odds === null) return;

      staked += 1;
      if (r.correct1X2) returned += odds;
    });

    if (staked === 0) return 0;
    return ((returned - staked) / staked) * 100;
  }

  /**
   * Kelly betting sulle quote reali.
   *
   * Con le quote del modello si aveva b = (1-p)/p e quindi
   * (b*p - q) / b = (q - q) / b = 0: la frazione di Kelly era identicamente
   * zero, lo stake sempre zero e il ROI Kelly esattamente 0 su ogni run.
   * Con la quota del bookmaker l'edge esiste solo se p * odds > 1.
   *
   * Si usa half-Kelly con cap al 10% del bankroll, che e' la pratica comune
   * per contenere la varianza quando p e' stimata e non nota.
   */
  private simulateKellyBetting(results: BacktestResult[]): number {
    const KELLY_FRACTION = 0.5;
    const MAX_STAKE = 0.10;

    let bankroll = 100;

    results.forEach(r => {
      if (!r.closingOdds) return;

      const outcome = r.prediction.predictedOutcome;
      const odds =
        outcome === '1' ? r.closingOdds.home :
        outcome === 'X' ? r.closingOdds.draw :
        r.closingOdds.away;

      const p =
        outcome === '1' ? r.prediction.prob1 :
        outcome === 'X' ? r.prediction.probX :
        r.prediction.prob2;

      const b = odds - 1;
      if (b <= 0) return;

      const q = 1 - p;
      const edge = (b * p - q) / b;
      if (edge <= 0) return; // nessun value: non si punta

      const fraction = Math.min(MAX_STAKE, edge * KELLY_FRACTION);
      const stake = bankroll * fraction;

      bankroll += r.correct1X2 ? stake * b : -stake;
    });

    return bankroll - 100; // profitto in % del bankroll iniziale (100)
  }
  
  /**
   * Analizza performance per league
   */
  private analyzeByLeague(results: BacktestResult[]) {
    const leagues = [...new Set(results.map(r => r.league))];
    
    const byLeague: Record<string, any> = {};
    
    leagues.forEach(league => {
      const leagueResults = results.filter(r => r.league === league);
      const correct = leagueResults.filter(r => r.correct1X2).length;
      const accuracy = (correct / leagueResults.length) * 100;
      const avgBrier = leagueResults.reduce((sum, r) => sum + r.brierScore, 0) / leagueResults.length;
      
      byLeague[league] = {
        matches: leagueResults.length,
        accuracy,
        brierScore: avgBrier,
      };
    });
    
    return byLeague;
  }
}

// Export singleton
export const backtester = new Backtester();
