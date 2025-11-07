'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProfessionalPredictionCard from '@/components/ProfessionalPredictionCard';
import MarketCalibrationCard from '@/components/MarketCalibrationCard';
import InjuriesCard from '@/components/InjuriesCard';
import AnalysisLoadingModal from '@/components/AnalysisLoadingModal';
import { useState, useEffect } from 'react';
import type { MatchPrediction, MarketCalibration, InjuriesAnalysis } from '@/types';
import { ENV } from '@/config/env';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

interface TodayMatch {
  id: number;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  competitionCode: string;
  time: string;
  status: string;
}

interface ExtendedMatchPrediction extends MatchPrediction {
  teamStats?: {
    home: { xg: number; xga: number };
    away: { xg: number; xga: number };
  };
  mostProbableScores?: Array<{
    homeGoals: number;
    awayGoals: number;
    probability: number;
  }>;
  formMomentum?: {
    home: {
      formScore: number;
      formFactor: number;
      formLabel: string;
      recentResults: string;
    };
    away: {
      formScore: number;
      formFactor: number;
      formLabel: string;
      recentResults: string;
    };
  };
  h2hAnalysis?: {
    totalMatches: number;
    homeWins: number;
    awayWins: number;
    draws: number;
    homeWinRate: number;
    awayWinRate: number;
    avgGoalsHome: number;
    avgGoalsAway: number;
    dominance: 'HOME' | 'AWAY' | 'BALANCED';
    dominanceLevel: number;
    h2hFactor: {
      home: number;
      away: number;
    };
    recentResults: string;
  };
  marketCalibration?: MarketCalibration;
  injuriesAnalysis?: InjuriesAnalysis;
}

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <MainApp />
    </QueryClientProvider>
  );
}

