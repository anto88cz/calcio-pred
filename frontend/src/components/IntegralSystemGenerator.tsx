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

interface IntegralSystemGeneratorProps {
  matches: Match[];
}

// Configurazione per una partita nel sistema integrale
interface MatchColumn {
  match: Match;
  recommendations: Recommendation[]; // 1, 2 o 3 raccomandazioni per questa partita
  columnType: 'single' | 'double' | 'triple';
}

// Singola colonna del sistema (una combinazione specifica)
interface SystemColumn {
  events: Array<{
    match: Match;
    recommendation: Recommendation;
  }>;
  totalOdds: number;
  potentialWin: number;
}

export default function IntegralSystemGenerator({ matches }: IntegralSystemGeneratorProps) {
  const [loadingRecommendations, setLoadingRecommendations] = useState<Set<number>>(new Set());
  const [matchRecommendations, setMatchRecommendations] = useState<Map<number, Recommendation[]>>(new Map());
  const [loadingProgress, setLoadingProgress] = useState<string>('');
  const [shouldAutoGenerate, setShouldAutoGenerate] = useState(false);
  const [includeFinishedMatches, setIncludeFinishedMatches] = useState(false);
  const [totalBudget, setTotalBudget] = useState<number>(10);
  const [maxMatches, setMaxMatches] = useState<number>(6); // Numero partite nel sistema
  
  const [generatedSystem, setGeneratedSystem] = useState<{
    columns: MatchColumn[];
    systemColumns: SystemColumn[];
    totalColumns: number;
    stakePerColumn: number;
    totalInvestment: number;
    maxWin: number;
    minWin: number;
    avgOdds: number;
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

  // Genera il sistema integrale automaticamente
  const generateIntegralSystem = () => {
    console.log('🎰 Generazione Sistema Integrale...');
    console.log('📋 Raccomandazioni disponibili:', matchRecommendations.size);
    console.log('🎯 Partite da processare:', matches.length);

    if (matchRecommendations.size === 0) {
      console.error('❌ Nessuna raccomandazione disponibile!');
      return;
    }

    const selectedMatches: MatchColumn[] = [];
    let singleCount = 0;
    let doubleCount = 0;
    let tripleCount = 0;

    // Per ogni match con raccomandazioni, decidi quante colonne usare
    matches.forEach((match, index) => {
      const recs = matchRecommendations.get(match.id);
      if (!recs || recs.length === 0) {
        console.log(`⚠️ Partita ${match.homeTeam} vs ${match.awayTeam}: nessuna raccomandazione trovata`);
        return;
      }
      
      console.log(`📊 Processando partita ${index + 1}/${matches.length}: ${match.homeTeam} vs ${match.awayTeam} (${recs.length} raccomandazioni)`);

      // Ordina per score (qualità della raccomandazione)
      const scored = recs.map(rec => ({
        rec,
        score: (
          (rec.valueRating || 0) * 0.4 +
          (rec.confidence || 0) * 0.3 +
          (rec.expectedValue || 0) * 0.2 +
          (rec.odds >= 1.5 && rec.odds <= 3.0 ? 10 : 0)
        )
      })).sort((a, b) => b.score - a.score);

      const best = scored[0];
      const secondBest = scored[1];
      const thirdBest = scored[2];

      // LOGICA BILANCIATA:
      // Score alto + confidence alta = SICURA → SINGOLA
      // Score medio = INCERTEZZA MEDIA → DOPPIA
      // Score basso o confidence bassa = INCERTA → TRIPLA
      
      const bestScore = best.score;
      const bestConfidence = best.rec.confidence || 0;
      
      let columnType: 'single' | 'double' | 'triple' = 'single';
      let selectedRecs: Recommendation[] = [best.rec];

      console.log(`  📊 Best: ${best.rec.prediction} - Score: ${bestScore.toFixed(1)}, Conf: ${bestConfidence.toFixed(0)}%, Odds: ${best.rec.odds}`);

      // Threshold più bassi per generare più singole
      if (bestScore >= 33 && bestConfidence >= 62) {
        // SICURA → Singola
        columnType = 'single';
        selectedRecs = [best.rec];
        console.log('  ✅ SINGOLA (sicura)');
      } else if (bestScore >= 28 && bestConfidence >= 55) {
        // INCERTEZZA MEDIA → Doppia
        if (secondBest && scored.length >= 2) {
          columnType = 'double';
          selectedRecs = [best.rec, secondBest.rec];
          console.log(`  ⚡ DOPPIA (media incertezza): ${selectedRecs.map(r => r.prediction).join(' / ')}`);
        } else {
          columnType = 'single';
          selectedRecs = [best.rec];
          console.log('  ✅ SINGOLA (solo 1 raccomandazione)');
        }
      } else {
        // MOLTO INCERTA → Tripla
        if (thirdBest && scored.length >= 3) {
          columnType = 'triple';
          selectedRecs = [best.rec, secondBest.rec, thirdBest.rec];
          console.log(`  🔥 TRIPLA (incerta): ${selectedRecs.map(r => r.prediction).join(' / ')}`);
        } else if (secondBest && scored.length >= 2) {
          columnType = 'double';
          selectedRecs = [best.rec, secondBest.rec];
          console.log(`  ⚡ DOPPIA (incerta): ${selectedRecs.map(r => r.prediction).join(' / ')}`);
        } else {
          columnType = 'single';
          selectedRecs = [best.rec];
          console.log('  ✅ SINGOLA (fallback)');
        }
      }

      selectedMatches.push({
        match,
        recommendations: selectedRecs,
        columnType
      });
    });

    console.log('📊 Partite selezionate prima del bilanciamento:', {
      totale: selectedMatches.length,
      singole: selectedMatches.filter(m => m.columnType === 'single').length,
      doppie: selectedMatches.filter(m => m.columnType === 'double').length,
      triple: selectedMatches.filter(m => m.columnType === 'triple').length
    });

    // Ordina per qualità (partite con colonne singole = più sicure = prima)
    selectedMatches.sort((a, b) => {
      const orderValue = { single: 1, double: 2, triple: 3 };
      return orderValue[a.columnType] - orderValue[b.columnType];
    });

    // Limita al numero di partite richiesto dall'utente
    let finalMatches = selectedMatches.slice(0, maxMatches);
    
    console.log(`✂️ Selezionate ${maxMatches} partite (da ${selectedMatches.length})`);

    // BILANCIAMENTO INTELLIGENTE per controllare il numero di colonne
    // Obiettivo: max 300-500 colonne per budget ragionevole
    // STRATEGIA: Invece di rimuovere partite, converti triple→doppie→singole
    
    const calculateTotalColumns = (matches: MatchColumn[]) => 
      matches.reduce((total, m) => total * m.recommendations.length, 1);
    
    let provisionalColumns = calculateTotalColumns(finalMatches);
    
    console.log('🔢 Colonne iniziali:', provisionalColumns);

    // Fase 1: Se troppe colonne (>500), converti triple in doppie
    while (provisionalColumns > 500 && finalMatches.some(m => m.columnType === 'triple')) {
      // Trova l'ultima tripla (le meno sicure sono alla fine)
      const tripleIndex = finalMatches.findLastIndex(m => m.columnType === 'triple');
      if (tripleIndex !== -1) {
        const match = finalMatches[tripleIndex];
        console.log(`  🔄 Convertita tripla → doppia: ${match.match.homeTeam} vs ${match.match.awayTeam}`);
        finalMatches[tripleIndex] = {
          ...match,
          recommendations: [match.recommendations[0], match.recommendations[1]], // Top 2
          columnType: 'double'
        };
      }
      provisionalColumns = calculateTotalColumns(finalMatches);
      console.log('  📊 Colonne dopo conversione:', provisionalColumns);
    }

    // Fase 2: Se ancora troppe (>500), converti doppie in singole
    while (provisionalColumns > 500 && finalMatches.some(m => m.columnType === 'double')) {
      const doubleIndex = finalMatches.findLastIndex(m => m.columnType === 'double');
      if (doubleIndex !== -1) {
        const match = finalMatches[doubleIndex];
        console.log(`  🔄 Convertita doppia → singola: ${match.match.homeTeam} vs ${match.match.awayTeam}`);
        finalMatches[doubleIndex] = {
          ...match,
          recommendations: [match.recommendations[0]], // Solo la migliore
          columnType: 'single'
        };
      }
      provisionalColumns = calculateTotalColumns(finalMatches);
      console.log('  📊 Colonne dopo conversione:', provisionalColumns);
    }

    // Fase 3: Solo se ancora troppe colonne (>500), rimuovi partite
    while (provisionalColumns > 500 && finalMatches.length > 3) {
      console.log(`  ⚠️ Ancora troppe colonne (${provisionalColumns}), rimozione ultima partita`);
      const removed = finalMatches.pop();
      if (removed) {
        console.log(`  🔻 Rimossa: ${removed.match.homeTeam} vs ${removed.match.awayTeam}`);
      }
      provisionalColumns = calculateTotalColumns(finalMatches);
      console.log('  📊 Colonne dopo rimozione:', provisionalColumns);
    }

    console.log('✅ Partite finali dopo bilanciamento:', {
      totale: finalMatches.length,
      singole: finalMatches.filter(m => m.columnType === 'single').length,
      doppie: finalMatches.filter(m => m.columnType === 'double').length,
      triple: finalMatches.filter(m => m.columnType === 'triple').length,
      colonneTotali: calculateTotalColumns(finalMatches)
    });

    // Calcola tutte le combinazioni possibili (prodotto cartesiano)
    const systemColumns = generateAllCombinations(finalMatches);

    // Calcola puntata per colonna con vincoli bookmakers
    const totalColumns = systemColumns.length;
    const rawStakePerColumn = totalBudget / totalColumns;
    
    // Arrotonda a multiplo di €0.05 SOLO se necessario
    // Se è già >= €0.05 e multiplo di €0.05, lascia com'è
    let stakePerColumn: number;
    
    if (rawStakePerColumn < 0.05) {
      // Sotto il minimo -> forza a €0.05
      stakePerColumn = 0.05;
      console.log('⚠️ Puntata sotto minimo, forzata a €0.05');
    } else if (Math.abs(rawStakePerColumn - Math.round(rawStakePerColumn / 0.05) * 0.05) < 0.001) {
      // Già multiplo perfetto di €0.05
      stakePerColumn = rawStakePerColumn;
      console.log('✅ Puntata già multiplo di €0.05');
    } else {
      // Arrotonda al multiplo di €0.05 più vicino
      const rounded = Math.round(rawStakePerColumn / 0.05) * 0.05;
      stakePerColumn = Math.max(0.05, rounded);
      console.log(`🔄 Puntata arrotondata: €${rawStakePerColumn.toFixed(4)} → €${stakePerColumn.toFixed(2)}`);
    }
    
    // Ricalcola investimento effettivo
    const actualInvestment = stakePerColumn * totalColumns;
    
    console.log('💰 Calcolo puntate:', {
      budgetRichiesto: totalBudget.toFixed(2),
      colonneTotali: totalColumns,
      puntataRaw: rawStakePerColumn.toFixed(4),
      puntataArrotondata: stakePerColumn.toFixed(2),
      investimentoEffettivo: actualInvestment.toFixed(2),
      differenza: (actualInvestment - totalBudget).toFixed(2)
    });

    // Ricalcola vincite con la puntata corretta
    const columnsWithCorrectStake = systemColumns.map(col => ({
      ...col,
      potentialWin: col.totalOdds * stakePerColumn
    }));

    // Calcola statistiche
    const maxWin = Math.max(...columnsWithCorrectStake.map(c => c.potentialWin));
    const minWin = Math.min(...columnsWithCorrectStake.map(c => c.potentialWin));
    const avgOdds = columnsWithCorrectStake.reduce((sum, c) => sum + c.totalOdds, 0) / totalColumns;

    setGeneratedSystem({
      columns: finalMatches,
      systemColumns: columnsWithCorrectStake,
      totalColumns,
      stakePerColumn,
      totalInvestment: actualInvestment,
      maxWin,
      minWin,
      avgOdds
    });

    console.log('✅ Sistema generato:', {
      partite: finalMatches.length,
      colonneComplessive: totalColumns,
      puntataPerColonna: stakePerColumn.toFixed(2),
      investimentoEffettivo: actualInvestment.toFixed(2),
      vincitaMassima: maxWin.toFixed(2)
    });
  };

  // Genera tutte le combinazioni (prodotto cartesiano)
  const generateAllCombinations = (matchColumns: MatchColumn[]): SystemColumn[] => {
    if (matchColumns.length === 0) return [];

    console.log('🔢 Generazione combinazioni da:', matchColumns.map(m => ({
      match: `${m.match.homeTeam} vs ${m.match.awayTeam}`,
      recommendations: m.recommendations.length,
      type: m.columnType
    })));

    const result: SystemColumn[] = [];

    const generateRecursive = (index: number, currentCombination: Array<{ match: Match; recommendation: Recommendation }>) => {
      if (index === matchColumns.length) {
        const totalOdds = currentCombination.reduce((acc, item) => acc * item.recommendation.odds, 1);
        // Non usare generatedSystem qui, verrà calcolato dopo
        const potentialWin = totalOdds; // Placeholder
        
        result.push({
          events: currentCombination,
          totalOdds,
          potentialWin
        });
        return;
      }

      const currentMatch = matchColumns[index];
      console.log(`  Livello ${index}: ${currentMatch.match.homeTeam} vs ${currentMatch.match.awayTeam} - ${currentMatch.recommendations.length} opzioni`);
      
      for (const rec of currentMatch.recommendations) {
        generateRecursive(index + 1, [
          ...currentCombination,
          { match: currentMatch.match, recommendation: rec }
        ]);
      }
    };

    generateRecursive(0, []);
    
    console.log(`✅ Generate ${result.length} combinazioni totali`);
    return result;
  };

  // Effect per auto-generazione quando il caricamento è completato
  useEffect(() => {
    if (shouldAutoGenerate && loadingRecommendations.size === 0 && matchRecommendations.size > 0) {
      console.log('🎯 Trigger auto-generazione! Recommendations loaded:', matchRecommendations.size);
      setShouldAutoGenerate(false);
      generateIntegralSystem();
    }
  }, [shouldAutoGenerate, loadingRecommendations.size, matchRecommendations.size]);

  // Filtra i matches in base al toggle "partite passate"
  const filteredMatches = includeFinishedMatches 
    ? matches 
    : matches.filter(m => moment.utc(m.date).tz('Europe/Rome').isAfter(moment().tz('Europe/Rome')));

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl p-6 shadow-2xl border border-slate-700/50">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <span className="text-3xl">🎰</span>
          Sistema Integrale Multi-Colonna
        </h2>
        <p className="text-gray-400 text-sm">
          Alcune partite avranno 1 sola scommessa, altre 2-3 scommesse per coprire più esiti
        </p>
      </div>

      {/* Configurazione */}
      <div className="mb-6 space-y-4">
        <div className="bg-slate-800/50 rounded-lg p-4">
          <label className="block text-white font-semibold mb-2">
            💰 Budget Totale Sistema
          </label>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={totalBudget}
            onChange={(e) => setTotalBudget(Math.max(0.5, parseFloat(e.target.value) || 10))}
            className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none text-lg font-bold"
          />
          <p className="text-gray-400 text-xs mt-1">
            Questo importo sarà diviso tra tutte le colonne del sistema
          </p>
          <p className="text-yellow-400 text-xs mt-1">
            ⚠️ Puntata minima per colonna: €0.05 (multipli di €0.05)
          </p>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4">
          <label className="block text-white font-semibold mb-2">
            🎯 Numero Partite nel Sistema
          </label>
          <input
            type="number"
            min="3"
            max="10"
            value={maxMatches}
            onChange={(e) => setMaxMatches(Math.max(3, Math.min(10, parseInt(e.target.value) || 6)))}
            className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none text-lg font-bold"
          />
          <p className="text-gray-400 text-xs mt-1">
            Quante partite includere nel sistema (minimo 3, massimo 10)
          </p>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4">
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
                Utile per analisi storiche e verificare performance del sistema
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Pulsante Genera */}
      {!generatedSystem && (
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
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold py-4 px-8 rounded-lg transition-all shadow-lg text-lg"
            >
              🎰 Genera Sistema Integrale Automatico
            </button>
          )}

          {loadingProgress && (
            <div className="mt-4 bg-blue-900/20 border border-blue-700/30 rounded-lg p-4 text-center">
              <div className="text-blue-400 font-semibold mb-2">{loadingProgress}</div>
              <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-purple-500 h-full transition-all duration-300"
                  style={{ width: `${(matchRecommendations.size / filteredMatches.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sistema Generato */}
      {generatedSystem && (
        <div className="space-y-6">
          {/* Riepilogo */}
          <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-lg p-6 border border-purple-700/30">
            <h3 className="text-xl font-bold text-white mb-4">📊 Riepilogo Sistema</h3>
            
            {/* Warning se budget non è esatto */}
            {Math.abs(generatedSystem.totalInvestment - totalBudget) > 0.01 && (
              <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3 mb-4">
                <div className="text-yellow-400 text-sm font-semibold mb-1">
                  ⚠️ Budget Aggiustato
                </div>
                <div className="text-gray-300 text-xs">
                  Budget richiesto: €{totalBudget.toFixed(2)} → Investimento effettivo: €{generatedSystem.totalInvestment.toFixed(2)}
                </div>
                <div className="text-gray-400 text-xs mt-1">
                  Arrotondato a multipli di €0.05 per colonna (minimo €0.05)
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <div className="text-gray-400 text-xs mb-1">Partite</div>
                <div className="text-2xl font-bold text-white">{generatedSystem.columns.length}</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <div className="text-gray-400 text-xs mb-1">Colonne Totali</div>
                <div className="text-2xl font-bold text-green-400">{generatedSystem.totalColumns}</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <div className="text-gray-400 text-xs mb-1">€ per Colonna</div>
                <div className="text-2xl font-bold text-yellow-400">€{generatedSystem.stakePerColumn.toFixed(2)}</div>
                <div className="text-xs text-gray-400 mt-1">min €0.05</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <div className="text-gray-400 text-xs mb-1">Investimento</div>
                <div className="text-2xl font-bold text-blue-400">€{generatedSystem.totalInvestment.toFixed(2)}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-gray-400 text-sm">Vincita Max</div>
                <div className="text-xl font-bold text-green-400">€{generatedSystem.maxWin.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Vincita Min</div>
                <div className="text-xl font-bold text-yellow-400">€{generatedSystem.minWin.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Quota Media</div>
                <div className="text-xl font-bold text-purple-400">{generatedSystem.avgOdds.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Partite Selezionate */}
          <div className="bg-black/20 rounded-lg p-6">
            <h4 className="text-lg font-bold text-white mb-4">🎯 Partite Selezionate</h4>
            <div className="space-y-3">
              {generatedSystem.columns.map((col, idx) => (
                <div key={idx} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-white">
                      {col.match.homeTeam} vs {col.match.awayTeam}
                    </div>
                    <div className="text-xs bg-purple-600/30 text-purple-300 px-2 py-1 rounded">
                      {col.columnType === 'single' ? '1 colonna' : col.columnType === 'double' ? '2 colonne' : '3 colonne'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {col.recommendations.map((rec, recIdx) => (
                      <div key={recIdx} className="bg-slate-700/50 rounded px-3 py-1 text-sm">
                        <span className="text-gray-300">{rec.prediction}</span>
                        <span className="text-yellow-400 ml-2 font-bold">@{rec.odds.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dettaglio Colonne (prime 20) */}
          <div className="bg-black/20 rounded-lg p-6">
            <h4 className="text-lg font-bold text-white mb-4">
              📋 Dettaglio Colonne (mostrando prime 20 su {generatedSystem.totalColumns})
            </h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {generatedSystem.systemColumns.slice(0, 20).map((col, idx) => (
                <div key={idx} className="bg-slate-900/50 rounded p-3 border border-slate-700/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white text-sm">Colonna {idx + 1}</span>
                    <div className="text-right">
                      <div className="text-yellow-400 font-bold">@ {col.totalOdds.toFixed(2)}</div>
                      <div className="text-xs text-green-400">Vincita: €{col.potentialWin.toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {col.events.map((evt, evtIdx) => (
                      <div key={evtIdx} className="text-xs text-gray-300">
                        • {evt.match.homeTeam} vs {evt.match.awayTeam}: <span className="text-white">{evt.recommendation.prediction}</span> @{evt.recommendation.odds.toFixed(2)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pulsante Rigenera */}
          <button
            onClick={() => {
              setGeneratedSystem(null);
              setMatchRecommendations(new Map());
            }}
            className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white font-bold py-3 px-6 rounded-lg transition-all"
          >
            🔄 Rigenera Nuovo Sistema
          </button>
        </div>
      )}
    </div>
  );
}
