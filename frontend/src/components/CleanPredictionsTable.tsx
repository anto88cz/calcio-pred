/**
 * Clean Predictions Table - Simple and Professional Design
 */

'use client';

import { MatchPrediction } from '@/types';

interface ExtendedMatchPrediction extends MatchPrediction {
  teamStats?: {
    home: { xg: number; xga: number };
    away: { xg: number; xga: number };
  };
}

interface Props {
  predictions: ExtendedMatchPrediction[];
}

export default function CleanPredictionsTable({ predictions }: Props) {
  
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-full bg-white rounded-lg shadow-lg border border-gray-200">
        {predictions.map((pred, idx) => (
          <div key={idx} className="p-6 border-b border-gray-100 last:border-b-0">
            
            {/* Header Match */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-2xl font-bold text-gray-800">
                  {pred.homeTeam} vs {pred.awayTeam}
                </h3>
                <span className="text-sm text-gray-500">{pred.league}</span>
              </div>
              <div className="text-sm text-gray-600">
                {new Date(pred.date).toLocaleDateString('it-IT', { 
                  weekday: 'long', 
                  day: 'numeric', 
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* Expected Goals */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                  <span className="text-xl mr-2">⚽</span>
                  Expected Goals (xG)
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">{pred.homeTeam}</span>
                    <span className="font-bold text-blue-600 text-lg">
                      {pred.teamStats?.home.xg.toFixed(2) || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">{pred.awayTeam}</span>
                    <span className="font-bold text-red-600 text-lg">
                      {pred.teamStats?.away.xg.toFixed(2) || 'N/A'}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-blue-200">
                    <div className="flex justify-between items-center font-bold">
                      <span>Previsione:</span>
                      <span className="text-green-600 text-xl">
                        {pred.predictions.homeGoals.toFixed(1)} - {pred.predictions.awayGoals.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Match Result Probabilities */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
                <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                  <span className="text-xl mr-2">🎯</span>
                  Risultato (1X2)
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Vittoria Casa (1)</span>
                    <span className="font-bold text-lg text-green-700">
                      {pred.predictions.prob1.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Pareggio (X)</span>
                    <span className="font-bold text-lg text-blue-700">
                      {pred.predictions.probX.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Vittoria Trasferta (2)</span>
                    <span className="font-bold text-lg text-red-700">
                      {pred.predictions.prob2.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Over/Under Markets */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
                <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                  <span className="text-xl mr-2">📊</span>
                  Over/Under
                </h4>
                <div className="space-y-2 text-sm">
                  {pred.overUnder && (
                    <>
                      <div className="flex justify-between">
                        <span>Over 0.5</span>
                        <span className="font-semibold">{pred.overUnder.over05?.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Over 1.5</span>
                        <span className="font-semibold">{pred.overUnder.over15?.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Over 2.5</span>
                        <span className="font-semibold">{pred.overUnder.over25?.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Over 3.5</span>
                        <span className="font-semibold">{pred.overUnder.over35?.toFixed(1)}%</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* BTTS */}
              {pred.btts && (
                <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4">
                  <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                    <span className="text-xl mr-2">🥅</span>
                    Both Teams To Score
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">BTTS Yes</span>
                      <span className="font-bold text-lg text-green-700">
                        {pred.btts.yes.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">BTTS No</span>
                      <span className="font-bold text-lg text-red-700">
                        {pred.btts.no.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Confidence */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4">
                <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                  <span className="text-xl mr-2">💪</span>
                  Affidabilità
                </h4>
                <div className="flex items-center justify-center h-20">
                  <div className="text-center">
                    <div className={`text-4xl font-bold ${
                      pred.confidence >= 70 ? 'text-green-600' :
                      pred.confidence >= 50 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {pred.confidence.toFixed(0)}%
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {pred.confidence >= 70 ? 'Alta' :
                       pred.confidence >= 50 ? 'Media' : 'Bassa'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Value Bet */}
              {pred.valueBets && pred.valueBets.length > 0 && (
                <div className="bg-gradient-to-br from-green-100 to-green-200 border-2 border-green-400 rounded-lg p-4">
                  <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                    <span className="text-xl mr-2">💰</span>
                    Value Bet
                  </h4>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-700 mb-2">
                      🎯 GIOCA
                    </div>
                    <div className="text-sm text-gray-700">
                      {pred.valueBets[0].market}: {pred.valueBets[0].value.toFixed(2)}
                    </div>
                  </div>
                </div>
              )}

              {(!pred.valueBets || pred.valueBets.length === 0) && (
                <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg p-4">
                  <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                    <span className="text-xl mr-2">💰</span>
                    Value Bet
                  </h4>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-600 mb-2">
                      ⏸️ SKIP
                    </div>
                    <div className="text-sm text-gray-600">
                      Nessun valore rilevato
                    </div>
                  </div>
                </div>
              )}

            </div>

          </div>
        ))}
      </div>
    </div>
  );
}
