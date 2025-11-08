 'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { MatchPrediction, MarketCalibration, InjuriesAnalysis } from '@/types';
import { ENV } from '@/config/env';
import BetSlipModal, { BetSlipConfig } from '@/components/BetSlipModal';
import BetSlipResult from '@/components/BetSlipResult';
import { generateAutomaticBetSlip, formatBetSlipForClipboard, type MatchData, type GeneratedBetSlip } from '@/lib/bet-slip-generator';

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
  homeTeamLogo?: string;
  awayTeam: string;
  awayTeamLogo?: string;
  competition: string;
  competitionCode: string;
  competitionCountry?: string;
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
  const router = useRouter();
  const [matches, setMatches] = useState<TodayMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // NUOVI STATI per filtri
  const [selectedDate, setSelectedDate] = useState<string>('today');
  const [selectedLeague, setSelectedLeague] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // STATI per schedina automatica
  const [showBetSlipModal, setShowBetSlipModal] = useState(false);
  const [generatingBetSlip, setGeneratingBetSlip] = useState(false);
  const [generatedBetSlip, setGeneratedBetSlip] = useState<GeneratedBetSlip | null>(null);
  const [generationProgress, setGenerationProgress] = useState<string>('');

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

  // Carica partite quando cambia la data
  useEffect(() => {
    loadMatches();
  }, [selectedDate]);

  const loadMatches = async () => {
    setLoadingMatches(true);
    setError(null);
    
    try {
      // Use new Sportsmonks endpoints
      const endpoint = selectedDate === 'today' 
        ? `${ENV.API_URL}/api/fixtures/sm/today`
        : `${ENV.API_URL}/api/fixtures/sm/range?startDate=${selectedDate}&endDate=${selectedDate}`;
      
      const response = await fetch(endpoint);
      const data = await response.json();
      
      // Transform Sportsmonks fixtures to our format
      if (data.fixtures && data.fixtures.length > 0) {
        const transformedMatches = data.fixtures.map((fixture: any) => ({
          id: fixture.id,
          homeTeam: fixture.homeTeam.name,
          homeTeamLogo: fixture.homeTeam.logo,
          awayTeam: fixture.awayTeam.name,
          awayTeamLogo: fixture.awayTeam.logo,
          competition: fixture.league.name,
          competitionCode: fixture.league.country,
          competitionCountry: fixture.league.country,
          time: new Date(fixture.date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
          status: fixture.statusShort,
        }));
        
        setMatches(transformedMatches);
        setSuccess(`✅ Trovate ${data.count} partite`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setMatches([]);
        setError('Nessuna partita trovata per questa data');
      }
    } catch (err) {
      setError('Errore caricamento partite');
      console.error(err);
    } finally {
      setLoadingMatches(false);
    }
  };

  const analyzeMatch = async (homeTeam: string, awayTeam: string, fixtureId?: number) => {
    // Naviga alla pagina di analisi dedicata
    const url = fixtureId 
      ? `/analysis?home=${encodeURIComponent(homeTeam)}&away=${encodeURIComponent(awayTeam)}&fixtureId=${fixtureId}`
      : `/analysis?home=${encodeURIComponent(homeTeam)}&away=${encodeURIComponent(awayTeam)}`;
    router.push(url);
  };

  const handleGenerateBetSlip = async (config: BetSlipConfig) => {
    setGeneratingBetSlip(true);
    setShowBetSlipModal(false); // Chiudi il modale subito
    setGenerationProgress(`Analisi di ${matches.length} partite in corso...`);
    
    try {
      console.log(`🎰 Starting parallel analysis of ${matches.length} matches...`);
      const startTime = Date.now();
      
      // Crea tutte le promise in parallelo (NON aspettare una per volta)
      const matchDataPromises = matches.map((match) => 
        fetch(`${ENV.API_URL}/api/predictions/calculate-by-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            homeTeamName: match.homeTeam,
            awayTeamName: match.awayTeam,
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              console.warn(`❌ Failed for ${match.homeTeam} vs ${match.awayTeam}: ${response.status}`);
              return null;
            }
            
            const data = await response.json();
            
            // Verifica che abbia dati validi
            if (!data.market1X2 || !data.poissonParams || data.confidence === 0) {
              console.warn(`⚠️ Invalid data for ${match.homeTeam} vs ${match.awayTeam}`);
              return null;
            }
            
            console.log(`✅ ${match.homeTeam} vs ${match.awayTeam} - Confidence: ${(data.confidence * 100).toFixed(0)}%`);
            
            return {
              id: match.id,
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              league: match.competition,
              date: match.time,
              market1X2: data.market1X2,
              marketUnderOver: data.marketUnderOver,
              marketBTTS: data.marketBTTS,
              marketDoubleChance: data.marketDoubleChance,
              poissonParams: data.poissonParams,
              confidence: data.confidence,
              formMomentum: data.formMomentum,
            } as MatchData;
          })
          .catch((error) => {
            console.error(`💥 Exception for ${match.homeTeam} vs ${match.awayTeam}:`, error.message);
            return null;
          })
      );
      
      // Aspetta che TUTTE le promise si risolvano contemporaneamente
      setGenerationProgress('⏳ Attendere il completamento delle analisi...');
      const matchDataResults = await Promise.all(matchDataPromises);
      
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`⏱️ Completed ${matches.length} predictions in ${elapsedTime}s`);
      
      // Filtra solo i match validi
      const validMatchData = matchDataResults.filter((m): m is MatchData => m !== null);
      
      console.log(`📊 Results: ${validMatchData.length} valid / ${matches.length} total`);
      
      if (validMatchData.length === 0) {
        throw new Error('Nessuna predizione valida trovata. Assicurati che il backend sia in esecuzione e che ci siano dati nel database.');
      }
      
      if (validMatchData.length < config.numEvents) {
        throw new Error(
          `Trovate solo ${validMatchData.length} predizioni valide, ma ne servono almeno ${config.numEvents}. ` +
          `Riduci il numero di eventi o attendi che ci siano più partite disponibili.`
        );
      }
      
      // Genera schedina
      setGenerationProgress('🎯 Generazione della schedina ottimizzata...');
      const betSlip = await generateAutomaticBetSlip(validMatchData, config);
      
      setGeneratedBetSlip(betSlip);
      setSuccess(`✅ Schedina generata con ${betSlip.events.length} eventi in ${elapsedTime}s!`);
      setTimeout(() => setSuccess(null), 5000);
      
    } catch (error: any) {
      console.error('💥 Error generating bet slip:', error);
      setError(error.message || 'Errore nella generazione della schedina');
      setTimeout(() => setError(null), 8000);
    } finally {
      setGeneratingBetSlip(false);
      setGenerationProgress('');
    }
  };

  const handleCopyBetSlip = () => {
    if (!generatedBetSlip) return;
    
    const text = formatBetSlipForClipboard(generatedBetSlip);
    navigator.clipboard.writeText(text);
    
    setSuccess('📋 Schedina copiata negli appunti!');
    setTimeout(() => setSuccess(null), 3000);
  };

  const getCompetitionEmoji = (code: string) => {
    const emojiMap: Record<string, string> = {
      '2': '🏆', '3': '🥈', '39': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '140': '🇪🇸', '135': '🇮🇹', '78': '🇩🇪', '61': '🇫🇷',
    };
    return emojiMap[code] || '⚽';
  };

  const getCompetitionColor = (code: string) => {
    const colorMap: Record<string, string> = {
      '2': 'from-blue-600 to-indigo-600',     // Champions League
      '3': 'from-orange-500 to-amber-500',    // Europa League
      '39': 'from-purple-600 to-pink-600',    // Premier League
      '140': 'from-red-600 to-rose-600',      // La Liga
      '135': 'from-sky-600 to-blue-600',      // Serie A
      '78': 'from-red-600 to-gray-900',       // Bundesliga
      '61': 'from-blue-500 to-cyan-500',      // Ligue 1
    };
    return colorMap[code] || 'from-gray-700 to-gray-900';
  };

  // Raggruppa partite per competizione
  const groupedMatches = matches.reduce((acc, match) => {
    const comp = match.competition;
    if (!acc[comp]) acc[comp] = [];
    acc[comp].push(match);
    return acc;
  }, {} as Record<string, TodayMatch[]>);

  // Filtra per lega selezionata
  const filteredGroupedMatches = selectedLeague === 'all'
    ? groupedMatches
    : { [selectedLeague]: groupedMatches[selectedLeague] || [] };

  // Filtra per ricerca (nome squadra o competizione)
  const searchFilteredMatches = Object.entries(filteredGroupedMatches).reduce((acc, [competition, compMatches]) => {
    if (searchQuery.trim() === '') {
      acc[competition] = compMatches;
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = compMatches.filter(match => 
        match.homeTeam.toLowerCase().includes(query) ||
        match.awayTeam.toLowerCase().includes(query) ||
        match.competition.toLowerCase().includes(query) ||
        match.competitionCountry?.toLowerCase().includes(query)
      );
      if (filtered.length > 0) {
        acc[competition] = filtered;
      }
    }
    return acc;
  }, {} as Record<string, TodayMatch[]>);

  // Get available leagues
  const availableLeagues = ['all', ...Object.keys(groupedMatches)];
  const dateOptions = getDateOptions();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900">
      {/* Header Compatto Dark */}
      <header className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 sticky top-0 z-50 shadow-lg shadow-black/20">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/30">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">CALCIO-PRED</h1>
                <p className="text-xs text-gray-400">AI Predictions</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="flex items-center space-x-1 text-xs text-gray-400">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Live</span>
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Filtri Compatti Dark */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4 mb-6 shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Filtro Data */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">📅 Data</label>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {dateOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Filtro Campionato */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">🏆 Campionato</label>
              <select
                value={selectedLeague}
                onChange={(e) => setSelectedLeague(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Tutti i campionati ({matches.length})</option>
                {Object.keys(groupedMatches).map(league => (
                  <option key={league} value={league}>
                    {league} ({groupedMatches[league].length})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Campo di Ricerca */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">🔍 Cerca</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Cerca squadra, competizione o paese..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 pl-10 text-sm text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  ✕
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="mt-2 text-xs text-gray-400">
                {Object.values(searchFilteredMatches).flat().length} partite trovate
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              onClick={loadMatches}
              disabled={loadingMatches}
              className="flex-1 sm:flex-none px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition shadow-lg shadow-blue-500/20"
            >
              {loadingMatches ? '⏳ Caricamento...' : '🔄 Aggiorna'}
            </button>
            
            {/* PULSANTE SCHEDINA AUTOMATICA - TEMPORANEAMENTE NASCOSTO */}
            {/* <button
              onClick={() => setShowBetSlipModal(true)}
              disabled={matches.length === 0 || loadingMatches}
              className="flex-1 sm:flex-none px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-bold rounded-lg hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-green-500/20 flex items-center justify-center space-x-2"
            >
              <span className="text-lg">🎰</span>
              <span>Genera Schedina Automatica</span>
            </button> */}
          </div>
        </div>

        {/* Messaggi */}
        {success && (
          <div className="mb-4 bg-green-900/50 border border-green-700 rounded-lg px-4 py-3 text-green-300 text-sm backdrop-blur-sm">
            {success}
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-900/50 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm backdrop-blur-sm">
            {error}
          </div>
        )}

        {/* Indicatore Progresso Generazione Schedina */}
        {generatingBetSlip && (
          <div className="mb-4 bg-blue-900/50 border border-blue-700 rounded-lg p-4 backdrop-blur-sm">
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-500 rounded-full animate-spin"></div>
              </div>
              <div className="flex-1">
                <div className="text-blue-300 font-semibold mb-1">{generationProgress}</div>
                <div className="text-xs text-blue-400">
                  Analisi in parallelo di tutte le partite. Attendere prego...
                </div>
                <div className="mt-2 w-full bg-blue-950 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-500 to-cyan-500 h-full rounded-full animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lista Partite */}
        {loadingMatches ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-blue-600/30 border-t-blue-500 rounded-full animate-spin"></div>
            <p className="text-gray-400 mt-2 text-sm">Caricamento...</p>
          </div>
        ) : Object.keys(searchFilteredMatches).length === 0 ? (
          <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700">
            <p className="text-gray-400">
              {searchQuery ? `Nessuna partita trovata per "${searchQuery}"` : 'Nessuna partita trovata'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(searchFilteredMatches).map(([competition, compMatches]) => {
              const firstMatch = compMatches[0];
              const emoji = getCompetitionEmoji(firstMatch.competitionCode);
              const color = getCompetitionColor(firstMatch.competitionCode);
              
              return (
                <div key={competition} className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden shadow-lg">
                  {/* Header Campionato */}
                  <div className={`bg-gradient-to-r ${color} px-4 py-2.5 flex items-center justify-between`}>
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{emoji}</span>
                      <div>
                        <h3 className="font-bold text-white text-sm">{competition}</h3>
                        {firstMatch.competitionCountry && (
                          <p className="text-xs text-white/80">{firstMatch.competitionCountry}</p>
                        )}
                      </div>
                    </div>
                    <span className="bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full text-white text-xs font-medium">
                      {compMatches.length}
                    </span>
                  </div>

                  {/* Lista Partite */}
                  <div className="divide-y divide-gray-700/50">
                    {compMatches.map((match) => (
                      <div
                        key={match.id}
                        className="p-3 hover:bg-gray-700/30 transition cursor-pointer"
                        onClick={() => analyzeMatch(match.homeTeam, match.awayTeam, match.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1.5">
                              <span className="text-xs font-medium text-gray-400">{match.time}</span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <span className="w-4 text-center text-xs text-blue-400 font-bold">H</span>
                                {match.homeTeamLogo && (
                                  <img 
                                    src={match.homeTeamLogo} 
                                    alt={match.homeTeam}
                                    className="w-5 h-5 object-contain"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                )}
                                <span className="font-medium text-gray-200 text-sm">{match.homeTeam}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="w-4 text-center text-xs text-red-400 font-bold">A</span>
                                {match.awayTeamLogo && (
                                  <img 
                                    src={match.awayTeamLogo} 
                                    alt={match.awayTeam}
                                    className="w-5 h-5 object-contain"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                )}
                                <span className="font-medium text-gray-200 text-sm">{match.awayTeam}</span>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              analyzeMatch(match.homeTeam, match.awayTeam, match.id);
                            }}
                            className="px-3 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-medium rounded-lg hover:from-blue-700 hover:to-purple-700 transition shadow-lg shadow-blue-500/20"
                          >
                            🔍 Analizza
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="bg-gray-900/80 backdrop-blur-sm border-t border-gray-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center">
          <p className="text-sm bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent font-bold">
            © 2025 CALCIO-PRED · AI-Powered Predictions
          </p>
        </div>
      </footer>

      {/* Modali */}
      <BetSlipModal
        isOpen={showBetSlipModal}
        onClose={() => setShowBetSlipModal(false)}
        onGenerate={handleGenerateBetSlip}
        isLoading={generatingBetSlip}
      />

      <BetSlipResult
        betSlip={generatedBetSlip}
        onClose={() => setGeneratedBetSlip(null)}
        onCopyToClipboard={handleCopyBetSlip}
      />
    </div>
  );
}
