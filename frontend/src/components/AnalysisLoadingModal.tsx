'use client';

import { useEffect, useState } from 'react';

interface AnalysisLoadingModalProps {
  isOpen: boolean;
  homeTeam: string;
  awayTeam: string;
}

const analysisSteps = [
  { message: 'Recupero dati storici delle squadre', emoji: '📊' },
  { message: 'Analisi degli ultimi 20 incontri', emoji: '🔍' },
  { message: 'Calcolo Expected Goals (xG)', emoji: '⚽' },
  { message: 'Valutazione forza offensiva e difensiva', emoji: '💪' },
  { message: 'Analisi Head-to-Head', emoji: '🤝' },
  { message: 'Calcolo probabilità Poisson', emoji: '📈' },
  { message: 'Generazione predizioni finali', emoji: '🎯' },
  { message: 'Ottimizzazione risultati', emoji: '✨' },
];

export default function AnalysisLoadingModal({ isOpen, homeTeam, awayTeam }: AnalysisLoadingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0);
      setProgress(0);
      return;
    }

    // Simula il progresso attraverso gli step
    const stepDuration = 800; // 800ms per step
    const totalSteps = analysisSteps.length;
    
    const stepInterval = setInterval(() => {
      setCurrentStep(prev => {
        if (prev < totalSteps - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, stepDuration);

    // Aggiorna la percentuale di progresso in modo fluido
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev < 98) {
          return prev + 1;
        }
        return prev;
      });
    }, stepDuration / 12); // Circa 12 incrementi per step

    return () => {
      clearInterval(stepInterval);
      clearInterval(progressInterval);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl">
        {/* Glow Effect */}
        <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/30 via-purple-500/30 to-emerald-500/30 rounded-3xl blur-3xl animate-pulse"></div>
        
        {/* Modal Content */}
        <div className="relative bg-gradient-to-br from-slate-900/95 to-slate-800/95 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-600 via-purple-600 to-emerald-600 rounded-full mb-4 shadow-2xl">
              <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center">
                <span className="text-4xl animate-bounce">{analysisSteps[currentStep]?.emoji}</span>
              </div>
            </div>
            
            <h2 className="text-3xl font-black text-white mb-2">
              🤖 AI Processing
            </h2>
            <p className="text-lg text-gray-300 font-semibold">
              {homeTeam} <span className="text-purple-400">vs</span> {awayTeam}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-bold text-gray-300">Progresso Analisi</span>
              <span className="text-2xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
                {progress}%
              </span>
            </div>
            
            <div className="relative h-4 bg-slate-700/50 rounded-full overflow-hidden border border-white/10">
              <div 
                className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 transition-all duration-300 ease-out rounded-full"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent animate-shimmer"></div>
              </div>
            </div>
          </div>

          {/* Current Step */}
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-700/80 border border-white/10 rounded-2xl p-6 mb-6">
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-2xl">{analysisSteps[currentStep]?.emoji}</span>
              </div>
              <div className="flex-1">
                <div className="text-sm text-gray-400 font-semibold mb-1">
                  Step {currentStep + 1} di {analysisSteps.length}
                </div>
                <div className="text-lg font-bold text-white">
                  {analysisSteps[currentStep]?.message}
                </div>
              </div>
              <div className="flex-shrink-0">
                <div className="w-6 h-6 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
              </div>
            </div>
          </div>

          {/* Steps List */}
          <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800/50">
            {analysisSteps.map((step, index) => {
              const isCompleted = index < currentStep;
              const isCurrent = index === currentStep;
              const isPending = index > currentStep;

              return (
                <div
                  key={index}
                  className={`flex items-center space-x-3 p-3 rounded-xl transition-all duration-300 ${
                    isCurrent ? 'bg-blue-500/20 border border-blue-500/30 scale-105' :
                    isCompleted ? 'bg-green-500/10 border border-green-500/20' :
                    'bg-slate-800/30 border border-slate-700/30 opacity-50'
                  }`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                    isCompleted ? 'bg-green-500 text-white' :
                    isCurrent ? 'bg-blue-500 text-white' :
                    'bg-slate-700 text-gray-400'
                  }`}>
                    {isCompleted ? '✓' : index + 1}
                  </div>
                  <span className={`text-xl ${isCurrent ? 'animate-bounce' : ''}`}>
                    {step.emoji}
                  </span>
                  <span className={`flex-1 text-sm font-semibold ${
                    isCurrent ? 'text-white' :
                    isCompleted ? 'text-green-300' :
                    'text-gray-400'
                  }`}>
                    {step.message}
                  </span>
                  {isCurrent && (
                    <div className="flex-shrink-0 flex space-x-1">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer Note */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-400">
              L'analisi può richiedere alcuni secondi per completarsi
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
