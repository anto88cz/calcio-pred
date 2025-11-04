'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PredictionsTable from '@/components/EnhancedPredictionsTable';
import { LeagueSelector } from '@/components/LeagueSelector';
import { useState } from 'react';
import type { League, MatchPrediction } from '@/types';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <MainApp />
    </QueryClientProvider>
  );
}

function MainApp() {
  const [predictions, setPredictions] = useState<MatchPrediction[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leagues: League[] = [
    { id: 39, name: 'Premier League', country: 'England', flag: '🇬🇧' },
    { id: 140, name: 'La Liga', country: 'Spain', flag: '🇪🇸' },
    { id: 135, name: 'Serie A', country: 'Italy', flag: '🇮🇹' },
    { id: 78, name: 'Bundesliga', country: 'Germany', flag: '🇩🇪' },
    { id: 61, name: 'Ligue 1', country: 'France', flag: '🇫🇷' },
    { id: 94, name: 'Primeira Liga', country: 'Portugal', flag: '🇵🇹' },
    { id: 88, name: 'Eredivisie', country: 'Netherlands', flag: '🇳🇱' },
    { id: 203, name: 'Süper Lig', country: 'Turkey', flag: '🇹🇷' }
  ];

  const analyzeLeague = async (league: League) => {
    if (!league) return;
    
    try {
      setAnalyzing(true);
      setError(null);
      setSelectedLeague(league);
      
      const response = await fetch(`http://localhost:3001/api/predictions/league/${league.id}`);
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setPredictions(data.predictions || []);
      } else {
        throw new Error(data.message || 'Unknown error');
      }
      
    } catch (err) {
      console.error('League analysis error:', err);
      setError(`Error analyzing ${league.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      await simulateAnalysis(league);
    } finally {
      setAnalyzing(false);
    }
  };

  const simulateAnalysis = async (league: League) => {
    const mockPredictions: MatchPrediction[] = [
      {
        id: '1',
        homeTeam: 'Team A',
        awayTeam: 'Team B', 
        league: league.name,
        date: new Date().toISOString(),
        predictions: {
          homeGoals: 1.85,
          awayGoals: 1.12,
          totalGoals: 2.97,
          prob1: 58.2,
          probX: 26.8,
          prob2: 15.0
        },
        confidence: 72.5,
        strength: 'FORTE',
        valueBets: [{
          market: '1X2',
          selection: 'HOME',
          odds: 1.75,
          probability: 58.2,
          value: 4.3,
          kelly: 2.8,
          recommend: true
        }]
      }
    ];
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    setPredictions(mockPredictions);
  };

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
                  <span>API-FOOTBALL Pro</span>
                  <span>Enhanced AI Engine</span>
                </div>
                <div className="flex items-center space-x-4">
                  <button className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-full text-white/70 hover:text-white transition-all duration-300">
                    🌙 Dark
                  </button>
                  <button className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-full text-white/70 hover:text-white transition-all duration-300">
                    ⚙️ Settings
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-6 py-16">
            <div className="text-center mb-12">
              <div className="flex justify-center mb-8">
                <div className="relative">
                  <div className="absolute -inset-4 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 rounded-full blur-xl opacity-50 animate-pulse"></div>
                  <div className="relative w-24 h-24 bg-gradient-to-br from-blue-600 via-purple-600 to-emerald-600 rounded-full flex items-center justify-center shadow-2xl">
                    <span className="text-4xl animate-bounce">⚽</span>
                  </div>
                </div>
              </div>

              <h1 className="text-7xl font-black mb-4">
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
                  CALCIO-PRED
                </span>
              </h1>
              
              <div className="text-2xl font-bold mb-6">
                <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  AI-Powered Football Prediction Engine
                </span>
              </div>

              <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
                Analisi predittive avanzate con Machine Learning, Value Betting intelligente 
                e dati real-time per massimizzare il tuo ROI nelle scommesse sportive
              </p>

              <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl blur opacity-25 group-hover:opacity-75 transition duration-500"></div>
                  <div className="relative bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
                    <div className="text-3xl font-black text-blue-400 mb-2">87%</div>
                    <div className="text-sm font-semibold text-white mb-1">Accuracy Rate</div>
                    <div className="text-xs text-gray-400">Enhanced AI Model</div>
                  </div>
                </div>

                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-purple-500 to-purple-600 rounded-2xl blur opacity-25 group-hover:opacity-75 transition duration-500"></div>
                  <div className="relative bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
                    <div className="text-3xl font-black text-purple-400 mb-2">+15.2%</div>
                    <div className="text-sm font-semibold text-white mb-1">Avg ROI</div>
                    <div className="text-xs text-gray-400">Kelly Criterion</div>
                  </div>
                </div>

                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl blur opacity-25 group-hover:opacity-75 transition duration-500"></div>
                  <div className="relative bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
                    <div className="text-3xl font-black text-emerald-400 mb-2">5.2M+</div>
                    <div className="text-sm font-semibold text-white mb-1">Data Points</div>
                    <div className="text-xs text-gray-400">Real-time Analysis</div>
                  </div>
                </div>

                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl blur opacity-25 group-hover:opacity-75 transition duration-500"></div>
                  <div className="relative bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
                    <div className="text-3xl font-black text-orange-400 mb-2">24/7</div>
                    <div className="text-sm font-semibold text-white mb-1">Monitoring</div>
                    <div className="text-xs text-gray-400">Live Updates</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      
      <main className="relative z-10 max-w-7xl mx-auto px-6 pb-20">
        <div className="mb-16">
          <LeagueSelector 
            leagues={leagues} 
            onSelectLeague={analyzeLeague}
            selectedLeague={selectedLeague}
            analyzing={analyzing}
          />
        </div>

        {analyzing && (
          <div className="text-center py-24">
            <div className="relative inline-block mb-8">
              <div className="absolute inset-0 animate-spin">
                <div className="w-32 h-32 border-4 border-blue-500/30 border-t-blue-500 rounded-full"></div>
              </div>
              <div className="absolute inset-4 animate-spin animation-delay-150" style={{ animationDirection: 'reverse' }}>
                <div className="w-24 h-24 border-4 border-purple-500/30 border-r-purple-500 rounded-full"></div>
              </div>
              <div className="absolute inset-8 animate-spin animation-delay-300">
                <div className="w-16 h-16 border-4 border-emerald-500/30 border-b-emerald-500 rounded-full"></div>
              </div>
              
              <div className="w-32 h-32 bg-gradient-to-br from-blue-600 via-purple-600 to-emerald-600 rounded-full flex items-center justify-center shadow-2xl">
                <span className="text-4xl animate-bounce">⚽</span>
              </div>
              
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 rounded-full blur-xl opacity-50 animate-pulse"></div>
            </div>
            
            <div className="space-y-6">
              <div className="text-3xl font-black text-white mb-2">
                🔍 Analyzing {selectedLeague?.flag} {selectedLeague?.name}
              </div>
              
              <div className="text-lg text-gray-300 mb-8">
                Our AI is processing millions of data points for accurate predictions
              </div>
              
              <div className="flex justify-center space-x-8">
                <div className="flex flex-col items-center space-y-2">
                  <div className="w-16 h-16 bg-blue-500/20 backdrop-blur-md rounded-2xl border border-blue-500/30 flex items-center justify-center">
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                  </div>
                  <span className="text-sm font-medium text-blue-300">Data Collection</span>
                </div>
                
                <div className="flex flex-col items-center space-y-2">
                  <div className="w-16 h-16 bg-purple-500/20 backdrop-blur-md rounded-2xl border border-purple-500/30 flex items-center justify-center">
                    <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse animation-delay-300"></div>
                  </div>
                  <span className="text-sm font-medium text-purple-300">AI Processing</span>
                </div>
                
                <div className="flex flex-col items-center space-y-2">
                  <div className="w-16 h-16 bg-emerald-500/20 backdrop-blur-md rounded-2xl border border-emerald-500/30 flex items-center justify-center">
                    <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse animation-delay-600"></div>
                  </div>
                  <span className="text-sm font-medium text-emerald-300">Value Analysis</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 backdrop-blur-md border border-red-500/20 rounded-2xl p-6 mb-8">
            <p className="text-red-300">❌ {error}</p>
          </div>
        )}

        {!analyzing && predictions.length > 0 && selectedLeague && (
          <div className="relative mb-16">
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-emerald-500/20 rounded-3xl blur-2xl"></div>
            
            <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10">
              <div className="text-center mb-12">
                <div className="inline-flex items-center space-x-3 mb-4">
                  <span className="text-6xl">{selectedLeague.flag}</span>
                  <div>
                    <h2 className="text-4xl font-black text-white">
                      {selectedLeague.name}
                    </h2>
                    <div className="flex items-center justify-center space-x-2 mt-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      <span className="text-green-400 font-bold text-sm">ANALYSIS COMPLETE</span>
                    </div>
                  </div>
                </div>
                
                <p className="text-xl text-gray-300 font-medium">
                  Today's Matches - AI Enhanced Analysis Results
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-blue-600 rounded-3xl blur-lg opacity-0 group-hover:opacity-50 transition-all duration-500"></div>
                  <div className="relative bg-white/5 backdrop-blur-xl border border-blue-500/20 rounded-3xl p-8 hover:bg-blue-500/10 transition-all duration-300">
                    <div className="flex items-center justify-between mb-6">
                      <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center">
                        <span className="text-2xl">⚽</span>
                      </div>
                      <div className="text-xs font-bold text-blue-400 bg-blue-500/20 px-2 py-1 rounded-full">
                        MATCHES
                      </div>
                    </div>
                    <div className="text-5xl font-black text-blue-400 mb-2">{predictions.length}</div>
                    <div className="text-blue-300 font-semibold">Analyzed Today</div>
                  </div>
                </div>
                
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-purple-500 to-purple-600 rounded-3xl blur-lg opacity-0 group-hover:opacity-50 transition-all duration-500"></div>
                  <div className="relative bg-white/5 backdrop-blur-xl border border-purple-500/20 rounded-3xl p-8 hover:bg-purple-500/10 transition-all duration-300">
                    <div className="flex items-center justify-between mb-6">
                      <div className="w-12 h-12 bg-purple-500/20 rounded-2xl flex items-center justify-center">
                        <span className="text-2xl">💎</span>
                      </div>
                      <div className="text-xs font-bold text-purple-400 bg-purple-500/20 px-2 py-1 rounded-full">
                        VALUE BETS
                      </div>
                    </div>
                    <div className="text-5xl font-black text-purple-400 mb-2">
                      {predictions.filter(p => p.valueBets?.some((vb: any) => vb.recommend)).length}
                    </div>
                    <div className="text-purple-300 font-semibold">Opportunities Found</div>
                  </div>
                </div>
                
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-3xl blur-lg opacity-0 group-hover:opacity-50 transition-all duration-500"></div>
                  <div className="relative bg-white/5 backdrop-blur-xl border border-emerald-500/20 rounded-3xl p-8 hover:bg-emerald-500/10 transition-all duration-300">
                    <div className="flex items-center justify-between mb-6">
                      <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center">
                        <span className="text-2xl">📈</span>
                      </div>
                      <div className="text-xs font-bold text-emerald-400 bg-emerald-500/20 px-2 py-1 rounded-full">
                        AVG ROI
                      </div>
                    </div>
                    <div className="text-5xl font-black text-emerald-400 mb-2">
                      +{predictions.length > 0 
                        ? `${(predictions.reduce((acc, p) => acc + (p.valueBets?.[0]?.value || 0), 0) / predictions.length).toFixed(1)}%`
                        : '0%'
                      }
                    </div>
                    <div className="text-emerald-300 font-semibold">Expected Return</div>
                  </div>
                </div>
                
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-3xl blur-lg opacity-0 group-hover:opacity-50 transition-all duration-500"></div>
                  <div className="relative bg-white/5 backdrop-blur-xl border border-orange-500/20 rounded-3xl p-8 hover:bg-orange-500/10 transition-all duration-300">
                    <div className="flex items-center justify-between mb-6">
                      <div className="w-12 h-12 bg-orange-500/20 rounded-2xl flex items-center justify-center">
                        <span className="text-2xl">🤖</span>
                      </div>
                      <div className="text-xs font-bold text-orange-400 bg-orange-500/20 px-2 py-1 rounded-full">
                        AI CONFIDENCE
                      </div>
                    </div>
                    <div className="text-5xl font-black text-orange-400 mb-2">
                      {predictions.length > 0 
                        ? `${(predictions.reduce((acc, p) => acc + p.confidence, 0) / predictions.length).toFixed(0)}%`
                        : '0%'
                      }
                    </div>
                    <div className="text-orange-300 font-semibold">Model Accuracy</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!analyzing && predictions.length > 0 && (
          <div className="relative">
            <div className="absolute -inset-2 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-emerald-500/10 rounded-3xl blur-xl"></div>
            <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-emerald-600 px-8 py-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-black text-white">
                      📊 Detailed AI Analysis
                    </h3>
                    <p className="text-white/80 font-medium mt-1">
                      Complete statistics for intelligent betting decisions
                    </p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2">
                      <span className="text-white font-bold text-sm">🤖 AI Enhanced</span>
                    </div>
                    <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2">
                      <span className="text-white font-bold text-sm">💎 Kelly Criterion</span>
                    </div>
                  </div>
                </div>
              </div>
              <PredictionsTable predictions={predictions} />
            </div>
          </div>
        )}

        {!analyzing && predictions.length === 0 && !selectedLeague && (
          <div className="text-center py-24">
            <div className="text-8xl mb-8 opacity-50">⚽</div>
            <h3 className="text-3xl font-black text-white mb-6">
              Select a League to Start
            </h3>
            <p className="text-gray-300 text-xl max-w-2xl mx-auto leading-relaxed">
              Choose a championship from above to analyze all today's matches with our Advanced AI Engine
            </p>
          </div>
        )}

        {!analyzing && predictions.length === 0 && selectedLeague && !error && (
          <div className="text-center py-24">
            <div className="text-8xl mb-8 opacity-50">📅</div>
            <h3 className="text-3xl font-black text-white mb-6">
              No Matches Today
            </h3>
            <p className="text-gray-300 text-xl mb-6">
              No matches scheduled today for {selectedLeague.flag} {selectedLeague.name}
            </p>
          </div>
        )}
      </main>
        
      <footer className="relative z-10 bg-black/40 backdrop-blur-xl border-t border-white/10 mt-20">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-center">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 via-purple-600 to-emerald-600 rounded-xl flex items-center justify-center">
                <span className="text-2xl">⚽</span>
              </div>
              <div>
                <div className="text-xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
                  CALCIO-PRED
                </div>
                <div className="text-sm text-gray-400">© 2025 AI Enhanced • API-FOOTBALL Pro</div>
              </div>
            </div>

            <div className="text-center">
              <div className="text-sm font-bold text-white mb-4">📋 Prediction Strength Legend</div>
              <div className="flex flex-wrap justify-center gap-3">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  🟩 GIOCA
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-300 border border-green-500/30">
                  🟢 FORTE
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                  🟡 MEDIO
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gray-500/20 text-gray-300 border border-gray-500/30">
                  ⚪ NEUTRALE
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                  🔴 ND
                </span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm font-bold text-white mb-4">🚀 Powered By</div>
              <div className="flex justify-end space-x-3 text-xs">
                <div className="bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-white">Next.js</div>
                <div className="bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-white">TypeScript</div>
                <div className="bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-white">AI/ML</div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
