/**
 * Modern Prediction Display - Professional Glass Design
 */

'use client';

interface Prediction {
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  predictions: {
    homeGoals: number;
    awayGoals: number;
    prob1: number;
    probX: number;
    prob2: number;
  };
  confidence: number;
  teamStats?: {
    home: { xg: number; xga: number };
    away: { xg: number; xga: number };
  };
  overUnder?: {
    over05?: number;
    over15?: number;
    over25?: number;
    over35?: number;
    over45?: number;
  };
  btts?: {
    yes: number;
    no: number;
  };
  valueBets?: Array<{
    market: string;
    value: number;
  }>;
}

interface Props {
  predictions: Prediction[];
}

export default function ProfessionalPredictionCard({ predictions }: Props) {
  if (!predictions || predictions.length === 0) return null;

  const pred = predictions[0];

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      
      {/* Hero Header */}
      <div className="glass-card p-8 mb-6">
        <div className="text-center mb-8">
          <div className="inline-block px-4 py-2 bg-blue-500/20 rounded-full border border-blue-500/50 mb-4">
            <span className="text-blue-300 text-sm font-semibold uppercase tracking-wider">{pred.league}</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-4">
            {pred.homeTeam} <span className="text-blue-400">vs</span> {pred.awayTeam}
          </h1>
          
          <p className="text-gray-400 text-sm md:text-base">
            {new Date(pred.date).toLocaleDateString('it-IT', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </div>

        {/* Score Box */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-emerald-500/20 blur-3xl"></div>
          <div className="relative bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl p-12 border border-white/10">
            <p className="text-center text-gray-400 uppercase text-sm tracking-widest mb-4">Previsione Risultato</p>
            <div className="flex items-center justify-center gap-8">
              <div className="text-6xl font-black text-blue-400">{pred.predictions.homeGoals.toFixed(1)}</div>
              <div className="text-4xl text-gray-600 font-bold">-</div>
              <div className="text-6xl font-black text-red-400">{pred.predictions.awayGoals.toFixed(1)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 1X2 */}
        <div className="glass-card p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center">
            <span className="text-2xl mr-3">🎯</span>
            Risultato 1X2
          </h3>
          
          <div className="space-y-4">
            <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Vittoria Casa</span>
                <span className="text-2xl font-bold text-blue-400">{pred.predictions.prob1.toFixed(1)}%</span>
              </div>
            </div>

            <div className="p-4 bg-gray-500/10 rounded-xl border border-gray-500/20">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Pareggio</span>
                <span className="text-2xl font-bold text-gray-400">{pred.predictions.probX.toFixed(1)}%</span>
              </div>
            </div>

            <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Vittoria Trasferta</span>
                <span className="text-2xl font-bold text-red-400">{pred.predictions.prob2.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* xG */}
        {pred.teamStats && (
          <div className="glass-card p-6">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              <span className="text-2xl mr-3">⚽</span>
              Expected Goals
            </h3>
            
            <div className="space-y-4">
              <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
                <p className="font-bold text-blue-300 mb-2">{pred.homeTeam}</p>
                <div className="flex gap-4">
                  <div>
                    <p className="text-xs text-gray-400">xG</p>
                    <p className="text-2xl font-black text-blue-400">{pred.teamStats.home.xg.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">xGA</p>
                    <p className="text-2xl font-black text-blue-400">{pred.teamStats.home.xga.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                <p className="font-bold text-red-300 mb-2">{pred.awayTeam}</p>
                <div className="flex gap-4">
                  <div>
                    <p className="text-xs text-gray-400">xG</p>
                    <p className="text-2xl font-black text-red-400">{pred.teamStats.away.xg.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">xGA</p>
                    <p className="text-2xl font-black text-red-400">{pred.teamStats.away.xga.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Over/Under */}
        {pred.overUnder && (
          <div className="glass-card p-6">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              <span className="text-2xl mr-3">📊</span>
              Over/Under
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              {pred.overUnder.over05 !== undefined && (
                <div className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/20">
                  <p className="text-gray-400 text-sm">O 0.5</p>
                  <p className="text-2xl font-black text-purple-400">{pred.overUnder.over05.toFixed(1)}%</p>
                </div>
              )}
              {pred.overUnder.over15 !== undefined && (
                <div className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/20">
                  <p className="text-gray-400 text-sm">O 1.5</p>
                  <p className="text-2xl font-black text-purple-400">{pred.overUnder.over15.toFixed(1)}%</p>
                </div>
              )}
              {pred.overUnder.over25 !== undefined && (
                <div className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/20">
                  <p className="text-gray-400 text-sm">O 2.5</p>
                  <p className="text-2xl font-black text-purple-400">{pred.overUnder.over25.toFixed(1)}%</p>
                </div>
              )}
              {pred.overUnder.over35 !== undefined && (
                <div className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/20">
                  <p className="text-gray-400 text-sm">O 3.5</p>
                  <p className="text-2xl font-black text-purple-400">{pred.overUnder.over35.toFixed(1)}%</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* BTTS */}
        {pred.btts && (
          <div className="glass-card p-6">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              <span className="text-2xl mr-3">🥅</span>
              Goal / NoGoal
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 bg-green-500/10 rounded-xl border border-green-500/20 text-center hover:bg-green-500/20 transition-colors">
                <p className="text-gray-400 text-sm mb-2 font-semibold">GOAL (Entrambe segnano)</p>
                <p className="text-4xl font-black text-green-400">{pred.btts.yes.toFixed(1)}%</p>
              </div>
              
              <div className="p-6 bg-red-500/10 rounded-xl border border-red-500/20 text-center hover:bg-red-500/20 transition-colors">
                <p className="text-gray-400 text-sm mb-2 font-semibold">NOGOAL (Almeno una non segna)</p>
                <p className="text-4xl font-black text-red-400">{pred.btts.no.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        
        {/* Confidence */}
        <div className={`glass-card p-6 border-2 ${
          pred.confidence >= 70 ? 'bg-green-500/20 border-green-500/50' :
          pred.confidence >= 50 ? 'bg-yellow-500/20 border-yellow-500/50' :
          'bg-red-500/20 border-red-500/50'
        }`}>
          <h3 className="text-xl font-bold text-white mb-4 flex items-center">
            <span className="text-2xl mr-3">💪</span>
            Affidabilità
          </h3>
          
          <div className="text-center">
            <div className={`text-6xl font-black mb-2 ${
              pred.confidence >= 70 ? 'text-green-400' :
              pred.confidence >= 50 ? 'text-yellow-400' :
              'text-red-400'
            }`}>
              {pred.confidence.toFixed(0)}%
            </div>
            <p className="text-gray-400 text-sm">
              {pred.confidence >= 70 ? '🔥 Alta' : pred.confidence >= 50 ? '⚡ Media' : '⚠️ Bassa'}
            </p>
          </div>
        </div>

        {/* Value Bet */}
        <div className={`glass-card p-6 ${
          pred.valueBets && pred.valueBets.length > 0 
            ? 'border-2 border-green-500/50 bg-green-500/10' 
            : 'border border-gray-500/20'
        }`}>
          <h3 className="text-xl font-bold text-white mb-4 flex items-center">
            <span className="text-2xl mr-3">💰</span>
            Value Betting
          </h3>
          
          <div className="text-center">
            {pred.valueBets && pred.valueBets.length > 0 ? (
              <>
                <div className="text-4xl mb-2">✅</div>
                <div className="text-2xl font-bold text-green-400 mb-1">GIOCA!</div>
                <p className="text-gray-300 text-sm">
                  {pred.valueBets[0].market}: {pred.valueBets[0].value.toFixed(2)}
                </p>
              </>
            ) : (
              <>
                <div className="text-4xl mb-2">⏸️</div>
                <div className="text-xl font-bold text-gray-400 mb-1">SKIP</div>
                <p className="text-gray-500 text-sm">Nessun valore</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
