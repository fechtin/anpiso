
import React from 'react';
import { useLocale } from '../i18n';

const Header: React.FC = () => {
  const { t } = useLocale();
  return (
    <header className="px-0 sm:px-2">
      <div className="flex items-center space-x-2.5 sm:space-x-4">
        <img
          src="/icon-light-color.png"
          alt="Anpiso"
          className="w-9 h-9 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl border border-slate-100 shadow-md shadow-slate-200 shrink-0"
        />
        <div className="min-w-0">
          <h1 className="brand-shimmer text-lg sm:text-3xl font-extrabold tracking-tight leading-tight truncate bg-gradient-to-r from-[#496CE9] via-[#9D7DF6] to-[#496CE9] bg-clip-text text-transparent">{t.loginTitle}</h1>
          <p className="text-[10px] sm:text-sm text-slate-400 font-medium leading-tight truncate">{t.headerTitle}</p>
        </div>
      </div>
    </header>
  );
};

export default Header;
