
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { logService } from '../services/logService';
import { LogEntry } from '../types';

interface LogBarProps {
  rpmLimit?: number;
  onRpmChange?: (value: number) => void;
  isRecording?: boolean;
  onHeightChange?: (height: number) => void;
}

const LogBar: React.FC<LogBarProps> = ({ rpmLimit, onRpmChange, isRecording, onHeightChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [height, setHeight] = useState(256); // Mặc định h-64 = 256px
  const [isResizing, setIsResizing] = useState(false);
  
  const [autoScrollAudio, setAutoScrollAudio] = useState(true);
  const [autoScrollText, setAutoScrollText] = useState(true);
  const [hasNewAudio, setHasNewAudio] = useState(false);
  const [hasNewText, setHasNewText] = useState(false);

  const audioScrollRef = useRef<HTMLDivElement>(null);
  const textScrollRef = useRef<HTMLDivElement>(null);
  const prevLogsCountRef = useRef({ audio: 0, text: 0 });

  useEffect(() => {
    onHeightChange?.(isOpen ? height : 32);
  }, [isOpen, height, onHeightChange]);

  useEffect(() => {
    return logService.subscribe((newLogs) => {
      const audioLogsCount = newLogs.filter(l => l.category === 'audio').length;
      const textLogsCount = newLogs.filter(l => l.category === 'text').length;
      
      if (!autoScrollAudio && audioLogsCount > prevLogsCountRef.current.audio) {
        setHasNewAudio(true);
      }
      if (!autoScrollText && textLogsCount > prevLogsCountRef.current.text) {
        setHasNewText(true);
      }
      
      prevLogsCountRef.current = { audio: audioLogsCount, text: textLogsCount };
      setLogs(newLogs);
    });
  }, [autoScrollAudio, autoScrollText]);

  // Logic Resize
  const startResizing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setIsOpen(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent | TouchEvent) => {
    if (isResizing) {
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const newHeight = window.innerHeight - clientY;
      // Giới hạn chiều cao từ 100px đến 90% màn hình
      if (newHeight > 100 && newHeight < window.innerHeight * 0.9) {
        setHeight(newHeight);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      window.addEventListener('touchmove', resize);
      window.addEventListener('touchend', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // Logic Scroll Detection
  const handleScroll = (ref: React.RefObject<HTMLDivElement>, setAuto: (v: boolean) => void, setHasNew: (v: boolean) => void) => {
    if (!ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    // Kiểm tra nếu cách đáy < 40px thì coi như đang ở đáy
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAuto(isAtBottom);
    if (isAtBottom) setHasNew(false);
  };

  // Auto Scroll Effect
  useEffect(() => {
    if (isOpen) {
      if (autoScrollAudio && audioScrollRef.current) {
        audioScrollRef.current.scrollTop = audioScrollRef.current.scrollHeight;
      }
      if (autoScrollText && textScrollRef.current) {
        textScrollRef.current.scrollTop = textScrollRef.current.scrollHeight;
      }
    }
  }, [logs, isOpen, autoScrollAudio, autoScrollText]);

  const scrollToBottom = (ref: React.RefObject<HTMLDivElement>, setAuto: (v: boolean) => void, setHasNew: (v: boolean) => void) => {
    if (ref.current) {
      ref.current.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
      setAuto(true);
      setHasNew(false);
    }
  };

  const audioLogs = logs.filter(l => l.category === 'audio');
  const textLogs = logs.filter(l => l.category === 'text');

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Fixed: Use React.FC to handle 'key' prop and resolve TypeScript assignment error
  const LogItem: React.FC<{ log: LogEntry }> = ({ log }) => (
    <div className={`p-2 mb-1 rounded text-[10px] font-mono border-l-2 ${
      log.direction === 'req' ? 'bg-slate-800 border-indigo-500' : 
      log.direction === 'res' ? 'bg-slate-800 border-emerald-500' : 'bg-slate-800 border-amber-500'
    }`}>
      <div className="flex justify-between text-slate-500 mb-0.5">
        <span>[{formatTime(log.timestamp)}] {log.label}</span>
        <span className="opacity-50 uppercase">{log.direction}</span>
      </div>
      <div className="text-slate-300 break-words whitespace-pre-wrap">{log.message}</div>
    </div>
  );

  return (
    <div 
      style={{ height: isOpen ? `${height}px` : '32px' }}
      className={`fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 z-[100] transition-[height] duration-200 ${isResizing ? 'transition-none' : ''}`}
    >
      {/* Resize Handle */}
      <div 
        onMouseDown={startResizing}
        onTouchStart={startResizing}
        className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-indigo-500/50 transition-colors z-[110]"
        title="Kéo để thay đổi kích thước"
      />

      {/* Header Bar */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 px-4 flex items-center justify-between cursor-pointer hover:bg-slate-800 transition-colors select-none"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <i className={`fas fa-terminal text-[10px] ${logs.length > 0 ? 'text-indigo-400' : 'text-slate-500'}`}></i>
          <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI Debug Logs</span>
          <span className="bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded text-[9px]">{logs.length} events</span>
        </div>
        <div className="flex items-center gap-3">
          {rpmLimit !== undefined && onRpmChange && isRecording && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 h-6 bg-slate-800 rounded-lg px-2 border border-slate-700/50"
            >
              <span className="text-[9px] text-slate-500 uppercase tracking-tight font-bold">RPM</span>
              <button
                onClick={() => onRpmChange(Math.max(1, rpmLimit - 1))}
                className="w-4 h-4 rounded bg-slate-700 text-slate-300 text-[10px] hover:bg-slate-600 flex items-center justify-center"
              >−</button>
              <span className="text-[10px] font-mono font-bold text-amber-400 w-4 text-center">{rpmLimit}</span>
              <button
                onClick={() => onRpmChange(Math.min(30, rpmLimit + 1))}
                className="w-4 h-4 rounded bg-slate-700 text-slate-300 text-[10px] hover:bg-slate-600 flex items-center justify-center"
              >+</button>
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); logService.clear(); }}
            className="text-[9px] text-slate-500 hover:text-red-400 font-bold uppercase transition-colors"
          >
            Clear
          </button>
          <i className={`fas fa-chevron-${isOpen ? 'down' : 'up'} text-slate-500 text-xs`}></i>
        </div>
      </div>

      {/* Content Area */}
      {isOpen && (
        <div 
          style={{ height: `${height - 32}px` }}
          className="grid grid-cols-2 gap-px bg-slate-800 overflow-hidden"
        >
          {/* Column Audio */}
          <div className="bg-slate-900 flex flex-col h-full overflow-hidden relative">
            <div className="px-3 py-1 bg-slate-800/50 text-[9px] font-black text-slate-500 border-b border-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <i className="fas fa-wave-square"></i> AUDIO EXCHANGE
              </span>
              {!autoScrollAudio && hasNewAudio && (
                <button 
                  onClick={() => scrollToBottom(audioScrollRef, setAutoScrollAudio, setHasNewAudio)}
                  className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[8px] animate-bounce hover:bg-indigo-500 transition-colors shadow-lg"
                >
                  NEW LOGS <i className="fas fa-arrow-down ml-1"></i>
                </button>
              )}
            </div>
            <div 
              ref={audioScrollRef} 
              onScroll={() => handleScroll(audioScrollRef, setAutoScrollAudio, setHasNewAudio)}
              className="flex-1 overflow-y-auto p-2 custom-scrollbar"
            >
              {audioLogs.map(log => <LogItem key={log.id} log={log} />)}
              {audioLogs.length === 0 && <div className="text-[10px] text-slate-700 italic p-4">No audio activity...</div>}
            </div>
          </div>

          {/* Column Text */}
          <div className="bg-slate-900 flex flex-col h-full overflow-hidden border-l border-slate-800 relative">
            <div className="px-3 py-1 bg-slate-800/50 text-[9px] font-black text-slate-500 border-b border-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <i className="fas fa-file-alt"></i> TEXT EXCHANGE
              </span>
              {!autoScrollText && hasNewText && (
                <button 
                  onClick={() => scrollToBottom(textScrollRef, setAutoScrollText, setHasNewText)}
                  className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[8px] animate-bounce hover:bg-indigo-500 transition-colors shadow-lg"
                >
                  NEW LOGS <i className="fas fa-arrow-down ml-1"></i>
                </button>
              )}
            </div>
            <div 
              ref={textScrollRef} 
              onScroll={() => handleScroll(textScrollRef, setAutoScrollText, setHasNewText)}
              className="flex-1 overflow-y-auto p-2 custom-scrollbar"
            >
              {textLogs.map(log => <LogItem key={log.id} log={log} />)}
              {textLogs.length === 0 && <div className="text-[10px] text-slate-700 italic p-4">No text activity...</div>}
            </div>
          </div>
        </div>
      )}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}</style>
    </div>
  );
};

export default LogBar;
