
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, exchangeDriveCodeFn, refreshDriveTokenFn } from './services/firebase';
import { gmailService } from './services/gmailService';
import { cryptoService } from './services/cryptoService';
import { meetingService } from './services/meetingService';
import { userSettingsService } from './services/userSettingsService';
import { driveService } from './services/driveService';
import { apiKeyService } from './services/apiKeyService';
import { replaceSpeakerInText } from './utils/renameSpeaker';
import { RecordingStatus, AudioSource, MeetingMinutes, User, UserSettings, DriveLinks, SttEngine, WebSpeechLang, TargetLanguage, AppMode } from './types';
import { useAISession } from './hooks/useAISession';
import { useWebSpeechSession } from './hooks/useWebSpeechSession';
import { useMeetingRecorder } from './hooks/useMeetingRecorder';
import Header from './components/Header';
import RecorderControls from './components/RecorderControls';
import MinutesDisplay from './components/MinutesDisplay';
import LiveTranscript from './components/LiveTranscript';
import LogBar from './components/LogBar';
import DriveAudioPlayer from './components/DriveAudioPlayer';
import LoginScreen from './components/LoginScreen';
import ConfirmDialog from './components/ConfirmDialog';
import ShareButton from './components/ShareButton';
import MeetingHistory from './components/MeetingHistory';
import SendEmailDialog from './components/SendEmailDialog';
import UserMenu from './components/UserMenu';
import SettingsDialog from './components/SettingsDialog';
import ErrorDisplay from './components/ErrorDisplay';
import CopyButton from './components/CopyButton';
import { useHostSharing } from './hooks/useHostSharing';
import { useLocale } from './i18n';
import { formatTime, formatDateTimeRange } from './utils/textUtils';
import { aiService } from './services/aiService';
import { minutesBodyText, minutesBodyHTML } from './utils/minutesFormat';
import { getDriveToken } from './utils/driveToken';

