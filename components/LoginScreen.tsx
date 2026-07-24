
import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';
import { User } from '../types';
import { useLocale, LOCALE_OPTIONS } from '../i18n';

interface Props {
  onLoginSuccess: (user: User) => void;
}

const INK = '#1D1A17';
const PAPER = '#FBFAF8';
const LINE = '#E8E4DC';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

// Mũi tên vẽ tay chú thích vignette
const HandArrow = () => (
  <svg viewBox="0 0 90 60" className="w-16 h-11" fill="none" aria-hidden="true">
    <path d="M84 8 C 60 14, 30 18, 10 46" stroke={INK} strokeWidth="2" strokeLinecap="round"/>
    <path d="M22 40 L 9 48 L 20 52" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const LoginScreen: React.FC<Props> = ({ onLoginSuccess }) => {
  const { t, locale, setLocale } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      const credential = GoogleAuthProvider.credentialFromResult(result);

      const user: User = {
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || '',
        email: firebaseUser.email || '',
        picture: firebaseUser.photoURL || '',
        accessToken: credential?.accessToken || undefined,
      };
      onLoginSuccess(user);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(t.loginAuthError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const FEATURES = [
    { title: t.landingFeat1Title, desc: t.landingFeat1Desc },
    { title: t.landingFeat2Title, desc: t.landingFeat2Desc },
    { title: t.landingFeat3Title, desc: t.landingFeat3Desc },
    { title: t.landingFeat4Title, desc: t.landingFeat4Desc },
  ];

  const TIMELINE = [
    { time: t.landingT1Time, text: t.landingT1Text },
    { time: t.landingT2Time, text: t.landingT2Text },
    { time: t.landingT3Time, text: t.landingT3Text },
    { time: t.landingT4Time, text: t.landingT4Text },
  ];

  const FAQS = [
    { q: t.landingFaq1Q, a: t.landingFaq1A },
    { q: t.landingFaq2Q, a: t.landingFaq2A },
    { q: t.landingFaq3Q, a: t.landingFaq3A },
    { q: t.landingFaq4Q, a: t.landingFaq4A },
  ];

  const ctaButton = (
    <button
      onClick={handleGoogleSignIn}
      disabled={isLoading}
      className="inline-flex items-center justify-center gap-3 px-7 py-3.5 rounded-xl font-bold text-sm text-white hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
      style={{ backgroundColor: INK, boxShadow: '0 10px 24px rgba(29,26,23,0.18)' }}
    >
      <span className="w-7 h-7 bg-white rounded-full flex items-center justify-center shrink-0">
        <GoogleIcon />
      </span>
      {isLoading ? t.loginLoading : t.landingCtaButton}
    </button>
  );

  return (
    <div className="landing-body min-h-screen" style={{ backgroundColor: PAPER, color: INK }}>
      <div className="max-w-5xl mx-auto px-5 sm:px-8">

        {/* Nav */}
        <nav className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2.5">
            <img src="/icon-light.png" alt="Anpiso" className="w-12 h-12 rounded-xl border shadow-sm" style={{ borderColor: LINE }} />
            <div>
              <p className="font-display text-[28px] font-bold leading-none">{t.loginTitle}</p>
              <p className="text-xs text-stone-500 font-medium mt-1">{t.headerTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 border rounded-full p-1 bg-white" style={{ borderColor: LINE }}>
            {LOCALE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setLocale(opt.value)}
                title={opt.label}
                className={`w-8 h-8 rounded-full text-sm flex items-center justify-center transition-all ${
                  locale === opt.value ? 'bg-stone-100 scale-110' : 'opacity-40 hover:opacity-100'
                }`}
              >
                {opt.flag}
              </button>
            ))}
          </div>
        </nav>

        {/* Hero */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-10 items-center pt-10 sm:pt-16 pb-16 sm:pb-24">
          <div className="space-y-7">
            <h1 className="font-display font-bold text-[2.6rem] sm:text-6xl leading-[1.25] tracking-tight">
              {t.landingHeroPre}
              <br />
              <span className="hl-marker">{t.landingHeroHl}</span> {t.landingHeroPost}
            </h1>
            <p className="text-stone-600 text-base sm:text-lg leading-relaxed max-w-xl">{t.landingSub}</p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
              {ctaButton}
              <a href="#work" className="text-sm font-semibold text-stone-500 hover:text-stone-900 transition-colors inline-flex items-center gap-2">
                {t.landingSeeFeatures} <i className="fas fa-arrow-down text-[10px]"></i>
              </a>
            </div>
            <p className="text-xs text-stone-400 flex items-center gap-2">
              <i className="fas fa-key text-[10px]"></i>
              {t.landingCtaHint}
            </p>
            {error && (
              <div className="inline-flex items-start gap-2 p-3.5 bg-red-50 rounded-xl border border-red-100">
                <i className="fas fa-exclamation-circle text-red-500 text-sm mt-0.5"></i>
                <p className="text-red-600 text-xs font-semibold leading-relaxed">{error}</p>
              </div>
            )}
            {isLoading && (
              <div className="flex items-center gap-2 text-stone-500 text-xs font-bold animate-pulse">
                <i className="fas fa-circle-notch fa-spin"></i>
                {t.loginAuthenticating}
              </div>
            )}
          </div>

          {/* Product vignette: khung browser + app thật thu nhỏ */}
          <div className="relative" aria-hidden="true">
            <div className="bg-white rounded-2xl border shadow-[0_20px_50px_rgba(29,26,23,0.08)]" style={{ borderColor: LINE }}>
              {/* Browser bar */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: LINE }}>
                <span className="w-2.5 h-2.5 rounded-full bg-red-300"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-300"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-300"></span>
                <div className="ml-2 flex-1 max-w-[220px] bg-stone-100 rounded-md px-3 py-1 text-[10px] text-stone-400 font-medium truncate">
                  anpiso.fechtin.com
                </div>
              </div>
              {/* Mini app UI */}
              <div className="p-4 space-y-3" style={{ backgroundColor: '#FBFAF8' }}>
                <div className="bg-white border border-slate-200/80 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-200">
                    <i className="fas fa-microphone text-sm"></i>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800">{t.readyCompact}</p>
                    <p className="text-[10px] text-slate-400 truncate">{t.captureOnline} · {t.multilingual}</p>
                  </div>
                  <span className="ml-auto text-[9px] font-bold text-slate-400 border border-slate-200 rounded-lg px-2 py-1.5 shrink-0">
                    <i className="fas fa-sliders mr-1"></i>{t.settingsToggle}
                  </span>
                </div>
                <div className="bg-white border border-slate-200/80 rounded-xl divide-y divide-slate-100">
                  <div className="p-3">
                    <p className="text-[11px] font-bold text-slate-700 truncate">{t.landingVigMeeting1}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">{t.landingVigMeeting1Meta}</p>
                  </div>
                  <div className="p-3">
                    <p className="text-[11px] font-bold text-slate-700 truncate">{t.landingVigMeeting2}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">{t.landingVigMeeting2Meta}</p>
                  </div>
                </div>
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3 flex items-center gap-2.5">
                  <i className="fas fa-wand-magic-sparkles text-indigo-500 text-xs"></i>
                  <p className="text-[10px] font-bold text-indigo-700 truncate">{t.landingVigReady}</p>
                  <i className="fas fa-check-circle text-emerald-500 text-sm ml-auto"></i>
                </div>
              </div>
            </div>

            {/* Sticky note */}
            <div className="absolute -top-5 -right-2 sm:-right-5 rotate-3 bg-amber-100 border border-amber-200/70 rounded-sm px-3.5 py-2.5 shadow-md">
              <p className="font-hand text-base leading-none" style={{ color: '#92600a' }}>{t.landingVigNote}</p>
            </div>

            {/* Hand-drawn annotation */}
            <div className="absolute -bottom-12 right-6 flex items-end gap-1.5">
              <p className="font-hand text-lg text-stone-600 -rotate-2">{t.landingVigArrow}</p>
              <HandArrow />
            </div>
          </div>
        </section>

        {/* Timeline */}
        <section id="work" className="py-14 sm:py-20 border-t" style={{ borderColor: LINE }}>
          <h2 className="font-display font-bold text-2xl sm:text-4xl tracking-tight mb-10 sm:mb-14">
            <span className="hl-marker">{t.landingTimelineTitle}</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8">
            {TIMELINE.map((s, i) => (
              <div key={i} className="relative pl-4 border-l-2" style={{ borderColor: i === TIMELINE.length - 1 ? '#4f46e5' : LINE }}>
                <p className={`font-mono text-xs font-bold mb-2 ${i === TIMELINE.length - 1 ? 'text-indigo-600' : 'text-stone-400'}`}>{s.time}</p>
                <p className="text-sm text-stone-700 leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features — danh sách editorial đánh số */}
        <section className="py-14 sm:py-20 border-t" style={{ borderColor: LINE }}>
          <h2 className="font-display font-bold text-2xl sm:text-4xl tracking-tight mb-10 sm:mb-14">{t.landingFeaturesTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-14 gap-y-10">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex gap-5">
                <span className="font-display text-3xl sm:text-4xl font-semibold text-stone-300 leading-none shrink-0 w-12">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="font-bold text-base sm:text-lg mb-1.5">{f.title}</h3>
                  <p className="text-stone-500 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Why we built this */}
        <section className="py-14 sm:py-20 border-t" style={{ borderColor: LINE }}>
          <div className="max-w-2xl">
            <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-tight mb-6">{t.landingWhyTitle}</h2>
            <p className="font-display text-lg sm:text-xl leading-relaxed text-stone-700 italic">"{t.landingWhyBody}"</p>
            <p className="font-hand text-xl text-stone-500 mt-6">{t.landingWhySign}</p>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-14 sm:py-20 border-t" style={{ borderColor: LINE }}>
          <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-tight mb-8">{t.landingFaqTitle}</h2>
          <div className="max-w-2xl divide-y" style={{ borderColor: LINE }}>
            {FAQS.map((f, i) => (
              <div key={i} className="py-5">
                <p className="font-bold text-sm sm:text-base mb-1.5">{f.q}</p>
                <p className="text-stone-500 text-sm leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 sm:py-24 border-t text-center" style={{ borderColor: LINE }}>
          <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-tight mb-8 leading-[1.3]">
            <span className="hl-marker">{t.landingCtaTitle}</span>
          </h2>
          <div className="flex justify-center">{ctaButton}</div>
          <p className="text-xs text-stone-400 mt-5">{t.landingCtaHint}</p>
        </section>

        {/* Footer */}
        <footer className="pb-8 text-center text-[11px] text-stone-400 font-medium border-t pt-6" style={{ borderColor: LINE }}>
          © {new Date().getFullYear()} Anpiso · a <a href="https://fechtin.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-stone-600 transition-colors">FechTin</a> product
        </footer>
      </div>
    </div>
  );
};

export default LoginScreen;
