/**
 * Tooltip con info dettagliate
 */

'use client';

import { useState } from 'react';
import { CONFIDENCE_COLORS, DATA_QUALITY_LABELS, type Prediction, type ConfidenceLevel, type DataQuality } from '@/types';

interface PredictionTooltipProps {
  prediction: Prediction;
  children: React.ReactNode;
}

export default function PredictionTooltip({ prediction, children }: PredictionTooltipProps) {
  const [show, setShow] = useState(false);
  
  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {children}
      </div>
      
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-xl">
          {/* Arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
            <div className="w-2 h-2 bg-gray-900 rotate-45"></div>
          </div>
          
          {/* Content */}
          <div className="space-y-2">
            <div>
              <p className="font-semibold text-gray-300">Match Analizzati</p>
              <p>
                Casa: {prediction.homeMatchesUsed} / Trasferta: {prediction.awayMatchesUsed}
              </p>
            </div>
            
            <div>
              <p className="font-semibold text-gray-300">Confidence</p>
              <p className={CONFIDENCE_COLORS[prediction.confidenceLevel as ConfidenceLevel]}>
                {(prediction.confidence * 100).toFixed(1)}% ({prediction.confidenceLevel.replace('_', ' ')})
              </p>
            </div>
            
            <div>
              <p className="font-semibold text-gray-300">Qualità Dati</p>
              <p>{DATA_QUALITY_LABELS[prediction.dataQuality as DataQuality]}</p>
            </div>
            
            <div className="flex gap-4 text-xs">
              {prediction.hasLineup && <span className="text-green-400">✓ Formazioni</span>}
              {prediction.hasInjuries && <span className="text-yellow-400">⚠ Infortuni</span>}
            </div>
            
            <div className="pt-2 border-t border-gray-700 text-xs text-gray-400">
              <p>Sorgente: API-FOOTBALL</p>
              <p>Calcolo: 60% Empirico + 40% Poisson</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
