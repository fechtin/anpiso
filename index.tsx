
import './index.css';
import { Buffer } from 'buffer';

// Polyfill Buffer and process for the browser
window.Buffer = Buffer;
(window as any).global = window;
(window as any).process = { env: {}, browser: true };

import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ViewerPage from './pages/ViewerPage';
import { LocaleContext, detectLocale, getTranslations, type Locale } from './i18n';

function Root() {
  const path = window.location.pathname;
  const viewMatch = path.match(/^\/view\/([a-zA-Z0-9]+)$/);

  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('pref_locale', l);
  };
  const localeCtx = useMemo(() => ({
    locale, setLocale, t: getTranslations(locale),
  }), [locale]);

  const content = viewMatch ? <ViewerPage roomId={viewMatch[1]} /> : <App />;

  return (
    <LocaleContext.Provider value={localeCtx}>
      {content}
    </LocaleContext.Provider>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Cache root across HMR reloads to avoid "createRoot called twice" warnings
const w = window as any;
const root = w.__appRoot ?? (w.__appRoot = ReactDOM.createRoot(rootElement));
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
