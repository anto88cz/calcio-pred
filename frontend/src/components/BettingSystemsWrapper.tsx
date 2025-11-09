'use client';

import { useState } from 'react';
import IntegralSystemGenerator from './IntegralSystemGenerator';
import SimpleMultipleGenerator from './SimpleMultipleGenerator';

interface Match {
  id: number;
  homeTeam: string;
  awayTeam: string;
  time: string;
  date: string;
  competition: string;
  homeTeamId: number;
  awayTeamId: number;
  seasonId: number;
  leagueId: number;
}

interface BettingSystemsWrapperProps {
  matches: Match[];
}

export default function BettingSystemsWrapper({ matches }: BettingSystemsWrapperProps) {
  const [activeTab, setActiveTab] = useState<'integral' | 'simple'>('integral');

  return (
    <div className="w-full">
      {/* Tab Selector */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('integral')}
          className={`flex-1 py-4 px-6 rounded-lg font-bold text-lg transition-all ${
            activeTab === 'integral'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg scale-105'
              : 'bg-slate-800/50 text-gray-400 hover:bg-slate-700/50'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl">🎰</span>
            <span>Sistema Integrale</span>
          </div>
          <div className="text-xs mt-1 opacity-80">
            Multi-colonna con coperture
          </div>
        </button>

        <button
          onClick={() => setActiveTab('simple')}
          className={`flex-1 py-4 px-6 rounded-lg font-bold text-lg transition-all ${
            activeTab === 'simple'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg scale-105'
              : 'bg-slate-800/50 text-gray-400 hover:bg-slate-700/50'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl">🎯</span>
            <span>Multipla Semplice</span>
          </div>
          <div className="text-xs mt-1 opacity-80">
            1 evento per partita
          </div>
        </button>
      </div>

      {/* Content */}
      <div className="transition-all duration-300">
        {activeTab === 'integral' && <IntegralSystemGenerator matches={matches} />}
        {activeTab === 'simple' && <SimpleMultipleGenerator matches={matches} />}
      </div>
    </div>
  );
}
