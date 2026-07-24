
import React, { useState, useEffect, useRef } from 'react';
import { cryptoService } from '../services/cryptoService';
import { driveService } from '../services/driveService';
import { refreshDriveTokenFn } from '../services/firebase';
import { UserSettings } from '../types';
import { useLocale } from '../i18n';

// Hiện trong Drive user (scope drive.file) → tên rõ để họ không xoá/chia sẻ nhầm
const KEY_BACKUP_FILE = 'Anpiso-E2EE-Key-DO-NOT-SHARE.txt';

interface Props {
  userSettings: UserSettings;
}

/** Lấy Drive token còn hạn (giống flow upload audio trong App). */
async function getDriveToken(): Promise<string> {
  let token = sessionStorage.getItem('drive_access_token');
  const expiry = Number(sessionStorage.getItem('drive_token_expiry') || '0');
  if (!token || Date.now() > expiry - 60_000) {
    const result = await refreshDriveTokenFn();
    token = result.data.accessToken;
    sessionStorage.setItem('drive_access_token', token);
    sessionStorage.setItem('drive_token_expiry', String(Date.now() + result.data.expiresIn * 1000));
  }
  return token!;
}

const EncryptionSettings: React.FC<Props> = ({ userSettings }) => {
  const { t } = useLocale();
  const [enabled, setEnabled] = useState(cryptoService.isEnabled());
  const [fingerprint, setFingerprint] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshFingerprint = () => {
    cryptoService.fingerprint().then(setFingerprint).catch(() => setFingerprint(''));
  };

  useEffect(() => {
    refreshFingerprint();
  }, [enabled]);

  const flash = (text: string, error = false) => {
    setMessage({ text, error });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (enabled) {
        cryptoService.disable();
        setEnabled(false);
      } else {
        await cryptoService.enable();
        setEnabled(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const downloadKey = async () => {
    try {
      const keyString = await cryptoService.exportKeyString();
      const blob = new Blob([keyString], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = KEY_BACKUP_FILE;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      flash(t.e2eeKeyBackedUp);
    } catch {
      flash(t.e2eeInvalidKeyFile, true);
    }
  };

  const importKeyFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await cryptoService.importKeyString(await file.text());
      setEnabled(true);
      refreshFingerprint();
      flash(t.e2eeKeyRestored);
    } catch {
      flash(t.e2eeInvalidKeyFile, true);
    }
  };

  const saveToDrive = async () => {
    setBusy(true);
    try {
      const keyString = await cryptoService.exportKeyString();
      await driveService.saveKeyBackup(await getDriveToken(), KEY_BACKUP_FILE, keyString);
      flash(t.e2eeKeyBackedUp);
    } catch (err: any) {
      flash(err?.message || 'Error', true);
    } finally {
      setBusy(false);
    }
  };

  const restoreFromDrive = async () => {
    setBusy(true);
    try {
      const content = await driveService.loadKeyBackup(await getDriveToken(), KEY_BACKUP_FILE);
      if (!content) {
        flash(t.e2eeNoBackupFound, true);
        return;
      }
      await cryptoService.importKeyString(content);
      setEnabled(true);
      refreshFingerprint();
      flash(t.e2eeKeyRestored);
    } catch {
      flash(t.e2eeInvalidKeyFile, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
            <i className="fas fa-lock text-teal-500 text-sm"></i>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-700">{t.e2eeTitle}</p>
            <p className="text-[10px] text-slate-400">
              {enabled ? t.e2eeOnHint : t.e2eeOffHint}
            </p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={busy}
          className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
            enabled ? 'bg-teal-500' : 'bg-slate-200'
          } ${busy ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
        >
          <div
            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
              enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-3 space-y-2.5">
          {fingerprint && (
            <p className="text-[10px] text-slate-400">
              <i className="fas fa-fingerprint mr-1.5 text-teal-400"></i>
              <span className="font-mono font-bold text-slate-500">{fingerprint}</span>
            </p>
          )}
          <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-100">
            <p className="text-[10px] font-bold text-amber-700 leading-relaxed">
              <i className="fas fa-triangle-exclamation mr-1"></i>{t.e2eeWarn}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={downloadKey}
              className="px-2 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold border border-slate-200 transition-colors"
            >
              <i className="fas fa-download mr-1"></i>{t.e2eeDownloadKey}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold border border-slate-200 transition-colors"
            >
              <i className="fas fa-file-import mr-1"></i>{t.e2eeImportKey}
            </button>
            {userSettings.driveEnabled && (
              <>
                <button
                  onClick={saveToDrive}
                  disabled={busy}
                  className="px-2 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg text-[10px] font-bold border border-teal-100 transition-colors disabled:opacity-50"
                >
                  <i className="fab fa-google-drive mr-1"></i>{t.e2eeSaveDrive}
                </button>
                <button
                  onClick={restoreFromDrive}
                  disabled={busy}
                  className="px-2 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg text-[10px] font-bold border border-teal-100 transition-colors disabled:opacity-50"
                >
                  <i className="fas fa-rotate-left mr-1"></i>{t.e2eeRestoreDrive}
                </button>
              </>
            )}
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">{t.e2eeOldNote}</p>
        </div>
      )}

      {!enabled && (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mt-2.5 text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1.5"
        >
          <i className="fas fa-file-import text-[9px]"></i>
          {t.e2eeImportKey}
        </button>
      )}

      {message && (
        <p className={`mt-2 text-[10px] font-bold ${message.error ? 'text-red-500' : 'text-emerald-600'}`}>
          {message.text}
        </p>
      )}

      <input ref={fileInputRef} type="file" accept=".txt" className="hidden" onChange={importKeyFile} />
    </div>
  );
};

export default EncryptionSettings;
