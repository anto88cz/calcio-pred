'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface BacktestEvent {
  fixture: {
    id: number;
    homeTeam: string;
    awayTeam: string;
    league: string;
  };
  recommendation: {
    prediction: string;
    odds: number;
    confidence: number;
    expectedValue: number;
  };
  actualResult: string;
  won: boolean;
}

interface BacktestResult {
  date: string;
  capital: number;
  stake: number;
  odds: number;
  events: BacktestEvent[];
  won: boolean;
  profit: number;
}

interface BacktestSummary {
  initialCapital: number;
  finalCapital: number;
  totalProfit: number;
  roi: number;
  totalBets: number;
  won: number;
  lost: number;
  winRate: number;
}

export default function BacktestPage() {
  const [startDate, setStartDate] = useState('2025-09-01');
  const [endDate, setEndDate] = useState('2025-11-25');
  const [initialCapital, setInitialCapital] = useState(100);
  const [stakePercentage, setStakePercentage] = useState(30);
  const [targetOdds, setTargetOdds] = useState(1.4);
  const [minOdds, setMinOdds] = useState(1.4);
  const [maxOdds, setMaxOdds] = useState(4.0);
  
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentDate, setCurrentDate] = useState('');
  const [totalDays, setTotalDays] = useState(0);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleBacktest = async () => {
    setLoading(true);
    setError(null);
    setProgress(0);
    setResults([]);
    setSummary(null);

    try {
      const response = await fetch('http://localhost:3001/api/backtest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
          initialCapital,
          stakePercentage: stakePercentage / 100,
          targetOdds,
          minOdds,
          maxOdds,
        }),
      });

      if (!response.ok) {
        throw new Error('Errore durante il backtest');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          const eventMatch = line.match(/^event: (.+)$/m);
          const dataMatch = line.match(/^data: (.+)$/m);

          if (eventMatch && dataMatch) {
            const event = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);

            if (event === 'init') {
              setTotalDays(data.totalDays);
            } else if (event === 'progress') {
              setProgress(data.percentage);
              setCurrentDate(data.date);
            } else if (event === 'update') {
              setResults(prev => [...prev, data.result]);
              setSummary(data.summary);
            } else if (event === 'complete') {
              setSummary(data.summary);
              setResults(data.results);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-100 mb-8">📊 Backtest Analyzer</h1>

        {/* Form */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Data Inizio</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Data Fine</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Capitale Iniziale (€)</label>
              <input
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Stake (%)</label>
              <input
                type="number"
                value={stakePercentage}
                onChange={(e) => setStakePercentage(Number(e.target.value))}
                min="1"
                max="100"
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Target Odds</label>
              <input
                type="number"
                step="0.1"
                value={targetOdds}
                onChange={(e) => setTargetOdds(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Min Odds</label>
              <input
                type="number"
                step="0.1"
                value={minOdds}
                onChange={(e) => setMinOdds(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Max Odds</label>
              <input
                type="number"
                step="0.1"
                value={maxOdds}
                onChange={(e) => setMaxOdds(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            onClick={handleBacktest}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium py-3 px-4 rounded-md transition-colors"
          >
            {loading ? `Elaborazione... ${progress}% (${currentDate})` : 'Avvia Backtest'}
          </button>

          {loading && (
            <div className="mt-4">
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-400 mt-2 text-center">
                {currentDate ? `Analisi: ${currentDate} (${progress}%)` : 'Inizializzazione...'}
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-900/20 border border-red-500 rounded-md">
              <p className="text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-6">
              <h3 className="text-sm font-medium text-gray-400 mb-2">ROI</h3>
              <p className={`text-3xl font-bold ${summary.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {summary.roi >= 0 ? '+' : ''}{summary.roi.toFixed(2)}%
              </p>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-6">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Capitale Finale</h3>
              <p className="text-3xl font-bold text-gray-100">€{summary.finalCapital.toFixed(2)}</p>
              <p className={`text-sm ${summary.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {summary.totalProfit >= 0 ? '+' : ''}€{summary.totalProfit.toFixed(2)}
              </p>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-6">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Win Rate</h3>
              <p className="text-3xl font-bold text-gray-100">{summary.winRate.toFixed(1)}%</p>
              <p className="text-sm text-gray-400">{summary.won}W - {summary.lost}L</p>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-6">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Scommesse Totali</h3>
              <p className="text-3xl font-bold text-gray-100">{summary.totalBets}</p>
              <p className="text-sm text-gray-400">{totalDays || results.length} giorni</p>
            </div>
          </div>
        )}

        {/* Chart */}
        {results.length > 0 && (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-100 mb-4">Andamento Capitale</h2>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={results}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: '1px solid #374151',
                    borderRadius: '0.5rem',
                  }}
                  labelStyle={{ color: '#F3F4F6' }}
                />
                <Legend wrapperStyle={{ color: '#9CA3AF' }} />
                <Line type="monotone" dataKey="capital" stroke="#3B82F6" strokeWidth={2} name="Capitale (€)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Results Table */}
        {results.length > 0 && (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Data</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Partite</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Quota</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Stake</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Risultato</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Profitto</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Capitale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {results.map((result, idx) => (
                    <tr key={idx} className={result.won ? 'bg-green-900/20' : 'bg-red-900/20'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{result.date}</td>
                      <td className="px-6 py-4 text-sm text-gray-300">
                        {result.events.map((e, i) => (
                          <div key={i} className="text-xs">
                            {e.fixture.homeTeam} - {e.fixture.awayTeam}: {e.recommendation.prediction}
                          </div>
                        ))}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{result.odds.toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">€{result.stake.toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${result.won ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {result.won ? 'VINTA' : 'PERSA'}
                        </span>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${result.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {result.profit >= 0 ? '+' : ''}€{result.profit.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">€{result.capital.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
