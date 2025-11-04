/**
 * Enhanced Predictions Table Component
 * Displays match predictions with detailed statistics for betting decisions
 */

'use client';

import { MatchPrediction, ValueBet } from '@/types';
import StrengthBadge from './StrengthBadge';

interface PredictionsTableProps {
  predictions: MatchPrediction[];
}

export default function PredictionsTable({ predictions }: PredictionsTableProps) {
  
  const getValueBetColor = (value: number) => {
    if (value >= 5) return 'text-green-600 bg-green-50 border-green-200';
    if (value >= 3) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (value >= 1) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600 bg-green-100';
    if (confidence >= 60) return 'text-blue-600 bg-blue-100';
    if (confidence >= 40) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const formatPercentage = (value: number) => `${value.toFixed(1)}%`;
  const formatGoals = (value: number) => value.toFixed(2);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
            <th className="px-8 py-4 text-left text-xs font-black text-gray-700 uppercase tracking-wider border-b-2 border-gray-200">
              <div className="flex items-center space-x-2">
                <span>⚽</span>
                <span>Match</span>
              </div>
            </th>
            <th className="px-6 py-4 text-left text-xs font-black text-gray-700 uppercase tracking-wider border-b-2 border-gray-200">
              <div className="flex items-center space-x-2">
                <span>🎯</span>
                <span>Expected Goals</span>
              </div>
            </th>
            <th className="px-6 py-4 text-left text-xs font-black text-gray-700 uppercase tracking-wider border-b-2 border-gray-200">
              <div className="flex items-center space-x-2">
                <span>📊</span>
                <span>Probabilità 1X2</span>
              </div>
            </th>
            <th className="px-6 py-4 text-left text-xs font-black text-gray-700 uppercase tracking-wider border-b-2 border-gray-200">
              <div className="flex items-center space-x-2">
                <span>🔢</span>
                <span>Over/Under</span>
              </div>
            </th>
            <th className="px-6 py-4 text-left text-xs font-black text-gray-700 uppercase tracking-wider border-b-2 border-gray-200">
              <div className="flex items-center space-x-2">
                <span>🔥</span>
                <span>Confidence</span>
              </div>
            </th>
            <th className="px-6 py-4 text-left text-xs font-black text-gray-700 uppercase tracking-wider border-b-2 border-gray-200">
              <div className="flex items-center space-x-2">
                <span>💎</span>
                <span>Value Betting</span>
              </div>
            </th>
            <th className="px-6 py-4 text-left text-xs font-black text-gray-700 uppercase tracking-wider border-b-2 border-gray-200">
              <div className="flex items-center space-x-2">
                <span>🎖️</span>
                <span>Raccomandazione</span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white/50">
          {predictions.map((prediction) => {
            const bestValueBet = prediction.valueBets?.find(vb => vb.recommend);
            const totalGoals = prediction.predictions.totalGoals;
            
            return (
              <tr key={prediction.id} className="border-b border-gray-100 hover:bg-gradient-to-r hover:from-emerald-50/50 hover:to-blue-50/50 transition-all duration-300">
                {/* Match */}
                <td className="px-8 py-6">
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-gradient-to-r from-emerald-500 to-blue-600 rounded-full"></div>
                      <div className="text-sm font-bold text-gray-900">
                        {prediction.homeTeam}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"></div>
                      <div className="text-sm font-bold text-gray-700">
                        {prediction.awayTeam}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 mt-2 pt-2 border-t border-gray-100">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        📅 {new Date(prediction.date).toLocaleDateString('it-IT')}
                      </span>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        🏆 {prediction.league}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Expected Goals */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-center">
                    <div className="text-lg font-bold text-gray-900 mb-1">
                      {formatGoals(prediction.predictions.homeGoals)} - {formatGoals(prediction.predictions.awayGoals)}
                    </div>
                    <div className="text-xs text-gray-500">
                      Total: {formatGoals(totalGoals)}
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>🏠 {formatGoals(prediction.predictions.homeGoals)}</span>
                      <span>✈️ {formatGoals(prediction.predictions.awayGoals)}</span>
                    </div>
                  </div>
                </td>

                {/* Probabilità 1X2 */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">🏠 Vittoria Casa:</span>
                      <span className="font-semibold text-green-600">
                        {formatPercentage(prediction.predictions.prob1)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">🤝 Pareggio:</span>
                      <span className="font-semibold text-blue-600">
                        {formatPercentage(prediction.predictions.probX)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">✈️ Vittoria Trasferta:</span>
                      <span className="font-semibold text-red-600">
                        {formatPercentage(prediction.predictions.prob2)}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Over/Under */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-center">
                    <div className="text-sm font-semibold text-gray-900 mb-2">
                      O/U 2.5
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Over 2.5:</span>
                        <span className={`font-semibold ${totalGoals > 2.5 ? 'text-green-600' : 'text-gray-500'}`}>
                          {totalGoals > 2.5 ? formatPercentage(65) : formatPercentage(35)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Under 2.5:</span>
                        <span className={`font-semibold ${totalGoals <= 2.5 ? 'text-green-600' : 'text-gray-500'}`}>
                          {totalGoals <= 2.5 ? formatPercentage(65) : formatPercentage(35)}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      BTTS: {totalGoals > 1.8 && prediction.predictions.homeGoals > 0.7 && prediction.predictions.awayGoals > 0.7 ? '62%' : '38%'}
                    </div>
                  </div>
                </td>

                {/* Confidence */}
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getConfidenceColor(prediction.confidence)}`}>
                    {formatPercentage(prediction.confidence)}
                  </div>
                  <div className="mt-2">
                    <StrengthBadge strength={prediction.strength as any} />
                  </div>
                </td>

                {/* Value Betting */}
                <td className="px-6 py-4 whitespace-nowrap">
                  {prediction.valueBets && prediction.valueBets.length > 0 ? (
                    <div className="space-y-2">
                      {prediction.valueBets.map((vb: ValueBet, idx: number) => (
                        <div key={idx} className={`text-xs p-2 rounded border ${vb.recommend ? getValueBetColor(vb.value) : 'text-gray-400 bg-gray-50'}`}>
                          <div className="font-semibold">
                            {vb.market}: {vb.selection}
                          </div>
                          <div className="flex justify-between mt-1">
                            <span>Odds: {vb.odds.toFixed(2)}</span>
                            <span>Value: {vb.value.toFixed(1)}%</span>
                          </div>
                          {vb.recommend && (
                            <div className="text-xs font-semibold text-green-700 mt-1">
                              💰 Kelly: {vb.kelly.toFixed(1)}%
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 text-center">
                      Nessun value bet
                    </div>
                  )}
                </td>

                {/* Raccomandazione */}
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  {bestValueBet ? (
                    <div className="space-y-2">
                      <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                        🎯 GIOCA
                      </div>
                      <div className="text-xs text-gray-600">
                        {bestValueBet.selection}
                      </div>
                      <div className="text-xs font-semibold text-green-600">
                        ROI: +{bestValueBet.value.toFixed(1)}%
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                        ⏸️ SKIP
                      </div>
                      <div className="text-xs text-gray-500">
                        Nessun valore
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      
      {/* Legend */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-semibold text-gray-800 mb-2">📊 Legenda:</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
          <div>
            <p><strong>Expected Goals:</strong> Media gol attesi basata su Enhanced Algorithm</p>
            <p><strong>Confidence:</strong> Affidabilità predizione (Shannon entropy + fattori)</p>
          </div>
          <div>
            <p><strong>Value Betting:</strong> Opportunità con ROI positivo (Kelly Criterion)</p>
            <p><strong>🎯 GIOCA:</strong> Value bet raccomandato • <strong>⏸️ SKIP:</strong> Nessun valore</p>
          </div>
        </div>
      </div>
    </div>
  );
}