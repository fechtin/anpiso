
// Added React to imports to fix "Cannot find namespace 'React'" error
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { TranscriptLine } from '../types';
import { formatTime, formatDuration } from '../utils/textUtils';
import { useLocale } from '../i18n';

interface Props {
  transcript: TranscriptLine[];
  inputDraft: string;
  outputDraft: string;
  isRecording?: boolean;
  isFinalizing?: boolean;
  elapsedTime?: number;
  onStop?: () => void;
  onCancel?: () => void;
  isProcessing?: boolean;
  viewerMode?: boolean;
  headerActions?: React.ReactNode;
  showTranslation?: boolean;
  micMuted?: boolean;
  onToggleMic?: () => void;
}

interface TranscriptPair {
  id: string;
  original?: TranscriptLine;
  translation?: TranscriptLine;
  timestamp: number;
}

const LiveTranscript: React.FC<Props> = ({
  transcript,
  inputDraft,
  outputDraft,
  isRecording,
  isFinalizing,
  elapsedTime,
  onStop,
  onCancel,
  isProcessing,
  viewerMode,
  headerActions,
  showTranslation = true,
  micMuted,
  onToggleMic,
}) => {
  const { t } = useLocale();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [finalizingSeconds, setFinalizingSeconds] = useState(0);

  const pairs = useMemo(() => {
    const p: TranscriptPair[] = [];
    const originals = transcript.filter(t => t.type === 'input');
    const outputMap = new Map<string, TranscriptLine>();
    transcript.filter(t => t.type === 'output').forEach(t => outputMap.set(t.id, t));

    originals.forEach(orig => {
      // Ghép cặp bằng id: 'in-XXX' → 'out-XXX' (thay phần prefix)
      const outputId = 'out-' + orig.id.slice(3);
      p.push({
        id: orig.id,
        original: orig,
        translation: outputMap.get(outputId),
        timestamp: orig.timestamp
      });
    });

    return p.sort((a, b) => a.timestamp - b.timestamp);
  }, [transcript]);

  useEffect(() => {
    let interval: number;
    if (isFinalizing) {
      setFinalizingSeconds(0);
      interval = window.setInterval(() => {
        setFinalizingSeconds(v => v + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isFinalizing]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const atBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
    setIsAtBottom(atBottom);
  }, []);

  useEffect(() => {
    if (isAtBottom && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [pairs, inputDraft, outputDraft, isAtBottom]);

  return (
    <div className="bg-[#0f172a] rounded-xl sm:rounded-[2rem] p-3 sm:p-6 shadow-2xl border border-slate-800 overflow-hidden flex flex-col flex-1 relative">
      <div className="flex flex-wrap items-center justify-between mb-3 sm:mb-4 border-b border-slate-800/50 pb-3 sm:pb-4 px-1 gap-2">
        <h3 className="text-slate-400 font-bold text-[10px] sm:text-xs uppercase tracking-[0.2em] flex items-center">
          <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full mr-2 sm:mr-3 shadow-[0_0_8px_rgba(99,102,241,0.5)]"></span>
          {t.live}
        </h3>
        <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">
          {!isAtBottom && (
            <button
              onClick={() => setIsAtBottom(true)}
              className="text-[9px] bg-indigo-600 text-white px-2 py-1 rounded-md animate-bounce"
            >
              <i className="fas fa-arrow-down mr-1"></i> {t.newMessages}
            </button>
          )}
          {isRecording && (
            <div className="flex items-center h-8 sm:h-9 bg-slate-800/80 rounded-lg sm:rounded-xl px-1.5 sm:px-2 border border-slate-700/50 animate-in slide-in-from-right-4 gap-1.5 sm:gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              <span className="text-red-400 font-bold text-[9px] sm:text-xs uppercase tracking-tight">
                {isProcessing ? t.analyzing : t.listening}
              </span>
              <span className="text-red-400/80 font-mono text-[10px] sm:text-[11px] font-bold border-l border-red-900/40 pl-1.5 sm:pl-2">
                {elapsedTime !== undefined ? formatDuration(elapsedTime) : '--:--'}
              </span>
              {onToggleMic && (
                <button
                  onClick={onToggleMic}
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                    micMuted
                      ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-900/20'
                      : 'bg-slate-600 hover:bg-slate-500 text-white'
                  }`}
                  title={micMuted ? t.unmuteMic : t.muteMic}
                >
                  <i className={`fas ${micMuted ? 'fa-microphone-slash' : 'fa-microphone'} text-[9px] sm:text-[10px]`}></i>
                </button>
              )}
              <button
                onClick={onStop}
                className="bg-red-500 hover:bg-red-600 text-white w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-red-900/20"
                title={t.stopRecording}
              >
                <i className="fas fa-stop text-[9px] sm:text-[10px]"></i>
              </button>
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="bg-slate-600 hover:bg-slate-500 text-white w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-slate-900/20"
                  title={t.cancelRecording}
                >
                  <i className="fas fa-times text-[9px] sm:text-[10px]"></i>
                </button>
              )}
            </div>
          )}
          {viewerMode && !isFinalizing && (
            <div className="flex items-center bg-emerald-900/40 rounded-lg sm:rounded-xl p-1 sm:p-1.5 border border-emerald-500/30 animate-in slide-in-from-right-4">
              <div className="flex items-center px-1.5 sm:px-2 py-1 rounded-lg">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse mr-1.5 sm:mr-2"></span>
                <span className="text-emerald-300 font-bold text-[9px] sm:text-xs uppercase tracking-tight">{t.viewing}</span>
                <span className="ml-1.5 sm:ml-2 text-emerald-400/80 font-mono text-[10px] sm:text-[11px] font-bold border-l border-emerald-500/20 pl-1.5 sm:pl-2">
                  {elapsedTime !== undefined ? formatDuration(elapsedTime) : '--:--'}
                </span>
              </div>
            </div>
          )}
          {headerActions}
          {isFinalizing && (
            <div className="flex items-center bg-indigo-900/40 rounded-lg sm:rounded-xl p-1 sm:p-1.5 border border-indigo-500/30 animate-in slide-in-from-right-4">
              <div className="flex items-center px-2 sm:px-3 py-1 rounded-lg">
                <div className="w-3 h-3 border-2 border-indigo-400/20 border-t-indigo-400 rounded-full animate-spin mr-1.5 sm:mr-2"></div>
                <span className="text-indigo-300 font-bold text-[9px] sm:text-xs uppercase tracking-tight">
                  {t.finalizing}
                </span>
                <span className="ml-2 sm:ml-3 text-indigo-400/80 font-mono text-[10px] sm:text-[11px] font-bold border-l border-indigo-500/20 pl-2 sm:pl-3">
                  {finalizingSeconds}s
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={`grid ${showTranslation ? 'grid-cols-2' : 'grid-cols-1'} gap-2 sm:gap-4 mb-2 px-1`}>
        <span className="text-[9px] uppercase font-black tracking-widest text-slate-500">{showTranslation ? t.originalColumn : t.transcript}</span>
        {showTranslation && (
          <span className="text-[9px] uppercase font-black tracking-widest text-indigo-400">{t.translateColumn}</span>
        )}
      </div>
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto custom-scrollbar pr-1 sm:pr-2 space-y-2 sm:space-y-4 scroll-smooth">
        {pairs.length === 0 && !inputDraft && (
          <div className="h-full flex items-center justify-center opacity-20 italic text-[11px] text-slate-500">
            {t.waitingForSpeech}
          </div>
        )}
        {pairs.map((pair) => (
          <div key={pair.id} className={`grid ${showTranslation ? 'grid-cols-2' : 'grid-cols-1'} gap-2 sm:gap-4 items-start animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div className="bg-slate-800/40 p-2 sm:p-4 rounded-lg sm:rounded-xl border border-slate-700/50 text-slate-100 text-[11px] sm:text-[14px] leading-relaxed shadow-sm h-full">
              <div className="text-[9px] sm:text-[10px] text-slate-500 mb-1 font-mono">{formatTime(pair.timestamp)}</div>
              <p className="font-medium">{pair.original?.text}</p>
            </div>
            {showTranslation && (
              <div className="bg-indigo-900/30 p-2 sm:p-4 rounded-lg sm:rounded-xl border border-indigo-500/30 text-indigo-50 text-[11px] sm:text-[14px] leading-relaxed ring-1 ring-indigo-500/10 shadow-lg shadow-indigo-900/20 h-full">
                <div className="text-[9px] sm:text-[10px] text-indigo-400/60 mb-1 font-mono">{formatTime(pair.timestamp)}</div>
                <p className="font-medium">{pair.translation?.text || "Translating..."}</p>
              </div>
            )}
          </div>
        ))}
        {(inputDraft || outputDraft) && (
          <div className={`grid ${showTranslation ? 'grid-cols-2' : 'grid-cols-1'} gap-2 sm:gap-4 items-start pb-6`}>
            <div className="bg-slate-800/20 p-2 sm:p-4 rounded-lg sm:rounded-xl border border-slate-700/40 text-slate-200 text-[11px] sm:text-[14px] leading-relaxed min-h-[40px] sm:min-h-[60px]">
              {inputDraft && (
                <p className="font-medium text-slate-100">
                  {inputDraft}
                  <span className="inline-block w-1.5 h-4 bg-indigo-500 ml-1 animate-blink align-middle"></span>
                </p>
              )}
            </div>
            {showTranslation && (
              <div className="bg-indigo-900/10 p-2 sm:p-4 rounded-lg sm:rounded-xl border border-indigo-500/20 text-indigo-100 text-[11px] sm:text-[14px] leading-relaxed min-h-[40px] sm:min-h-[60px]">
                {outputDraft && (
                  <p className="font-medium">
                    {outputDraft}
                    <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-1 animate-blink align-middle"></span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .animate-blink { animation: blink 0.8s infinite; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
        .custom-scrollbar { scrollbar-width: thin; scrollbar-color: #334155 transparent; }
      `}</style>
    </div>
  );
};

export default React.memo(LiveTranscript);
