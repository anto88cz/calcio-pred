/**
 * Simple Prediction Card - Zero dependencies, pure CSS
 */

'use client';

interface Prediction {
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  predictions: {
    homeGoals: number;
    awayGoals: number;
    prob1: number;
    probX: number;
    prob2: number;
  };
  confidence: number;
  teamStats?: {
    home: { xg: number; xga: number };
    away: { xg: number; xga: number };
  };
  overUnder?: {
    over05?: number;
    over15?: number;
    over25?: number;
    over35?: number;
    over45?: number;
  };
  btts?: {
    yes: number;
    no: number;
  };
  valueBets?: Array<{
    market: string;
    value: number;
  }>;
}

interface Props {
  predictions: Prediction[];
}

export default function SimplePredictionCard({ predictions }: Props) {
  if (!predictions || predictions.length === 0) return null;

  const pred = predictions[0];

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>
            {pred.homeTeam} vs {pred.awayTeam}
          </h1>
          <p style={styles.subtitle}>{pred.league}</p>
          <p style={styles.date}>
            {new Date(pred.date).toLocaleString('it-IT')}
          </p>
        </div>

        {/* Main Prediction */}
        <div style={styles.mainPrediction}>
          <div style={styles.scoreBox}>
            <div style={styles.scoreLabel}>Previsione Risultato</div>
            <div style={styles.score}>
              {pred.predictions.homeGoals.toFixed(1)} - {pred.predictions.awayGoals.toFixed(1)}
            </div>
          </div>
        </div>

        {/* Probabilities */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Probabilità Risultato (1X2)</h3>
          <div style={styles.probGrid}>
            <div style={styles.probBox}>
              <div style={styles.probLabel}>Vittoria Casa</div>
              <div style={styles.probValue}>{pred.predictions.prob1.toFixed(1)}%</div>
            </div>
            <div style={styles.probBox}>
              <div style={styles.probLabel}>Pareggio</div>
              <div style={styles.probValue}>{pred.predictions.probX.toFixed(1)}%</div>
            </div>
            <div style={styles.probBox}>
              <div style={styles.probLabel}>Vittoria Trasferta</div>
              <div style={styles.probValue}>{pred.predictions.prob2.toFixed(1)}%</div>
            </div>
          </div>
        </div>

        {/* Expected Goals */}
        {pred.teamStats && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Expected Goals (xG)</h3>
            <div style={styles.xgGrid}>
              <div style={styles.xgBox}>
                <div style={styles.xgTeam}>{pred.homeTeam}</div>
                <div style={styles.xgValue}>xG: {pred.teamStats.home.xg.toFixed(2)}</div>
                <div style={styles.xgValue}>xGA: {pred.teamStats.home.xga.toFixed(2)}</div>
              </div>
              <div style={styles.xgBox}>
                <div style={styles.xgTeam}>{pred.awayTeam}</div>
                <div style={styles.xgValue}>xG: {pred.teamStats.away.xg.toFixed(2)}</div>
                <div style={styles.xgValue}>xGA: {pred.teamStats.away.xga.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Over/Under */}
        {pred.overUnder && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Over/Under</h3>
            <div style={styles.overUnderGrid}>
              {pred.overUnder.over05 !== undefined && (
                <div style={styles.ouBox}>Over 0.5: <strong>{pred.overUnder.over05.toFixed(1)}%</strong></div>
              )}
              {pred.overUnder.over15 !== undefined && (
                <div style={styles.ouBox}>Over 1.5: <strong>{pred.overUnder.over15.toFixed(1)}%</strong></div>
              )}
              {pred.overUnder.over25 !== undefined && (
                <div style={styles.ouBox}>Over 2.5: <strong>{pred.overUnder.over25.toFixed(1)}%</strong></div>
              )}
              {pred.overUnder.over35 !== undefined && (
                <div style={styles.ouBox}>Over 3.5: <strong>{pred.overUnder.over35.toFixed(1)}%</strong></div>
              )}
            </div>
          </div>
        )}

        {/* BTTS */}
        {pred.btts && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Both Teams To Score</h3>
            <div style={styles.bttsGrid}>
              <div style={styles.bttsBox}>
                <span>Yes: </span>
                <strong>{pred.btts.yes.toFixed(1)}%</strong>
              </div>
              <div style={styles.bttsBox}>
                <span>No: </span>
                <strong>{pred.btts.no.toFixed(1)}%</strong>
              </div>
            </div>
          </div>
        )}

        {/* Confidence */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Affidabilità Predizione</h3>
          <div style={styles.confidenceBox}>
            <div style={{
              ...styles.confidenceValue,
              color: pred.confidence >= 70 ? '#22c55e' : pred.confidence >= 50 ? '#eab308' : '#ef4444'
            }}>
              {pred.confidence.toFixed(0)}%
            </div>
            <div style={styles.confidenceLabel}>
              {pred.confidence >= 70 ? 'Alta Affidabilità' : pred.confidence >= 50 ? 'Media Affidabilità' : 'Bassa Affidabilità'}
            </div>
          </div>
        </div>

        {/* Value Bet */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Value Betting</h3>
          {pred.valueBets && pred.valueBets.length > 0 ? (
            <div style={styles.valueBetYes}>
              <div style={styles.valueBetIcon}>✅</div>
              <div>
                <div style={styles.valueBetTitle}>GIOCA QUESTA SCOMMESSA</div>
                <div style={styles.valueBetDetail}>
                  {pred.valueBets[0].market}: {pred.valueBets[0].value.toFixed(2)}
                </div>
              </div>
            </div>
          ) : (
            <div style={styles.valueBetNo}>
              <div style={styles.valueBetIcon}>⏸️</div>
              <div style={styles.valueBetTitle}>SKIP - Nessun valore trovato</div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// Pure CSS-in-JS styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    maxWidth: '900px',
    margin: '0 auto',
    padding: '20px',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    padding: '30px',
  },
  header: {
    borderBottom: '3px solid #e5e7eb',
    paddingBottom: '20px',
    marginBottom: '30px',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold' as const,
    color: '#111827',
    marginBottom: '10px',
  },
  subtitle: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '5px',
  },
  date: {
    fontSize: '14px',
    color: '#9ca3af',
  },
  mainPrediction: {
    backgroundColor: '#f3f4f6',
    borderRadius: '10px',
    padding: '30px',
    marginBottom: '30px',
    textAlign: 'center' as const,
  },
  scoreBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '10px',
    textTransform: 'uppercase' as const,
    fontWeight: '600' as const,
  },
  score: {
    fontSize: '48px',
    fontWeight: 'bold' as const,
    color: '#059669',
  },
  section: {
    marginBottom: '30px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 'bold' as const,
    color: '#374151',
    marginBottom: '15px',
    paddingBottom: '10px',
    borderBottom: '2px solid #e5e7eb',
  },
  probGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '15px',
  },
  probBox: {
    backgroundColor: '#f9fafb',
    padding: '20px',
    borderRadius: '8px',
    textAlign: 'center' as const,
    border: '1px solid #e5e7eb',
  },
  probLabel: {
    fontSize: '13px',
    color: '#6b7280',
    marginBottom: '8px',
  },
  probValue: {
    fontSize: '24px',
    fontWeight: 'bold' as const,
    color: '#1f2937',
  },
  xgGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '15px',
  },
  xgBox: {
    backgroundColor: '#eff6ff',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #bfdbfe',
  },
  xgTeam: {
    fontSize: '16px',
    fontWeight: 'bold' as const,
    color: '#1e40af',
    marginBottom: '10px',
  },
  xgValue: {
    fontSize: '14px',
    color: '#374151',
    marginTop: '5px',
  },
  overUnderGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '10px',
  },
  ouBox: {
    backgroundColor: '#fef3c7',
    padding: '15px',
    borderRadius: '8px',
    border: '1px solid #fde68a',
    fontSize: '14px',
  },
  bttsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '15px',
  },
  bttsBox: {
    backgroundColor: '#f0fdf4',
    padding: '15px',
    borderRadius: '8px',
    border: '1px solid #bbf7d0',
    fontSize: '16px',
    textAlign: 'center' as const,
  },
  confidenceBox: {
    textAlign: 'center' as const,
    padding: '20px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
  },
  confidenceValue: {
    fontSize: '42px',
    fontWeight: 'bold' as const,
    marginBottom: '10px',
  },
  confidenceLabel: {
    fontSize: '14px',
    color: '#6b7280',
  },
  valueBetYes: {
    backgroundColor: '#dcfce7',
    border: '2px solid #22c55e',
    borderRadius: '8px',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
  },
  valueBetNo: {
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
  },
  valueBetIcon: {
    fontSize: '32px',
  },
  valueBetTitle: {
    fontSize: '18px',
    fontWeight: 'bold' as const,
    color: '#111827',
  },
  valueBetDetail: {
    fontSize: '14px',
    color: '#6b7280',
    marginTop: '5px',
  },
};
