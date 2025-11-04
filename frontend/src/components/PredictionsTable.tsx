/**
 * Tabella Predictions con fixtures
 */

'use client';

import { useState } from 'react';
import { usePredictions } from '@/lib/api';
import StrengthBadge from './StrengthBadge';
import PredictionTooltip from './PredictionTooltip';
import type { StrengthFilter, Prediction } from '@/types';

export default function PredictionsTable() {
  const [strengthFilter, setStrengthFilter] = useState<StrengthFilter>('ALL');
  const [days, setDays] = useState(0);
  
  const { data: predictions, isLoading, error } = usePredictions({
    strengthFilter,
    days,
  });
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
        <p className="font-semibold">Errore nel caricamento</p>
        <p className="text-sm">{(error as Error).message}</p>
      </div>
    );
  }
  
  if (!predictions || predictions.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center text-gray-600">
        <p className="text-lg font-semibold mb-2">Nessuna predizione disponibile</p>
        <p className="text-sm">Prova a cambiare i filtri o calcolare nuove predizioni</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Filtri */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mostra
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setStrengthFilter('ALL')}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  strengthFilter === 'ALL'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Tutte
              </button>
              <button
                onClick={() => setStrengthFilter('GIOCALA')}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  strengthFilter === 'GIOCALA'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                🟩 Solo GIOCALA
              </button>
              <button
                onClick={() => setStrengthFilter('STRONG_PLUS')}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  strengthFilter === 'STRONG_PLUS'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                🟢 Forti + Giocala
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Periodo
            </label>
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={0}>Oggi</option>
              <option value={1}>Domani</option>
              <option value={2}>Prossimi 2 giorni</option>
              <option value={3}>Prossimi 3 giorni</option>
              <option value={7}>Prossimi 7 giorni</option>
            </select>
          </div>
          
          <div className="ml-auto text-sm text-gray-600">
            <p className="font-semibold">{predictions.length} partite trovate</p>
          </div>
        </div>
      </div>
      
      {/* Tabella */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Partita
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data/Ora
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  1X2
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Over 2.5
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  BTTS
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Doppia Chance
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Confidence
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {predictions.map((prediction) => (
                <PredictionRow key={prediction.id} prediction={prediction} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================
// ROW COMPONENT
// ============================================

interface PredictionRowProps {
  prediction: Prediction;
}

function PredictionRow({ prediction }: PredictionRowProps) {
  const fixture = prediction.fixture;
  
  if (!fixture) return null;
  
  const matchDate = new Date(fixture.date);
  const dateStr = matchDate.toLocaleDateString('it-IT', { 
    day: '2-digit', 
    month: '2-digit' 
  });
  const timeStr = matchDate.toLocaleTimeString('it-IT', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  // Determina risultato 1X2 più probabile
  const max1X2 = Math.max(prediction.finalProb1, prediction.finalProbX, prediction.finalProb2);
  const result1X2 = 
    prediction.finalProb1 === max1X2 ? '1' :
    prediction.finalProbX === max1X2 ? 'X' : '2';
  const prob1X2 = max1X2;
  
  // Over 2.5
  const isOver25 = prediction.finalOver25 > prediction.finalUnder25;
  const probOver25 = isOver25 ? prediction.finalOver25 : prediction.finalUnder25;
  const labelOver25 = isOver25 ? 'Over 2.5' : 'Under 2.5';
  
  // BTTS
  const isBttsYes = prediction.finalBttsYes > prediction.finalBttsNo;
  const probBtts = isBttsYes ? prediction.finalBttsYes : prediction.finalBttsNo;
  const labelBtts = isBttsYes ? 'GG' : 'NG';
  
  // Doppia Chance - migliore
  const maxDC = Math.max(prediction.final1X, prediction.final12, prediction.finalX2);
  const dcLabel = 
    prediction.final1X === maxDC ? '1X' :
    prediction.final12 === maxDC ? '12' : 'X2';
  const probDC = maxDC;
  const strengthDC = 
    prediction.final1X === maxDC ? prediction.strength1X :
    prediction.final12 === maxDC ? prediction.strength12 : prediction.strengthX2;
  
  return (
    <PredictionTooltip prediction={prediction}>
      <tr className="hover:bg-gray-50 cursor-pointer transition">
        <td className="px-6 py-4">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {fixture.homeTeam.name} vs {fixture.awayTeam.name}
            </p>
            <p className="text-xs text-gray-500">
              {fixture.leagueName} - {fixture.round}
            </p>
          </div>
        </td>
        
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="text-sm text-gray-900">{dateStr}</div>
          <div className="text-xs text-gray-500">{timeStr}</div>
        </td>
        
        <td className="px-6 py-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <StrengthBadge strength={prediction.strength1X2} size="sm" />
            <span className="text-xs font-medium text-gray-700">
              {result1X2}: {(prob1X2 * 100).toFixed(0)}%
            </span>
          </div>
        </td>
        
        <td className="px-6 py-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <StrengthBadge strength={prediction.strengthOver25} size="sm" />
            <span className="text-xs font-medium text-gray-700">
              {labelOver25}: {(probOver25 * 100).toFixed(0)}%
            </span>
          </div>
        </td>
        
        <td className="px-6 py-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <StrengthBadge strength={prediction.strengthBtts} size="sm" />
            <span className="text-xs font-medium text-gray-700">
              {labelBtts}: {(probBtts * 100).toFixed(0)}%
            </span>
          </div>
        </td>
        
        <td className="px-6 py-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <StrengthBadge strength={strengthDC} size="sm" />
            <span className="text-xs font-medium text-gray-700">
              {dcLabel}: {(probDC * 100).toFixed(0)}%
            </span>
          </div>
        </td>
        
        <td className="px-6 py-4 text-center">
          <div className="text-sm font-medium text-gray-900">
            {(prediction.confidence * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-gray-500">
            {prediction.confidenceLevel.replace('_', ' ')}
          </div>
        </td>
      </tr>
    </PredictionTooltip>
  );
}
