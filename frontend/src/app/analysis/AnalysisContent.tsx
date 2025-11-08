'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ENV } from '@/config/env';
import { generateRecommendations, getTopRecommendations, type BettingRecommendation } from '@/lib/betting-recommendations';

interface AnalysisData {
  homeTeam: string;
  awayTeam: string;
  league: string;
  confidence: number;
  market1X2: {
    final: { prob1: number; probX: number; prob2: number };
    strength: string;
  };
  marketUnderOver: {
    '0.5': { final: { over: number; under: number }; strength: string };
    '1.5': { final: { over: number; under: number }; strength: string };
    '2.5': { final: { over: number; under: number }; strength: string };
    '3.5': { final: { over: number; under: number }; strength: string };
    '4.5': { final: { over: number; under: number }; strength: string };
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
  teamStats?: {
    home: { xg: number; xga: number };
    away: { xg: number; xga: number };
  };
  formMomentum?: {
    home: {
      formLabel: string;
      formScore: number;
      recentResults: string;
    };
    away: {
      formLabel: string;
      formScore: number;
      recentResults: string;
    };
  };
  h2hAnalysis?: {
    totalMatches: number;
    homeWins: number;
    awayWins: number;
    draws: number;
    dominance: string;
  };
  mostProbableScores?: Array<{
    homeGoals: number;
    awayGoals: number;
    probability: number;
  }>;
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
    oddsDoubleChance?: {
      '1X': number;
      'X2': number;
      '12': number;
    };
    bookmakerCount: number;
    overround: number;
    lastUpdate?: string;
  };
}