const App: React.FC = () => {
  const { t } = useLocale();
  const [audioSourceType, _setAudioSourceType] = useState<AudioSource>(() => {
    const saved = localStorage.getItem('pref_audioSource') as AudioSource;
    return Object.values(AudioSource).includes(saved) ? saved : AudioSource.MICROPHONE;
  });
  const setAudioSourceType = (v: AudioSource) => { _setAudioSourceType(v); localStorage.setItem('pref_audioSource', v); };
  const [appMode, _setAppMode] = useState<AppMode>(
    // Default người dùng mới: 'notes' = None (Record only); bật dịch khi cần
    () => (localStorage.getItem('pref_appMode') as AppMode) || 'notes'
  );
  const setAppMode = (v: AppMode) => { _setAppMode(v); localStorage.setItem('pref_appMode', v); };
  const translationEnabled = appMode === 'interpret';
  const [showTranscript, setShowTranscript] = useState<boolean>(false);
  const [keyWarning, setKeyWarning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'keys'>('general');
  const openSettings = (tab: 'general' | 'keys' = 'general') => { setSettingsTab(tab); setSettingsOpen(true); };
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  // State cho Custom Popups
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendMinutes, setSendMinutes] = useState<MeetingMinutes | null>(null);
  const [sendSubject, setSendSubject] = useState('');
  const [sendHtmlBody, setSendHtmlBody] = useState('');
  const [sendTextBody, setSendTextBody] = useState('');
  const savedMeetingIdRef = useRef<string | null>(null);
  const draftMeetingIdRef = useRef<string | null>(null);
  const pendingDriveLinksRef = useRef<DriveLinks | null>(null);
  const pendingDriveFolderIdRef = useRef<string | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isRetranscribing, setIsRetranscribing] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [pastMeetings, setPastMeetings] = useState<any[]>([]);
  const [isMeetingsLoading, setIsMeetingsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMeetings, setHasMoreMeetings] = useState(false);
  const lastMeetingDocRef = useRef<any>(null);
  const timeFilterRef = useRef<{ startDate?: Date; endDate?: Date }>({});
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [showSelectedTranscript, setShowSelectedTranscript] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings>({ driveEnabled: false });
  const [isDriveAuthorizing, setIsDriveAuthorizing] = useState(false);

  // Firebase Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const savedDriveToken = sessionStorage.getItem('drive_access_token') || undefined;
        setUser({
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || '',
          email: firebaseUser.email || '',
          picture: firebaseUser.photoURL || '',
          driveAccessToken: savedDriveToken,
        });
      } else {
        setUser(null);
        gmailService.clearSendToken();
        sessionStorage.removeItem('drive_access_token');
        sessionStorage.removeItem('drive_token_expiry');
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load user settings from Firestore
  useEffect(() => {
    if (!user) return;
    userSettingsService.getSettings(user.uid)
      .then(setUserSettings)
      .catch(err => console.error('Failed to load user settings:', err));
  }, [user?.uid]);

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const executeLogout = async () => {
    gmailService.clearSendToken();
    sessionStorage.removeItem('drive_access_token');
    sessionStorage.removeItem('drive_token_expiry');
    await signOut(auth);
    setUser(null);
    setUserSettings({ driveEnabled: false });
    setShowLogoutConfirm(false);
  };

  const [rpmLimit, setRpmLimit] = useState(15);
  // Log bar chỉ dành cho debug — ẩn hoàn toàn ở bản production
  const showLogBar = import.meta.env.DEV;
  const [logBarHeight, setLogBarHeight] = useState(showLogBar ? 32 : 0);
  const [sttEngine, _setSttEngine] = useState<SttEngine>(
    () => (localStorage.getItem('pref_sttEngine') as SttEngine) || SttEngine.GEMINI
  );
  const setSttEngine = (v: SttEngine) => { _setSttEngine(v); localStorage.setItem('pref_sttEngine', v); };
  const [webSpeechLang, _setWebSpeechLang] = useState<WebSpeechLang>(
    () => (localStorage.getItem('pref_webSpeechLang') as WebSpeechLang) || 'en-US'
  );
  const setWebSpeechLang = (v: WebSpeechLang) => { _setWebSpeechLang(v); localStorage.setItem('pref_webSpeechLang', v); };
  const [targetLang, _setTargetLang] = useState<TargetLanguage>(
    () => (localStorage.getItem('pref_targetLang') as TargetLanguage) || 'vi'
  );
  const setTargetLang = (v: TargetLanguage) => { _setTargetLang(v); localStorage.setItem('pref_targetLang', v); };

  // Custom Hooks quản lý Live Interpretation Session (cả 2 luôn được khởi tạo, chỉ active hook được connect)
  const geminiSession = useAISession(rpmLimit, targetLang, translationEnabled);
  const webSpeechSession = useWebSpeechSession(rpmLimit, webSpeechLang, targetLang, translationEnabled);
  const activeSession = sttEngine === SttEngine.GEMINI ? geminiSession : webSpeechSession;
  const {
    connect: connectAI,
    cleanup: cleanupAI,
    liveTranscript,
    setLiveTranscript,
    inputDraft,
    outputDraft
  } = activeSession;

  // Custom Hook quản lý Recording, Segments (Phương án 1) và Minutes Generation
  const {
    status,
    minutes,
    setMinutes,
    errorMessage,
    isProcessingSegment,
    hqSegments,
    fullTranslatedTranscript,
    setFullTranslatedTranscript,
    isTranslatingFull,
    recordedBlob,
    elapsedTime,
    micMuted,
    micAvailable,
    toggleMic,
    hasPendingMinutes,
    retryMinutes,
    transcriptSource,
    startRecording,
    stopRecording,
    cancelRecording,
    reset
  } = useMeetingRecorder(
    connectAI, cleanupAI, targetLang, translationEnabled,
    () => liveTranscript
      .filter(l => l.type === 'input')
      .map(l => `[${formatTime(l.timestamp)}] ${l.text}`)
      .join('\n'),
    (blob: Blob) => uploadAudioAtStop(blob)
  );

  // WebRTC sharing
  const {
    isSharing, shareLink, viewerCount,
    startSharing, stopSharing
  } = useHostSharing(
    liveTranscript, inputDraft, outputDraft,
    elapsedTime, status, minutes, hqSegments,
    fullTranslatedTranscript, user, translationEnabled
  );

  // Upload audio lên Drive NGAY khi bấm dừng (không đợi gỡ băng/tóm tắt) —
  // audio là nguồn gốc, phải an toàn trước tiên; link gắn vào doc khi doc được tạo
  const uploadAudioAtStop = async (audioBlob: Blob) => {
    if (!userSettings.driveEnabled || !userSettings.driveFolderId) return;

    // Proactively refresh if token missing or expired (with 60s buffer)
    let token = sessionStorage.getItem('drive_access_token');
    const expiry = Number(sessionStorage.getItem('drive_token_expiry') || '0');
    if (!token || Date.now() > expiry - 60_000) {
      try {
        const result = await refreshDriveTokenFn();
        token = result.data.accessToken;
        sessionStorage.setItem('drive_access_token', token);
        sessionStorage.setItem('drive_token_expiry', String(Date.now() + result.data.expiresIn * 1000));
      } catch {
        console.error('Drive upload skipped: could not refresh token');
        return;
      }
    }

    try {
      const meetingTitle = `Meeting ${new Date().toLocaleString()}`;
      const folder = await driveService.createMeetingFolder(token, userSettings.driveFolderId!, meetingTitle);

      const driveLinks: DriveLinks = { folderWebViewLink: folder.webViewLink };
      pendingDriveFolderIdRef.current = folder.id;

      const timestamp = new Date().toISOString().slice(0, 10);
      const audioResult = await driveService.uploadAudioFile(token, folder.id, `Audio_${timestamp}.webm`, audioBlob);
      driveLinks.audioFileId = audioResult.id;
      driveLinks.audioWebViewLink = audioResult.webViewLink;

      pendingDriveLinksRef.current = driveLinks;
      // Doc (biên bản hoặc nháp) đã kịp lưu trước khi upload xong → gắn link ngay
      const savedId = savedMeetingIdRef.current || draftMeetingIdRef.current;
      if (savedId) await meetingService.updateDriveLinks(savedId, driveLinks);
      console.log('Audio uploaded to Drive (at stop):', driveLinks);
    } catch (err) {
      console.error('Drive upload failed (non-blocking):', err);
    }
  };

  // Tóm tắt thất bại → lưu NHÁP transcript xuống Firestore ngay, đóng tab không mất họp
  useEffect(() => {
    if (status === RecordingStatus.ERROR && hasPendingMinutes && user && !draftMeetingIdRef.current && hqSegments.length > 0) {
      meetingService.saveDraft(user.uid, user.email, hqSegments.join("\n\n---\n\n"), fullTranslatedTranscript, transcriptSource)
        .then(id => {
          draftMeetingIdRef.current = id;
          console.log('Draft saved to Firestore:', id);
          if (pendingDriveLinksRef.current) {
            meetingService.updateDriveLinks(id, pendingDriveLinksRef.current).catch(() => {});
          }
        })
        .catch(err => console.error('Failed to save draft:', err));
    }
  }, [status, hasPendingMinutes, user, hqSegments, fullTranslatedTranscript]);

  // Auto-save meeting minutes to Firestore
  useEffect(() => {
    if (minutes && user && status === RecordingStatus.COMPLETED && !savedMeetingIdRef.current) {
      const savePromise = draftMeetingIdRef.current
        ? meetingService.finalizeDraft(draftMeetingIdRef.current, minutes, fullTranslatedTranscript, cryptoService.isEnabled())
            .then(() => draftMeetingIdRef.current as string)
        : meetingService.saveMeeting(
            user.uid,
            user.email,
            minutes,
            hqSegments.join("\n\n---\n\n"),
            fullTranslatedTranscript,
            transcriptSource
          );
      savePromise.then(id => {
        draftMeetingIdRef.current = null;
        savedMeetingIdRef.current = id;
        console.log('Meeting saved to Firestore:', id);

        // Audio đã upload từ lúc bấm dừng — gắn link vào doc + đổi tên folder theo tóm tắt
        if (pendingDriveLinksRef.current) {
          meetingService.updateDriveLinks(id, pendingDriveLinksRef.current).catch(() => {});
        }
        if (pendingDriveFolderIdRef.current && minutes.shortSummary) {
          getDriveToken()
            .then(token => driveService.renameFile(token, pendingDriveFolderIdRef.current!, minutes.shortSummary))
            .catch(() => {});
        }
      }).catch(err => {
        console.error('Failed to save meeting to Firestore:', err);
      });
    }
  }, [minutes, status, user]);

  // Fetch past meetings from Firestore (paginated)
  const loadMeetings = useCallback(async (reset = false) => {
    if (!user) return;
    if (reset) {
      setIsMeetingsLoading(true);
      lastMeetingDocRef.current = null;
    } else {
      setIsLoadingMore(true);
    }

    try {
      const result = await meetingService.getUserMeetings(user.uid, {
        pageSize: 5,
        startAfterDoc: reset ? undefined : lastMeetingDocRef.current,
        ...timeFilterRef.current,
      });
      lastMeetingDocRef.current = result.lastDoc;
      setHasMoreMeetings(result.hasMore);
      setPastMeetings(prev => reset ? result.meetings : [...prev, ...result.meetings]);
    } catch (err) {
      console.error('Failed to load meetings:', err);
    } finally {
      setIsMeetingsLoading(false);
      setIsLoadingMore(false);
    }
  }, [user]);

  useEffect(() => {
    loadMeetings(true);
  }, [user, status, loadMeetings]);

  const handleLoadMore = () => loadMeetings(false);

  const handleTimeFilterChange = (startDate?: Date, endDate?: Date) => {
    timeFilterRef.current = { startDate, endDate };
    loadMeetings(true);
  };

  // Tạo biên bản từ bản nháp đã lưu (transcript có sẵn trong Firestore)
  const handleGenerateFromDraft = async () => {
    const m = selectedMeeting;
    if (!m?.draft || isGeneratingDraft) return;
    setIsGeneratingDraft(true);
    setDraftError(null);
    try {
      const created = m.createdAt?.toDate ? m.createdAt.toDate() : new Date();
      const timeRange = formatDateTimeRange(created, created);
      const result = await aiService.generateMinutes(m.transcriptText || '', timeRange, targetLang, translationEnabled);
      await meetingService.finalizeDraft(m.id, result, result.translatedTranscript || '', m.encrypted === true);
      const updated = { ...m, draft: false, minutes: result, translatedTranscript: result.translatedTranscript || '' };
      setSelectedMeeting(updated);
      setPastMeetings(prev => prev.map(x => x.id === m.id ? updated : x));
    } catch (err: any) {
      setDraftError(err?.message || 'Error');
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  // Gỡ băng lại HQ từ audio đã lưu trên Drive → thay transcript → tạo lại biên bản
  const handleRetranscribe = async () => {
    const m = selectedMeeting;
    if (!m?.driveLinks?.audioFileId || isRetranscribing || isGeneratingDraft) return;
    setIsRetranscribing(true);
    setDraftError(null);
    try {
      const token = await getDriveToken();
      const audioBlob = await driveService.downloadFile(token, m.driveLinks.audioFileId);
      const transcript = await aiService.transcribeFullAudio(audioBlob, audioBlob.type || 'audio/webm');
      if (!transcript.trim()) throw new Error('Empty transcript from audio');
      await meetingService.updateTranscript(m.id, transcript, m.encrypted === true);

      const created = m.createdAt?.toDate ? m.createdAt.toDate() : new Date();
      const timeRange = formatDateTimeRange(created, created);
      const result = await aiService.generateMinutes(transcript, timeRange, targetLang, translationEnabled);
      await meetingService.finalizeDraft(m.id, result, result.translatedTranscript || '', m.encrypted === true);

      const updated = {
        ...m,
        draft: false,
        transcriptSource: 'hq',
        transcriptText: transcript,
        minutes: result,
        translatedTranscript: result.translatedTranscript || '',
      };
      setSelectedMeeting(updated);
      setPastMeetings(prev => prev.map(x => x.id === m.id ? updated : x));
    } catch (err: any) {
      setDraftError(err?.message || 'Error');
    } finally {
      setIsRetranscribing(false);
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    await meetingService.deleteMeeting(meetingId);
    setPastMeetings(prev => prev.filter(m => m.id !== meetingId));
  };

  const handleDeleteAllMeetings = async () => {
    if (!user) return;
    await meetingService.deleteAllMeetings(user.uid);
    setPastMeetings([]);
    setHasMoreMeetings(false);
    lastMeetingDocRef.current = null;
  };

  const handleStart = () => {
    // Require a user-provided Gemini key — the app ships no shared key.
    if (!apiKeyService.hasUserKeys()) {
      setKeyWarning(true);
      return;
    }
    setKeyWarning(false);
    setLiveTranscript([]);
    setShowTranscript(false);
    draftMeetingIdRef.current = null;
    pendingDriveLinksRef.current = null;
    pendingDriveFolderIdRef.current = null;
    setDraftError(null);
    startRecording(audioSourceType);
  };

  const handleCancel = () => {
    draftMeetingIdRef.current = null;
    pendingDriveLinksRef.current = null;
    pendingDriveFolderIdRef.current = null;
    setDraftError(null);
    if (isSharing) stopSharing();
    cancelRecording();
    setLiveTranscript([]);
    setShowTranscript(false);
    savedMeetingIdRef.current = null;
  };

  const handleReset = () => {
    draftMeetingIdRef.current = null;
    pendingDriveLinksRef.current = null;
    pendingDriveFolderIdRef.current = null;
    setDraftError(null);
    if (isSharing) stopSharing();
    reset();
    setLiveTranscript([]);
    setShowTranscript(false);
    savedMeetingIdRef.current = null;
  };

  const formatTranscript = (text: string) => text.replace(/(?<!\n)\[(\d{1,2}:\d{2})\]/g, '\n[$1]').trimStart();

  const processShortSummary = (summary: string) => {
    if (!summary) return "";
    let s = summary.trim();
    while (s.endsWith('.')) {
      s = s.slice(0, -1).trim();
    }
    const capFirst = s.charAt(0).toUpperCase() + s.slice(1);
    return capFirst.split(/\s+/).slice(0, 15).join(' ');
  };

  const generateMinutesHTML = (m: MeetingMinutes) => {
    const titleText = processShortSummary(m.shortSummary);
    const participantsHTML = m.participants.map(p => 
      `<span style="display:inline-block; background-color:#f0f4ff; color:#4338ca; padding:8px 16px; border-radius:12px; margin:0 8px 8px 0; font-size:13px; font-weight:700; border:1px solid #e0e7ff;">${p}</span>`
    ).join('');

    const actionItemsHTML = m.actionItems.map(item => `
      <div style="background-color:#ffffff; border:1px solid #f1f5f9; border-left:5px solid #6366f1; border-radius:20px; padding:20px; margin-bottom:16px; box-shadow:0 4px 20px rgba(0,0,0,0.03);">
        <p style="margin:0 0 16px 0; color:#1e293b; font-size:14px; font-weight:800; line-height:1.5;">${item.task}</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background-color:#f0f4ff; color:#4f46e5; padding:6px 12px; border-radius:10px; font-size:11px; font-weight:800; border:1px solid #e0e7ff; display:inline-block;">
              👤 ${item.pic}
            </td>
            <td align="right" style="color:#94a3b8; font-size:11px; font-weight:700;">
              ⏱️ ${item.deadline}
            </td>
          </tr>
        </table>
      </div>
    `).join('');

    const renderSectionHeader = (text: string) => `
      <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
        <tr>
          <td valign="middle" style="padding-right:12px;">
            <div style="width:30px; height:1px; background-color:#e2e8f0; line-height:1px; font-size:1px;">&nbsp;</div>
          </td>
          <td valign="middle">
            <h3 style="font-size:11px; font-weight:900; color:#94a3b8; text-transform:uppercase; letter-spacing:0.25em; margin:0; line-height:1;">${text}</h3>
          </td>
        </tr>
      </table>
    `;

    return `
      <div style="font-family:'Inter', Arial, sans-serif; background-color:#f8fafc; padding:40px 10px; color:#334155;">
        <div style="max-width:850px; margin:0 auto; background-color:#ffffff; border-radius:40px; padding:45px; border:1px solid #f1f5f9; box-shadow:0 25px 50px -12px rgba(0,0,0,0.08);">
          <div style="margin-bottom:45px;">
            <h2 style="font-size:28px; font-weight:900; color:#1e293b; margin:0 0 20px 0; letter-spacing:-0.03em; line-height:1.2;">${titleText}</h2>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="50%" style="padding-right:20px;">
                  <div style="display:inline-block; vertical-align:middle; width:32px; height:32px; background-color:#f0f4ff; border-radius:100%; text-align:center; line-height:32px; margin-right:12px;">📅</div>
                  <div style="display:inline-block; vertical-align:middle;">
                    <p style="text-transform:uppercase; font-size:9px; font-weight:900; color:#94a3b8; letter-spacing:0.15em; margin:0 0 2px 0;">${t.timeLabel}</p>
                    <p style="font-size:14px; font-weight:700; color:#475569; margin:0;">${m.time}</p>
                  </div>
                </td>
                <td width="50%">
                  <div style="display:inline-block; vertical-align:middle; width:32px; height:32px; background-color:#f0f4ff; border-radius:100%; text-align:center; line-height:32px; margin-right:12px;">📍</div>
                  <div style="display:inline-block; vertical-align:middle;">
                    <p style="text-transform:uppercase; font-size:9px; font-weight:900; color:#94a3b8; letter-spacing:0.15em; margin:0 0 2px 0;">${t.locationLabel}</p>
                    <p style="font-size:14px; font-weight:700; color:#475569; margin:0;">${m.location}</p>
                  </div>
                </td>
              </tr>
            </table>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="64%" valign="top" style="padding-right:40px;">
                <div style="margin-bottom:45px;">
                  ${renderSectionHeader(t.participantsSection)}
                  <div style="margin-top:15px;">${participantsHTML}</div>
                </div>
                <div>
                  ${renderSectionHeader(t.summarySection)}
                  ${minutesBodyHTML(m, t)}
                </div>
              </td>
              <td width="36%" valign="top">
                ${renderSectionHeader(t.actionItemsSection)}
                <div style="margin-top:15px;">${actionItemsHTML}</div>
              </td>
            </tr>
          </table>
          <div style="margin-top:50px; padding-top:25px; border-top:1px solid #f1f5f9; text-align:center;">
             <p style="font-size:11px; color:#cbd5e1; font-weight:800; letter-spacing:0.05em;">${t.emailFooter}</p>
          </div>
        </div>
      </div>
    `;
  };

  // Bản plain-text của biên bản — dùng cho fallback mailto khi chưa bật gửi Gmail trực tiếp
  const generateMinutesText = (m: MeetingMinutes) => [
    processShortSummary(m.shortSummary),
    `${t.timeLabel}: ${m.time}`,
    `${t.locationLabel}: ${m.location}`,
    `${t.participantsSection}: ${m.participants.join(', ')}`,
    '',
    minutesBodyText(m, t),
    '',
    `${t.actionItemsSection}:`,
    ...m.actionItems.map(item => `- ${item.task} (${item.pic} · ${item.deadline})`),
  ].join('\n');

  const handleSendEmail = (updatedMinutes: MeetingMinutes) => {
    const htmlBody = generateMinutesHTML(updatedMinutes);
    const titleText = processShortSummary(updatedMinutes.shortSummary);
    const timeParts = updatedMinutes.time.trim().split(/\s+/);
    const displayDate = timeParts.length > 0 ? timeParts[timeParts.length - 1] : "";
    const subjectPrefix = `${t.emailSubjectPrefix} ${titleText}`;
    const subject = displayDate ? `${subjectPrefix} (${displayDate})` : subjectPrefix;

    setSendMinutes(updatedMinutes);
    setSendSubject(subject);
    setSendHtmlBody(htmlBody);
    setSendTextBody(generateMinutesText(updatedMinutes));
    setShowSendDialog(true);
  };

  const handleToggleDrive = async () => {
    if (!user) return;

    if (userSettings.driveEnabled) {
      const updated = { ...userSettings, driveEnabled: false };
      setUserSettings(updated);
      await userSettingsService.updateSettings(user.uid, { driveEnabled: false });
      return;
    }

    setIsDriveAuthorizing(true);
    try {
      // Use Google Identity Services to get authorization code
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      const accessToken = await new Promise<string>((resolve, reject) => {
        const client = google.accounts.oauth2.initCodeClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.file',
          ux_mode: 'popup',
          callback: async (response: google.accounts.oauth2.CodeResponse) => {
            if (response.error) {
              reject(new Error(response.error));
              return;
            }
            try {
              // Exchange code for tokens via Cloud Function
              const result = await exchangeDriveCodeFn({ authCode: response.code });
              sessionStorage.setItem('drive_token_expiry', String(Date.now() + result.data.expiresIn * 1000));
              resolve(result.data.accessToken);
            } catch (err) {
              reject(err);
            }
          },
        });
        client.requestCode();
      });

      sessionStorage.setItem('drive_access_token', accessToken);
      setUser(prev => prev ? { ...prev, driveAccessToken: accessToken } : null);

      const folderId = await driveService.getOrCreateAppFolder(accessToken);
      const updated: UserSettings = { driveEnabled: true, driveFolderId: folderId };
      setUserSettings(updated);
      await userSettingsService.updateSettings(user.uid, updated);
    } catch (err: any) {
      if (err.message !== 'popup_closed' && err.error !== 'popup_closed') {
        console.error('Drive authorization failed:', err);
      }
    } finally {
      setIsDriveAuthorizing(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div style={{ paddingBottom: `${logBarHeight}px` }} className="h-screen flex flex-col items-center p-2 sm:p-4 md:p-8 relative overflow-hidden">
      <div className="w-full max-w-4xl flex flex-col flex-1 space-y-3 sm:space-y-6 overflow-hidden">
        <div className="flex justify-between items-center sm:items-start gap-2">
          <Header />
          <UserMenu
            user={user}
            onOpenSettings={() => openSettings('general')}
            onLogout={handleLogout}
          />
        </div>

        <SettingsDialog
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          userSettings={userSettings}
          isDriveAuthorizing={isDriveAuthorizing}
          onToggleDrive={handleToggleDrive}
          initialTab={settingsTab}
        />

        {status === RecordingStatus.IDLE && !selectedMeeting && (
          <div className="flex-1 overflow-y-auto hide-scrollbar space-y-6">
            {keyWarning && (
              <button
                onClick={() => openSettings('keys')}
                className="w-full flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm text-left hover:bg-amber-100 transition-colors group"
              >
                <i className="fas fa-key mt-0.5"></i>
                <span className="flex-1">{t.needKeyToStart}</span>
                <i className="fas fa-arrow-right mt-0.5 opacity-50 group-hover:translate-x-0.5 transition-transform"></i>
              </button>
            )}
            <RecorderControls
              status={status}
              onStart={handleStart}
              onStop={stopRecording}
              audioSource={audioSourceType}
              setAudioSource={setAudioSourceType}
              sttEngine={sttEngine}
              setSttEngine={setSttEngine}
              webSpeechLang={webSpeechLang}
              setWebSpeechLang={setWebSpeechLang}
              targetLang={targetLang}
              setTargetLang={setTargetLang}
              appMode={appMode}
              setAppMode={setAppMode}
            />
            <MeetingHistory
              meetings={pastMeetings}
              onSelect={setSelectedMeeting}
              onDelete={handleDeleteMeeting}
              onDeleteAll={handleDeleteAllMeetings}
              isLoading={isMeetingsLoading}
              hasMore={hasMoreMeetings}
              onLoadMore={handleLoadMore}
              isLoadingMore={isLoadingMore}
              onTimeFilterChange={handleTimeFilterChange}
            />
          </div>
        )}

        {status === RecordingStatus.IDLE && selectedMeeting && (
          <div className="flex-1 overflow-y-auto hide-scrollbar space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => { setSelectedMeeting(null); setShowSelectedTranscript(false); }}
                className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 rounded-xl font-bold text-xs border border-slate-100 transition-colors"
              >
                <i className="fas fa-chevron-left"></i> {t.back}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSelectedTranscript(!showSelectedTranscript)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                    showSelectedTranscript
                      ? 'bg-indigo-600 text-white'
                      : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                  }`}
                >
                  <i className="fas fa-file-alt"></i> {t.transcript}
                </button>
                {selectedMeeting.driveLinks?.audioFileId && (
                  <DriveAudioPlayer
                    audioFileId={selectedMeeting.driveLinks.audioFileId}
                    audioWebViewLink={selectedMeeting.driveLinks.audioWebViewLink}
                  />
                )}
                {selectedMeeting.driveLinks?.audioWebViewLink && (
                  <a
                    href={selectedMeeting.driveLinks.audioWebViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all text-xs font-bold flex items-center gap-2"
                  >
                    <i className="fab fa-google-drive"></i> Audio
                  </a>
                )}
              </div>
            </div>

            {selectedMeeting.draft && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                <div className="flex items-start gap-2.5 flex-1">
                  <i className="fas fa-file-pen text-amber-500 mt-0.5"></i>
                  <p className="text-amber-800 text-xs font-semibold leading-relaxed">{t.draftBanner}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {selectedMeeting.transcriptSource === 'live' && selectedMeeting.driveLinks?.audioFileId && (
                    <button
                      onClick={handleRetranscribe}
                      disabled={isRetranscribing || isGeneratingDraft}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-100 transition-colors disabled:opacity-60"
                    >
                      {isRetranscribing
                        ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>{t.retranscribing}</>
                        : <><i className="fas fa-arrows-rotate mr-1.5"></i>{t.retranscribeHq}</>}
                    </button>
                  )}
                  <button
                    onClick={handleGenerateFromDraft}
                    disabled={isGeneratingDraft || isRetranscribing}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-60 ${
                      selectedMeeting.transcriptSource === 'live' && selectedMeeting.driveLinks?.audioFileId
                        ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100'
                    }`}
                  >
                    {isGeneratingDraft
                      ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>{t.loading}</>
                      : <><i className="fas fa-wand-magic-sparkles mr-1.5"></i>{t.generateMinutesNow}</>}
                  </button>
                </div>
              </div>
            )}

            {/* Meeting hoàn chỉnh nhưng transcript nguồn live + có audio → mời gỡ băng lại HQ */}
            {!selectedMeeting.draft && selectedMeeting.transcriptSource === 'live' && selectedMeeting.driveLinks?.audioFileId && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl">
                <p className="text-indigo-700 text-xs font-semibold leading-relaxed flex-1">
                  <i className="fas fa-circle-info mr-1.5"></i>{t.liveSourceNote}
                </p>
                <button
                  onClick={handleRetranscribe}
                  disabled={isRetranscribing}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-100 transition-colors disabled:opacity-60 shrink-0"
                >
                  {isRetranscribing
                    ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>{t.retranscribing}</>
                    : <><i className="fas fa-arrows-rotate mr-1.5"></i>{t.retranscribeHq}</>}
                </button>
              </div>
            )}
            {draftError && !selectedMeeting.draft && (
              <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                <p className="text-red-600 text-xs font-bold"><i className="fas fa-exclamation-circle mr-2"></i>{draftError}</p>
              </div>
            )}
            {draftError && selectedMeeting.draft && (
              <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                <p className="text-red-600 text-xs font-bold"><i className="fas fa-exclamation-circle mr-2"></i>{draftError}</p>
              </div>
            )}

            {(showSelectedTranscript || selectedMeeting.draft) ? (
              <div className="animate-in fade-in duration-300">
                {(selectedMeeting.transcriptText || selectedMeeting.translatedTranscript) ? (
                  <div className={`grid grid-cols-1 ${selectedMeeting.transcriptText && selectedMeeting.translatedTranscript ? 'md:grid-cols-2' : ''} gap-4`}>
                    {selectedMeeting.translatedTranscript && (
                      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden order-1">
                        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <i className="fas fa-globe text-emerald-500 text-sm"></i>
                            <h3 className="text-xs font-black text-slate-600 uppercase tracking-wider truncate">{t.vietnameseTranslation}</h3>
                          </div>
                          <CopyButton text={formatTranscript(selectedMeeting.translatedTranscript)} />
                        </div>
                        <div className="p-5 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap max-h-[70vh] overflow-y-auto custom-scrollbar">
                          {formatTranscript(selectedMeeting.translatedTranscript)}
                        </div>
                      </div>
                    )}
                    {selectedMeeting.transcriptText && (
                      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden order-2">
                        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <i className="fas fa-language text-indigo-500 text-sm"></i>
                            <h3 className="text-xs font-black text-slate-600 uppercase tracking-wider truncate">{t.originalTranscript}</h3>
                          </div>
                          <CopyButton text={formatTranscript(selectedMeeting.transcriptText)} />
                        </div>
                        <div className="p-5 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap max-h-[70vh] overflow-y-auto custom-scrollbar">
                          {formatTranscript(selectedMeeting.transcriptText)}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <i className="fas fa-file-alt text-3xl text-slate-300 mb-3"></i>
                    <p className="text-slate-400 text-sm font-bold">{t.noTranscript}</p>
                  </div>
                )}
              </div>
            ) : (
              <MinutesDisplay
                minutes={selectedMeeting.minutes}
                onSendEmail={handleSendEmail}
                onSave={(updated) => {
                  meetingService.updateMinutes(selectedMeeting.id, updated, selectedMeeting.encrypted === true).then(() => {
                    setSelectedMeeting({ ...selectedMeeting, minutes: updated });
                    setPastMeetings(prev => prev.map(m => m.id === selectedMeeting.id ? { ...m, minutes: updated } : m));
                  }).catch(err =>
                    console.error('Failed to update minutes:', err)
                  );
                }}
                onReset={() => setSelectedMeeting(null)}
                onRenameTranscript={(token, to) => {
                  const nextT = replaceSpeakerInText(selectedMeeting.translatedTranscript || '', token, to);
                  setSelectedMeeting(prev => prev ? { ...prev, translatedTranscript: nextT } : prev);
                  setPastMeetings(prev => prev.map(m => m.id === selectedMeeting.id ? { ...m, translatedTranscript: nextT } : m));
                  meetingService.updateTranslated(selectedMeeting.id, nextT, selectedMeeting.encrypted === true).catch(err =>
                    console.error('Failed to update translated transcript:', err)
                  );
                }}
                transcriptText={selectedMeeting.transcriptText || ''}
                onViewTranscript={() => setShowSelectedTranscript(true)}
                liveTranscript={[]}
                translatedTranscript={selectedMeeting.translatedTranscript || ''}
                isTranslating={false}
              />
            )}
          </div>
        )}

        {status === RecordingStatus.RECORDING && (
          <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
             <LiveTranscript
               transcript={liveTranscript}
               inputDraft={inputDraft}
               outputDraft={outputDraft}
               showTranslation={translationEnabled}
               isRecording={true}
               micMuted={micMuted}
               onToggleMic={micAvailable ? toggleMic : undefined}
               elapsedTime={elapsedTime}
               onStop={stopRecording}
               onCancel={handleCancel}
               isProcessing={isProcessingSegment}
               headerActions={
                 <ShareButton
                   isSharing={isSharing}
                   shareLink={shareLink}
                   viewerCount={viewerCount}
                   onStartSharing={startSharing}
                   onStopSharing={stopSharing}
                 />
               }
             />
          </div>
        )}

        {status === RecordingStatus.PROCESSING && (
          <div className="animate-in fade-in duration-500 flex-1 flex flex-col overflow-hidden">
            <LiveTranscript
              transcript={liveTranscript}
              inputDraft={""}
              outputDraft={""}
              showTranslation={translationEnabled}
              isRecording={false}
              isFinalizing={true}
              headerActions={isSharing ? (
                <ShareButton
                  isSharing={isSharing}
                  shareLink={shareLink}
                  viewerCount={viewerCount}
                  onStartSharing={startSharing}
                  onStopSharing={stopSharing}
                />
              ) : undefined}
            />
          </div>
        )}

        {status === RecordingStatus.COMPLETED && minutes && (
          <>
            {showTranscript ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500 flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                      <i className="fas fa-history"></i>
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-800 text-sm">{t.conversationHistory}</h2>
                      <p className="text-[10px] text-slate-400">{t.conversationHistoryDesc}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowTranscript(false)} 
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-colors flex items-center"
                  >
                    <i className="fas fa-chevron-left mr-2"></i> {t.backToMinutes}
                  </button>
                </div>
                <LiveTranscript transcript={liveTranscript} inputDraft={""} outputDraft={""} isRecording={false} showTranslation={translationEnabled} />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto hide-scrollbar pr-1">
                <MinutesDisplay
                  minutes={minutes}
                  onSendEmail={handleSendEmail}
                  onSave={(updated) => {
                    // Sync state cha để không mất chỉnh sửa khi remount (vd chuyển qua/lại transcript)
                    setMinutes(updated);
                    if (savedMeetingIdRef.current) {
                      meetingService.updateMinutes(savedMeetingIdRef.current, updated, cryptoService.isEnabled()).catch(err =>
                        console.error('Failed to update minutes:', err)
                      );
                    }
                  }}
                  onReset={handleReset}
                  onRenameTranscript={(token, to) => {
                    // onSave đã lo phần minutes; ở đây chỉ lan sang bản dịch transcript (lưu tách riêng)
                    const nextT = replaceSpeakerInText(fullTranslatedTranscript || '', token, to);
                    setFullTranslatedTranscript(nextT);
                    if (savedMeetingIdRef.current) {
                      meetingService.updateTranslated(savedMeetingIdRef.current, nextT, cryptoService.isEnabled()).catch(err =>
                        console.error('Failed to update translated transcript:', err)
                      );
                    }
                  }}
                  transcriptText={hqSegments.join("\n\n---\n\n")}
                  onViewTranscript={() => setShowTranscript(true)}
                  liveTranscript={liveTranscript}
                  translatedTranscript={fullTranslatedTranscript}
                  isTranslating={isTranslatingFull}
                />
              </div>
            )}
          </>
        )}

        {status === RecordingStatus.ERROR && (
          <ErrorDisplay errorMessage={errorMessage} onRetry={hasPendingMinutes ? retryMinutes : handleReset} />
        )}
      </div>
      {showLogBar && <LogBar rpmLimit={rpmLimit} onRpmChange={setRpmLimit} isRecording={status === RecordingStatus.RECORDING} onHeightChange={setLogBarHeight} />}

      {/* Popups */}
      <ConfirmDialog 
        isOpen={showLogoutConfirm}
        title={t.logoutTitle}
        message={t.logoutMessage}
        confirmLabel={t.logout}
        cancelLabel={t.cancel}
        onConfirm={executeLogout}
        onCancel={() => setShowLogoutConfirm(false)}
        type="danger"
      />

      {sendMinutes && (
        <SendEmailDialog
          isOpen={showSendDialog}
          minutes={sendMinutes}
          subject={sendSubject}
          htmlBody={sendHtmlBody}
          textBody={sendTextBody}
          userUid={user?.uid || ''}
          userEmail={user?.email || ''}
          onClose={() => setShowSendDialog(false)}
        />
      )}
    </div>
  );
};

export default App;
