import React from 'react';

interface InjuredPlayer {
  playerId: number;
  playerName: string;
  playerPhoto: string;
  type: string;
  reason: string;
  position?: string;
}

interface TeamInjuries {
  teamId: number;
  teamName: string;
  players: InjuredPlayer[];
  totalInjuries: number;
  severityScore: number;
  impactFactor: {
    attacking: number;
    defensive: number;
  };
}

interface InjuriesAnalysis {
  home: TeamInjuries;
  away: TeamInjuries;
  homeAdvantage: boolean;
  awayAdvantage: boolean;
  balanced: boolean;
  impactDescription: string;
}

interface InjuriesCardProps {
  analysis: InjuriesAnalysis;
}

const InjuriesCard: React.FC<InjuriesCardProps> = ({ analysis }) => {
  const {  home, away, homeAdvantage, awayAdvantage, balanced, impactDescription } = analysis;

  // Calculate total injuries across both teams
  const totalInjuries = home.totalInjuries + away.totalInjuries;

  // Helper function to get severity color
  const getSeverityColor = (score: number) => {
    if (score >= 75) return 'from-red-600 to-red-800';
    if (score >= 50) return 'from-orange-600 to-orange-800';
    if (score >= 25) return 'from-yellow-600 to-yellow-800';
    return 'from-green-600 to-green-800';
  };

  // Helper function to get advantage badge
  const getAdvantageBadge = () => {
    if (balanced) {
      return (
        <span className="px-4 py-2 bg-blue-500/20 border border-blue-500/50 rounded-xl text-blue-300 font-bold text-sm">
          ⚖️ Equilibrato
        </span>
      );
    }
    if (homeAdvantage) {
      return (
        <span className="px-4 py-2 bg-green-500/20 border border-green-500/50 rounded-xl text-green-300 font-bold text-sm">
          🏠 Vantaggio Casa
        </span>
      );
    }
    if (awayAdvantage) {
      return (
        <span className="px-4 py-2 bg-purple-500/20 border border-purple-500/50 rounded-xl text-purple-300 font-bold text-sm">
          ✈️ Vantaggio Trasferta
        </span>
      );
    }
    return null;
  };

  // Helper function to get position emoji
  const getPositionEmoji = (position?: string) => {
    switch (position) {
      case 'Goalkeeper':
        return '🧤';
      case 'Defender':
        return '🛡️';
      case 'Midfielder':
        return '⚙️';
      case 'Attacker':
        return '⚽';
      default:
        return '👤';
    }
  };

  // Helper function to get type badge color
  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'Injury':
        return 'bg-red-500/20 text-red-300 border-red-500/50';
      case 'Suspended':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50';
      case 'Missing':
        return 'bg-gray-500/20 text-gray-300 border-gray-500/50';
      case 'Doubtful':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/50';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/50';
    }
  };

  // Helper function to translate type to Italian
  const translateType = (type: string) => {
    const translations: Record<string, string> = {
      Injury: 'Infortunato',
      Suspended: 'Squalificato',
      Missing: 'Assente',
      Doubtful: 'Dubbio',
    };
    return translations[type] || type;
  };

  // If no injuries, don't render
  if (totalInjuries === 0) {
    return null;
  }

  return (
    <div className="relative mb-8">
      <div className="absolute -inset-2 bg-gradient-to-r from-red-500/20 via-orange-500/20 to-yellow-500/20 rounded-3xl blur-xl"></div>
      
      <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <span className="text-3xl">🏥</span>
            <h3 className="text-2xl font-black text-white">Infortuni & Squalifiche</h3>
          </div>
          {getAdvantageBadge()}
        </div>

        {/* Impact Description */}
        <div className="mb-6 bg-blue-500/10 border border-blue-500/20 rounded-2xl px-6 py-4">
          <p className="text-blue-200 text-center font-medium">{impactDescription}</p>
        </div>

        {/* Teams Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Home Team Injuries */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xl font-bold text-white">🏠 {home.teamName || 'Casa'}</h4>
              <span className="text-sm text-gray-400">{home.totalInjuries} giocatori</span>
            </div>

            {/* Severity Badge */}
            <div className={`bg-gradient-to-r ${getSeverityColor(home.severityScore)} rounded-xl p-4`}>
              <div className="flex items-center justify-between">
                <span className="text-white font-bold">Severità</span>
                <span className="text-white text-2xl font-black">{home.severityScore}</span>
              </div>
              <div className="mt-2 w-full bg-white/20 rounded-full h-2">
                <div
                  className="bg-white rounded-full h-2 transition-all"
                  style={{ width: `${Math.min(100, home.severityScore)}%` }}
                ></div>
              </div>
            </div>

            {/* Impact Factors */}
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                <span className="text-gray-300">⚔️ Attacco</span>
                <span className={`font-bold ${home.impactFactor.attacking < 1 ? 'text-red-400' : 'text-green-400'}`}>
                  {home.impactFactor.attacking < 1 ? '' : '+'}
                  {((home.impactFactor.attacking - 1) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                <span className="text-gray-300">🛡️ Difesa</span>
                <span className={`font-bold ${home.impactFactor.defensive > 1 ? 'text-red-400' : 'text-green-400'}`}>
                  {home.impactFactor.defensive > 1 ? '+' : ''}
                  {((home.impactFactor.defensive - 1) * 100).toFixed(0)}% gol subiti
                </span>
              </div>
            </div>

            {/* Players List */}
            {home.players.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400 font-semibold">Giocatori assenti:</p>
                {home.players.slice(0, 5).map((player) => (
                  <div
                    key={player.playerId}
                    className="bg-white/5 border border-white/10 rounded-xl p-3 hover:bg-white/10 transition-all"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{getPositionEmoji(player.position)}</span>
                      <div className="flex-1">
                        <p className="text-white font-bold text-sm">{player.playerName}</p>
                        <p className="text-gray-400 text-xs">{player.reason}</p>
                      </div>
                      <span className={`px-2 py-1 border rounded-lg text-xs font-semibold ${getTypeBadgeColor(player.type)}`}>
                        {translateType(player.type)}
                      </span>
                    </div>
                  </div>
                ))}
                {home.players.length > 5 && (
                  <p className="text-xs text-gray-500 text-center">+{home.players.length - 5} altri...</p>
                )}
              </div>
            )}

            {home.totalInjuries === 0 && (
              <div className="text-center py-6">
                <p className="text-green-400 font-semibold">✅ Nessun infortunio</p>
              </div>
            )}
          </div>

          {/* Away Team Injuries */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xl font-bold text-white">✈️ {away.teamName || 'Trasferta'}</h4>
              <span className="text-sm text-gray-400">{away.totalInjuries} giocatori</span>
            </div>

            {/* Severity Badge */}
            <div className={`bg-gradient-to-r ${getSeverityColor(away.severityScore)} rounded-xl p-4`}>
              <div className="flex items-center justify-between">
                <span className="text-white font-bold">Severità</span>
                <span className="text-white text-2xl font-black">{away.severityScore}</span>
              </div>
              <div className="mt-2 w-full bg-white/20 rounded-full h-2">
                <div
                  className="bg-white rounded-full h-2 transition-all"
                  style={{ width: `${Math.min(100, away.severityScore)}%` }}
                ></div>
              </div>
            </div>

            {/* Impact Factors */}
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                <span className="text-gray-300">⚔️ Attacco</span>
                <span className={`font-bold ${away.impactFactor.attacking < 1 ? 'text-red-400' : 'text-green-400'}`}>
                  {away.impactFactor.attacking < 1 ? '' : '+'}
                  {((away.impactFactor.attacking - 1) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                <span className="text-gray-300">🛡️ Difesa</span>
                <span className={`font-bold ${away.impactFactor.defensive > 1 ? 'text-red-400' : 'text-green-400'}`}>
                  {away.impactFactor.defensive > 1 ? '+' : ''}
                  {((away.impactFactor.defensive - 1) * 100).toFixed(0)}% gol subiti
                </span>
              </div>
            </div>

            {/* Players List */}
            {away.players.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400 font-semibold">Giocatori assenti:</p>
                {away.players.slice(0, 5).map((player) => (
                  <div
                    key={player.playerId}
                    className="bg-white/5 border border-white/10 rounded-xl p-3 hover:bg-white/10 transition-all"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{getPositionEmoji(player.position)}</span>
                      <div className="flex-1">
                        <p className="text-white font-bold text-sm">{player.playerName}</p>
                        <p className="text-gray-400 text-xs">{player.reason}</p>
                      </div>
                      <span className={`px-2 py-1 border rounded-lg text-xs font-semibold ${getTypeBadgeColor(player.type)}`}>
                        {translateType(player.type)}
                      </span>
                    </div>
                  </div>
                ))}
                {away.players.length > 5 && (
                  <p className="text-xs text-gray-500 text-center">+{away.players.length - 5} altri...</p>
                )}
              </div>
            )}

            {away.totalInjuries === 0 && (
              <div className="text-center py-6">
                <p className="text-green-400 font-semibold">✅ Nessun infortunio</p>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 pt-6 border-t border-white/10">
          <p className="text-xs text-gray-500 text-center">
            💡 Impatto calcolato su Expected Goals (xG). Severity: 0-25 Basso, 25-50 Medio, 50-75 Alto, 75+ Critico
          </p>
        </div>
      </div>
    </div>
  );
};

export default InjuriesCard;