export default function AnalysisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalysisData | null>(null);
  const [fromCache, setFromCache] = useState(false); // 🆕 Indica se i dati sono dalla cache
  const [oddsAttempted, setOddsAttempted] = useState(false); // 🆕 Indica se abbiamo tentato di recuperare quote

  // Calcola raccomandazioni intelligenti (PRIMA di qualsiasi return!)
  const recommendations = useMemo(() => {
    if (!data) return [];
    return generateRecommendations(data);
  }, [data]);

  const topRecommendations = useMemo(() => {
    return getTopRecommendations(recommendations, 5);
  }, [recommendations]);

  useEffect(() => {
    const homeTeam = searchParams.get('home');
    const awayTeam = searchParams.get('away');
    const fixtureIdParam = searchParams.get('fixtureId');

    if (!homeTeam || !awayTeam) {
      setError('Parametri mancanti');
      setLoading(false);
      return;
    }

    const fixtureId = fixtureIdParam ? parseInt(fixtureIdParam, 10) : undefined;
    analyzeMatch(homeTeam, awayTeam, false, fixtureId);
  }, [searchParams]);

  const analyzeMatch = async (homeTeam: string, awayTeam: string, forceRecalculate = false, fixtureId?: number) => {
    try {
      setLoading(true);
      setError(null);
      setOddsAttempted(forceRecalculate); // 🆕 Se forziamo il ricalcolo, segniamo che tentiamo le quote

      console.log('🔍 Richiesta analisi:', { homeTeam, awayTeam, forceRecalculate, fixtureId });

      const response = await fetch(`${ENV.API_URL}/api/predictions/calculate-by-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          homeTeamName: homeTeam, 
          awayTeamName: awayTeam,
          forceRecalculate, // 🆕 Passa il parametro al backend
          fixtureId, // 🆕 Passa il fixtureId se disponibile
        }),
      });

      console.log('📡 Risposta HTTP:', response.status, response.statusText);

      if (response.ok) {
        const result = await response.json();
        
        // 💾 Controlla se i dati sono dalla cache
        setFromCache(result.fromCache === true);
        
        console.log('📊 Dati backend completi:', JSON.stringify(result, null, 2));
        console.log('💾 From cache:', result.fromCache);
        console.log('🎲 Real Odds:', result.realOdds);
        console.log('📊 market1X2:', result.market1X2);
        console.log('📊 marketUnderOver:', result.marketUnderOver);
        console.log('📊 marketBTTS:', result.marketBTTS);
        console.log('📊 poissonParams:', result.poissonParams);
        console.log('📊 teamStats:', result.teamStats);
        console.log('📊 formMomentum:', result.formMomentum);
        console.log('📊 confidence:', result.confidence);
        
        // Verifica che i dati siano validi
        if (!result.market1X2 || !result.poissonParams) {
          console.error('❌ Dati insufficienti:', { 
            hasMarket1X2: !!result.market1X2, 
            hasPoissonParams: !!result.poissonParams,
            resultKeys: Object.keys(result),
          });
          setError('Dati insufficienti ricevuti dal backend');
          return;
        }
        
        // Verifica valori numerici dettagliata
        console.log('🔍 Verifica valori numerici:');
        console.log('  - confidence:', result.confidence, typeof result.confidence);
        console.log('  - lambdaHome:', result.poissonParams?.lambdaHome, typeof result.poissonParams?.lambdaHome);
        console.log('  - lambdaAway:', result.poissonParams?.lambdaAway, typeof result.poissonParams?.lambdaAway);
        console.log('  - prob1:', result.market1X2?.final?.prob1, typeof result.market1X2?.final?.prob1);
        console.log('  - probX:', result.market1X2?.final?.probX, typeof result.market1X2?.final?.probX);
        console.log('  - prob2:', result.market1X2?.final?.prob2, typeof result.market1X2?.final?.prob2);
        
        if (result.confidence === 0 || result.poissonParams.lambdaHome === 0) {
          console.warn('⚠️ Valori zero rilevati - possibile errore nel calcolo backend');
        }
        
        setData(result);
      } else {
        const errorData = await response.json();
        console.error('❌ Errore risposta:', errorData);
        setError(errorData.error || 'Errore nell\'analisi');
      }
    } catch (err) {
      console.error('❌ Errore fetch:', err);
      setError('Errore di connessione al server');
    } finally {
      setLoading(false);
    }
  };

  const getFormColor = (label: string) => {
    const colors: Record<string, string> = {
      'HOT': 'from-orange-600 to-red-600',
      'GOOD': 'from-yellow-500 to-orange-500',
      'AVERAGE': 'from-gray-600 to-gray-700',
      'COLD': 'from-blue-500 to-cyan-500',
    };
    return colors[label] || 'from-gray-600 to-gray-700';
  };

  const getFormEmoji = (label: string) => {
    const emojis: Record<string, string> = {
      'HOT': '🔥',
      'GOOD': '⚡',
      'AVERAGE': '📊',
      'COLD': '❄️',
    };
    return emojis[label] || '❓';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-blue-600/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-400">Analisi in corso...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center">
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-6 max-w-md">
          <p className="text-red-300">{error}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            ← Torna indietro
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Helper per ottenere il colore del rischio
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-green-400 bg-green-900/30 border-green-700';
      case 'MEDIUM': return 'text-yellow-400 bg-yellow-900/30 border-yellow-700';
      case 'HIGH': return 'text-red-400 bg-red-900/30 border-red-700';
      default: return 'text-gray-400 bg-gray-900/30 border-gray-700';
    }
  };

  // Helper per ottenere l'icona del tipo di scommessa
  const getBetIcon = (type: string) => {
    switch (type) {
      case '1': return '🏠';
      case '2': return '✈️';
      case 'X': return '🤝';
      case 'OVER': return '⬆️';
      case 'UNDER': return '⬇️';
      case 'BTTS_YES': return '⚽⚽';
      case 'BTTS_NO': return '🚫⚽';
      case 'COMBO': return '🎯';
      default: return '📊';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900">
      {/* Header */}
      <header className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center space-x-2 text-gray-400 hover:text-white transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Indietro</span>
          </button>
          
          <div className="flex items-center space-x-3">
            {/* 💾 Badge Cache */}
            {fromCache && (
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-green-900/30 border border-green-700 rounded-lg">
                <span className="text-green-400 text-sm">💾 Da cache</span>
              </div>
            )}
            
            {/* 🔄 Pulsante Ricalcola */}
            <button
              onClick={() => {
                const homeTeam = searchParams.get('home');
                const awayTeam = searchParams.get('away');
                const fixtureIdParam = searchParams.get('fixtureId');
                const fixtureId = fixtureIdParam ? parseInt(fixtureIdParam, 10) : undefined;
                if (homeTeam && awayTeam) {
                  analyzeMatch(homeTeam, awayTeam, true, fixtureId); // forceRecalculate = true
                }
              }}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition shadow-lg hover:shadow-blue-500/50"
              title="Ricalcola l'analisi con dati aggiornati"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Ricalcola</span>
            </button>
          </div>
          
          <div className="text-sm text-gray-400">{data.league}</div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Intestazione Partita */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-6 mb-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4">
              <span className="text-blue-400">{data.homeTeam}</span>
              <span className="text-gray-500 mx-3">vs</span>
              <span className="text-red-400">{data.awayTeam}</span>
            </h1>
            <div className="flex items-center justify-center space-x-4">
              <div className="px-4 py-2 bg-blue-600/20 border border-blue-500 rounded-lg">
                <div className="text-xs text-gray-400 mb-1">Affidabilità</div>
                <div className="text-2xl font-bold text-blue-400">
                  {data.confidence ? (data.confidence * 100).toFixed(1) : '0.0'}%
                </div>
              </div>
              <div className="px-4 py-2 bg-purple-600/20 border border-purple-500 rounded-lg">
                <div className="text-xs text-gray-400 mb-1">Goal Attesi</div>
                <div className="text-2xl font-bold text-purple-400">
                  {data.poissonParams ? 
                    (data.poissonParams.lambdaHome + data.poissonParams.lambdaAway).toFixed(1) 
                    : '0.0'}
                </div>
              </div>
            </div>
          </div>
          
          {/* ⚠️ WARNING per bassa confidence */}
          {data.confidence && data.confidence < 0.5 && (
            <div className="mt-4 bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="text-2xl">⚠️</div>
                <div className="flex-1">
                  <div className="font-semibold text-yellow-400 mb-2">
                    Attenzione: Dati Limitati
                  </div>
                  <div className="text-sm text-yellow-200/80 space-y-1">
                    <p>L'affidabilità di questa predizione è <strong>bassa ({(data.confidence * 100).toFixed(0)}%)</strong> perché:</p>
                    <ul className="list-disc ml-4 space-y-1">
                      <li>Dati storici insufficienti per queste squadre</li>
                      <li>Le raccomandazioni potrebbero essere imprecise</li>
                      <li>Consigliamo prudenza su questa partita</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 🎲 SEZIONE QUOTE BOOKMAKER (se disponibili) */}
        {data.realOdds && (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-yellow-600/50 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center">
                <span className="text-2xl mr-2">🎲</span>
                Quote Bookmaker
              </h2>
              <div className="text-xs text-gray-400">
                📊 {data.realOdds.bookmakerCount} bookmaker • Margine: {((data.realOdds.overround - 1) * 100).toFixed(2)}%
              </div>
            </div>

            {/* Tabella Quote 1X2 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-600 rounded-lg p-4">
                <div className="text-center">
                  <div className="text-xs text-gray-400 mb-1">1 (Casa)</div>
                  <div className="text-3xl font-bold text-blue-400 mb-2">
                    {data.realOdds.odds1X2.home.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-300">
                    {(data.realOdds.odds1X2.prob1 * 100).toFixed(1)}% implicito
                  </div>
                  {data.market1X2 && (
                    <div className="mt-2 pt-2 border-t border-blue-700">
                      <div className="text-xs text-gray-400">Modello: {(data.market1X2.final.prob1 * 100).toFixed(1)}%</div>
                      {Math.abs(data.market1X2.final.prob1 - data.realOdds.odds1X2.prob1) > 0.05 && (
                        <div className={`text-xs font-semibold mt-1 ${data.market1X2.final.prob1 > data.realOdds.odds1X2.prob1 ? 'text-green-400' : 'text-red-400'}`}>
                          {data.market1X2.final.prob1 > data.realOdds.odds1X2.prob1 ? '💎 VALUE' : '⚠️ SOPRAVVALUTATO'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gradient-to-br from-gray-900/30 to-gray-800/20 border border-gray-600 rounded-lg p-4">
                <div className="text-center">
                  <div className="text-xs text-gray-400 mb-1">X (Pareggio)</div>
                  <div className="text-3xl font-bold text-gray-400 mb-2">
                    {data.realOdds.odds1X2.draw.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-300">
                    {(data.realOdds.odds1X2.probX * 100).toFixed(1)}% implicito
                  </div>
                  {data.market1X2 && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <div className="text-xs text-gray-400">Modello: {(data.market1X2.final.probX * 100).toFixed(1)}%</div>
                      {Math.abs(data.market1X2.final.probX - data.realOdds.odds1X2.probX) > 0.05 && (
                        <div className={`text-xs font-semibold mt-1 ${data.market1X2.final.probX > data.realOdds.odds1X2.probX ? 'text-green-400' : 'text-red-400'}`}>
                          {data.market1X2.final.probX > data.realOdds.odds1X2.probX ? '💎 VALUE' : '⚠️ SOPRAVVALUTATO'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gradient-to-br from-red-900/30 to-red-800/20 border border-red-600 rounded-lg p-4">
                <div className="text-center">
                  <div className="text-xs text-gray-400 mb-1">2 (Trasferta)</div>
                  <div className="text-3xl font-bold text-red-400 mb-2">
                    {data.realOdds.odds1X2.away.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-300">
                    {(data.realOdds.odds1X2.prob2 * 100).toFixed(1)}% implicito
                  </div>
                  {data.market1X2 && (
                    <div className="mt-2 pt-2 border-t border-red-700">
                      <div className="text-xs text-gray-400">Modello: {(data.market1X2.final.prob2 * 100).toFixed(1)}%</div>
                      {Math.abs(data.market1X2.final.prob2 - data.realOdds.odds1X2.prob2) > 0.05 && (
                        <div className={`text-xs font-semibold mt-1 ${data.market1X2.final.prob2 > data.realOdds.odds1X2.prob2 ? 'text-green-400' : 'text-red-400'}`}>
                          {data.market1X2.final.prob2 > data.realOdds.odds1X2.prob2 ? '💎 VALUE' : '⚠️ SOPRAVVALUTATO'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quote Over/Under e BTTS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Over/Under */}
              {data.realOdds.oddsOverUnder && (
                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                  <div className="text-sm font-semibold text-white mb-3">Over/Under Goal</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Over 2.5</span>
                      <span className="text-green-400 font-bold">{data.realOdds.oddsOverUnder.over25.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Under 2.5</span>
                      <span className="text-blue-400 font-bold">{data.realOdds.oddsOverUnder.under25.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* BTTS */}
              {data.realOdds.oddsBTTS && (
                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                  <div className="text-sm font-semibold text-white mb-3">Goal/No Goal</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Goal (Entrambe)</span>
                      <span className="text-green-400 font-bold">{data.realOdds.oddsBTTS.yes.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">No Goal</span>
                      <span className="text-blue-400 font-bold">{data.realOdds.oddsBTTS.no.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* �🎯 SEZIONE RACCOMANDAZIONI INTELLIGENTI */}
        {topRecommendations.length > 0 && (
          <div className="bg-gradient-to-br from-green-900/20 via-blue-900/20 to-purple-900/20 backdrop-blur-sm rounded-lg border-2 border-green-600/50 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white flex items-center">
                <span className="text-3xl mr-3">💡</span>
                Raccomandazioni Intelligenti
              </h2>
              <div className="px-3 py-1 bg-green-600/30 border border-green-500 rounded-full text-xs text-green-300 font-semibold">
                {topRecommendations.length} GIOCATE CONSIGLIATE
              </div>
            </div>

            {/* Banner informativo se non ci sono quote reali */}
            {!data.realOdds && (
              <div className="bg-orange-900/20 border border-orange-600/50 rounded-lg p-4 mb-4">
                <div className="flex items-start">
                  <span className="text-2xl mr-3">⚠️</span>
                  <div className="flex-1">
                    <h3 className="text-orange-300 font-semibold mb-1">
                      Quote Reali Non Disponibili
                    </h3>
                    <p className="text-sm text-orange-200/80 mb-2">
                      Abbiamo cercato le quote reali da <strong>Sportsmonks</strong>, ma non sono disponibili per questa partita. Le quote mostrate sono <strong>stime del modello</strong>.
                    </p>
                    <div className="bg-orange-800/30 border border-orange-700/50 rounded p-2 text-xs text-orange-100/90">
                      <strong>Perché non vedo le quote reali?</strong>
                      <ul className="list-disc ml-4 mt-1 space-y-1">
                        <li>Sportsmonks non ha bookmaker disponibili per questa partita</li>
                        <li>La partita potrebbe essere troppo vecchia, troppo futura, o non ufficiale</li>
                        <li>Prova con partite dalla lista <strong>"Partite Imminenti"</strong> (prossimi 2-7 giorni, leghe top)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topRecommendations.map((rec, idx) => (
                <div 
                  key={idx}
                  className="bg-gray-900/70 backdrop-blur-sm rounded-lg border border-gray-700 p-4 hover:border-green-500 transition-all hover:shadow-lg hover:shadow-green-500/20"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl">{getBetIcon(rec.type)}</span>
                      <div>
                        <div className="font-bold text-white text-sm">{rec.description}</div>
                        <div className="text-xs text-gray-400">{rec.market}</div>
                      </div>
                    </div>
                    <div className={`px-2 py-1 rounded-full border text-xs font-semibold ${getRiskColor(rec.risk)}`}>
                      {rec.risk}
                    </div>
                  </div>

                  {/* Statistiche */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-gray-800/50 rounded p-2">
                      <div className="text-xs text-gray-400">Probabilità</div>
                      <div className="text-lg font-bold text-green-400">
                        {(rec.probability * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="bg-gray-800/50 rounded p-2">
                      <div className="text-xs text-gray-400">
                        {rec.realOdds ? 'Quota Bookmaker 📊' : 'Quota Modello ⚠️'}
                      </div>
                      <div className="text-lg font-bold flex items-center justify-between">
                        <span className={rec.realOdds ? 'text-green-400' : 'text-orange-400'}>
                          {rec.realOdds ? rec.realOdds.toFixed(2) : rec.odds ? rec.odds.toFixed(2) : 'N/A'}
                        </span>
                        {!rec.realOdds && rec.odds && (
                          <span className="text-xs text-orange-300" title="Quota calcolata dal modello">�</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expected Value (se disponibile) */}
                  {rec.realOdds && rec.expectedValue !== undefined && (
                    <div className="mb-3 p-2 bg-gradient-to-r from-yellow-900/20 to-orange-900/20 border border-yellow-700 rounded">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-yellow-300 font-semibold">Expected Value:</span>
                        <span className={`text-sm font-bold ${rec.expectedValue > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {rec.expectedValue > 0 ? '+' : ''}{(rec.expectedValue * 100).toFixed(1)}%
                        </span>
                      </div>
                      {rec.expectedValue > 0.05 && (
                        <div className="text-xs text-green-300 mt-1 flex items-center">
                          <span className="mr-1">💎</span>
                          <span>VALUE BET!</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Value Rating */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400">Value Rating</span>
                      <span className="text-purple-400 font-bold">{rec.valueRating.toFixed(0)}/100</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all"
                        style={{ width: `${rec.valueRating}%` }}
                      />
                    </div>
                  </div>

                  {/* Combo items */}
                  {rec.combo && rec.combo.length > 0 && (
                    <div className="mb-3 p-2 bg-blue-900/20 border border-blue-700 rounded">
                      <div className="text-xs text-blue-300 font-semibold mb-1">Combo:</div>
                      <div className="space-y-1">
                        {rec.combo.map((item, i) => (
                          <div key={i} className="text-xs text-blue-200 flex items-center">
                            <span className="mr-1">•</span> {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reasoning */}
                  <div className="text-xs text-gray-400 leading-relaxed border-t border-gray-700 pt-3">
                    {rec.reasoning}
                  </div>

                  {/* Strength indicator */}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                      Forza: <span className={`font-semibold ${
                        rec.strength === 'STRONG' ? 'text-green-400' :
                        rec.strength === 'MEDIUM' ? 'text-yellow-400' :
                        rec.strength === 'WEAK' ? 'text-orange-400' : 'text-gray-400'
                      }`}>{rec.strength}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Conf: <span className="font-semibold text-blue-400">{(rec.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Legenda */}
            <div className="mt-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
              <div className="text-xs text-gray-400 space-y-2">
                <div className="font-semibold text-white mb-2">📌 Come leggere le quote:</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="flex items-start">
                    <span className="text-green-400 mr-2">📊</span>
                    <span><strong className="text-green-400">Quota Bookmaker:</strong> Quote reali medie da 10-20 bookmaker</span>
                  </div>
                  <div className="flex items-start">
                    <span className="text-orange-400 mr-2">🔮</span>
                    <span><strong className="text-orange-400">Quota Modello:</strong> Stima teorica (1/probabilità)</span>
                  </div>
                  <div className="flex items-start">
                    <span className="text-green-400 mr-2">💎</span>
                    <span><strong className="text-green-400">VALUE BET:</strong> Expected Value positivo (modello vede più valore del mercato)</span>
                  </div>
                  <div className="flex items-start">
                    <span className="text-blue-400 mr-2">⚖️</span>
                    <span><strong className="text-blue-400">Value Rating:</strong> Punteggio basato su probabilità × confidenza × forza</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sezione Legenda Vecchia (rimuoviamo perché duplicata) */}
        {/* Grid Compatto */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* 1X2 */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4">
            <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center">
              <span className="mr-2">🎯</span> Risultato Finale (1X2)
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">1 (Casa)</span>
                <div className="flex items-center space-x-2">
                  <div className="w-32 bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-full"
                      style={{ width: `${((data.market1X2?.final?.prob1 || 0) * 100).toFixed(1)}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-bold text-blue-400 w-12 text-right">
                    {((data.market1X2?.final?.prob1 || 0) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">X (Pareggio)</span>
                <div className="flex items-center space-x-2">
                  <div className="w-32 bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-gray-500 to-gray-600 h-full"
                      style={{ width: `${((data.market1X2?.final?.probX || 0) * 100).toFixed(1)}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-bold text-gray-400 w-12 text-right">
                    {((data.market1X2?.final?.probX || 0) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">2 (Trasferta)</span>
                <div className="flex items-center space-x-2">
                  <div className="w-32 bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-red-500 to-red-600 h-full"
                      style={{ width: `${((data.market1X2?.final?.prob2 || 0) * 100).toFixed(1)}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-bold text-red-400 w-12 text-right">
                    {((data.market1X2?.final?.prob2 || 0) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Expected Goals */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4">
            <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center">
              <span className="mr-2">⚽</span> Expected Goals (xG)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-xs text-gray-400 mb-2">Casa</div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-blue-400">
                    {data.poissonParams?.lambdaHome?.toFixed(2) || '0.00'}
                  </div>
                  {data.teamStats && (
                    <div className="text-xs text-gray-500">
                      xG: {data.teamStats.home?.xg?.toFixed(2) || '0.00'} | xGA: {data.teamStats.home?.xga?.toFixed(2) || '0.00'}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-400 mb-2">Trasferta</div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-red-400">
                    {data.poissonParams?.lambdaAway?.toFixed(2) || '0.00'}
                  </div>
                  {data.teamStats && (
                    <div className="text-xs text-gray-500">
                      xG: {data.teamStats.away?.xg?.toFixed(2) || '0.00'} | xGA: {data.teamStats.away?.xga?.toFixed(2) || '0.00'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Over/Under Compatto */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4 mb-6">
          <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center">
            <span className="mr-2">📊</span> Over/Under
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {['0.5', '1.5', '2.5', '3.5', '4.5'].map((threshold) => {
              const overData = data.marketUnderOver?.[threshold as keyof typeof data.marketUnderOver];
              const over = overData?.final?.over || 0.5;
              const under = overData?.final?.under || 0.5;
              
              return (
                <div key={threshold} className="bg-gray-900/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400 mb-2">O/U {threshold}</div>
                  <div className="text-lg font-bold text-green-400">
                    {(over * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Over</div>
                  <div className="text-sm font-bold text-red-400 mt-2">
                    {(under * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">Under</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* BTTS */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4 mb-6">
          <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center">
            <span className="mr-2">🥅</span> Entrambe Segnano (BTTS)
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-center">
              <div className="text-xs text-gray-400 mb-2">Goal</div>
              <div className="text-3xl font-bold text-green-400">
                {((data.marketBTTS?.final?.yes || 0.5) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-center">
              <div className="text-xs text-gray-400 mb-2">No Goal</div>
              <div className="text-3xl font-bold text-red-400">
                {((data.marketBTTS?.final?.no || 0.5) * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* Form Momentum */}
        {data.formMomentum && (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4 mb-6">
            <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center">
              <span className="mr-2">📈</span> Forma Recente
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className={`bg-gradient-to-br ${getFormColor(data.formMomentum.home.formLabel)} rounded-lg p-4`}>
                <div className="text-xs text-white/70 mb-2">{data.homeTeam}</div>
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-2xl">{getFormEmoji(data.formMomentum.home.formLabel)}</span>
                  <span className="text-lg font-bold text-white">{data.formMomentum.home.formLabel}</span>
                </div>
                <div className="text-sm text-white/80">
                  Score: {(data.formMomentum.home.formScore * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-white/60 mt-2">
                  {data.formMomentum.home.recentResults}
                </div>
              </div>
              <div className={`bg-gradient-to-br ${getFormColor(data.formMomentum.away.formLabel)} rounded-lg p-4`}>
                <div className="text-xs text-white/70 mb-2">{data.awayTeam}</div>
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-2xl">{getFormEmoji(data.formMomentum.away.formLabel)}</span>
                  <span className="text-lg font-bold text-white">{data.formMomentum.away.formLabel}</span>
                </div>
                <div className="text-sm text-white/80">
                  Score: {(data.formMomentum.away.formScore * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-white/60 mt-2">
                  {data.formMomentum.away.recentResults}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Risultati Probabili */}
        {data.mostProbableScores && data.mostProbableScores.length > 0 && (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4">
            <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center">
              <span className="mr-2">🎲</span> Risultati Più Probabili
            </h3>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {data.mostProbableScores.slice(0, 10).map((score, idx) => (
                <div
                  key={idx}
                  className="bg-gray-900/50 rounded-lg p-3 text-center border border-gray-700"
                >
                  <div className="text-lg font-bold text-white mb-1">
                    {score.homeGoals} - {score.awayGoals}
                  </div>
                  <div className="text-xs text-gray-400">
                    {(score.probability * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* H2H */}
        {data.h2hAnalysis && data.h2hAnalysis.totalMatches > 0 && (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4 mt-6">
            <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center">
              <span className="mr-2">🤝</span> Scontri Diretti
            </h3>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-400">{data.h2hAnalysis.homeWins}</div>
                <div className="text-xs text-gray-400">Vittorie Casa</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-400">{data.h2hAnalysis.draws}</div>
                <div className="text-xs text-gray-400">Pareggi</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-400">{data.h2hAnalysis.awayWins}</div>
                <div className="text-xs text-gray-400">Vittorie Trasferta</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-400">{data.h2hAnalysis.totalMatches}</div>
                <div className="text-xs text-gray-400">Totale</div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
