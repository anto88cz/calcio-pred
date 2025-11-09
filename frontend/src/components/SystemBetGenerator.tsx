'use client';

import { useState, useMemo, useEffect } from 'react';
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
  date?: string; // Data completa ISO della partita
  competition: string;
  homeTeamId?: number;
  awayTeamId?: number;
  seasonId?: number;
  leagueId?: number;
  recommendations?: Recommendation[];
}

interface SystemType {
  name: string;
  minEvents: number;
  maxEvents: number;
  description: string;
  calculateColumns: (n: number) => number;
  calculateCombinations: (events: SelectedEvent[]) => Combination[];
}

interface SelectedEvent {
  matchId: number;
  matchName: string;
  recommendation: Recommendation;
  time: string;
  competition: string;
}

interface Combination {
  type: string;
  events: SelectedEvent[];
  totalOdds: number;
  potentialWin: number;
}

interface SystemBetGeneratorProps {
  matches: Match[];
}

const SYSTEM_TYPES: Record<string, SystemType> = {
  trixie: {
    name: 'Trixie',
    minEvents: 3,
    maxEvents: 3,
    description: '3 eventi: 3 doppie + 1 tripla = 4 colonne',
    calculateColumns: () => 4,
    calculateCombinations: (events) => {
      const combinations: Combination[] = [];
      const n = events.length;
      
      // 3 Doppie
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const pair = [events[i], events[j]];
          combinations.push({
            type: 'Doppia',
            events: pair,
            totalOdds: pair.reduce((acc, e) => acc * e.recommendation.odds, 1),
            potentialWin: 0
          });
        }
      }
      
      // 1 Tripla
      combinations.push({
        type: 'Tripla',
        events: events,
        totalOdds: events.reduce((acc, e) => acc * e.recommendation.odds, 1),
        potentialWin: 0
      });
      
      return combinations;
    }
  },
  yankee: {
    name: 'Yankee',
    minEvents: 4,
    maxEvents: 4,
    description: '4 eventi: 6 doppie + 4 triple + 1 quadrupla = 11 colonne',
    calculateColumns: () => 11,
    calculateCombinations: (events) => {
      const combinations: Combination[] = [];
      const n = events.length;
      
      // 6 Doppie
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const pair = [events[i], events[j]];
          combinations.push({
            type: 'Doppia',
            events: pair,
            totalOdds: pair.reduce((acc, e) => acc * e.recommendation.odds, 1),
            potentialWin: 0
          });
        }
      }
      
      // 4 Triple
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          for (let k = j + 1; k < n; k++) {
            const triple = [events[i], events[j], events[k]];
            combinations.push({
              type: 'Tripla',
              events: triple,
              totalOdds: triple.reduce((acc, e) => acc * e.recommendation.odds, 1),
              potentialWin: 0
            });
          }
        }
      }
      
      // 1 Quadrupla
      combinations.push({
        type: 'Quadrupla',
        events: events,
        totalOdds: events.reduce((acc, e) => acc * e.recommendation.odds, 1),
        potentialWin: 0
      });
      
      return combinations;
    }
  },
  canadian: {
    name: 'Canadian (Super Yankee)',
    minEvents: 5,
    maxEvents: 5,
    description: '5 eventi: 10 doppie + 10 triple + 5 quadruple + 1 quintupla = 26 colonne',
    calculateColumns: () => 26,
    calculateCombinations: (events) => {
      const combinations: Combination[] = [];
      const n = events.length;
      
      // 10 Doppie
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const pair = [events[i], events[j]];
          combinations.push({
            type: 'Doppia',
            events: pair,
            totalOdds: pair.reduce((acc, e) => acc * e.recommendation.odds, 1),
            potentialWin: 0
          });
        }
      }
      
      // 10 Triple
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          for (let k = j + 1; k < n; k++) {
            const triple = [events[i], events[j], events[k]];
            combinations.push({
              type: 'Tripla',
              events: triple,
              totalOdds: triple.reduce((acc, e) => acc * e.recommendation.odds, 1),
              potentialWin: 0
            });
          }
        }
      }
      
      // 5 Quadruple
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          for (let k = j + 1; k < n; k++) {
            for (let l = k + 1; l < n; l++) {
              const quad = [events[i], events[j], events[k], events[l]];
              combinations.push({
                type: 'Quadrupla',
                events: quad,
                totalOdds: quad.reduce((acc, e) => acc * e.recommendation.odds, 1),
                potentialWin: 0
              });
            }
          }
        }
      }
      
      // 1 Quintupla
      combinations.push({
        type: 'Quintupla',
        events: events,
        totalOdds: events.reduce((acc, e) => acc * e.recommendation.odds, 1),
        potentialWin: 0
      });
      
      return combinations;
    }
  },
  heinz: {
    name: 'Heinz',
    minEvents: 6,
    maxEvents: 6,
    description: '6 eventi: 15 doppie + 20 triple + 15 quadruple + 6 quintuple + 1 sestupla = 57 colonne',
    calculateColumns: () => 57,
    calculateCombinations: (events) => {
      // Implementazione completa con tutte le combinazioni
      return generateAllCombinations(events, [2, 3, 4, 5, 6]);
    }
  },
  superHeinz: {
    name: 'Super Heinz',
    minEvents: 7,
    maxEvents: 7,
    description: '7 eventi: 21 doppie + 35 triple + 35 quadruple + 21 quintuple + 7 sestuple + 1 settupla = 120 colonne',
    calculateColumns: () => 120,
    calculateCombinations: (events) => {
      return generateAllCombinations(events, [2, 3, 4, 5, 6, 7]);
    }
  },
  goliath: {
    name: 'Goliath',
    minEvents: 8,
    maxEvents: 8,
    description: '8 eventi: 28 doppie + 56 triple + 70 quadruple + 56 quintuple + 28 sestuple + 8 settuple + 1 ottupla = 247 colonne',
    calculateColumns: () => 247,
    calculateCombinations: (events) => {
      return generateAllCombinations(events, [2, 3, 4, 5, 6, 7, 8]);
    }
  }
};

