'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import moment from 'moment-timezone';
import { ENV } from '@/config/env';

interface PredictionData {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  predictions: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  expectedScore: {
    home: number;
    away: number;
  };
  confidence: number;
  analysis: {
    headToHeadAdvantage: 'home' | 'away' | 'neutral';
    formAdvantage: 'home' | 'away' | 'neutral';
    xGAdvantage: 'home' | 'away' | 'neutral';
    strengthDifference: number;
  };
  factors: {
    headToHead: {
      matches: number;
      homeWins: number;
      draws: number;
      awayWins: number;
      avgHomeGoals: number;
      avgAwayGoals: number;
      weight: number;
    };
    seasonStats: {
      homeStats: any;
      awayStats: any;
      weight: number;
    };
    xGData: {
      homeAvgXG: number;
      homeAvgXGA: number;
      awayAvgXG: number;
      awayAvgXGA: number;
      weight: number;
    };
  };
}

interface BettingRecommendation {
  id: string;
  type: 'result' | 'double_chance' | 'goal_nogoal' | 'over_under' | 'combo' | 'multigoal';
  name: string;
  description: string;
  prediction: string;
  confidence: number;
  valueRating: number;
  odds: number;
  impliedProbability: number;
  modelProbability: number;
  expectedValue: number;
  reason: string;
}

interface BettingRecommendations {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  recommendations: BettingRecommendation[];
  topPicks: BettingRecommendation[];
  lastUpdated: string;
}

