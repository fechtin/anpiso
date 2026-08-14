import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';
import { shareService, SharePayload } from '../services/shareService';
import MinutesDisplay from '../components/MinutesDisplay';
import CopyButton from '../components/CopyButton';
import { useLocale } from '../i18n';

/**
 * Trang xem cuộc họp được chia sẻ: /s/<shareId>#k=<khoá>
 *
 * Khoá giải mã lấy từ fragment — không bao giờ rời trình duyệt. Quyền đọc doc
 * do rules Firestore quyết định theo email đã đăng nhập, nên phải đăng nhập
 * trước rồi mới tải được ciphertext.
 */

interface Props {
  shareId: string;
}

type State = 'auth' | 'signin' | 'loading' | 'denied' | 'notfound' | 'badlink' | 'ready';

const Shell: React.FC<{ icon: string; tone: string; title: string; message: string; children?: React.ReactNode }> = ({
  icon, tone, title, message, children,
}) => (
  <div className="min-h-screen flex items-center justify-center p-4">
    <div className="text-center bg-white rounded-3xl p-10 shadow-xl border border-slate-100 max-w-md">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${tone}`}>
        <i className={`${icon} text-2xl`}></i>
      </div>
      <h2 className="text-xl font-black text-slate-800 mb-2">{title}</h2>
      <p className="text-slate-400 text-sm mb-5">{message}</p>
      {children}
    </div>
  </div>
);

const SharedMeetingPage: React.FC<Props> = ({ shareId }) => {
  const { t } = useLocale();
  const [state, setState] = useState<State>('auth');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [ownerName, setOwnerName] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);

  // Khoá nằm sau dấu # — đọc một lần, không bao giờ gửi đi đâu
  const keyRaw = new URLSearchParams(window.location.hash.slice(1)).get('k') || '';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, u => {
      setUser(u);
      setState(u ? 'loading' : 'signin');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (state !== 'loading' || !user) return;
    if (!keyRaw) { setState('badlink'); return; }

    let alive = true;
    shareService.getShare(shareId)
      .then(async share => {
        if (!alive) return;
        if (!share) { setState('notfound'); return; }
        setOwnerName(share.ownerName || share.ownerEmail || '');
        try {
          setPayload(await shareService.decryptPayload(share, keyRaw));
          setState('ready');
        } catch {
          setState('badlink');
        }
      })
      .catch(err => {
        if (!alive) return;
        // Rules chặn → doc có tồn tại nhưng email này không nằm trong allowedEmails
        setState(err?.code === 'permission-denied' ? 'denied' : 'notfound');
      });
    return () => { alive = false; };
  }, [state, user, shareId, keyRaw]);

  const signIn = () => signInWithPopup(auth, googleProvider).catch(() => {});
  const switchAccount = async () => { await signOut(auth); signIn(); };

  if (state === 'auth') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (state === 'signin') {
    return (
      <Shell icon="fas fa-lock" tone="bg-indigo-100 text-indigo-600" title={t.sharedSignInTitle} message={t.sharedSignInMsg}>
        <button
          onClick={signIn}
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 transition-transform active:scale-95"
        >
          <i className="fab fa-google mr-2"></i>{t.sharedSignIn}
        </button>
      </Shell>
    );
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-bold text-sm">{t.sharedLoading}</p>
        </div>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <Shell icon="fas fa-user-lock" tone="bg-amber-100 text-amber-600" title={t.sharedDenied} message={t.sharedDeniedMsg}>
        <p className="text-slate-500 text-xs font-bold mb-4">{user?.email}</p>
        <button
          onClick={switchAccount}
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 transition-transform active:scale-95"
        >
          {t.sharedSwitchAccount}
        </button>
      </Shell>
    );
  }

  if (state === 'notfound') {
    return <Shell icon="fas fa-link-slash" tone="bg-red-100 text-red-600" title={t.sharedNotFound} message={t.sharedNotFoundMsg} />;
  }

  if (state === 'badlink' || !payload) {
    return <Shell icon="fas fa-triangle-exclamation" tone="bg-red-100 text-red-600" title={t.sharedBadLink} message={t.sharedBadLinkMsg} />;
  }

  const formatTranscript = (text: string) => text.replace(/(?<!\n)\[(\d{1,2}:\d{2})\]/g, '\n[$1]').trimStart();
  const hasTranscript = !!(payload.transcriptText || payload.translatedTranscript);

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 pb-12">
      <div className="w-full max-w-4xl flex flex-col flex-1 space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src="/icon-light-color.png" alt="Anpiso" className="w-10 h-10 rounded-2xl border border-slate-100 shadow-md shadow-slate-200 rotate-3" />
            <div>
              <h1 className="text-sm font-black text-slate-800 tracking-tight">{t.loginTitle}</h1>
              <p className="text-[10px] text-slate-400 font-medium">{t.sharedBy}: {ownerName}</p>
            </div>
          </div>
          {hasTranscript && (
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                showTranscript ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
              }`}
            >
              <i className="fas fa-file-alt"></i> {t.transcript}
            </button>
          )}
        </div>

        {payload.audio && (
          <a
            href={payload.audio.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3.5 bg-white border border-slate-200 rounded-2xl hover:border-indigo-300 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <i className="fas fa-headphones text-sm"></i>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-700">{t.sharedAudio}</p>
              <p className="text-[10px] text-slate-400">{t.sharedOpenInDrive}</p>
            </div>
            <i className="fas fa-arrow-up-right-from-square text-slate-300 text-xs"></i>
          </a>
        )}

        {showTranscript ? (
          <div className={`grid grid-cols-1 ${payload.transcriptText && payload.translatedTranscript ? 'md:grid-cols-2' : ''} gap-4`}>
            {payload.translatedTranscript && (
              <div className="bg-white rounded-2xl border border-slate-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">{t.vietnameseTranslation}</h3>
                  <CopyButton text={formatTranscript(payload.translatedTranscript)} />
                </div>
                <pre className="whitespace-pre-wrap text-sm text-slate-600 font-sans leading-relaxed">
                  {formatTranscript(payload.translatedTranscript)}
                </pre>
              </div>
            )}
            {payload.transcriptText && (
              <div className="bg-white rounded-2xl border border-slate-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">{t.originalTranscript}</h3>
                  <CopyButton text={formatTranscript(payload.transcriptText)} />
                </div>
                <pre className="whitespace-pre-wrap text-sm text-slate-600 font-sans leading-relaxed">
                  {formatTranscript(payload.transcriptText)}
                </pre>
              </div>
            )}
          </div>
        ) : payload.minutes ? (
          <MinutesDisplay
            minutes={payload.minutes}
            readOnly
            onSendEmail={() => {}}
            onReset={() => {}}
            transcriptText={payload.transcriptText}
            onViewTranscript={() => setShowTranscript(true)}
            liveTranscript={[]}
            translatedTranscript={payload.translatedTranscript}
            isTranslating={false}
          />
        ) : null}
      </div>
    </div>
  );
};

export default SharedMeetingPage;
