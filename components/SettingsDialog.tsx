
import React, { useState, useEffect } from 'react';
import { UserSettings } from '../types';
import { apiKeyService } from '../services/apiKeyService';
import { translateKeyService } from '../services/translateKeyService';
import { useLocale } from '../i18n';
import EncryptionSettings from './EncryptionSettings';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userSettings: UserSettings;
  isDriveAuthorizing: boolean;
  onToggleDrive: () => void;
  /** Tab mở sẵn khi bật dialog (vd banner "thiếu key" mở thẳng tab API Keys). */
  initialTab?: 'general' | 'keys';
}

/** Trung tâm cài đặt: modal giữa màn hình trên desktop, full-screen sheet trên mobile. */
const SettingsDialog = ({ isOpen, onClose, userSettings, isDriveAuthorizing, onToggleDrive, initialTab = 'general' }: Props) => {
  const { t } = useLocale();
  const [geminiKeys, setGeminiKeys] = useState<string[]>([]);
  const [showKeys, setShowKeys] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [gtKeyDraft, setGtKeyDraft] = useState('');
  const [showGtKey, setShowGtKey] = useState(false);
  const [gtKeySaved, setGtKeySaved] = useState(false);
  const [showGtSetup, setShowGtSetup] = useState(false);
  const [showGeminiSetup, setShowGeminiSetup] = useState(false);
  const [tab, setTab] = useState<'general' | 'keys'>(initialTab);

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab); // mỗi lần mở → về tab được yêu cầu
    const saved = apiKeyService.getKeys();
    setGeminiKeys(saved.length > 0 ? saved : ['']);
    setGtKeyDraft(translateKeyService.getKey());
  }, [isOpen, initialTab]);

  // Poll error version to re-render when keys fail at runtime
  const [, setErrorTick] = useState(0);
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setErrorTick(apiKeyService.getKeyErrorVersion() + translateKeyService.getErrorVersion());
    }, 2000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const updateKey = (index: number, value: string) => {
    const updated = [...geminiKeys];
    updated[index] = value;
    setGeminiKeys(updated);
    setKeySaved(false);
  };

  const addKey = () => setGeminiKeys([...geminiKeys, '']);

  const removeKey = (index: number) => {
    const updated = geminiKeys.filter((_, i) => i !== index);
    setGeminiKeys(updated.length > 0 ? updated : ['']);
    apiKeyService.setKeys(updated);
    apiKeyService.clearKeyError(index);
  };

  const saveKeys = () => {
    apiKeyService.setKeys(geminiKeys);
    setKeySaved(true);
    const saved = apiKeyService.getKeys();
    setGeminiKeys(saved.length > 0 ? saved : ['']);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const clearAll = () => {
    apiKeyService.clearKeys();
    setGeminiKeys(['']);
    setKeySaved(false);
  };

  const activeIndex = apiKeyService.getCurrentIndex();
  const hasKeys = apiKeyService.hasUserKeys();
  const validKeyCount = geminiKeys.filter(k => k.trim()).length;
  const keyErrors = apiKeyService.getKeyErrors();
  const hasGtKey = translateKeyService.hasKey();
  const gtError = translateKeyService.getError();

  const saveGtKey = () => {
    translateKeyService.setKey(gtKeyDraft);
    setGtKeySaved(true);
    setGtKeyDraft(translateKeyService.getKey());
    setTimeout(() => setGtKeySaved(false), 2000);
  };

  const clearGtKey = () => {
    translateKeyService.clearKey();
    setGtKeyDraft('');
    setGtKeySaved(false);
  };

  const SectionHead = ({ icon, iconBg, iconColor, title, subtitle, right }: {
    icon: string; iconBg: string; iconColor: string; title: string; subtitle: string; right?: React.ReactNode;
  }) => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
          <i className={`${icon} ${iconColor}`}></i>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800">{title}</p>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>
      {right}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex sm:items-center sm:justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full h-full sm:h-[700px] sm:max-h-[85vh] sm:max-w-2xl bg-white sm:rounded-[2rem] shadow-2xl border border-slate-100 overflow-y-auto custom-scrollbar animate-in sm:zoom-in-95 slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-300">

        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-black text-slate-800">
            <i className="fas fa-gear text-indigo-500 mr-2.5"></i>{t.settingsMenu}
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="sticky top-[65px] bg-white/95 backdrop-blur px-6 pt-3 pb-0 border-b border-slate-100 z-10 flex gap-1">
          {([['general', t.settingsTabGeneral], ['keys', 'API Keys']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-bold rounded-t-xl border-b-2 transition-colors ${
                tab === key
                  ? 'text-indigo-600 border-indigo-500'
                  : 'text-slate-400 border-transparent hover:text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-5">

          {tab === 'general' && (<>
          {/* Google Drive */}
          <section className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5">
            <SectionHead
              icon="fab fa-google-drive" iconBg="bg-indigo-50" iconColor="text-indigo-500"
              title={t.googleDrive}
              subtitle={userSettings.driveEnabled ? t.driveAutoSave : t.driveSaveAudio}
              right={
                <button
                  onClick={onToggleDrive}
                  disabled={isDriveAuthorizing}
                  className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${
                    userSettings.driveEnabled ? 'bg-indigo-500' : 'bg-slate-200'
                  } ${isDriveAuthorizing ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                >
                  <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                    userSettings.driveEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              }
            />
          </section>

          {/* Mã hoá đầu-cuối (component sẵn có) */}
          <section className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5">
            <EncryptionSettings userSettings={userSettings} />
          </section>
          </>)}

          {tab === 'keys' && (<>
          {/* Gemini API Keys */}
          <section className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5">
            <SectionHead
              icon="fas fa-key" iconBg="bg-amber-50" iconColor="text-amber-500"
              title={t.geminiApiKeys}
              subtitle={hasKeys ? t.keyCount(apiKeyService.getKeys().length, activeIndex + 1) : t.usingDefaultKey}
              right={
                <button onClick={() => setShowKeys(!showKeys)} className="text-slate-400 hover:text-slate-600 p-2">
                  <i className={`fas ${showKeys ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
                </button>
              }
            />

            <div className="space-y-2.5">
              {geminiKeys.map((key, i) => {
                const error = keyErrors.get(i);
                return (
                  <div key={i}>
                    <div className="flex gap-2 items-center">
                      <span className={`text-[10px] font-black w-5 text-center shrink-0 ${
                        error ? 'text-red-400' : hasKeys && i === activeIndex ? 'text-emerald-500' : 'text-slate-300'
                      }`}>
                        {error
                          ? <i className="fas fa-exclamation-triangle text-[9px]"></i>
                          : hasKeys && i === activeIndex
                            ? <i className="fas fa-circle text-[7px]"></i>
                            : (i + 1)}
                      </span>
                      <input
                        type={showKeys ? 'text' : 'password'}
                        value={key}
                        onChange={(e) => updateKey(i, e.target.value)}
                        placeholder="AIza..."
                        className={`flex-1 min-w-0 px-3.5 py-2.5 text-sm rounded-xl focus:outline-none font-mono ${
                          error
                            ? 'bg-red-50 border border-red-200 focus:border-red-400 focus:ring-1 focus:ring-red-100'
                            : 'bg-white border border-slate-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-100'
                        }`}
                      />
                      {geminiKeys.length > 1 && (
                        <button onClick={() => removeKey(i)} className="text-slate-300 hover:text-red-400 p-1.5 shrink-0">
                          <i className="fas fa-times text-xs"></i>
                        </button>
                      )}
                    </div>
                    {error && <p className="ml-7 mt-1 text-[11px] font-bold text-red-400">{error}</p>}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2.5 mt-4">
              <button
                onClick={addKey}
                className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-500 rounded-xl text-xs font-bold transition-colors border border-slate-200"
              >
                <i className="fas fa-plus mr-1.5"></i>{t.addKey}
              </button>
              <button
                onClick={saveKeys}
                disabled={validKeyCount === 0 && !hasKeys}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors ml-auto"
              >
                {keySaved ? t.saved : `${t.saveKeys} ${validKeyCount > 0 ? `(${validKeyCount})` : ''}`}
              </button>
              {hasKeys && (
                <button
                  onClick={clearAll}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-400 rounded-xl text-xs font-bold transition-colors"
                >
                  {t.delete}
                </button>
              )}
            </div>

            <button
              onClick={() => setShowGeminiSetup(!showGeminiSetup)}
              className="mt-4 text-xs text-slate-400 hover:text-slate-600 flex items-center gap-2"
            >
              <i className={`fas fa-chevron-${showGeminiSetup ? 'up' : 'down'} text-[9px]`}></i>
              {t.geminiSetupGuide}
            </button>

            {showGeminiSetup && (
              <div className="mt-3 p-4 bg-white rounded-xl border border-slate-100">
                <ol className="space-y-2 text-xs text-slate-600 list-decimal list-inside leading-relaxed">
                  <li>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">
                      {t.geminiStep1} <i className="fas fa-external-link-alt text-[9px] ml-0.5"></i>
                    </a>
                  </li>
                  <li>{t.geminiStep2}</li>
                  <li>{t.geminiStep3}</li>
                </ol>
                <p className="mt-3 text-xs text-slate-500 leading-relaxed">{t.geminiFreeTierNote}</p>
              </div>
            )}
          </section>

          {/* Google Translate Key */}
          <section className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5">
            <SectionHead
              icon="fas fa-language" iconBg="bg-emerald-50" iconColor="text-emerald-500"
              title={t.gtKeyTitle}
              subtitle={hasGtKey ? t.gtKeyHint : t.gtKeyNotConfigured}
              right={
                <button onClick={() => setShowGtKey(!showGtKey)} className="text-slate-400 hover:text-slate-600 p-2">
                  <i className={`fas ${showGtKey ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
                </button>
              }
            />

            <div className="flex gap-2 items-center">
              <span className={`text-[10px] font-black w-5 text-center shrink-0 ${
                gtError ? 'text-red-400' : hasGtKey ? 'text-emerald-500' : 'text-slate-300'
              }`}>
                {gtError
                  ? <i className="fas fa-exclamation-triangle text-[9px]"></i>
                  : hasGtKey ? <i className="fas fa-circle text-[7px]"></i> : <i className="fas fa-minus text-[9px]"></i>}
              </span>
              <input
                type={showGtKey ? 'text' : 'password'}
                value={gtKeyDraft}
                onChange={(e) => { setGtKeyDraft(e.target.value); setGtKeySaved(false); }}
                placeholder={t.gtPlaceholder}
                className={`flex-1 min-w-0 px-3.5 py-2.5 text-sm rounded-xl focus:outline-none font-mono ${
                  gtError
                    ? 'bg-red-50 border border-red-200 focus:border-red-400 focus:ring-1 focus:ring-red-100'
                    : 'bg-white border border-slate-200 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100'
                }`}
              />
            </div>
            {gtError && <p className="ml-7 mt-1 text-[11px] font-bold text-red-400">{gtError}</p>}

            <div className="flex gap-2.5 mt-4">
              <button
                onClick={saveGtKey}
                disabled={!gtKeyDraft.trim() && !hasGtKey}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors ml-auto"
              >
                {gtKeySaved ? t.saved : t.saveKeys}
              </button>
              {hasGtKey && (
                <button
                  onClick={clearGtKey}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-400 rounded-xl text-xs font-bold transition-colors"
                >
                  {t.delete}
                </button>
              )}
            </div>

            <button
              onClick={() => setShowGtSetup(!showGtSetup)}
              className="mt-4 text-xs text-slate-400 hover:text-slate-600 flex items-center gap-2"
            >
              <i className={`fas fa-chevron-${showGtSetup ? 'up' : 'down'} text-[9px]`}></i>
              {t.gtSetupGuide}
            </button>

            {showGtSetup && (
              <div className="mt-3 p-4 bg-white rounded-xl border border-slate-100">
                <ol className="space-y-2 text-xs text-slate-600 list-decimal list-inside leading-relaxed">
                  <li>
                    <a href="https://console.cloud.google.com/apis/library/translate.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
                      {t.gtStep1} <i className="fas fa-external-link-alt text-[9px] ml-0.5"></i>
                    </a>
                  </li>
                  <li>
                    <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
                      {t.gtStep2} <i className="fas fa-external-link-alt text-[9px] ml-0.5"></i>
                    </a>
                  </li>
                  <li>{t.gtStep3}</li>
                  <li>{t.gtStep4}</li>
                </ol>
                <p className="mt-3 text-xs font-bold text-amber-600 leading-relaxed">{t.gtSecurityWarn}</p>
              </div>
            )}
          </section>
          </>)}
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;