export default function PredictionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PredictionData | null>(null);
  const [recommendations, setRecommendations] = useState<BettingRecommendations | null>(null);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    const fixtureId = searchParams.get('fixtureId');
    const homeTeam = searchParams.get('home');
    const awayTeam = searchParams.get('away');
    const homeTeamId = searchParams.get('homeTeamId');
    const awayTeamId = searchParams.get('awayTeamId');
    const seasonId = searchParams.get('seasonId');
    const leagueId = searchParams.get('leagueId');

    if (!fixtureId || !homeTeamId || !awayTeamId || !seasonId || !leagueId) {
      setError('Parametri mancanti per la predizione ML');
      setLoading(false);
      return;
    }

    fetchPrediction(
      parseInt(fixtureId), 
      parseInt(homeTeamId), 
      parseInt(awayTeamId), 
      parseInt(seasonId), 
      parseInt(leagueId),
      homeTeam || '',
      awayTeam || ''
    );
  }, [searchParams]);

  const fetchPrediction = async (
    fixtureId: number,
    homeTeamId: number,
    awayTeamId: number,
    seasonId: number,
    leagueId: number,
    homeTeam: string,
    awayTeam: string
  ) => {
    try {
      setLoading(true);
      setError(null);

      console.log('🤖 Richiesta predizione ML:', { 
        fixtureId, homeTeamId, awayTeamId, seasonId, leagueId 
      });

      const response = await fetch(`${ENV.API_URL}/api/ml-prediction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fixtureId,
          homeTeamId,
          awayTeamId,
          seasonId,
          leagueId,
          homeTeamName: homeTeam,
          awayTeamName: awayTeam,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setFromCache(result.fromCache === true);
        setData(result);
        console.log('✅ Predizione ML ricevuta:', result);
        
        // Fetch betting recommendations
        fetchRecommendations(fixtureId, homeTeamId, awayTeamId, seasonId, leagueId, homeTeam, awayTeam);
      } else {
        const errorData = await response.json();
        console.error('❌ Errore risposta:', errorData);
        setError(errorData.error || 'Errore nella predizione ML');
      }
    } catch (err) {
      console.error('❌ Errore fetch:', err);
      setError('Errore di connessione al server');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecommendations = async (
    fixtureId: number,
    homeTeamId: number,
    awayTeamId: number,
    seasonId: number,
    leagueId: number,
    homeTeam: string,
    awayTeam: string
  ) => {
    try {
      setLoadingRecommendations(true);
      
      console.log('🎲 Richiesta betting recommendations:', { 
        fixtureId, homeTeamId, awayTeamId 
      });

      const response = await fetch(`${ENV.API_URL}/api/betting-recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fixtureId,
          homeTeamId,
          awayTeamId,
          seasonId,
          leagueId,
          homeTeamName: homeTeam,
          awayTeamName: awayTeam,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setRecommendations(result);
        console.log('✅ Betting recommendations ricevute:', result);
      } else {
        console.error('❌ Errore nel fetch recommendations');
      }
    } catch (err) {
      console.error('❌ Errore fetch recommendations:', err);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const getAdvantageColor = (advantage: 'home' | 'away' | 'neutral') => {
    switch (advantage) {
      case 'home': return 'text-blue-400';
      case 'away': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getAdvantageIcon = (advantage: 'home' | 'away' | 'neutral') => {
    switch (advantage) {
      case 'home': return '🏠';
      case 'away': return '✈️';
      default: return '⚖️';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-purple-600/30 border-t-purple-500 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-400">Elaborazione predizione ML...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-red-900/20 border border-red-600/30 rounded-lg p-6">
          <h2 className="text-xl font-bold text-red-400 mb-2">⚠️ Errore</h2>
          <p className="text-gray-300">{error}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
          >
            Torna Indietro
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const maxProb = Math.max(data.predictions.homeWin, data.predictions.draw, data.predictions.awayWin);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition mb-4"
          >
            <span>←</span>
            <span>Torna alle partite</span>
          </button>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">
                🤖 Predizione Machine Learning
              </h1>
              <p className="text-gray-400">
                Analisi basata su Head-to-Head, Statistiche Stagionali e xG
              </p>
            </div>
            {fromCache && (
              <div className="px-4 py-2 bg-blue-900/30 border border-blue-600/30 rounded-lg">
                <span className="text-blue-400 text-sm">📦 Dalla cache</span>
              </div>
            )}
          </div>
        </div>

        {/* Match Header */}
        <div className="bg-gradient-to-r from-slate-800/50 to-slate-900/50 rounded-xl p-6 md:p-8 mb-8 border border-slate-700/50">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-blue-400">
                {data.homeTeam}
              </h2>
              <p className="text-gray-400 text-sm mt-1">Casa</p>
            </div>
            
            <div className="flex-shrink-0">
              <div className="text-4xl md:text-5xl font-bold text-gray-500">VS</div>
            </div>
            
            <div className="flex-1 text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-red-400">
                {data.awayTeam}
              </h2>
              <p className="text-gray-400 text-sm mt-1">Trasferta</p>
            </div>
          </div>
        </div>

        {/* Confidence Badge */}
        <div className="mb-8 flex justify-center">
          <div className="bg-gradient-to-r from-purple-900/50 to-purple-800/50 rounded-lg px-8 py-4 border border-purple-600/30">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">Affidabilità Predizione</p>
              <p className="text-4xl font-bold text-purple-400">{data.confidence}%</p>
            </div>
          </div>
        </div>

        {/* Predictions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Home Win */}
          <div className={`bg-gradient-to-br ${
            data.predictions.homeWin === maxProb 
              ? 'from-blue-900/50 to-blue-800/50 border-blue-500/50' 
              : 'from-slate-800/30 to-slate-900/30 border-slate-700/30'
          } rounded-xl p-6 border-2 transition-all duration-300`}>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-400 mb-2">Vittoria {data.homeTeam}</h3>
              <p className="text-5xl font-bold text-blue-400 mb-2">
                {(data.predictions.homeWin * 100).toFixed(1)}%
              </p>
              {data.predictions.homeWin === maxProb && (
                <span className="inline-block px-3 py-1 bg-blue-600/30 text-blue-300 rounded-full text-sm">
                  ⭐ Più Probabile
                </span>
              )}
            </div>
          </div>

          {/* Draw */}
          <div className={`bg-gradient-to-br ${
            data.predictions.draw === maxProb 
              ? 'from-gray-700/50 to-gray-600/50 border-gray-500/50' 
              : 'from-slate-800/30 to-slate-900/30 border-slate-700/30'
          } rounded-xl p-6 border-2 transition-all duration-300`}>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-400 mb-2">Pareggio</h3>
              <p className="text-5xl font-bold text-gray-300 mb-2">
                {(data.predictions.draw * 100).toFixed(1)}%
              </p>
              {data.predictions.draw === maxProb && (
                <span className="inline-block px-3 py-1 bg-gray-600/30 text-gray-300 rounded-full text-sm">
                  ⭐ Più Probabile
                </span>
              )}
            </div>
          </div>

          {/* Away Win */}
          <div className={`bg-gradient-to-br ${
            data.predictions.awayWin === maxProb 
              ? 'from-red-900/50 to-red-800/50 border-red-500/50' 
              : 'from-slate-800/30 to-slate-900/30 border-slate-700/30'
          } rounded-xl p-6 border-2 transition-all duration-300`}>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-400 mb-2">Vittoria {data.awayTeam}</h3>
              <p className="text-5xl font-bold text-red-400 mb-2">
                {(data.predictions.awayWin * 100).toFixed(1)}%
              </p>
              {data.predictions.awayWin === maxProb && (
                <span className="inline-block px-3 py-1 bg-red-600/30 text-red-300 rounded-full text-sm">
                  ⭐ Più Probabile
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Expected Score */}
        <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 rounded-xl p-6 mb-8 border border-green-600/30">
          <h3 className="text-xl font-bold text-green-400 mb-4 text-center">
            📊 Punteggio Atteso
          </h3>
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">{data.homeTeam}</p>
              <p className="text-5xl font-bold text-blue-400">{data.expectedScore.home}</p>
            </div>
            <div className="text-3xl text-gray-500">-</div>
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">{data.awayTeam}</p>
              <p className="text-5xl font-bold text-red-400">{data.expectedScore.away}</p>
            </div>
          </div>
        </div>

        {/* Analysis Summary */}
        <div className="bg-slate-800/50 rounded-xl p-6 mb-8 border border-slate-700/50">
          <h3 className="text-xl font-bold mb-4">🔍 Analisi Fattori</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-2">Testa a Testa</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl">
                  {getAdvantageIcon(data.analysis.headToHeadAdvantage)}
                </span>
                <span className={`font-bold ${getAdvantageColor(data.analysis.headToHeadAdvantage)}`}>
                  {data.analysis.headToHeadAdvantage === 'home' ? data.homeTeam :
                   data.analysis.headToHeadAdvantage === 'away' ? data.awayTeam : 'Equilibrato'}
                </span>
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-2">Forma Stagionale</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl">
                  {getAdvantageIcon(data.analysis.formAdvantage)}
                </span>
                <span className={`font-bold ${getAdvantageColor(data.analysis.formAdvantage)}`}>
                  {data.analysis.formAdvantage === 'home' ? data.homeTeam :
                   data.analysis.formAdvantage === 'away' ? data.awayTeam : 'Equilibrato'}
                </span>
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-2">Expected Goals (xG)</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl">
                  {getAdvantageIcon(data.analysis.xGAdvantage)}
                </span>
                <span className={`font-bold ${getAdvantageColor(data.analysis.xGAdvantage)}`}>
                  {data.analysis.xGAdvantage === 'home' ? data.homeTeam :
                   data.analysis.xGAdvantage === 'away' ? data.awayTeam : 'Equilibrato'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Factors */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Head to Head */}
          <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
            <h4 className="text-lg font-bold mb-4 text-purple-400">
              📜 Storico Testa a Testa
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Partite</span>
                <span className="font-bold">{data.factors.headToHead.matches}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Vittorie Casa</span>
                <span className="font-bold text-blue-400">{data.factors.headToHead.homeWins}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Pareggi</span>
                <span className="font-bold text-gray-400">{data.factors.headToHead.draws}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Vittorie Trasferta</span>
                <span className="font-bold text-red-400">{data.factors.headToHead.awayWins}</span>
              </div>
              <div className="border-t border-slate-700 pt-3 mt-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Media Gol Casa</span>
                  <span className="font-bold">{data.factors.headToHead.avgHomeGoals.toFixed(1)}</span>
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-gray-400">Media Gol Trasferta</span>
                  <span className="font-bold">{data.factors.headToHead.avgAwayGoals.toFixed(1)}</span>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-700">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Peso nell'algoritmo</span>
                  <span className="text-purple-400 font-bold">
                    {(data.factors.headToHead.weight * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Season Stats */}
          <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
            <h4 className="text-lg font-bold mb-4 text-green-400">
              📈 Statistiche Stagionali
            </h4>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-400 mb-2">{data.homeTeam}</p>
                <div className="text-xs space-y-1">
                  {data.factors.seasonStats.homeStats.avgGoalsScored !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Media Gol Segnati</span>
                      <span className="text-blue-400">
                        {data.factors.seasonStats.homeStats.avgGoalsScored.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {data.factors.seasonStats.homeStats.avgGoalsConceded !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Media Gol Subiti</span>
                      <span className="text-blue-400">
                        {data.factors.seasonStats.homeStats.avgGoalsConceded.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {data.factors.seasonStats.homeStats.winRate !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">% Vittorie</span>
                      <span className="text-blue-400">
                        {(data.factors.seasonStats.homeStats.winRate * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                  {data.factors.seasonStats.homeStats.wins !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">V-P-S</span>
                      <span className="text-blue-400">
                        {data.factors.seasonStats.homeStats.wins}-
                        {data.factors.seasonStats.homeStats.draws}-
                        {data.factors.seasonStats.homeStats.losses}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="border-t border-slate-700 pt-3">
                <p className="text-sm text-gray-400 mb-2">{data.awayTeam}</p>
                {Object.keys(data.factors.seasonStats.awayStats).length > 0 ? (
                  <div className="text-xs space-y-1">
                    {data.factors.seasonStats.awayStats.avgGoalsScored !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Media Gol Segnati</span>
                        <span className="text-red-400">
                          {data.factors.seasonStats.awayStats.avgGoalsScored.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {data.factors.seasonStats.awayStats.avgGoalsConceded !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Media Gol Subiti</span>
                        <span className="text-red-400">
                          {data.factors.seasonStats.awayStats.avgGoalsConceded.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {data.factors.seasonStats.awayStats.winRate !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">% Vittorie</span>
                        <span className="text-red-400">
                          {(data.factors.seasonStats.awayStats.winRate * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
                    {data.factors.seasonStats.awayStats.wins !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">V-P-S</span>
                        <span className="text-red-400">
                          {data.factors.seasonStats.awayStats.wins}-
                          {data.factors.seasonStats.awayStats.draws}-
                          {data.factors.seasonStats.awayStats.losses}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 italic">
                    Statistiche non disponibili per questa squadra
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-700">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Peso nell'algoritmo</span>
                  <span className="text-green-400 font-bold">
                    {(data.factors.seasonStats.weight * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* xG Data */}
          <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
            <h4 className="text-lg font-bold mb-4 text-orange-400">
              ⚡ Expected Goals (xG)
            </h4>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-400 mb-2">{data.homeTeam}</p>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Media xG</span>
                    <span className="text-blue-400">
                      {data.factors.xGData.homeAvgXG.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Media xGA</span>
                    <span className="text-blue-400">
                      {data.factors.xGData.homeAvgXGA.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span className="text-gray-400">xG Differenziale</span>
                    <span className={
                      (data.factors.xGData.homeAvgXG - data.factors.xGData.homeAvgXGA) > 0 
                        ? 'text-green-400' 
                        : 'text-red-400'
                    }>
                      {(data.factors.xGData.homeAvgXG - data.factors.xGData.homeAvgXGA).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="border-t border-slate-700 pt-3">
                <p className="text-sm text-gray-400 mb-2">{data.awayTeam}</p>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Media xG</span>
                    <span className="text-red-400">
                      {data.factors.xGData.awayAvgXG.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Media xGA</span>
                    <span className="text-red-400">
                      {data.factors.xGData.awayAvgXGA.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span className="text-gray-400">xG Differenziale</span>
                    <span className={
                      (data.factors.xGData.awayAvgXG - data.factors.xGData.awayAvgXGA) > 0 
                        ? 'text-green-400' 
                        : 'text-red-400'
                    }>
                      {(data.factors.xGData.awayAvgXG - data.factors.xGData.awayAvgXGA).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-700">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Peso nell'algoritmo</span>
                  <span className="text-orange-400 font-bold">
                    {(data.factors.xGData.weight * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Betting Recommendations */}
        {loadingRecommendations && (
          <div className="bg-slate-800/50 rounded-xl p-8 mb-8 border border-slate-700/50">
            <div className="flex items-center justify-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
              <span className="text-gray-400">Caricamento raccomandazioni betting...</span>
            </div>
          </div>
        )}

        {recommendations && !loadingRecommendations && (
          <div className="mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-6 flex items-center gap-3">
              <span>🎯</span>
              <span>Giocate Consigliate</span>
            </h2>

            {/* Top 3 Picks */}
            {recommendations.topPicks && recommendations.topPicks.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-4 text-yellow-400">⭐ Top 3 Raccomandazioni</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {recommendations.topPicks.map((pick, index) => (
                    <div
                      key={pick.id}
                      className="bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 rounded-xl p-6 border-2 border-yellow-600/50 relative overflow-hidden"
                    >
                      {/* Badge */}
                      <div className="absolute top-2 right-2 bg-yellow-600 text-yellow-950 rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </div>

                      {/* Type */}
                      <div className="text-xs text-gray-400 uppercase mb-2">{pick.type}</div>

                      {/* Name */}
                      <h4 className="text-lg font-bold text-yellow-300 mb-3">{pick.name}</h4>

                      {/* Prediction */}
                      <div className="text-2xl font-bold text-white mb-3">{pick.prediction}</div>

                      {/* Odds */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-gray-400 text-sm">Quota:</span>
                        <span className="text-2xl font-bold text-green-400">{pick.odds.toFixed(2)}</span>
                      </div>

                      {/* Confidence & Value Rating */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-slate-900/50 rounded-lg p-2">
                          <div className="text-xs text-gray-500 mb-1">Fiducia</div>
                          <div className="text-lg font-bold text-blue-400">{pick.confidence}%</div>
                        </div>
                        <div className="bg-slate-900/50 rounded-lg p-2">
                          <div className="text-xs text-gray-500 mb-1">Valore</div>
                          <div className="text-lg">{'⭐'.repeat(pick.valueRating)}</div>
                        </div>
                      </div>

                      {/* Expected Value */}
                      {pick.expectedValue !== undefined && (
                        <div className={`px-3 py-2 rounded-lg text-center font-bold ${
                          pick.expectedValue > 0 
                            ? 'bg-green-900/50 text-green-300' 
                            : pick.expectedValue < 0 
                            ? 'bg-red-900/50 text-red-300'
                            : 'bg-gray-900/50 text-gray-300'
                        }`}>
                          EV: {pick.expectedValue > 0 ? '+' : ''}{pick.expectedValue.toFixed(1)}%
                        </div>
                      )}

                      {/* Reason */}
                      {pick.reason && (
                        <div className="mt-3 pt-3 border-t border-yellow-700/30 text-sm text-gray-400">
                          {pick.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full Recommendations List */}
            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
              <h3 className="text-xl font-bold mb-4">📋 Tutte le Raccomandazioni</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recommendations.recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30 hover:border-slate-600/50 transition-all"
                  >
                    {/* Type Badge */}
                    <div className="text-xs text-gray-500 uppercase mb-2">{rec.type}</div>

                    {/* Name */}
                    <h4 className="font-bold text-white mb-2">{rec.name}</h4>

                    {/* Prediction */}
                    <div className="text-lg text-gray-300 mb-3">{rec.prediction}</div>

                    {/* Odds & Stats */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-400">Quota:</span>
                      <span className="text-xl font-bold text-green-400">{rec.odds.toFixed(2)}</span>
                    </div>

                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-400">Fiducia:</span>
                      <span className="font-bold text-blue-400">{rec.confidence}%</span>
                    </div>

                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-gray-400">Valore:</span>
                      <span>{'⭐'.repeat(rec.valueRating)}</span>
                    </div>

                    {/* Expected Value */}
                    {rec.expectedValue !== undefined && (
                      <div className={`px-2 py-1 rounded text-center text-sm font-bold ${
                        rec.expectedValue > 0 
                          ? 'bg-green-900/50 text-green-300' 
                          : rec.expectedValue < 0 
                          ? 'bg-red-900/50 text-red-300'
                          : 'bg-gray-900/50 text-gray-300'
                      }`}>
                        EV: {rec.expectedValue > 0 ? '+' : ''}{rec.expectedValue.toFixed(1)}%
                      </div>
                    )}

                    {/* Reason */}
                    {rec.reason && (
                      <div className="mt-3 pt-3 border-t border-slate-700/30 text-xs text-gray-500">
                        {rec.reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Last Updated */}
              {recommendations.lastUpdated && (
                <div className="mt-6 pt-4 border-t border-slate-700/30 text-center text-xs text-gray-500">
                  Ultimo aggiornamento: {moment.utc(recommendations.lastUpdated).tz('Europe/Rome').format('DD/MM/YYYY HH:mm:ss')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Info */}
        <div className="bg-slate-800/30 rounded-lg p-4 text-center text-sm text-gray-500">
          <p>
            ℹ️ Questa predizione è generata da un algoritmo di Machine Learning che analizza 
            testa a testa storici, statistiche stagionali e dati xG. Le raccomandazioni betting 
            sono calcolate con Expected Value e distribuzioni di Poisson. Utilizza queste informazioni 
            in modo responsabile.
          </p>
        </div>
      </div>
    </div>
  );
}