// Funzione helper per generare tutte le combinazioni
function generateAllCombinations(events: SelectedEvent[], sizes: number[]): Combination[] {
  const combinations: Combination[] = [];
  
  sizes.forEach(size => {
    const combos = getCombinations(events, size);
    combos.forEach(combo => {
      combinations.push({
        type: getComboTypeName(size),
        events: combo,
        totalOdds: combo.reduce((acc, e) => acc * e.recommendation.odds, 1),
        potentialWin: 0
      });
    });
  });
  
  return combinations;
}

function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 1) return arr.map(item => [item]);
  if (k === arr.length) return [arr];
  
  const combinations: T[][] = [];
  
  for (let i = 0; i <= arr.length - k; i++) {
    const head = arr[i];
    const tailCombos = getCombinations(arr.slice(i + 1), k - 1);
    tailCombos.forEach(combo => {
      combinations.push([head, ...combo]);
    });
  }
  
  return combinations;
}

function getComboTypeName(size: number): string {
  const names = ['', 'Singola', 'Doppia', 'Tripla', 'Quadrupla', 'Quintupla', 'Sestupla', 'Settupla', 'Ottupla'];
  return names[size] || `${size}-pla`;
}

export default function SystemBetGenerator({ matches }: SystemBetGeneratorProps) {
  const [selectedEvents, setSelectedEvents] = useState<SelectedEvent[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string>('');
  const [stakePerColumn, setStakePerColumn] = useState<number>(1);
  const [showResults, setShowResults] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState<Set<number>>(new Set());
  const [matchRecommendations, setMatchRecommendations] = useState<Map<number, Recommendation[]>>(new Map());
  const [loadingProgress, setLoadingProgress] = useState<string>('');
  const [shouldAutoSelect, setShouldAutoSelect] = useState(false);
  const [autoSuggestion, setAutoSuggestion] = useState<{
    events: SelectedEvent[];
    systemType: string;
    suggestedStake: number;
    reason: string;
  } | null>(null);

  // Carica raccomandazioni per una partita
  const loadMatchRecommendations = async (match: Match) => {
    if (matchRecommendations.has(match.id) || loadingRecommendations.has(match.id)) {
      return; // Già caricato o in caricamento
    }

    // Verifica che ci siano i dati necessari
    if (!match.homeTeamId || !match.awayTeamId || !match.seasonId || !match.leagueId) {
      console.error(`Missing required IDs for match ${match.id}:`, {
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        seasonId: match.seasonId,
        leagueId: match.leagueId
      });
      return;
    }

    setLoadingRecommendations(prev => new Set(prev).add(match.id));

    try {
      console.log('🎲 Loading recommendations for:', match.homeTeam, 'vs', match.awayTeam);
      
      const response = await fetch(`${ENV.API_URL}/api/betting-recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fixtureId: match.id,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          leagueId: match.leagueId,
          seasonId: match.seasonId,
          homeTeamName: match.homeTeam,
          awayTeamName: match.awayTeam,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Recommendations loaded:', data);

      if (data.recommendations && Array.isArray(data.recommendations)) {
        // Trasforma le raccomandazioni nel formato atteso
        const recs: Recommendation[] = data.recommendations.map((rec: any, idx: number) => {
          // Normalizza i valori: se sono già percentuali (>1), usali direttamente, altrimenti converti
          const confidence = (rec.confidence || 0) > 1 ? rec.confidence : (rec.confidence || 0) * 100;
          const expectedValue = (rec.expectedValue || 0) > 1 ? rec.expectedValue : (rec.expectedValue || 0) * 100;
          const valueRating = rec.valueRating || rec.value || 0;
          
          console.log('🔍 Transforming rec:', {
            type: rec.type,
            confidence: `${rec.confidence} -> ${confidence}`,
            expectedValue: `${rec.expectedValue} -> ${expectedValue}`,
            valueRating
          });

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

        console.log('📦 Transformed recommendations:', recs);
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

  // Filtra match con raccomandazioni (caricate o pre-esistenti)
  const availableMatches = useMemo(() => {
    return matches.map(m => ({
      ...m,
      recommendations: m.recommendations || matchRecommendations.get(m.id) || []
    })).filter(m => m.recommendations.length > 0);
  }, [matches, matchRecommendations]);

  // Effect per auto-selezione quando il caricamento è completato
  useEffect(() => {
    if (shouldAutoSelect && loadingRecommendations.size === 0 && matchRecommendations.size > 0) {
      console.log('🎯 Trigger auto-selezione! Recommendations loaded:', matchRecommendations.size);
      setShouldAutoSelect(false);
      autoSelectBestRecommendations();
    }
  }, [shouldAutoSelect, loadingRecommendations.size, matchRecommendations.size]);

  // Auto-selezione intelligente delle migliori raccomandazioni
  const autoSelectBestRecommendations = () => {
    console.log('🤖 Auto-selezione delle migliori raccomandazioni...');
    console.log('📋 matchRecommendations Map size:', matchRecommendations.size);
    
    // Raccoglie tutte le raccomandazioni con punteggio
    const allRecommendations: Array<{
      match: Match;
      rec: Recommendation;
      score: number;
    }> = [];

    // Itera su tutti i match e prendi le raccomandazioni dalla Map
    matches.forEach(match => {
      const recommendations = matchRecommendations.get(match.id);
      if (!recommendations || recommendations.length === 0) return;

      console.log(`🎯 Processing match ${match.homeTeam} vs ${match.awayTeam}:`, {
        recommendations: recommendations.length,
        sample: recommendations[0]
      });
      
      recommendations.forEach(rec => {
        // Calcola uno score basato su: valueRating, confidence, expectedValue, odds
        const score = (
          (rec.valueRating || 0) * 0.4 +          // 40% peso al value rating
          (rec.confidence || 0) * 0.3 +           // 30% peso alla confidence
          (rec.expectedValue || 0) * 0.2 +        // 20% peso all'expected value
          (rec.odds >= 1.5 && rec.odds <= 3.0 ? 10 : 0) // Bonus per quote ottimali
        );

        console.log(`  ⭐ ${rec.name}: score=${score.toFixed(2)} (vr=${rec.valueRating}, conf=${rec.confidence}, ev=${rec.expectedValue}, odds=${rec.odds})`);

        allRecommendations.push({
          match,
          rec,
          score
        });
      });
    });

    // Ordina per score decrescente
    allRecommendations.sort((a, b) => b.score - a.score);

    console.log('📊 Tutte le raccomandazioni ordinate per score:', allRecommendations.map(r => ({
      match: `${r.match.homeTeam} vs ${r.match.awayTeam}`,
      rec: r.rec.prediction,
      score: r.score.toFixed(2)
    })));

    // Selezione partite diverse (max 1 raccomandazione per partita)
    const selectedMatches = new Set<number>();
    const bestPicks: Array<{ match: Match; rec: Recommendation }> = [];

    for (const item of allRecommendations) {
      if (!selectedMatches.has(item.match.id) && bestPicks.length < 8) {
        bestPicks.push(item);
        selectedMatches.add(item.match.id);
      }
    }

    // Determina il numero ottimale di eventi (tra 3 e 6 per sistemi gestibili)
    const optimalCount = Math.min(Math.max(bestPicks.length, 3), 6);
    const selectedPicks = bestPicks.slice(0, optimalCount);

    console.log(`✅ Selezionate ${selectedPicks.length} migliori raccomandazioni`);

    // Converti in SelectedEvent
    const selectedEvts: SelectedEvent[] = selectedPicks.map(pick => ({
      matchId: pick.match.id,
      matchName: `${pick.match.homeTeam} vs ${pick.match.awayTeam}`,
      recommendation: pick.rec,
      time: pick.match.time,
      competition: pick.match.competition
    }));

    // Determina il sistema ottimale in base al numero di eventi
    let systemType = '';
    let systemName = '';
    
    if (optimalCount === 3) {
      systemType = 'trixie';
      systemName = 'Trixie';
    } else if (optimalCount === 4) {
      systemType = 'yankee';
      systemName = 'Yankee';
    } else if (optimalCount === 5) {
      systemType = 'canadian';
      systemName = 'Canadian';
    } else if (optimalCount === 6) {
      systemType = 'heinz';
      systemName = 'Heinz';
    }

    // Calcola la puntata suggerita in base alle quote medie
    const avgOdds = selectedEvts.reduce((sum, e) => sum + e.recommendation.odds, 0) / selectedEvts.length;
    
    // Strategia di puntata: più le quote sono alte, meno si punta per colonna
    let suggestedStake = 1.0;
    if (avgOdds >= 3.0) {
      suggestedStake = 0.5; // Quote alte = puntata bassa
    } else if (avgOdds >= 2.0) {
      suggestedStake = 1.0; // Quote medie = puntata normale
    } else {
      suggestedStake = 1.5; // Quote basse = puntata più alta
    }

    const reason = `Selezionate le ${optimalCount} migliori raccomandazioni con value rating medio ${
      (selectedEvts.reduce((sum, e) => sum + e.recommendation.valueRating, 0) / selectedEvts.length).toFixed(1)
    }⭐ e quote medie ${avgOdds.toFixed(2)}. Sistema ${systemName} consigliato con puntata €${suggestedStake.toFixed(2)} per colonna.`;

    setAutoSuggestion({
      events: selectedEvts,
      systemType,
      suggestedStake,
      reason
    });

    setSelectedEvents(selectedEvts);
    setSelectedSystem(systemType);
    setStakePerColumn(suggestedStake);

    console.log('🎯 Auto-selezione completata:', {
      events: selectedEvts.length,
      system: systemName,
      stake: suggestedStake,
      avgOdds
    });
  };

  const toggleEventSelection = (match: Match, rec: Recommendation) => {
    const eventId = `${match.id}-${rec.id}`;
    const existing = selectedEvents.find(e => 
      e.matchId === match.id && e.recommendation.id === rec.id
    );

    if (existing) {
      setSelectedEvents(selectedEvents.filter(e => 
        !(e.matchId === match.id && e.recommendation.id === rec.id)
      ));
    } else {
      setSelectedEvents([...selectedEvents, {
        matchId: match.id,
        matchName: `${match.homeTeam} vs ${match.awayTeam}`,
        recommendation: rec,
        time: match.time,
        competition: match.competition
      }]);
    }
  };

  const isEventSelected = (matchId: number, recId: string) => {
    return selectedEvents.some(e => e.matchId === matchId && e.recommendation.id === recId);
  };

  // Sistemi disponibili in base al numero di eventi selezionati
  const availableSystems = useMemo(() => {
    const count = selectedEvents.length;
    return Object.entries(SYSTEM_TYPES).filter(([_, system]) => 
      count >= system.minEvents && count <= system.maxEvents
    );
  }, [selectedEvents.length]);

  // Calcola le combinazioni e statistiche del sistema
  const systemStats = useMemo(() => {
    if (!selectedSystem || selectedEvents.length === 0) return null;

    const system = SYSTEM_TYPES[selectedSystem];
    if (!system) return null;

    const combinations = system.calculateCombinations(selectedEvents);
    const totalColumns = combinations.length;
    const totalStake = totalColumns * stakePerColumn;

    // Calcola vincita massima (tutti gli eventi corretti)
    const maxWin = combinations.reduce((sum, combo) => {
      return sum + (combo.totalOdds * stakePerColumn);
    }, 0);

    // Calcola vincita minima (solo le doppie corrette, scenario peggiore)
    const doppie = combinations.filter(c => c.type === 'Doppia');
    const minWin = doppie.length > 0 
      ? doppie.reduce((sum, combo) => sum + (combo.totalOdds * stakePerColumn), 0)
      : 0;

    // Scenario con 1 errore
    const win1Error = calculateWinWith1Error(combinations, stakePerColumn);

    return {
      system,
      combinations,
      totalColumns,
      totalStake,
      maxWin,
      minWin,
      win1Error,
      roi: ((maxWin - totalStake) / totalStake) * 100,
      avgOdds: selectedEvents.reduce((sum, e) => sum + e.recommendation.odds, 0) / selectedEvents.length
    };
  }, [selectedSystem, selectedEvents, stakePerColumn]);

  function calculateWinWith1Error(combinations: Combination[], stake: number): number {
    // Con 1 errore, vincono solo le combinazioni che non includono l'evento sbagliato
    // Nel caso peggiore, calcoliamo le vincite delle combinazioni più piccole
    const smallestSize = Math.min(...combinations.map(c => c.events.length));
    const smallestCombos = combinations.filter(c => c.events.length === smallestSize);
    
    // Assumiamo che N-1 combinazioni della taglia più piccola vincano
    const winningCombos = smallestCombos.slice(0, Math.max(1, smallestCombos.length - 1));
    return winningCombos.reduce((sum, combo) => sum + (combo.totalOdds * stake), 0);
  }

  const generateSystem = () => {
    if (!systemStats) return;
    setShowResults(true);
  };

  const downloadSystem = () => {
    if (!systemStats) return;

    const content = `
SISTEMA ${systemStats.system.name.toUpperCase()}
==========================================

Data: ${moment().tz('Europe/Rome').format('DD/MM/YYYY HH:mm')}

EVENTI SELEZIONATI (${selectedEvents.length}):
${selectedEvents.map((e, i) => `
${i + 1}. ${e.matchName}
   ${e.competition} - ${e.time}
   ${e.recommendation.name}: ${e.recommendation.prediction}
   Quota: ${e.recommendation.odds.toFixed(2)}
   Confidence: ${e.recommendation.confidence}%
`).join('')}

INFORMAZIONI SISTEMA:
- Totale colonne: ${systemStats.totalColumns}
- Puntata per colonna: €${stakePerColumn.toFixed(2)}
- Investimento totale: €${systemStats.totalStake.toFixed(2)}

POTENZIALI VINCITE:
- Massima (tutti corretti): €${systemStats.maxWin.toFixed(2)} (ROI: ${systemStats.roi.toFixed(2)}%)
- Con 1 errore: €${systemStats.win1Error.toFixed(2)}
- Minima (solo doppie): €${systemStats.minWin.toFixed(2)}

DETTAGLIO COLONNE:
${systemStats.combinations.map((combo, i) => `
${i + 1}. ${combo.type} - Quota: ${combo.totalOdds.toFixed(2)} - Vincita: €${(combo.totalOdds * stakePerColumn).toFixed(2)}
   ${combo.events.map(e => `${e.matchName}: ${e.recommendation.prediction}`).join('\n   ')}
`).join('')}

==========================================
Generato da Sistema Predizioni Calcio
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sistema-${systemStats.system.name.toLowerCase()}-${moment().format('YYYY-MM-DD')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl p-6 shadow-2xl border border-slate-700/50">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <span className="text-3xl">🎰</span>
          Generatore Sistemi Integrali
        </h2>
        <p className="text-gray-400 text-sm">
          Seleziona le raccomandazioni delle partite di oggi e genera un sistema integrale multi-colonna
        </p>
        <p className="text-blue-400 text-xs mt-1">
          💡 Solo partite non ancora iniziate • {matches.length} partite disponibili
        </p>
      </div>

      {/* Selezione Eventi */}
      <div className="mb-6">
        
        {availableMatches.length === 0 && loadingRecommendations.size === 0 && (
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4 text-center mb-4">
            <div className="text-blue-400 mb-2 text-xl">🎯 Generazione Sistema Automatico</div>
            <p className="text-sm text-gray-400 mb-3">
              Il sistema analizzerà tutte le partite non ancora iniziate e selezionerà automaticamente le migliori raccomandazioni per creare un sistema integrale ottimizzato
            </p>
            <button
              onClick={async () => {
                // Carica raccomandazioni per TUTTE le partite disponibili
                const matchesToLoad = matches; // TUTTE, non solo 10
                setLoadingProgress(`Analisi 0/${matchesToLoad.length} partite...`);
                
                for (let i = 0; i < matchesToLoad.length; i++) {
                  setLoadingProgress(`Analisi ${i + 1}/${matchesToLoad.length} partite...`);
                  await loadMatchRecommendations(matchesToLoad[i]);
                }
                
                setLoadingProgress('');
                console.log('✅ Tutte le raccomandazioni caricate!');
                
                // Attiva il flag per far partire l'auto-selezione via useEffect
                setShouldAutoSelect(true);
              }}
              disabled={loadingRecommendations.size > 0}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold py-3 px-8 rounded-lg transition-all disabled:opacity-50 shadow-lg text-lg"
            >
              {loadingRecommendations.size > 0 ? `⏳ ${loadingProgress}` : '🎰 Genera Sistema Automatico'}
            </button>
          </div>
        )}
        
        {/* Indicatore caricamento */}
        {loadingRecommendations.size > 0 && (
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-6 text-center mb-4">
            <div className="text-blue-400 mb-3 text-xl">⏳ Analisi in corso...</div>
            <p className="text-sm text-gray-400 mb-2">{loadingProgress}</p>
            <p className="text-xs text-gray-500 mb-3">Caricamento predizioni e calcolo probabilità per tutte le partite</p>
            <div className="mt-3 w-full bg-blue-950 rounded-full h-3">
              <div 
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-300" 
                style={{ 
                  width: `${matches.length > 0 ? ((matchRecommendations.size / matches.length) * 100) : 0}%` 
                }}
              ></div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {matchRecommendations.size} / {matches.length} partite analizzate
            </p>
          </div>
        )}
      </div>

      {/* Sistema Generato Automaticamente - UNICA SEZIONE VISIBILE */}
      {autoSuggestion && systemStats && !showResults && (
          <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-lg p-5 border border-purple-700/30 mb-4">
            <h4 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-2xl">🤖</span>
              Sistema Suggerito Automaticamente
            </h4>
            
            <div className="bg-black/20 rounded-lg p-4 mb-4">
              <p className="text-gray-300 text-sm mb-3">{autoSuggestion.reason}</p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div className="bg-purple-500/10 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Sistema</div>
                  <div className="text-xl font-bold text-purple-400">
                    {SYSTEM_TYPES[autoSuggestion.systemType]?.name}
                  </div>
                </div>
                <div className="bg-blue-500/10 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Eventi</div>
                  <div className="text-xl font-bold text-blue-400">
                    {autoSuggestion.events.length}
                  </div>
                </div>
                <div className="bg-green-500/10 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Colonne</div>
                  <div className="text-xl font-bold text-green-400">
                    {systemStats.totalColumns}
                  </div>
                </div>
                <div className="bg-yellow-500/10 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Puntata/Colonna</div>
                  <div className="text-xl font-bold text-yellow-400">
                    €{autoSuggestion.suggestedStake.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-1">💰 Investimento Totale</div>
                <div className="text-2xl font-bold text-white">
                  €{systemStats.totalStake.toFixed(2)}
                </div>
              </div>
              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-1">🎯 Vincita Massima</div>
                <div className="text-2xl font-bold text-green-400">
                  €{systemStats.maxWin.toFixed(2)}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  (se tutti gli eventi vincono)
                </div>
              </div>
              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-1">📊 ROI Massimo</div>
                <div className="text-2xl font-bold text-purple-400">
                  +{systemStats.roi.toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="bg-black/20 rounded-lg p-4">
              <div className="text-sm font-semibold text-white mb-2">🛡️ Correzione d'Errore:</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-400">Con 1 errore:</span>
                  <span className="text-yellow-400 font-bold ml-2">€{systemStats.win1Error.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Quote medie:</span>
                  <span className="text-blue-400 font-bold ml-2">{systemStats.avgOdds.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 bg-black/20 rounded-lg p-4">
              <div className="text-sm font-semibold text-white mb-3">📋 Eventi Selezionati:</div>
              <div className="space-y-2">
                {autoSuggestion.events.map((evt, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-800/50 rounded px-3 py-2">
                    <div className="flex-1">
                      <div className="text-white text-sm font-medium">{evt.matchName}</div>
                      <div className="text-gray-400 text-xs">{evt.recommendation.prediction}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-yellow-400 font-bold">@{evt.recommendation.odds.toFixed(2)}</div>
                      <div className="text-xs text-green-400">{evt.recommendation.valueRating}⭐</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
          {availableMatches.map(match => (
            <div key={match.id} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/30">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold text-white">{match.homeTeam} vs {match.awayTeam}</div>
                  <div className="text-xs text-gray-400">{match.competition} - {match.time}</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {match.recommendations?.slice(0, 6).map(rec => (
                  <button
                    key={rec.id}
                    onClick={() => toggleEventSelection(match, rec)}
                    className={`text-left p-2 rounded border transition-all ${
                      isEventSelected(match.id, rec.id)
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-700/50 border-slate-600 text-gray-300 hover:bg-slate-700'
                    }`}
                  >
                    <div className="text-xs font-medium">{rec.name}</div>
                    <div className="text-xs opacity-75">{rec.prediction}</div>
                    <div className="text-sm font-bold mt-1">@ {rec.odds.toFixed(2)}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          
          {/* Mostra anche partite senza raccomandazioni con pulsante per caricarle */}
          {matches.filter(m => !matchRecommendations.has(m.id) && !(m.recommendations && m.recommendations.length > 0)).slice(0, 5).map(match => (
            <div key={match.id} className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-400">{match.homeTeam} vs {match.awayTeam}</div>
                  <div className="text-xs text-gray-500">{match.competition} - {match.time}</div>
                </div>
                <button
                  onClick={() => loadMatchRecommendations(match)}
                  disabled={loadingRecommendations.has(match.id)}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded transition-all disabled:opacity-50"
                >
                  {loadingRecommendations.has(match.id) ? '⏳' : '🔍 Analizza'}
                </button>
              </div>
            </div>
          ))}
      </div>

      {/* Sistema Generato Automaticamente - UNICA SEZIONE VISIBILE DOPO IL CARICAMENTO */}
      {autoSuggestion && systemStats && (
        <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-lg p-6 border border-purple-700/30">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="text-3xl">🎰</span>
              Sistema Generato Automaticamente
            </h4>
            <button
              onClick={downloadSystem}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition-all flex items-center gap-2"
            >
              <span>📥</span> Scarica
            </button>
          </div>
          
          <div className="bg-black/20 rounded-lg p-4 mb-4">
            <p className="text-gray-300 text-sm mb-3">{autoSuggestion.reason}</p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div className="bg-purple-500/10 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">Sistema</div>
                <div className="text-xl font-bold text-purple-400">
                  {SYSTEM_TYPES[autoSuggestion.systemType]?.name}
                </div>
              </div>
              <div className="bg-blue-500/10 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">Eventi</div>
                <div className="text-xl font-bold text-blue-400">
                  {autoSuggestion.events.length}
                </div>
              </div>
              <div className="bg-green-500/10 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">Colonne</div>
                <div className="text-xl font-bold text-green-400">
                  {systemStats.totalColumns}
                </div>
              </div>
              <div className="bg-yellow-500/10 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">Puntata/Colonna</div>
                <div className="text-xl font-bold text-yellow-400">
                  €{autoSuggestion.suggestedStake.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-black/20 rounded-lg p-4">
              <div className="text-gray-400 text-sm mb-1">💰 Investimento Totale</div>
              <div className="text-2xl font-bold text-white">
                €{systemStats.totalStake.toFixed(2)}
              </div>
            </div>
            <div className="bg-black/20 rounded-lg p-4">
              <div className="text-gray-400 text-sm mb-1">🎯 Vincita Massima</div>
              <div className="text-2xl font-bold text-green-400">
                €{systemStats.maxWin.toFixed(2)}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                (se tutti gli eventi vincono)
              </div>
            </div>
            <div className="bg-black/20 rounded-lg p-4">
              <div className="text-gray-400 text-sm mb-1">📊 ROI Massimo</div>
              <div className="text-2xl font-bold text-purple-400">
                +{systemStats.roi.toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="bg-black/20 rounded-lg p-4 mb-4">
            <div className="text-sm font-semibold text-white mb-2">🛡️ Correzione d'Errore:</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-400">Con 1 errore:</span>
                <span className="text-yellow-400 font-bold ml-2">€{systemStats.win1Error.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-gray-400">Quote medie:</span>
                <span className="text-blue-400 font-bold ml-2">{systemStats.avgOdds.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="bg-black/20 rounded-lg p-4 mb-4">
            <div className="text-sm font-semibold text-white mb-3">📋 Eventi Selezionati:</div>
            <div className="space-y-2">
              {autoSuggestion.events.map((evt, idx) => (
                <div key={idx} className="flex items-center justify-between bg-slate-800/50 rounded px-3 py-2">
                  <div className="flex-1">
                    <div className="text-white text-sm font-medium">{evt.matchName}</div>
                    <div className="text-gray-400 text-xs">{evt.recommendation.prediction}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-yellow-400 font-bold">@{evt.recommendation.odds.toFixed(2)}</div>
                    <div className="text-xs text-green-400">{evt.recommendation.valueRating}⭐</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dettaglio Combinazioni */}
          <div className="bg-black/20 rounded-lg p-4">
            <h5 className="text-lg font-bold text-white mb-3">📊 Dettaglio Colonne ({systemStats.combinations.length})</h5>
            
            <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
              {systemStats.combinations.map((combo, i) => (
                <div key={i} className="bg-slate-900/50 rounded p-3 border border-slate-700/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white text-sm">
                      {i + 1}. {combo.type}
                    </span>
                    <div className="text-right">
                      <div className="text-yellow-400 font-bold text-sm">@ {combo.totalOdds.toFixed(2)}</div>
                      <div className="text-xs text-gray-400">
                        Vincita: €{(combo.totalOdds * stakePerColumn).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {combo.events.map((event, j) => (
                      <div key={j} className="text-xs text-gray-300 pl-2">
                        • {event.matchName}: {event.recommendation.prediction} @ {event.recommendation.odds.toFixed(2)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Help - Mostra solo quando non ci sono raccomandazioni caricate */}
      {selectedSystem && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <span>💰</span> Puntata per Colonna
          </h3>
          
          <div className="flex items-center gap-4">
            <input
              type="number"
              value={stakePerColumn}
              onChange={(e) => setStakePerColumn(Math.max(0.5, parseFloat(e.target.value) || 1))}
              min="0.5"
              step="0.5"
              className="bg-slate-800 border border-slate-700 text-white rounded px-4 py-2 w-32"
            />
            <span className="text-gray-400">€ per colonna</span>
            {systemStats && (
              <span className="text-gray-400">
                = <span className="text-white font-bold">€{systemStats.totalStake.toFixed(2)}</span> totale
              </span>
            )}
          </div>
        </div>
      )}

      {/* Anteprima Statistiche */}
      {systemStats && !showResults && (
        <div className="mb-6 bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-4 border border-blue-700/30">
          <h3 className="text-lg font-semibold text-white mb-3">📊 Anteprima Sistema</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-gray-400 text-xs mb-1">Colonne</div>
              <div className="text-2xl font-bold text-white">{systemStats.totalColumns}</div>
            </div>
            <div>
              <div className="text-gray-400 text-xs mb-1">Investimento</div>
              <div className="text-2xl font-bold text-green-400">€{systemStats.totalStake.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-400 text-xs mb-1">Vincita Max</div>
              <div className="text-2xl font-bold text-yellow-400">€{systemStats.maxWin.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-400 text-xs mb-1">ROI Max</div>
              <div className="text-2xl font-bold text-purple-400">{systemStats.roi.toFixed(0)}%</div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Con 1 errore:</span>
                <span className="text-white font-bold ml-2">€{systemStats.win1Error.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-gray-400">Quote media:</span>
                <span className="text-white font-bold ml-2">{systemStats.avgOdds.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pulsante Genera */}
      {systemStats && !showResults && (
        <button
          onClick={generateSystem}
          className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-4 px-6 rounded-lg transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
        >
          <span className="text-2xl">🎯</span>
          <span>Genera Sistema {systemStats.system.name}</span>
        </button>
      )}

      {/* Risultati Dettagliati */}
      {showResults && systemStats && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 rounded-lg p-6 border border-green-700/30">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span>✅</span> Sistema Generato con Successo!
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-black/20 rounded p-4 text-center">
                <div className="text-gray-400 text-sm mb-1">Totale Colonne</div>
                <div className="text-3xl font-bold text-white">{systemStats.totalColumns}</div>
              </div>
              <div className="bg-black/20 rounded p-4 text-center">
                <div className="text-gray-400 text-sm mb-1">Investimento</div>
                <div className="text-3xl font-bold text-green-400">€{systemStats.totalStake.toFixed(2)}</div>
              </div>
              <div className="bg-black/20 rounded p-4 text-center">
                <div className="text-gray-400 text-sm mb-1">Vincita Massima</div>
                <div className="text-3xl font-bold text-yellow-400">€{systemStats.maxWin.toFixed(2)}</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={downloadSystem}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <span>📥</span> Scarica Sistema
              </button>
              <button
                onClick={() => setShowResults(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-lg transition-all"
              >
                Modifica
              </button>
            </div>
          </div>

          {/* Dettaglio Combinazioni */}
          <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/30">
            <h4 className="text-lg font-bold text-white mb-4">📋 Dettaglio Colonne ({systemStats.combinations.length})</h4>
            
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {systemStats.combinations.map((combo, i) => (
                <div key={i} className="bg-slate-900/50 rounded p-3 border border-slate-700/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white">
                      {i + 1}. {combo.type}
                    </span>
                    <div className="text-right">
                      <div className="text-yellow-400 font-bold">@ {combo.totalOdds.toFixed(2)}</div>
                      <div className="text-xs text-gray-400">
                        Vincita: €{(combo.totalOdds * stakePerColumn).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {combo.events.map((event, j) => (
                      <div key={j} className="text-xs text-gray-300 pl-4">
                        • {event.matchName}: {event.recommendation.prediction} @ {event.recommendation.odds.toFixed(2)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Help */}
      {selectedEvents.length < 3 && (
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4 text-center">
          <div className="text-blue-400 mb-2">ℹ️ Come funziona?</div>
          <p className="text-sm text-gray-400">
            Seleziona almeno 3 raccomandazioni dalle partite di oggi per generare un sistema.
            I sistemi permettono di vincere anche se sbagli uno o più pronostici!
          </p>
        </div>
      )}
    </div>
  );
}
