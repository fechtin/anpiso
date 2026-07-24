
import React, { useState, useRef, useEffect } from 'react';
import { RecordingStatus, AudioSource, SttEngine, WebSpeechLang, TargetLanguage, AppMode } from '../types';
import { useLocale } from '../i18n';

const LANG_OPTIONS: { value: WebSpeechLang; label: string; flag: string }[] = [
  { value: 'en-US', label: 'English', flag: '🇺🇸' },
  { value: 'ko-KR', label: '한국어', flag: '🇰🇷' },
  { value: 'vi-VN', label: 'Tiếng Việt', flag: '🇻🇳' },
  { value: 'ja-JP', label: '日本語', flag: '🇯🇵' },
  { value: 'zh-CN', label: '中文', flag: '🇨🇳' },
];

const TARGET_LANG_OPTIONS: { value: TargetLanguage; label: string; flag: string }[] = [
  { value: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'ko', label: '한국어', flag: '🇰🇷' },
  { value: 'zh', label: '中文', flag: '🇨🇳' },
  { value: 'ja', label: '日本語', flag: '🇯🇵' },
];

// Waveform trang trí trên thanh record — gợn nhẹ theo animation eq-soft
const WAVE_BARS = Array.from({ length: 36 }, (_, i) => {
  const noise = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  const cluster = Math.pow(Math.abs(Math.sin(i * 0.4 + 1)), 1.4);
  return Math.round(4 + noise * 18 * cluster);
});

interface Props {
  status: RecordingStatus;
  onStart: () => void;
  onStop: () => void;
  audioSource: AudioSource;
  setAudioSource: (source: AudioSource) => void;
  sttEngine: SttEngine;
  setSttEngine: (engine: SttEngine) => void;
  webSpeechLang: WebSpeechLang;
  setWebSpeechLang: (lang: WebSpeechLang) => void;
  targetLang: TargetLanguage;
  setTargetLang: (lang: TargetLanguage) => void;
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
}

const SectionHeader: React.FC<{ icon: string; label: string }> = ({ icon, label }) => (
  <div className="flex items-center gap-2.5 mb-3">
    <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0">
      <i className={`${icon} text-sm`}></i>
    </div>
    <h3 className="text-sm font-bold text-slate-700">{label}</h3>
  </div>
);

