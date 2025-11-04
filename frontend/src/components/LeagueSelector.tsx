/**
 * League Selector Component
 * Allows users to select and analyze different football leagues
 */

import { League } from '@/types';

interface LeagueSelectorProps {
  leagues: League[];
  onSelectLeague: (league: League) => void;
  selectedLeague: League | null;
  analyzing: boolean;
}

export function LeagueSelector({ 
  leagues, 
  onSelectLeague, 
  selectedLeague, 
  analyzing 
}: LeagueSelectorProps) {
  
  return (
    <div className="relative z-10">
      {/* Section Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center space-x-3 mb-6">
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
          <span className="text-blue-400 font-bold text-sm uppercase tracking-wider">
            Select Championship
          </span>
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse animation-delay-150"></div>
        </div>
        
        <h2 className="text-4xl font-black text-white mb-4">
          Choose Your League
        </h2>
        <p className="text-gray-300 text-lg max-w-2xl mx-auto">
          Select a championship to analyze all today's matches with our Advanced AI Engine and Value Betting algorithms
        </p>
      </div>
      
      {/* Premium League Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
        {leagues.map((league, index) => (
          <div 
            key={league.id} 
            className="relative group"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            {/* Premium Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 rounded-3xl blur-lg opacity-0 group-hover:opacity-50 transition-all duration-700"></div>
            
            {/* Main Card */}
            <button
              onClick={() => !analyzing && onSelectLeague(league)}
              disabled={analyzing}
              className={`
                relative w-full h-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 
                transition-all duration-500 transform hover:-translate-y-4 hover:scale-105
                ${selectedLeague?.id === league.id
                  ? 'bg-gradient-to-br from-blue-500/20 to-purple-500/20 border-blue-400/50 shadow-2xl scale-105'
                  : 'hover:bg-white/10 hover:border-white/20'
                }
                ${analyzing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {/* League Flag & Selection Status */}
              <div className="flex items-center justify-between mb-6">
                <div className="text-5xl filter drop-shadow-2xl transform group-hover:scale-110 transition-transform duration-300">
                  {league.flag}
                </div>
                
                {selectedLeague?.id === league.id && (
                  <div className="flex items-center justify-center w-8 h-8 bg-blue-500 rounded-full shadow-lg">
                    {analyzing ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <span className="text-white text-sm font-bold">✓</span>
                    )}
                  </div>
                )}
              </div>
              
              {/* League Information */}
              <div className="text-left space-y-4">
                <div>
                  <h3 className="text-xl font-black text-white mb-2 leading-tight">
                    {league.name}
                  </h3>
                  <p className="text-gray-300 font-semibold">
                    {league.country}
                  </p>
                </div>
                
                {/* Premium Features */}
                <div className="space-y-2">
                  <div className="flex items-center text-sm font-medium text-blue-300">
                    <div className="w-2 h-2 bg-blue-400 rounded-full mr-3 animate-pulse"></div>
                    AI Enhanced Analysis
                  </div>
                  <div className="flex items-center text-sm font-medium text-purple-300">
                    <div className="w-2 h-2 bg-purple-400 rounded-full mr-3 animate-pulse animation-delay-300"></div>
                    Kelly Criterion Betting
                  </div>
                  <div className="flex items-center text-sm font-medium text-emerald-300">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full mr-3 animate-pulse animation-delay-600"></div>
                    Real-Time Data Feed
                  </div>
                </div>
              </div>
              
              {/* Premium Badge */}
              <div className="absolute top-4 right-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-xs font-black px-2 py-1 rounded-full">
                PRO
              </div>
              
              {/* League ID */}
              <div className="absolute bottom-4 right-4 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
                <span className="text-xs font-bold text-white/70">#{league.id}</span>
              </div>
            </button>
          </div>
        ))}
      </div>
      
      {/* Help Text */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-start space-x-2">
          <span className="text-blue-500 text-lg">💡</span>
          <div className="text-sm text-gray-700">
            <p className="font-semibold mb-1">Cosa otterrai per ogni lega:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center space-x-1">
                <span className="text-green-600">📊</span>
                <span>Expected Goals dettagliati</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-blue-600">🎯</span>
                <span>Probabilità 1X2 precise</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-purple-600">💰</span>
                <span>Value Betting opportunities</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-orange-600">📈</span>
                <span>Confidence Score avanzato</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Currently Analyzing */}
      {analyzing && selectedLeague && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <div>
              <div className="font-semibold text-blue-800">
                🔍 Analizzando {selectedLeague.flag} {selectedLeague.name}
              </div>
              <div className="text-sm text-blue-600">
                Raccogliendo dati da API-FOOTBALL Pro • Enhanced Multi-Factor Analysis
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}