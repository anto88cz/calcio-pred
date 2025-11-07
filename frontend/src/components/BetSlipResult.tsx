'use client';

import { BettingRecommendation } from '@/lib/betting-recommendations';

interface GeneratedBetSlip {
  events: Array<{
    match: string;
    recommendation: BettingRecommendation;
  }>;
  totalOdds: number;
  totalProbability: number;
  estimatedReturn: number; // Su 10€
  averageConfidence: number;
}

interface BetSlipResultProps {
  betSlip: GeneratedBetSlip | null;
  onClose: () => void;
  onCopyToClipboard: () => void;
}

export default function BetSlipResult({ betSlip, onClose, onCopyToClipboard }: BetSlipResultProps) {
  if (!betSlip) return null;

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-green-400';
      case 'MEDIUM': return 'text-yellow-400';
      case 'HIGH': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 rounded-xl border-2 border-green-600 max-w-3xl w-full shadow-2xl my-8">
        {/* Header */}
        <div className="p-6 border-b border-gray-700 bg-gradient-to-r from-green-900/30 to-blue-900/30">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-white flex items-center">
                <span className="text-4xl mr-3">🎫</span>
                Schedina Generata
              </h2>
              <p className="text-sm text-gray-300 mt-1">
                {betSlip.events.length} eventi selezionati automaticamente
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Statistiche Globali */}
        <div className="p-6 border-b border-gray-700 bg-gray-900/50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-sm text-gray-400 mb-1">Quota Totale</div>
              <div className="text-3xl font-bold text-green-400">
                {betSlip.totalOdds.toFixed(2)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-400 mb-1">Probabilità</div>
              <div className="text-3xl font-bold text-blue-400">
                {(betSlip.totalProbability * 100).toFixed(1)}%
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-400 mb-1">Vincita su 10€</div>
              <div className="text-3xl font-bold text-purple-400">
                {betSlip.estimatedReturn.toFixed(2)}€
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-400 mb-1">Confidence Media</div>
              <div className="text-3xl font-bold text-yellow-400">
                {(betSlip.averageConfidence * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        </div>

        {/* Eventi */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {betSlip.events.map((event, idx) => (
            <div 
              key={idx}
              className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4 hover:border-green-500 transition-all"
            >
              {/* Match Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex-1">
                  <div className="text-lg font-bold text-white">{event.match}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {event.recommendation.market}
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full border text-xs font-semibold ${
                  event.recommendation.risk === 'LOW' ? 'text-green-400 bg-green-900/30 border-green-700' :
                  event.recommendation.risk === 'MEDIUM' ? 'text-yellow-400 bg-yellow-900/30 border-yellow-700' :
                  'text-red-400 bg-red-900/30 border-red-700'
                }`}>
                  {event.recommendation.risk}
                </div>
              </div>

              {/* Bet Description */}
              <div className="flex items-center space-x-3 mb-3">
                <span className="text-3xl">{getBetIcon(event.recommendation.type)}</span>
                <div className="flex-1">
                  <div className="font-semibold text-white">
                    {event.recommendation.description}
                  </div>
                  {event.recommendation.combo && event.recommendation.combo.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {event.recommendation.combo.map((item, i) => (
                        <span key={i} className="text-xs px-2 py-1 bg-blue-900/30 border border-blue-700 text-blue-300 rounded">
                          {item}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-gray-900/50 rounded p-2 text-center">
                  <div className="text-xs text-gray-400">Probabilità</div>
                  <div className="text-lg font-bold text-green-400">
                    {(event.recommendation.probability * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="bg-gray-900/50 rounded p-2 text-center">
                  <div className="text-xs text-gray-400">Quota</div>
                  <div className="text-lg font-bold text-blue-400">
                    {event.recommendation.odds?.toFixed(2) || 'N/A'}
                  </div>
                </div>
                <div className="bg-gray-900/50 rounded p-2 text-center">
                  <div className="text-xs text-gray-400">Value</div>
                  <div className="text-lg font-bold text-purple-400">
                    {event.recommendation.valueRating.toFixed(0)}
                  </div>
                </div>
              </div>

              {/* Reasoning */}
              <div className="text-xs text-gray-400 bg-gray-900/30 rounded p-2">
                💡 {event.recommendation.reasoning}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-gray-400">
            ⚠️ Gioca responsabilmente. Questa è solo un'indicazione statistica.
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCopyToClipboard}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>Copia</span>
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition font-semibold"
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
