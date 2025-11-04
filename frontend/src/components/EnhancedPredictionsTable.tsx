/**
 * Clean Predictions Table Component
 * Simple and professional design for match predictions
 */

'use client';

import { MatchPrediction } from '@/types';

interface PredictionsTableProps {
  predictions: MatchPrediction[];
}

export default function PredictionsTable({ predictions }: PredictionsTableProps) {
  
  return (
    <div className="w-full bg-white rounded-lg shadow-lg overflow-hidden">
      <table className="w-full table-auto border-collapse">
        <thead>
          <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
            <th className="px-4 py-4 text-left text-xs font-black text-gray-700 uppercase tracking-wider border-b-2 border-gray-200">
              <div className="flex items-center space-x-2">
                <span>⚽</span>
                <span>Match</span>
              </div>
            </th>
            <th className="px-3 py-4 text-center text-xs font-black text-gray-700 uppercase tracking-wider border-b-2 border-gray-200">
              <div className="flex items-center justify-center space-x-1">
                <span>🎯</span>
                <span>xG</span>
              </div>
            </th>
            <th className="px-3 py-4 text-left text-xs font-black text-gray-700 uppercase tracking-wider border-b-2 border-gray-200">
              <div className="flex items-center space-x-1">
                <span>📊</span>
                <span>1X2</span>
              </div>
            </th>
            <th className="px-3 py-4 text-left text-xs font-black text-gray-700 uppercase tracking-wider border-b-2 border-gray-200">
              <div className="flex items-center space-x-1">
                <span>🔢</span>
                <span>Over/Under + BTTS</span>
              </div>
            </th>
            <th className="px-3 py-4 text-center text-xs font-black text-gray-700 uppercase tracking-wider border-b-2 border-gray-200">
              <div className="flex items-center justify-center space-x-1">
                <span>🔥</span>
                <span>Confidence</span>
              </div>
            </th>
            <th className="px-3 py-4 text-left text-xs font-black text-gray-700 uppercase tracking-wider border-b-2 border-gray-200">
              <div className="flex items-center space-x-1">
                <span>💎</span>
                <span>Value Bet</span>
              </div>
            </th>
            <th className="px-3 py-4 text-center text-xs font-black text-gray-700 uppercase tracking-wider border-b-2 border-gray-200">
              <div className="flex items-center justify-center space-x-1">
                <span>🎖️</span>
                <span>Consiglio</span>
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
                <td className="px-4 py-4">
                  <div className="flex flex-col space-y-1">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-gradient-to-r from-emerald-500 to-blue-600 rounded-full"></div>
                      <div className="text-sm font-bold text-gray-900">
                        {prediction.homeTeam}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"></div>
                      <div className="text-sm font-bold text-gray-700">
                        {prediction.awayTeam}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-gray-100">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        📅 {new Date(prediction.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        🏆 {prediction.league}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Expected Goals */}
                <td className="px-3 py-4 text-center">
                  <div className="text-center">
                    <div className="text-base font-bold text-gray-900 mb-1">
                      {formatGoals(prediction.predictions.homeGoals)} - {formatGoals(prediction.predictions.awayGoals)}
                    </div>
                    <div className="text-xs text-gray-500">
                      Tot: {formatGoals(totalGoals)}
                    </div>
                  </div>
                </td>

                {/* Probabilità 1X2 */}
                <td className="px-3 py-4">
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">🏠 Casa:</span>
                      <span className="font-semibold text-green-600">
                        {formatPercentage(prediction.predictions.prob1)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">🤝 X:</span>
                      <span className="font-semibold text-blue-600">
                        {formatPercentage(prediction.predictions.probX)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">✈️ Trasf:</span>
                      <span className="font-semibold text-red-600">
                        {formatPercentage(prediction.predictions.prob2)}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Over/Under */}
                <td className="px-6 py-4">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Over/Under 0.5 */}
                    {prediction.overUnder?.over05 !== undefined && (
                      <div className="text-xs bg-gray-50 rounded-lg p-2">
                        <div className="font-bold text-gray-700 mb-1 text-center">O/U 0.5</div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">O:</span>
                          <span className="font-semibold text-green-600">
                            {formatPercentage(prediction.overUnder.over05)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">U:</span>
                          <span className="font-semibold text-red-600">
                            {formatPercentage(prediction.overUnder.under05 || 0)}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* Over/Under 1.5 */}
                    {prediction.overUnder?.over15 !== undefined && (
                      <div className="text-xs bg-blue-50 rounded-lg p-2">
                        <div className="font-bold text-gray-700 mb-1 text-center">O/U 1.5</div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">O:</span>
                          <span className="font-semibold text-green-600">
                            {formatPercentage(prediction.overUnder.over15)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">U:</span>
                          <span className="font-semibold text-red-600">
                            {formatPercentage(prediction.overUnder.under15 || 0)}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* Over/Under 2.5 */}
                    {prediction.overUnder?.over25 !== undefined && (
                      <div className="text-xs bg-emerald-50 rounded-lg p-2">
                        <div className="font-bold text-gray-700 mb-1 text-center">O/U 2.5</div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">O:</span>
                          <span className="font-semibold text-green-600">
                            {formatPercentage(prediction.overUnder.over25)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">U:</span>
                          <span className="font-semibold text-red-600">
                            {formatPercentage(prediction.overUnder.under25 || 0)}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* Over/Under 3.5 */}
                    {prediction.overUnder?.over35 !== undefined && (
                      <div className="text-xs bg-amber-50 rounded-lg p-2">
                        <div className="font-bold text-gray-700 mb-1 text-center">O/U 3.5</div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">O:</span>
                          <span className="font-semibold text-green-600">
                            {formatPercentage(prediction.overUnder.over35)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">U:</span>
                          <span className="font-semibold text-red-600">
                            {formatPercentage(prediction.overUnder.under35 || 0)}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* Over/Under 4.5 */}
                    {prediction.overUnder?.over45 !== undefined && (
                      <div className="text-xs bg-orange-50 rounded-lg p-2">
                        <div className="font-bold text-gray-700 mb-1 text-center">O/U 4.5</div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">O:</span>
                          <span className="font-semibold text-green-600">
                            {formatPercentage(prediction.overUnder.over45)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">U:</span>
                          <span className="font-semibold text-red-600">
                            {formatPercentage(prediction.overUnder.under45 || 0)}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* BTTS */}
                    {prediction.btts && (
                      <div className="text-xs bg-purple-50 rounded-lg p-2 col-span-2">
                        <div className="font-bold text-gray-700 mb-1 text-center">BTTS</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Yes:</span>
                            <span className="font-semibold text-purple-600">
                              {formatPercentage(prediction.btts.yes)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">No:</span>
                            <span className="font-semibold text-gray-600">
                              {formatPercentage(prediction.btts.no)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </td>

                {/* Confidence */}
                <td className="px-3 py-4 text-center">
                  <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${getConfidenceColor(prediction.confidence)}`}>
                    {formatPercentage(prediction.confidence)}
                  </div>
                  <div className="mt-1">
                    <StrengthBadge strength={prediction.strength as any} />
                  </div>
                </td>

                {/* Value Betting */}
                <td className="px-3 py-4">
                  {prediction.valueBets && prediction.valueBets.length > 0 ? (
                    <div className="space-y-1">
                      {prediction.valueBets.map((vb: ValueBet, idx: number) => (
                        <div key={idx} className={`text-xs p-1.5 rounded border ${vb.recommend ? getValueBetColor(vb.value) : 'text-gray-400 bg-gray-50'}`}>
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
                <td className="px-3 py-4 text-center">
                  {bestValueBet ? (
                    <div className="space-y-1">
                      <div className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-bold">
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
                      <div className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold">
                        ⏸️ SKIP
                      </div>
                      <div className="text-xs text-gray-500">
                        No value
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
    </>
  );
}