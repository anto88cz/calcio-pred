'use client';

import { Suspense } from 'react';
import AnalysisContent from './AnalysisContent';

export default function AnalysisPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-blue-600/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-400">Caricamento...</p>
        </div>
      </div>
    }>
      <AnalysisContent />
    </Suspense>
  );
}
