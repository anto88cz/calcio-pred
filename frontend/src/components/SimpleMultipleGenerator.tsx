'use client';

import { useState, useEffect } from 'react';
import moment from 'moment-timezone';
import { ENV } from '@/config/env';

interface Recommendation {
  id: string;
  name: string;
  prediction: string;
  odds: number;
  confidence: number;
  valueRating: number;
  expectedValue: number;
}

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
  recommendations?: Recommendation[];
}

interface SimpleMultipleGeneratorProps {
  matches: Match[];
}

interface SelectedEvent {
  match: Match;
  recommendation: Recommendation;
  score: number;
}

export default function SimpleMultipleGenerator({ matches }: SimpleMultipleGeneratorProps) {
  const [loadingRecommendations, setLoadingRecommendations] = useState<Set<number>>(new Set());
  const [matchRecommendations, setMatchRecommendations] = useState<Map<number, Recommendation[]>>(new Map());
  const [loadingProgress, setLoadingProgress] = useState<string>('');
  const [shouldAutoGenerate, setShouldAutoGenerate] = useState(false);
  const [includeFinishedMatches, setIncludeFinishedMatches] = useState(false);
  
  // Configurazione multipla
  const [stake, setStake] = useState<number>(10);
  const [numMatches, setNumMatches] = useState<number>(5);
  const [targetOdds, setTargetOdds] = useState<number>(10);
  
  const [generatedMultiple, setGeneratedMultiple] = useState<{
    events: SelectedEvent[];
    totalOdds: number;
    potentialWin: number;
    avgConfidence: number;
    avgScore: number;
  } | null>(null);

  // Carica raccomandazioni per una partita
  const loadMatchRecommendations = async (match: Match) => {
    if (matchRecommendations.has(match.id) || loadingRecommendations.has(match.id)) {
      return;
    }

    setLoadingRecommendations(prev => new Set(prev).add(match.id));

    try {
      console.log('🎲 Loading recommendations for:', `${match.homeTeam} vs ${match.awayTeam}`);

      if (!match.homeTeamId || !match.awayTeamId || !match.seasonId || !match.leagueId) {
        console.error('Missing required IDs for match:', match.id);
        return;
      }

      const response = await fetch(`${ENV.API_URL}/api/betting-recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixtureId: match.id,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          leagueId: match.leagueId,
          seasonId: match.seasonId,
          homeTeamName: match.homeTeam,
          awayTeamName: match.awayTeam
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.recommendations && Array.isArray(data.recommendations)) {
        const recs: Recommendation[] = data.recommendations.map((rec: any, idx: number) => {
          const confidence = (rec.confidence || 0) > 1 ? rec.confidence : (rec.confidence || 0) * 100;
          const expectedValue = (rec.expectedValue || 0) > 1 ? rec.expectedValue : (rec.expectedValue || 0) * 100;
          const valueRating = rec.valueRating || rec.value || 0;

          return {
            id: `${match.id}-${idx}`,
            name: rec.type || rec.name,
            prediction: rec.prediction,
            odds: rec.odds || 0,
            confidence,
            valueRating,
            expectedValue,
          };
        });

        setMatchRecommendations(prev => new Map(prev).set(match.id, recs));
      }
    } catch (error) {
      console.error(`Error loading recommendations for match ${match.id}:`, error);
    } finally {
      setLoadingRecommendations(prev => {
        const next = new Set(prev);
        next.delete(match.id);
        return next;
      });
    }
  };

  // Genera multipla semplice
  const generateSimpleMultiple = () => {
    console.log('🎯 Generazione Multipla Semplice...');
    console.log('📋 Raccomandazioni disponibili:', matchRecommendations.size);
    console.log('🎯 Target:', numMatches, 'partite con quota', targetOdds);

    if (matchRecommendations.size === 0) {
      console.error('❌ Nessuna raccomandazione disponibile!');
      return;
    }

    // Pool di tutti gli eventi possibili con score
    const allEvents: SelectedEvent[] = [];

    matches.forEach((match) => {
      const recs = matchRecommendations.get(match.id);
      if (!recs || recs.length === 0) return;

      // Per ogni raccomandazione, calcola score
      recs.forEach(rec => {
        const score = (
          (rec.valueRating || 0) * 0.4 +
          (rec.confidence || 0) * 0.3 +
          (rec.expectedValue || 0) * 0.2 +
          (rec.odds >= 1.5 && rec.odds <= 3.0 ? 10 : 0)
        );

        allEvents.push({
          match,
          recommendation: rec,
          score
        });
      });
    });

    console.log('📊 Pool totale eventi:', allEvents.length);

    // Ordina per score (migliori prima)
    allEvents.sort((a, b) => b.score - a.score);

    // STRATEGIA: Seleziona le migliori partite cercando di raggiungere la quota target
    const selectedEvents: SelectedEvent[] = [];
    const usedMatches = new Set<number>();

    // Funzione per calcolare quota totale
    const calculateTotalOdds = (events: SelectedEvent[]) => 
      events.reduce((acc, e) => acc * e.recommendation.odds, 1);

    // Fase 1: Seleziona i migliori eventi (1 per partita) fino a numMatches
    for (const event of allEvents) {
      if (usedMatches.has(event.match.id)) continue; // Una sola scommessa per partita
      if (selectedEvents.length >= numMatches) break;

      selectedEvents.push(event);
      usedMatches.add(event.match.id);

      const currentOdds = calculateTotalOdds(selectedEvents);
      console.log(`  ✅ Aggiunto: ${event.match.homeTeam} vs ${event.match.awayTeam} - ${event.recommendation.prediction} @${event.recommendation.odds.toFixed(2)} (quota totale: ${currentOdds.toFixed(2)})`);
    }

    // Fase 2: Ottimizzazione per avvicinarsi alla quota target
    // Se la quota è troppo bassa, prova a sostituire eventi con quote più alte
    let currentOdds = calculateTotalOdds(selectedEvents);
    console.log(`📊 Quota iniziale: ${currentOdds.toFixed(2)} (target: ${targetOdds})`);

    if (currentOdds < targetOdds * 0.8) {
      console.log('⚠️ Quota troppo bassa, ottimizzazione...');
      
      // Prova a sostituire eventi con quote basse con eventi con quote più alte
      for (let i = selectedEvents.length - 1; i >= 0; i--) {
        const currentEvent = selectedEvents[i];
        
        // Cerca alternative per questa partita con quota più alta
        const alternatives = allEvents.filter(e => 
          e.match.id === currentEvent.match.id && 
          e.recommendation.odds > currentEvent.recommendation.odds &&
          e.score >= currentEvent.score * 0.7 // Non troppo peggio in qualità
        );

        if (alternatives.length > 0) {
          const betterEvent = alternatives[0];
          console.log(`  🔄 Sostituito: ${currentEvent.recommendation.prediction} @${currentEvent.recommendation.odds.toFixed(2)} → ${betterEvent.recommendation.prediction} @${betterEvent.recommendation.odds.toFixed(2)}`);
          selectedEvents[i] = betterEvent;
          
          currentOdds = calculateTotalOdds(selectedEvents);
          if (currentOdds >= targetOdds * 0.8) break;
        }
      }
    }

    // Calcola statistiche
    const finalOdds = calculateTotalOdds(selectedEvents);
    const potentialWin = stake * finalOdds;
    const avgConfidence = selectedEvents.reduce((sum, e) => sum + e.recommendation.confidence, 0) / selectedEvents.length;
    const avgScore = selectedEvents.reduce((sum, e) => sum + e.score, 0) / selectedEvents.length;

    setGeneratedMultiple({
      events: selectedEvents,
      totalOdds: finalOdds,
      potentialWin,
      avgConfidence,
      avgScore
    });

    console.log('✅ Multipla generata:', {
      eventi: selectedEvents.length,
      quotaTotale: finalOdds.toFixed(2),
      puntata: stake.toFixed(2),
      vincitaPotenziale: potentialWin.toFixed(2),
      confidenceMedia: avgConfidence.toFixed(1)
    });
  };

  // Effect per auto-generazione
  useEffect(() => {
    if (shouldAutoGenerate && loadingRecommendations.size === 0 && matchRecommendations.size > 0) {
      console.log('🎯 Trigger auto-generazione multipla!');
      setShouldAutoGenerate(false);
      generateSimpleMultiple();
    }
  }, [shouldAutoGenerate, loadingRecommendations.size, matchRecommendations.size]);

  // Filtra matches
  const filteredMatches = includeFinishedMatches 
    ? matches 
    : matches.filter(m => moment.utc(m.date).tz('Europe/Rome').isAfter(moment().tz('Europe/Rome')));

  return (
    <div className="bg-gradient-to-br from-blue-900 via-indigo-900 to-blue-900 rounded-xl p-6 shadow-2xl border border-blue-700/50">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <span className="text-3xl">🎯</span>
          Multipla Semplice
        </h2>
        <p className="text-gray-400 text-sm">
          Seleziona automaticamente le migliori scommesse per creare una multipla
        </p>
      </div>

      {/* Configurazione */}
      <div className="mb-6 space-y-4">
        <div className="bg-blue-800/30 rounded-lg p-4">
          <label className="block text-white font-semibold mb-2">
            💰 Puntata
          </label>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={stake}
            onChange={(e) => setStake(Math.max(0.5, parseFloat(e.target.value) || 10))}
            className="w-full px-4 py-2 bg-blue-900/50 text-white rounded-lg border border-blue-600 focus:border-blue-400 focus:outline-none text-lg font-bold"
          />
        </div>

        <div className="bg-blue-800/30 rounded-lg p-4">
          <label className="block text-white font-semibold mb-2">
            🎯 Numero Partite
          </label>
          <input
            type="number"
            min="2"
            max="15"
            value={numMatches}
            onChange={(e) => setNumMatches(Math.max(2, Math.min(15, parseInt(e.target.value) || 5)))}
            className="w-full px-4 py-2 bg-blue-900/50 text-white rounded-lg border border-blue-600 focus:border-blue-400 focus:outline-none text-lg font-bold"
          />
          <p className="text-gray-400 text-xs mt-1">
            Quante partite includere nella multipla (2-15)
          </p>
        </div>

        <div className="bg-blue-800/30 rounded-lg p-4">
          <label className="block text-white font-semibold mb-2">
            📈 Quota Target
          </label>
          <input
            type="number"
            min="2"
            step="0.5"
            value={targetOdds}
            onChange={(e) => setTargetOdds(Math.max(2, parseFloat(e.target.value) || 10))}
            className="w-full px-4 py-2 bg-blue-900/50 text-white rounded-lg border border-blue-600 focus:border-blue-400 focus:outline-none text-lg font-bold"
          />
          <p className="text-gray-400 text-xs mt-1">
            Quota totale desiderata (l'algoritmo cercherà di avvicinarsi)
          </p>
        </div>

        <div className="bg-blue-800/30 rounded-lg p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeFinishedMatches}
              onChange={(e) => setIncludeFinishedMatches(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
            <div>
              <span className="text-white font-semibold">Includi Partite Passate</span>
              <p className="text-gray-400 text-xs">
                Per analisi storiche
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Pulsante Genera */}
      {!generatedMultiple && (
        <div className="mb-6">
          {loadingRecommendations.size === 0 && (
            <button
              onClick={async () => {
                const matchesToLoad = filteredMatches;
                setLoadingProgress(`Analisi 0/${matchesToLoad.length} partite...`);
                
                for (let i = 0; i < matchesToLoad.length; i++) {
                  setLoadingProgress(`Analisi ${i + 1}/${matchesToLoad.length} partite...`);
                  await loadMatchRecommendations(matchesToLoad[i]);
                }
                
                setLoadingProgress('');
                setShouldAutoGenerate(true);
              }}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 px-8 rounded-lg transition-all shadow-lg text-lg"
            >
              🎯 Genera Multipla Automatica
            </button>
          )}

          {loadingProgress && (
            <div className="mt-4 bg-blue-900/20 border border-blue-700/30 rounded-lg p-4 text-center">
              <div className="text-blue-400 font-semibold mb-2">{loadingProgress}</div>
              <div className="w-full bg-blue-900 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-300"
                  style={{ width: `${(matchRecommendations.size / filteredMatches.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Multipla Generata */}
      {generatedMultiple && (
        <div className="space-y-6">
          {/* Riepilogo */}
          <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 rounded-lg p-6 border border-green-700/30">
            <h3 className="text-xl font-bold text-white mb-4">📊 Riepilogo Multipla</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <div className="text-gray-400 text-xs mb-1">Partite</div>
                <div className="text-2xl font-bold text-white">{generatedMultiple.events.length}</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <div className="text-gray-400 text-xs mb-1">Quota Totale</div>
                <div className="text-2xl font-bold text-yellow-400">{generatedMultiple.totalOdds.toFixed(2)}</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <div className="text-gray-400 text-xs mb-1">Puntata</div>
                <div className="text-2xl font-bold text-blue-400">€{stake.toFixed(2)}</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <div className="text-gray-400 text-xs mb-1">Vincita Potenziale</div>
                <div className="text-2xl font-bold text-green-400">€{generatedMultiple.potentialWin.toFixed(2)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-gray-400 text-sm">Confidence Media</div>
                <div className="text-xl font-bold text-purple-400">{generatedMultiple.avgConfidence.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Qualità Media</div>
                <div className="text-xl font-bold text-orange-400">{generatedMultiple.avgScore.toFixed(1)}/100</div>
              </div>
            </div>

            {/* Confronto con target */}
            {Math.abs(generatedMultiple.totalOdds - targetOdds) > targetOdds * 0.2 && (
              <div className="mt-4 bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
                <div className="text-yellow-400 text-sm font-semibold mb-1">
                  ⚠️ Quota Diversa dal Target
                </div>
                <div className="text-gray-300 text-xs">
                  Target: {targetOdds.toFixed(2)} → Ottenuto: {generatedMultiple.totalOdds.toFixed(2)} 
                  {generatedMultiple.totalOdds < targetOdds ? ' (più bassa)' : ' (più alta)'}
                </div>
              </div>
            )}
          </div>

          {/* Eventi Selezionati */}
          <div className="bg-black/20 rounded-lg p-6">
            <h4 className="text-lg font-bold text-white mb-4">🎯 Eventi nella Multipla</h4>
            <div className="space-y-3">
              {generatedMultiple.events.map((event, idx) => (
                <div key={idx} className="bg-blue-900/30 rounded-lg p-4 border border-blue-700/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-white">
                      {event.match.homeTeam} vs {event.match.awayTeam}
                    </div>
                    <div className="text-xs bg-green-600/30 text-green-300 px-2 py-1 rounded">
                      Qualità: {event.score.toFixed(1)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="bg-blue-800/50 rounded px-3 py-1">
                      <span className="text-gray-300 text-sm">{event.recommendation.prediction}</span>
                      <span className="text-yellow-400 ml-2 font-bold">@{event.recommendation.odds.toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      Conf: {event.recommendation.confidence.toFixed(0)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pulsante Rigenera */}
          <button
            onClick={() => {
              setGeneratedMultiple(null);
              setMatchRecommendations(new Map());
            }}
            className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white font-bold py-3 px-6 rounded-lg transition-all"
          >
            🔄 Rigenera Nuova Multipla
          </button>
        </div>
      )}
    </div>
  );
}