const RecorderControls: React.FC<Props> = ({
  status, onStart, onStop,
  audioSource, setAudioSource,
  sttEngine, setSttEngine,
  webSpeechLang, setWebSpeechLang,
  targetLang, setTargetLang,
  appMode, setAppMode,
}) => {
  const { t } = useLocale();
  const isRecording = status === RecordingStatus.RECORDING;
  const webSpeechSupported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [translationOpen, setTranslationOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);
  const translationDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
      if (translationDropdownRef.current && !translationDropdownRef.current.contains(e.target as Node)) {
        setTranslationOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isMultilingual = sttEngine === SttEngine.GEMINI;
  const translationEnabled = appMode === 'interpret';
  const activeLang = LANG_OPTIONS.find(l => l.value === webSpeechLang);
  const activeTarget = TARGET_LANG_OPTIONS.find(l => l.value === targetLang);

  const selectMultilingual = () => {
    setSttEngine(SttEngine.GEMINI);
    setLangOpen(false);
  };

  const selectLang = (lang: WebSpeechLang) => {
    setWebSpeechLang(lang);
    if (webSpeechSupported) setSttEngine(SttEngine.WEB_SPEECH);
    setLangOpen(false);
  };

  const selectNoTranslation = () => {
    setAppMode('notes');
    setTranslationOpen(false);
  };

  const selectTarget = (lang: TargetLanguage) => {
    setTargetLang(lang);
    setAppMode('interpret');
    setTranslationOpen(false);
  };

  const speedBadge = (slow: boolean) => (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${slow ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
      {slow ? t.speedSlow : t.speedFast}
    </span>
  );

  // Tóm tắt cấu hình hiện tại — hiển thị trên thanh record để không cần mở thiết lập vẫn biết
  const captureLabel = audioSource === AudioSource.MICROPHONE ? t.captureInPerson : t.captureOnline;
  const langLabel = isMultilingual ? t.multilingual : (activeLang?.label ?? '');
  const configSummary = translationEnabled
    ? `${captureLabel} · ${langLabel} → ${activeTarget?.label ?? ''}`
    : `${captureLabel} · ${langLabel} · ${t.translationNone}`;

  return (
    <div className="mx-auto w-full space-y-3 sm:space-y-4">

      {/* Thanh record compact */}
      <div className="bg-white border border-slate-200/70 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="relative shrink-0 flex items-center justify-center md:w-56">
            {!isRecording && (
              <div className="absolute inset-x-0 hidden md:flex items-center justify-center gap-[3px] pointer-events-none" aria-hidden="true">
                {WAVE_BARS.map((h, i) => (
                  <span
                    key={i}
                    className="w-[2.5px] rounded-full bg-indigo-300/50 eq-soft shrink-0"
                    style={{ height: `${Math.max(h, 3)}px`, animationDelay: `${(i % 7) * 0.26}s` }}
                  ></span>
                ))}
              </div>
            )}
            <div className="relative">
            {isRecording ? (
              <div className="absolute inset-0 bg-red-100 rounded-full animate-ping opacity-75"></div>
            ) : (
              <div className="absolute -inset-2 bg-indigo-500/10 rounded-full pointer-events-none animate-breathe"></div>
            )}
            <button
              onClick={isRecording ? onStop : onStart}
              title={isRecording ? t.stopRecording : t.readyCompact}
              className={`relative z-10 w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-white transition-all transform active:scale-90 hover:scale-105 ${
                isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-600'
              } shadow-lg shadow-indigo-200`}
            >
              {isRecording ? <i className="fas fa-stop text-lg sm:text-xl"></i> : <i className="fas fa-microphone text-lg sm:text-xl"></i>}
            </button>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <h2 className={`text-base sm:text-lg font-bold tracking-tight ${isRecording ? 'text-red-600' : 'text-slate-800'}`}>
              {isRecording ? t.recording : t.readyCompact}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 truncate mt-0.5">
              {isRecording ? t.recordingWith(langLabel) : configSummary}
            </p>
          </div>

          {!isRecording && (
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                settingsOpen
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <i className="fas fa-sliders"></i>
              <span className="hidden sm:inline">{t.settingsToggle}</span>
              <i className={`fas fa-chevron-down text-[10px] transition-transform ${settingsOpen ? 'rotate-180' : ''}`}></i>
            </button>
          )}
        </div>
      </div>

      {/* Settings cards (mở rộng khi cần) */}
      {!isRecording && settingsOpen && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 text-left animate-in fade-in slide-in-from-top-2 duration-300">

          {/* Capture */}
          <div className="bg-white border border-slate-200/70 rounded-2xl p-4 sm:p-5 shadow-sm">
            <SectionHeader icon="fas fa-bullseye" label={t.captureSection} />
            <div className="space-y-2.5">
              {[
                { value: AudioSource.MICROPHONE, icon: 'fas fa-microphone', title: t.captureInPerson, desc: t.captureInPersonDesc },
                { value: AudioSource.SYSTEM_AND_MIC, icon: 'fas fa-desktop', title: t.captureOnline, desc: t.captureOnlineDesc },
              ].map(opt => {
                const isActive = audioSource === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setAudioSource(opt.value)}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all ${
                      isActive
                        ? 'border-indigo-300 ring-1 ring-indigo-200 bg-indigo-50/40'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                      <i className={`${opt.icon} text-sm`}></i>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs sm:text-sm font-bold whitespace-nowrap ${isActive ? 'text-indigo-600' : 'text-slate-700'}`}>{opt.title}</p>
                      <p className="text-[10px] sm:text-[11px] text-slate-400 leading-snug mt-0.5">{opt.desc}</p>
                    </div>
                    <span className={`text-sm shrink-0 ${isActive ? 'text-indigo-500' : 'text-slate-200'}`}>
                      <i className={isActive ? 'fas fa-circle-check' : 'far fa-circle'}></i>
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Hướng dẫn cho họp online: thao tác chọn cửa sổ + "Share" không được mô tả ở đâu khác */}
            {audioSource !== AudioSource.MICROPHONE && (
              <div className="mt-2.5 space-y-1.5 bg-indigo-50/60 rounded-xl px-3.5 py-2.5">
                <div className="flex items-start gap-2">
                  <i className="fas fa-lightbulb text-indigo-400 text-xs mt-0.5"></i>
                  <p className="text-[11px] text-indigo-500 font-medium leading-snug">{t.captureTip}</p>
                </div>
                <div className="flex items-start gap-2">
                  <i className="fas fa-circle-info text-indigo-400 text-xs mt-0.5"></i>
                  <p className="text-[11px] text-indigo-500 font-medium leading-snug">{t.tapToSelectWindow}</p>
                </div>
              </div>
            )}
          </div>

          {/* Meeting Settings */}
          <div className="bg-white border border-slate-200/70 rounded-2xl p-4 sm:p-5 shadow-sm">
            <SectionHeader icon="fas fa-globe" label={t.meetingSettingsSection} />
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-600 mb-1.5">{t.meetingLanguageLabel}</p>
                <div ref={langDropdownRef} className="relative">
                  <button
                    onClick={() => setLangOpen(!langOpen)}
                    className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isMultilingual ? (
                        <>
                          <i className="fas fa-globe text-indigo-500 text-sm"></i>
                          <span className="text-xs sm:text-sm font-semibold text-slate-700 truncate">{t.multilingual}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-sm sm:text-base">{activeLang?.flag}</span>
                          <span className="text-xs sm:text-sm font-semibold text-slate-700 truncate">{activeLang?.label}</span>
                        </>
                      )}
                      {speedBadge(isMultilingual)}
                    </div>
                    <i className={`fas fa-chevron-down text-[10px] text-slate-400 transition-transform ${langOpen ? 'rotate-180' : ''}`}></i>
                  </button>

                  {langOpen && (
                    <div className="absolute z-20 top-full mt-1.5 left-0 right-0 min-w-[200px] bg-white rounded-xl border border-slate-100 shadow-xl overflow-hidden">
                      <button
                        onClick={selectMultilingual}
                        className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${isMultilingual ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <i className={`fas fa-globe text-sm ${isMultilingual ? 'text-indigo-500' : 'text-slate-400'}`}></i>
                          <span className={`text-xs sm:text-sm font-semibold ${isMultilingual ? 'text-indigo-600' : 'text-slate-700'}`}>{t.multilingual}</span>
                        </div>
                        {speedBadge(true)}
                      </button>
                      <div className="h-px bg-slate-100"></div>
                      {LANG_OPTIONS.map(opt => {
                        const isActive = !isMultilingual && webSpeechLang === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => selectLang(opt.value)}
                            disabled={!webSpeechSupported}
                            className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${
                              !webSpeechSupported ? 'opacity-40 cursor-not-allowed' : isActive ? 'bg-indigo-50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-sm w-5 text-center">{opt.flag}</span>
                              <span className={`text-xs sm:text-sm font-semibold ${isActive ? 'text-indigo-600' : 'text-slate-700'}`}>{opt.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {speedBadge(false)}
                              {isActive && <i className="fas fa-check text-indigo-500 text-xs"></i>}
                            </div>
                          </button>
                        );
                      })}
                      {!webSpeechSupported && (
                        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
                          <p className="text-[10px] text-slate-400">{t.browserNotSupported}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1.5">{t.meetingLanguageDesc}</p>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-600 mb-1.5">{t.translationSection}</p>
                <div ref={translationDropdownRef} className="relative">
                  <button
                    onClick={() => setTranslationOpen(!translationOpen)}
                    className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {translationEnabled ? (
                        <>
                          <span className="text-sm sm:text-base">{activeTarget?.flag}</span>
                          <span className="text-xs sm:text-sm font-semibold text-slate-700 truncate">{activeTarget?.label}</span>
                        </>
                      ) : (
                        <>
                          <i className="fas fa-ban text-slate-400 text-sm"></i>
                          <span className="text-xs sm:text-sm font-semibold text-slate-500 truncate">{t.translationNone}</span>
                        </>
                      )}
                    </div>
                    <i className={`fas fa-chevron-down text-[10px] text-slate-400 transition-transform ${translationOpen ? 'rotate-180' : ''}`}></i>
                  </button>

                  {translationOpen && (
                    <div className="absolute z-20 top-full mt-1.5 left-0 right-0 min-w-[190px] bg-white rounded-xl border border-slate-100 shadow-xl overflow-hidden">
                      <button
                        onClick={selectNoTranslation}
                        className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${!translationEnabled ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <i className={`fas fa-ban text-sm ${!translationEnabled ? 'text-indigo-500' : 'text-slate-400'}`}></i>
                          <span className={`text-xs sm:text-sm font-semibold ${!translationEnabled ? 'text-indigo-600' : 'text-slate-700'}`}>{t.translationNone}</span>
                        </div>
                        {!translationEnabled && <i className="fas fa-check text-indigo-500 text-xs"></i>}
                      </button>
                      <div className="h-px bg-slate-100"></div>
                      {TARGET_LANG_OPTIONS.map(opt => {
                        const isActive = translationEnabled && targetLang === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => selectTarget(opt.value)}
                            className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${isActive ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-sm w-5 text-center">{opt.flag}</span>
                              <span className={`text-xs sm:text-sm font-semibold ${isActive ? 'text-indigo-600' : 'text-slate-700'}`}>{opt.label}</span>
                            </div>
                            {isActive && <i className="fas fa-check text-indigo-500 text-xs"></i>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1.5">{t.translationDesc}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecorderControls;
