import React from 'react';
import { Radio, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { THEMES } from '../../utils/theme';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showTagline?: boolean;
  layout?: 'horizontal' | 'vertical';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ 
  size = 'md', 
  showTagline = true,
  layout = 'horizontal' 
}) => {
  const { settings } = useAuth();
  const theme = settings?.theme ? THEMES[settings.theme] : THEMES.emerald;
  const siteName = settings?.siteName || 'KB MAX';
  const tagline = settings?.tagline || 'Live SMS Relay & Gateway';
  const [imgError, setImgError] = React.useState(false);

  // Reset img error if logo url changes
  React.useEffect(() => {
    setImgError(false);
  }, [settings?.customLogoUrl]);

  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
    '2xl': 'w-24 h-24 sm:w-28 sm:h-28',
  };

  const textSizes = {
    sm: 'text-base font-black tracking-wider',
    md: 'text-xl font-black tracking-wider',
    lg: 'text-2xl font-black tracking-wider',
    xl: 'text-3xl font-black tracking-widest',
    '2xl': 'text-3xl sm:text-4xl font-black tracking-widest',
  };

  const hasCustomLogo = settings?.logoType === 'custom_url' && settings.customLogoUrl && !imgError;
  const isVertical = layout === 'vertical' || size === '2xl';

  return (
    <div className={`flex ${isVertical ? 'flex-col items-center text-center gap-4' : 'items-center gap-3'} select-none`}>
      {hasCustomLogo ? (
        <div className="relative shrink-0 flex items-center justify-center">
          <img
            src={settings.customLogoUrl}
            alt={siteName}
            onError={() => setImgError(true)}
            className={`${
              size === '2xl' 
                ? 'max-h-28 sm:max-h-32 max-w-[280px] p-2.5 shadow-2xl' 
                : size === 'xl' 
                ? 'max-h-20 max-w-[220px] p-1.5 shadow-xl' 
                : 'max-h-12 max-w-[160px] p-1 shadow-md'
            } w-auto object-contain rounded-2xl border border-slate-700/80 bg-slate-950/90`}
          />
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 shadow-md" />
        </div>
      ) : (
        <div className="relative shrink-0 flex items-center justify-center">
          <div
            className={`${iconSizes[size]} rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 border ${theme.accentBorder} flex items-center justify-center shadow-2xl relative overflow-hidden group`}
          >
            <div className="absolute inset-0 bg-emerald-500/15 opacity-60 group-hover:opacity-100 transition-opacity" />
            <Radio 
              className={`${
                size === 'sm' 
                  ? 'w-4 h-4' 
                  : size === 'lg' 
                  ? 'w-6 h-6' 
                  : size === 'xl' 
                  ? 'w-8 h-8' 
                  : size === '2xl' 
                  ? 'w-12 h-12 sm:w-14 sm:h-14' 
                  : 'w-5 h-5'
              } ${theme.primaryText} relative z-10 animate-pulse`} 
            />
          </div>
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 shadow-md" />
        </div>
      )}

      <div className={`flex flex-col min-w-0 ${isVertical ? 'items-center text-center' : ''}`}>
        <div className="flex items-center justify-center gap-2">
          <span className={`${textSizes[size]} uppercase font-black font-sans bg-gradient-to-r from-white via-slate-100 to-emerald-400 bg-clip-text text-transparent drop-shadow-md truncate`}>
            {siteName}
          </span>
          <span className="px-2 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0 shadow-sm">
            LIVE
          </span>
        </div>
        {showTagline && (
          <span className={`${size === '2xl' ? 'text-xs sm:text-sm mt-1' : 'text-[11px]'} text-slate-400 font-semibold tracking-wide truncate`}>
            {tagline}
          </span>
        )}
      </div>
    </div>
  );
};
