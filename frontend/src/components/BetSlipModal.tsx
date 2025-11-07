'use client';

import { useState } from 'react';
import { BettingRecommendation } from '@/lib/betting-recommendations';

interface BetSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: BetSlipConfig) => void;
  isLoading?: boolean;
}

export interface BetSlipConfig {
  numEvents: number;
  minProbability: number;
  maxRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  includeCombo: boolean;
  minOdds: number;
  maxOdds: number;
}

export default function BetSlipModal({ isOpen, onClose, onGenerate, isLoading }: BetSlipModalProps) {
  const [config, setConfig] = useState<BetSlipConfig>({
    numEvents: 3,
    minProbability: 60,
    maxRisk: 'MEDIUM',
    includeCombo: true,
    minOdds: 1.30,
    maxOdds: 3.00,
  });

  if (!isOpen) return null;

  const handleGenerate = () => {
    onGenerate(config);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 rounded-xl border border-gray-700 max-w-2xl w-full shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center">
                <span className="text-3xl mr-3">🎰</span>
                Genera Schedina Automatica
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                Configura i parametri per generare una schedina ottimizzata
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

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Numero Eventi */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-3">
              Numero di Eventi nella Schedina
            </label>
            <div className="flex items-center space-x-4">
              <input
                type="range"
                min="2"
                max="10"
                value={config.numEvents}
                onChange={(e) => setConfig({ ...config, numEvents: parseInt(e.target.value) })}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="w-16 text-center">
                <span className="text-2xl font-bold text-blue-400">{config.numEvents}</span>
                <div className="text-xs text-gray-400">eventi</div>
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Min: 2</span>
              <span>Max: 10</span>
            </div>
          </div>

          {/* Probabilità Minima */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-3">
              Probabilità Minima per Evento
            </label>
            <div className="flex items-center space-x-4">
              <input
                type="range"
                min="50"
                max="90"
                step="5"
                value={config.minProbability}
                onChange={(e) => setConfig({ ...config, minProbability: parseInt(e.target.value) })}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
              <div className="w-16 text-center">
                <span className="text-2xl font-bold text-green-400">{config.minProbability}%</span>
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Solo eventi con probabilità ≥ {config.minProbability}%
            </div>
          </div>

          {/* Rischio Massimo */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-3">
              Livello di Rischio Massimo
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setConfig({ ...config, maxRisk: 'LOW' })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  config.maxRisk === 'LOW'
                    ? 'border-green-500 bg-green-900/30 text-green-300'
                    : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                }`}
              >
                <div className="text-2xl mb-1">🛡️</div>
                <div className="font-semibold">LOW</div>
                <div className="text-xs mt-1">Sicuro</div>
              </button>
              <button
                onClick={() => setConfig({ ...config, maxRisk: 'MEDIUM' })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  config.maxRisk === 'MEDIUM'
                    ? 'border-yellow-500 bg-yellow-900/30 text-yellow-300'
                    : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                }`}
              >
                <div className="text-2xl mb-1">⚖️</div>
                <div className="font-semibold">MEDIUM</div>
                <div className="text-xs mt-1">Bilanciato</div>
              </button>
              <button
                onClick={() => setConfig({ ...config, maxRisk: 'HIGH' })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  config.maxRisk === 'HIGH'
                    ? 'border-red-500 bg-red-900/30 text-red-300'
                    : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                }`}
              >
                <div className="text-2xl mb-1">🎲</div>
                <div className="font-semibold">HIGH</div>
                <div className="text-xs mt-1">Rischioso</div>
              </button>
            </div>
          </div>

          {/* Range Quote */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-3">
                Quota Minima
              </label>
              <input
                type="number"
                min="1.01"
                max="2.00"
                step="0.10"
                value={config.minOdds}
                onChange={(e) => setConfig({ ...config, minOdds: parseFloat(e.target.value) })}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-3">
                Quota Massima
              </label>
              <input
                type="number"
                min="1.50"
                max="10.00"
                step="0.50"
                value={config.maxOdds}
                onChange={(e) => setConfig({ ...config, maxOdds: parseFloat(e.target.value) })}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Includi Combo */}
          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <div>
              <div className="font-semibold text-white">Includi Scommesse Combo</div>
              <div className="text-xs text-gray-400 mt-1">
                Es: 1+Goal, 1X+Over2.5, ecc.
              </div>
            </div>
            <button
              onClick={() => setConfig({ ...config, includeCombo: !config.includeCombo })}
              className={`relative w-14 h-7 rounded-full transition-colors ${
                config.includeCombo ? 'bg-green-600' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
                  config.includeCombo ? 'translate-x-7' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
            <div className="flex items-start space-x-3">
              <span className="text-2xl">ℹ️</span>
              <div className="text-sm text-blue-300">
                <div className="font-semibold mb-1">Come funziona</div>
                <div className="text-xs text-blue-200 leading-relaxed">
                  L'algoritmo analizzerà tutte le partite di oggi e selezionerà automaticamente i <span className="font-semibold">{config.numEvents} migliori eventi</span> basandosi su probabilità, confidence e value rating. La schedina sarà ottimizzata per massimizzare le tue possibilità di vincita.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition"
          >
            Annulla
          </button>
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            className="px-8 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg font-semibold hover:from-green-500 hover:to-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Generazione...</span>
              </>
            ) : (
              <>
                <span>🎯</span>
                <span>Genera Schedina</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
