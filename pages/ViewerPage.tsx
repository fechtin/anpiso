import React from 'react';
import { RecordingStatus } from '../types';
import { useViewerSession } from '../hooks/useViewerSession';
import LiveTranscript from '../components/LiveTranscript';
import MinutesDisplay from '../components/MinutesDisplay';
import { useLocale } from '../i18n';

interface Props {
  roomId: string;
}

const ViewerPage: React.FC<Props> = ({ roomId }) => {
  const { t } = useLocale();
  const {
    connectionState,
    hostName,
    liveTranscript,
    inputDraft,
    outputDraft,
    elapsedTime,
    status,
    minutes,
    hqSegments,
    fullTranslatedTranscript,
    translationEnabled,
  } = useViewerSession(roomId);

  if (connectionState === 'room_not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center bg-white rounded-3xl p-10 shadow-xl border border-slate-100 max-w-md">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-link-slash text-2xl"></i>
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">{t.roomNotFound}</h2>
          <p className="text-slate-400 text-sm">{t.roomNotFoundMsg}</p>
        </div>
      </div>
    );
  }

  if (connectionState === 'room_ended') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center bg-white rounded-3xl p-10 shadow-xl border border-slate-100 max-w-md">
          <div className="w-16 h-16 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-calendar-check text-2xl"></i>
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">{t.meetingEnded}</h2>
          <p className="text-slate-400 text-sm">{t.meetingEndedMsg}</p>
        </div>
      </div>
    );
  }

  if (connectionState === 'connecting') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-bold text-sm">{t.connectingToMeeting}</p>
          {hostName && <p className="text-slate-400 text-xs mt-1">{t.host}: {hostName}</p>}
        </div>
      </div>
    );
  }

  if (connectionState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center bg-white rounded-3xl p-10 shadow-xl border border-slate-100 max-w-md">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-exclamation-triangle text-2xl"></i>
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">{t.connectionError}</h2>
          <p className="text-slate-400 text-sm mb-4">{t.connectionErrorMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 transition-transform active:scale-95"
          >
            {t.retry}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col items-center p-4 md:p-8 pb-12 relative overflow-hidden">
      <div className="w-full max-w-4xl flex flex-col flex-1 space-y-6 overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src="/icon-light-color.png" alt="Anpiso" className="w-10 h-10 rounded-2xl border border-slate-100 shadow-md shadow-slate-200 rotate-3" />
            <div>
              <h1 className="text-sm font-black text-slate-800 tracking-tight">{t.loginTitle}</h1>
              <p className="text-[10px] text-slate-400 font-medium">{t.liveViewing}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold border ${
              connectionState === 'connected'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                : 'bg-amber-50 border-amber-200 text-amber-600'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                connectionState === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}></span>
              {connectionState === 'connected' ? t.connected : t.reconnecting}
            </div>
            {hostName && (
              <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-100 shadow-sm">
                <p className="text-[9px] text-slate-400 font-bold">{t.host}</p>
                <p className="text-[10px] font-black text-slate-700">{hostName}</p>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {(status === RecordingStatus.RECORDING || status === RecordingStatus.PROCESSING || (status === RecordingStatus.COMPLETED && !minutes)) && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <LiveTranscript
              transcript={liveTranscript}
              inputDraft={status === RecordingStatus.RECORDING ? inputDraft : ''}
              outputDraft={status === RecordingStatus.RECORDING ? outputDraft : ''}
              isRecording={false}
              viewerMode={true}
              showTranslation={translationEnabled}
              elapsedTime={elapsedTime}
              isFinalizing={status === RecordingStatus.PROCESSING || (status === RecordingStatus.COMPLETED && !minutes)}
            />
            {status === RecordingStatus.COMPLETED && !minutes && (
              <div className="mt-3 flex items-center justify-center gap-2 text-indigo-400 animate-pulse">
                <div className="w-3 h-3 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin"></div>
                <span className="text-xs font-bold">{t.waitingForSummary}</span>
              </div>
            )}
          </div>
        )}

        {status === RecordingStatus.COMPLETED && minutes && (
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
            <MinutesDisplay
              minutes={minutes}
              onSendEmail={() => {}}
              onReset={() => {}}
              audioBlob={null}
              transcriptText={hqSegments.join("\n\n---\n\n")}
              onViewTranscript={() => {}}
              liveTranscript={liveTranscript}
              translatedTranscript={fullTranslatedTranscript}
              isTranslating={false}
              readOnly={true}
            />
          </div>
        )}

        {status === RecordingStatus.IDLE && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-400">
              <i className="fas fa-clock text-3xl mb-3 text-slate-300"></i>
              <p className="font-bold text-sm">{t.waitingForHost}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewerPage;