function MainApp() {
  const [todayMatches, setTodayMatches] = useState<TodayMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [prediction, setPrediction] = useState<ExtendedMatchPrediction | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingTeams, setAnalyzingTeams] = useState<{ home: string; away: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // NUOVI STATI per filtri
  const [selectedDate, setSelectedDate] = useState<string>('today');
  const [selectedLeague, setSelectedLeague] = useState<string>('all');

  // Genera date per i prossimi 3 giorni
  const getDateOptions = () => {
    const dates = [];
    const today = new Date();
    
    for (let i = 0; i < 4; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const label = i === 0 ? 'Oggi' : i === 1 ? 'Domani' : date.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
      dates.push({ value: i === 0 ? 'today' : dateStr, label });
    }
    return dates;
  };

  // Carica partite di oggi all'avvio
  useEffect(() => {
    loadMatches();
  }, [selectedDate]);

  const loadMatches = async () => {
    setLoadingMatches(true);
    setError(null);
    
    try {
      const endpoint = selectedDate === 'today' 
        ? `${ENV.API_URL}/api/fixtures/today`
        : `${ENV.API_URL}/api/fixtures/date/${selectedDate}`;
      
      const response = await fetch(endpoint);
      const data = await response.json();
      
      if (data.success) {
        setTodayMatches(data.matches);
        setSuccess(`✅ Trovate ${data.count} partite`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError('Nessuna partita trovata');
      }
    } catch (err) {
      setError('Errore caricamento partite');
      console.error(err);
    } finally {
      setLoadingMatches(false);
    }
  };  const analyzeMatch = async (homeTeam: string, awayTeam: string, competition: string) => {
    try {
      setAnalyzing(true);
      setAnalyzingTeams({ home: homeTeam, away: awayTeam });
      setError(null);
      setPrediction(null);

      const response = await fetch(`${ENV.API_URL}/api/predictions/calculate-by-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeamName: homeTeam,
          awayTeamName: awayTeam,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Log per debug
        console.log('🔍 Dati ricevuti dal backend:', data);
        console.log('🥅 BTTS data:', data.marketBTTS);
        console.log('🎲 Most Probable Scores:', data.mostProbableScores);
        console.log('📊 Market Calibration:', data.marketCalibration);
        
        const mappedPrediction: ExtendedMatchPrediction = {
          id: Date.now().toString(),
          homeTeam,
          awayTeam,
          league: competition,
          date: new Date().toLocaleString('it-IT'),
          predictions: {
            homeGoals: data.poissonParams?.lambdaHome || 1.5,
            awayGoals: data.poissonParams?.lambdaAway || 1.2,
            totalGoals: (data.poissonParams?.lambdaHome || 1.5) + (data.poissonParams?.lambdaAway || 1.2),
            prob1: (data.market1X2?.final?.prob1 || 0.5) * 100,
            probX: (data.market1X2?.final?.probX || 0.25) * 100,
            prob2: (data.market1X2?.final?.prob2 || 0.25) * 100,
          },
          overUnder: {
            over05: (data.marketUnderOver?.['0.5']?.final?.over || 0.5) * 100,
            under05: (data.marketUnderOver?.['0.5']?.final?.under || 0.5) * 100,
            over15: (data.marketUnderOver?.['1.5']?.final?.over || 0.5) * 100,
            under15: (data.marketUnderOver?.['1.5']?.final?.under || 0.5) * 100,
            over25: (data.marketUnderOver?.['2.5']?.final?.over || 0.5) * 100,
            under25: (data.marketUnderOver?.['2.5']?.final?.under || 0.5) * 100,
            over35: (data.marketUnderOver?.['3.5']?.final?.over || 0.5) * 100,
            under35: (data.marketUnderOver?.['3.5']?.final?.under || 0.5) * 100,
            over45: (data.marketUnderOver?.['4.5']?.final?.over || 0.5) * 100,
            under45: (data.marketUnderOver?.['4.5']?.final?.under || 0.5) * 100,
          },
          btts: {
            yes: (data.marketBTTS?.final?.yes || 0.5) * 100,
            no: (data.marketBTTS?.final?.no || 0.5) * 100,
          },
          confidence: (data.confidence || 0.7) * 100,
          strength: data.market1X2?.strength || 'MEDIO',
          valueBets: [],
          teamStats: data.teamStats,
          mostProbableScores: data.mostProbableScores,
          formMomentum: data.formMomentum,
          h2hAnalysis: data.h2hAnalysis,
          marketCalibration: data.marketCalibration,
          injuriesAnalysis: data.injuriesAnalysis,
        };
        
        setPrediction(mappedPrediction);
        // Scroll to results
        setTimeout(() => {
          document.getElementById('prediction-results')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else {
        const errorData = await response.json();
        
        // Messaggio personalizzato per dati insufficienti
        if (errorData.error && errorData.error.includes('Dati insufficienti')) {
          setError(`⚠️ ${errorData.error}\n\nQuesta partita non può essere analizzata perché una o entrambe le squadre non hanno giocato abbastanza partite nella stagione corrente.`);
        } else {
          setError(errorData.error || 'Errore nel calcolo della predizione');
        }
      }
      
    } catch (err) {
      console.error('Analysis error:', err);
      setError('Errore nella connessione al server');
    } finally {
      setAnalyzing(false);
      setAnalyzingTeams(null);
    }
  };

    const getCompetitionEmoji = (code: string) => {
    const emojiMap: Record<string, string> = {
      '2': '🏆', // Champions League
      '3': '🥈', // Europa League
      '39': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', // Premier League
      '140': '🇪🇸', // La Liga
      '135': '🇮🇹', // Serie A
      '78': '🇩🇪', // Bundesliga
      '61': '🇫🇷', // Ligue 1
    };
    return emojiMap[code] || '⚽';
  };

  const getCompetitionColor = (code: string) => {
    const colorMap: Record<string, string> = {
      '2': 'from-blue-600 to-indigo-600', // Champions League
      '3': 'from-orange-500 to-amber-500', // Europa League
      '39': 'from-purple-600 to-pink-600', // Premier League
      '140': 'from-red-600 to-rose-600', // La Liga
      '135': 'from-sky-600 to-blue-600', // Serie A
      '78': 'from-gray-700 to-gray-900', // Bundesliga
      '61': 'from-blue-500 to-cyan-500', // Ligue 1
    };
    return colorMap[code] || 'from-gray-600 to-gray-800';
  };

  // Raggruppa partite per competizione
  const groupedMatches = todayMatches.reduce((acc, match) => {
    const comp = match.competition;
    if (!acc[comp]) acc[comp] = [];
    acc[comp].push(match);
    return acc;
  }, {} as Record<string, TodayMatch[]>);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -inset-10 opacity-50">
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-3/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse animation-delay-300"></div>
          <div className="absolute bottom-1/4 left-1/2 w-80 h-80 bg-emerald-500/20 rounded-full blur-3xl animate-pulse animation-delay-600"></div>
        </div>
      </div>

      <header className="relative z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-transparent backdrop-blur-xl"></div>
        <div className="relative">
          <div className="border-b border-white/10 bg-black/20 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-6 py-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-6 text-white/70">
                  <span className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span>LIVE Data</span>
                  </span>
                  <span>Football-Data.org</span>
                  <span>Enhanced AI Engine</span>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-6 py-20">
            <div className="text-center mb-16">
              {/* Animated Logo */}
              <div className="flex justify-center mb-10">
                <div className="relative group">
                  <div className="absolute -inset-6 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 rounded-full blur-2xl opacity-40 group-hover:opacity-60 animate-pulse transition-opacity"></div>
                  <div className="relative w-32 h-32 bg-gradient-to-br from-blue-600 via-purple-600 to-emerald-600 rounded-full flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                    <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Main Title */}
              <h1 className="text-6xl md:text-7xl lg:text-8xl font-black mb-6 animate-fade-in">
                <span className="gradient-text drop-shadow-2xl">
                  CALCIO-PRED
                </span>
              </h1>
              
              {/* Subtitle */}
              <div className="text-2xl md:text-3xl font-bold mb-8 animate-fade-in animation-delay-150">
                <span className="bg-gradient-to-r from-white via-gray-200 to-gray-300 bg-clip-text text-transparent">
                  AI-Powered Football Prediction Engine
                </span>
              </div>

              {/* Description */}
              <p className="text-lg md:text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed mb-8 animate-fade-in animation-delay-300">
                 Analizza le partite con intelligenza artificiale avanzata
                <br />
                <span className="text-blue-400 font-semibold">xG, Over/Under, BTTS</span> e molto altro
              </p>

              {/* Features Pills */}
              <div className="flex flex-wrap justify-center gap-3 animate-fade-in animation-delay-600">
                <span className="px-4 py-2 bg-blue-500/20 border border-blue-500/50 rounded-full text-blue-300 text-sm font-semibold">
                   Previsioni AI
                </span>
                <span className="px-4 py-2 bg-purple-500/20 border border-purple-500/50 rounded-full text-purple-300 text-sm font-semibold">
                  ⚽ Expected Goals
                </span>
                <span className="px-4 py-2 bg-emerald-500/20 border border-emerald-500/50 rounded-full text-emerald-300 text-sm font-semibold">
                   Value Betting
                </span>
                <span className="px-4 py-2 bg-yellow-500/20 border border-yellow-500/50 rounded-full text-yellow-300 text-sm font-semibold">
                  📊 Statistiche Live
                </span>
              </div>
```
            </div>
          </div>
        </div>
      </header>
      
      <main className="relative z-10 max-w-7xl mx-auto px-6 pb-20">
        {/* Partite di oggi */}
        <div className="mb-16">
          <div className="relative">
            <div className="absolute -inset-2 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-emerald-500/20 rounded-3xl blur-xl"></div>
            
            <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-4xl font-black text-white">
                   Partite di Oggi
                </h2>
                <button
                  onClick={loadTodayMatches}
                  disabled={loadingMatches}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-white transition-all disabled:opacity-50"
                >
                  {loadingMatches ? ' Caricamento...' : ' Aggiorna'}
                </button>
              </div>

              {success && (
                <div className="mb-6 bg-green-500/20 border-2 border-green-500/50 rounded-2xl px-6 py-4 text-green-200 text-center font-medium">
                  {success}
                </div>
              )}

              {error && (
                <div className="mb-6 bg-red-500/20 border-2 border-red-500/50 rounded-2xl px-6 py-4 text-red-200 text-center font-medium">
                   {error}
                </div>
              )}

              {loadingMatches ? (
                <div className="text-center py-12">
                  <div className="inline-block w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                  <p className="text-white mt-4">Caricamento partite...</p>
                </div>
              ) : todayMatches.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-2xl text-gray-400">Nessuna partita trovata per oggi</p>
                  <p className="text-gray-500 mt-2">Prova a ricaricare o torna domani</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {Object.entries(groupedMatches).map(([competition, matches]) => {
                    const firstMatch = matches[0];
                    const competitionColor = getCompetitionColor(firstMatch.competitionCode);
                    const competitionEmoji = getCompetitionEmoji(firstMatch.competitionCode);
                    
                    return (
                      <div key={competition} className="space-y-4">
                        {/* Competition Header */}
                        <div className={`bg-gradient-to-r ${competitionColor} rounded-2xl p-4 shadow-lg`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <span className="text-3xl">{competitionEmoji}</span>
                              <h3 className="text-2xl font-black text-white">{competition}</h3>
                            </div>
                            <span className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-xl text-white font-bold">
                              {matches.length} {matches.length === 1 ? 'partita' : 'partite'}
                            </span>
                          </div>
                        </div>

                        {/* Matches Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {matches.map((match) => (
                            <div
                              key={match.id}
                              className="glass-card p-6 hover:bg-white/15 hover:border-white/30 transition-all duration-300 group"
                            >
                              {/* Time Badge */}
                              <div className="flex justify-between items-center mb-4">
                                <span className={`bg-gradient-to-r ${competitionColor} px-4 py-2 rounded-xl text-sm font-bold text-white shadow-lg`}>
                                  ⏰ {match.time}
                                </span>
                                <span className="text-gray-400 text-sm">{competitionEmoji}</span>
                              </div>
                              
                              {/* Teams Container */}
                              <div className="space-y-4 mb-6">
                                {/* Home Team */}
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                                  <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-black text-lg shadow-lg">
                                      H
                                    </div>
                                    <div className="flex-1">
                                      <p className="text-xs text-blue-300 uppercase tracking-wider mb-1">Casa</p>
                                      <p className="text-xl font-black text-white">
                                        {match.homeTeam}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* VS Divider */}
                                <div className="flex items-center justify-center">
                                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                                  <span className="px-4 text-white font-bold text-lg">VS</span>
                                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                                </div>
                                
                                {/* Away Team */}
                                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                                  <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white font-black text-lg shadow-lg">
                                      A
                                    </div>
                                    <div className="flex-1">
                                      <p className="text-xs text-red-300 uppercase tracking-wider mb-1">Trasferta</p>
                                      <p className="text-xl font-black text-white">
                                        {match.awayTeam}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Analyze Button */}
                              <button
                                onClick={() => analyzeMatch(match.homeTeam, match.awayTeam, match.competition)}
                                disabled={analyzing}
                                className={`w-full py-4 bg-gradient-to-r ${competitionColor} rounded-xl font-bold text-white text-lg hover:scale-[1.02] hover:shadow-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group-hover:shadow-lg`}
                              >
                                {analyzing ? (
                                  <span className="flex items-center justify-center space-x-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                    </svg>
                                    <span>Analisi in corso...</span>
                                  </span>
                                ) : (
                                  '🔍 Analizza Partita'
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal di caricamento analisi */}
        <AnalysisLoadingModal 
          isOpen={analyzing} 
          homeTeam={analyzingTeams?.home || ''} 
          awayTeam={analyzingTeams?.away || ''} 
        />

        {!analyzing && prediction && (
          <div id="prediction-results" className="relative mb-16">
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-emerald-500/20 rounded-3xl blur-2xl"></div>
            
            <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-black text-white mb-4">
                   {prediction.league}
                </h2>
                <p className="text-2xl text-gray-300 font-bold">
                  {prediction.homeTeam} vs {prediction.awayTeam}
                </p>
                <div className="flex items-center justify-center space-x-2 mt-4">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-green-400 font-bold text-sm">ANALYSIS COMPLETE</span>
                </div>
              </div>
              
              {/* Market Calibration Card */}
              {prediction.marketCalibration && (
                <MarketCalibrationCard calibration={prediction.marketCalibration} />
              )}

              {/* Injuries & Suspensions Card */}
              {prediction.injuriesAnalysis && (
                <InjuriesCard analysis={prediction.injuriesAnalysis} />
              )}
              
              <ProfessionalPredictionCard predictions={[prediction]} />
            </div>
          </div>
        )}
      </main>
        
      <footer className="relative z-10 bg-black/40 backdrop-blur-xl border-t border-white/10 mt-20">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="text-center">
            <div className="text-xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
              CALCIO-PRED
            </div>
            <div className="text-sm text-gray-400 mt-2"> 2025 AI Enhanced  Real-Time Predictions</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
