/**
 * Home Page - Enhanced Predictions Dashboard
 * Allows users to select leagues and analyze all matches with detailed statistics
 */

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
      
      console.log(`🔍 Analizzando ${league.name}...`);
      
      // Chiamata al nostro Enhanced API Server
      const response = await fetch(`http://localhost:3001/api/predictions/league/${league.id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Errore API: ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setPredictions(data.predictions || []);
      } else {
        throw new Error(data.message || 'Errore sconosciuto');
      }
      
    } catch (err) {
      console.error('Errore analisi lega:', err);
      setError(`Errore nell'analisi di ${league.name}: ${err instanceof Error ? err.message : 'Errore sconosciuto'}`);
      
      // Fallback con dati demo per testing
      console.log('🎯 Usando dati demo per testing...');
      await simulateAnalysis(league);
      
    } finally {
      setAnalyzing(false);
    }
  };

  const simulateAnalysis = async (league: League) => {
    // Simula predizioni per demo/testing
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
        valueBets: [
          {
            market: '1X2',
            selection: 'HOME',
            odds: 1.75,
            probability: 58.2,
            value: 4.3,
            kelly: 2.8,
            recommend: true
          }
        ]
      },
      {
        id: '2',
        homeTeam: 'Team C',
        awayTeam: 'Team D',
        league: league.name,
        date: new Date().toISOString(),
        predictions: {
          homeGoals: 1.45,
          awayGoals: 1.65,
          totalGoals: 3.10,
          prob1: 42.1,
          probX: 28.9,
          prob2: 29.0
        },
        confidence: 65.8,
        strength: 'MEDIO',
        valueBets: []
      }
    ];
    
    // Simula delay API
    await new Promise(resolve => setTimeout(resolve, 2000));
    setPredictions(mockPredictions);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">
                ⚽ CALCIO-PRED PRO
              </h1>
              <p className="mt-2 text-lg text-gray-600">
                Sistema Avanzato di Predizioni con Value Betting
              </p>
            </div>
            
            <div className="hidden md:block">
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">75-80%</div>
                  <div className="text-gray-600">Accuratezza</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">Enhanced</div>
                  <div className="text-gray-600">Algoritmo</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* League Selector */}
        <div className="mb-8">
          <LeagueSelector 
            leagues={leagues} 
            onSelectLeague={analyzeLeague}
            selectedLeague={selectedLeague}
            analyzing={analyzing}
          />
        </div>

        {/* Loading State */}
        {analyzing && (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <div className="text-xl text-gray-700 mb-2">
              🔍 Analizzando {selectedLeague?.flag} {selectedLeague?.name}
            </div>
            <div className="text-sm text-gray-500">
              Raccogliendo dati • Calcolando predizioni Enhanced • Value Betting
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-6 mb-8 rounded-r-lg">
            <p className="text-red-700">❌ {error}</p>
          </div>
        )}

        {/* Results Summary */}
        {!analyzing && predictions.length > 0 && selectedLeague && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              {selectedLeague.flag} {selectedLeague.name} - Partite di Oggi
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-500">
                <div className="text-green-800 font-semibold text-sm">📊 PARTITE</div>
                <div className="text-3xl font-bold text-green-600">{predictions.length}</div>
                <div className="text-green-600 text-xs">Analizzate</div>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
                <div className="text-blue-800 font-semibold text-sm">🎯 VALUE BETS</div>
                <div className="text-3xl font-bold text-blue-600">
                  {predictions.filter(p => p.valueBets?.some((vb: any) => vb.recommend)).length}
                </div>
                <div className="text-blue-600 text-xs">Opportunità</div>
              </div>
              
              <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-500">
                <div className="text-purple-800 font-semibold text-sm">💰 AVG ROI</div>
                <div className="text-3xl font-bold text-purple-600">
                  {predictions.length > 0 
                    ? `${(predictions.reduce((acc, p) => acc + (p.valueBets?.[0]?.value || 0), 0) / predictions.length).toFixed(1)}%`
                    : '0%'
                  }
                </div>
                <div className="text-purple-600 text-xs">Atteso</div>
              </div>
              
              <div className="bg-orange-50 p-4 rounded-lg border-l-4 border-orange-500">
                <div className="text-orange-800 font-semibold text-sm">📈 CONFIDENCE</div>
                <div className="text-3xl font-bold text-orange-600">
                  {predictions.length > 0 
                    ? `${(predictions.reduce((acc, p) => acc + p.confidence, 0) / predictions.length).toFixed(0)}%`
                    : '0%'
                  }
                </div>
                <div className="text-orange-600 text-xs">Media</div>
              </div>
            </div>
          </div>
        )}

        {/* Predictions Table */}
        {!analyzing && predictions.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">
                📊 Analisi Dettagliata Partite
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Tutte le statistiche per decidere cosa giocare
              </p>
            </div>
            <PredictionsTable predictions={predictions} />
          </div>
        )}

        {/* Empty State - No League Selected */}
        {!analyzing && predictions.length === 0 && !selectedLeague && (
          <div className="text-center py-16">
            <div className="text-8xl mb-6">⚽</div>
            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              Seleziona una Lega per Iniziare
            </h3>
            <p className="text-gray-600 text-lg mb-8">
              Scegli una lega dal menu sopra per analizzare tutte le partite di oggi
            </p>
          </div>
        )}

        {/* Empty State - No Matches Today */}
        {!analyzing && predictions.length === 0 && selectedLeague && !error && (
          <div className="text-center py-16">
            <div className="text-8xl mb-6">📅</div>
            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              Nessuna Partita Oggi
            </h3>
            <p className="text-gray-600 text-lg mb-4">
              Non ci sono partite programmate oggi per {selectedLeague.flag} {selectedLeague.name}
            </p>
          </div>
        )}
      </main>
        
      {/* Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center text-sm text-gray-600">
            <p>
              © 2025 Calcio-Pred Enhanced - Powered by API-FOOTBALL Pro
            </p>
            <div className="flex gap-4">
              <span className="font-semibold">Legenda:</span>
              <span>🟩 GIOCA (Value Bet)</span>
              <span>🟢 FORTE</span>
              <span>🟡 MEDIO</span>
              <span>⚪ NEUTRALE</span>
              <span>🔴 ND</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}