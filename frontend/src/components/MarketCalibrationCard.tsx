/**
 * Market Calibration Card Component
 * Display model vs market comparison and value bets
 */

import React from 'react';
import type { MarketCalibration } from '@/types';

interface MarketCalibrationCardProps {
  calibration: MarketCalibration;
}

export default function MarketCalibrationCard({ calibration }: MarketCalibrationCardProps) {
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
  
  const getAgreementColor = (agreement: number) => {
    if (agreement >= 0.8) return 'text-green-600 bg-green-50';
    if (agreement >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-orange-600 bg-orange-50';
  };

  const getAgreementEmoji = (agreement: number) => {
    if (agreement >= 0.8) return '🟢';
    if (agreement >= 0.6) return '🟡';
    return '🟠';
  };

  const getValueBetColor = (ev: number) => {
    if (ev >= 1.0) return 'text-purple-700 bg-purple-100 border-purple-300'; // EV > 100% = MEGA VALUE
    if (ev >= 0.5) return 'text-green-700 bg-green-100 border-green-300'; // EV > 50% = STRONG VALUE
    if (ev >= 0.2) return 'text-blue-700 bg-blue-100 border-blue-300'; // EV > 20% = GOOD VALUE
    return 'text-gray-700 bg-gray-100 border-gray-300'; // EV < 20% = WEAK VALUE
  };

  const getValueBetEmoji = (ev: number) => {
    if (ev >= 1.0) return '🚀'; // Mega value
    if (ev >= 0.5) return '💰'; // Strong value
    if (ev >= 0.2) return '💵'; // Good value
    return '💸'; // Weak value
  };

  // Progress bar component
  const ProbabilityBar = ({ 
    label, 
    value, 
    color 
  }: { 
    label: string; 
    value: number; 
    color: string;
  }) => (
    <div className="flex items-center gap-3">
      <div className="w-24 text-sm font-medium text-gray-300">{label}</div>
      <div className="flex-1 bg-white/5 rounded-full h-6 relative overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-500 flex items-center justify-end pr-2`}
          style={{ width: `${value * 100}%` }}
        >
          <span className="text-xs font-bold text-white drop-shadow-lg">
            {formatPercent(value)}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="glass-card p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-3xl">📊</div>
          <div>
            <h3 className="text-xl font-bold gradient-text">Calibrazione Mercato</h3>
            <p className="text-sm text-gray-400">Modello vs Bookmaker</p>
          </div>
        </div>
        
        {/* Agreement badge */}
        <div className={`px-4 py-2 rounded-full font-bold text-sm ${getAgreementColor(calibration.agreement)}`}>
          {getAgreementEmoji(calibration.agreement)} Accordo {formatPercent(calibration.agreement)}
        </div>
      </div>

      {/* Confidence boost */}
      {calibration.confidenceBoost > 0 && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 flex items-center gap-3">
          <div className="text-2xl">⬆️</div>
          <div>
            <div className="font-bold text-green-400">Bonus Confidenza Applicato</div>
            <div className="text-sm text-gray-400">
              +{formatPercent(calibration.confidenceBoost)} aumento confidenza grazie all'accordo modello-mercato
            </div>
          </div>
        </div>
      )}

      {/* Probabilities comparison */}
      <div className="space-y-4">
        <h4 className="font-bold text-white flex items-center gap-2">
          <span>⚖️</span> Confronto Probabilità
        </h4>
        
        <div className="space-y-3">
          {/* Home Win (1) */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-gray-400 uppercase">Vittoria Casa (1)</div>
            <ProbabilityBar 
              label="Modello" 
              value={calibration.modelProbabilities.prob1} 
              color="bg-gradient-to-r from-gray-500 to-gray-600" 
            />
            <ProbabilityBar 
              label="Mercato" 
              value={calibration.marketProbabilities.prob1} 
              color="bg-gradient-to-r from-blue-500 to-blue-600" 
            />
            <ProbabilityBar 
              label="Calibrato" 
              value={calibration.calibratedProbabilities.prob1} 
              color="bg-gradient-to-r from-green-500 to-emerald-600" 
            />
          </div>

          {/* Draw (X) */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-gray-400 uppercase">Pareggio (X)</div>
            <ProbabilityBar 
              label="Modello" 
              value={calibration.modelProbabilities.probX} 
              color="bg-gradient-to-r from-gray-500 to-gray-600" 
            />
            <ProbabilityBar 
              label="Mercato" 
              value={calibration.marketProbabilities.probX} 
              color="bg-gradient-to-r from-blue-500 to-blue-600" 
            />
            <ProbabilityBar 
              label="Calibrato" 
              value={calibration.calibratedProbabilities.probX} 
              color="bg-gradient-to-r from-green-500 to-emerald-600" 
            />
          </div>

          {/* Away Win (2) */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-gray-400 uppercase">Vittoria Trasferta (2)</div>
            <ProbabilityBar 
              label="Modello" 
              value={calibration.modelProbabilities.prob2} 
              color="bg-gradient-to-r from-gray-500 to-gray-600" 
            />
            <ProbabilityBar 
              label="Mercato" 
              value={calibration.marketProbabilities.prob2} 
              color="bg-gradient-to-r from-blue-500 to-blue-600" 
            />
            <ProbabilityBar 
              label="Calibrato" 
              value={calibration.calibratedProbabilities.prob2} 
              color="bg-gradient-to-r from-green-500 to-emerald-600" 
            />
          </div>
        </div>
      </div>

      {/* Value Bets */}
      {calibration.valueBets.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-bold text-white flex items-center gap-2">
            <span>💰</span> Scommesse di Valore Rilevate ({calibration.valueBets.length})
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {calibration.valueBets.map((bet, idx) => (
              <div 
                key={idx}
                className={`border-2 rounded-xl p-4 ${getValueBetColor(bet.expectedValue)}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getValueBetEmoji(bet.expectedValue)}</span>
                    <span className="font-bold text-lg">{bet.market}</span>
                  </div>
                  <div className="text-sm font-bold">
                    +{formatPercent(bet.expectedValue)} EV
                  </div>
                </div>
                
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Modello:</span>
                    <span className="font-bold">{formatPercent(bet.modelProb)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Mercato:</span>
                    <span className="font-bold">{formatPercent(bet.marketProb)}</span>
                  </div>
                  <div className="flex justify-between border-t border-current/20 pt-1">
                    <span className="text-gray-600">Vantaggio:</span>
                    <span className="font-bold text-lg">+{formatPercent(bet.difference)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Quota:</span>
                    <span className="font-mono">{bet.marketOdds.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Value bet legend */}
          <div className="bg-white/5 rounded-lg p-3 text-xs text-gray-400">
            <div className="font-bold mb-2">💡 Guida Scommesse di Valore:</div>
            <div className="grid grid-cols-2 gap-2">
              <div>🚀 <span className="font-semibold">Mega Valore</span>: EV &gt; 100%</div>
              <div>💰 <span className="font-semibold">Valore Forte</span>: EV 50-100%</div>
              <div>💵 <span className="font-semibold">Buon Valore</span>: EV 20-50%</div>
              <div>💸 <span className="font-semibold">Valore Debole</span>: EV 10-20%</div>
            </div>
          </div>
        </div>
      )}

      {/* Market info */}
      <div className="bg-white/5 rounded-lg p-3 text-sm text-gray-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>📚</span>
          <span>Bookmaker: {calibration.marketProbabilities.bookmakerCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>🔄</span>
          <span>Blend: 70% Modello + 30% Mercato</span>
        </div>
      </div>
    </div>
  );
}
