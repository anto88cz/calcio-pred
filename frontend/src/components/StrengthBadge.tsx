/**
 * Badge Forza Predizione
 */

import { STRENGTH_BADGES, type PredictionStrength } from '@/types';

interface StrengthBadgeProps {
  strength: PredictionStrength;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function StrengthBadge({ 
  strength, 
  showIcon = true,
  size = 'md' 
}: StrengthBadgeProps) {
  const badge = STRENGTH_BADGES[strength];
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2',
  };
  
  const getGlowEffect = (strength: PredictionStrength) => {
    switch (strength) {
      case 'GIOCALA':
        return 'shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40';
      case 'FORTE':
        return 'shadow-lg shadow-green-500/25 hover:shadow-green-500/40';
      case 'MEDIO':
        return 'shadow-lg shadow-yellow-500/25 hover:shadow-yellow-500/40';
      case 'NEUTRALE':
        return 'shadow-lg shadow-gray-500/25 hover:shadow-gray-500/40';
      case 'ND':
        return 'shadow-lg shadow-red-500/25 hover:shadow-red-500/40';
      default:
        return 'shadow-lg';
    }
  };
  
  return (
    <div className="relative group">
      <div className={`absolute -inset-0.5 bg-gradient-to-r ${
        strength === 'GIOCALA' ? 'from-emerald-500 to-emerald-600' :
        strength === 'FORTE' ? 'from-green-500 to-green-600' :
        strength === 'MEDIO' ? 'from-yellow-500 to-yellow-600' :
        strength === 'NEUTRALE' ? 'from-gray-400 to-gray-500' :
        'from-red-500 to-red-600'
      } rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-300`}></div>
      
      <span
        className={`
          relative inline-flex items-center gap-2 rounded-xl border-2 font-bold transition-all duration-300
          ${badge.color} ${badge.bgColor} ${badge.borderColor} ${sizeClasses[size]} ${getGlowEffect(strength)}
          hover:scale-105 transform
        `}
      >
        {showIcon && <span className="filter drop-shadow-sm">{badge.icon}</span>}
        <span className="font-black tracking-wide">{badge.label}</span>
      </span>
    </div>
  );
}
