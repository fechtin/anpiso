import React, { useState, useRef, useEffect, useCallback } from 'react';
import { refreshDriveTokenFn } from '../services/firebase';

interface Props {
  audioFileId: string;
  audioWebViewLink?: string;
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

const DriveAudioPlayer: React.FC<Props> = ({ audioFileId, audioWebViewLink }) => {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const getAccessToken = async (): Promise<string> => {
    let token = sessionStorage.getItem('drive_access_token');
    const expiry = Number(sessionStorage.getItem('drive_token_expiry') || '0');
    if (!token || Date.now() > expiry - 60_000) {
      const result = await refreshDriveTokenFn();
      token = result.data.accessToken;
      sessionStorage.setItem('drive_access_token', token);
      sessionStorage.setItem('drive_token_expiry', String(Date.now() + result.data.expiresIn * 1000));
    }
    return token;
  };

  const loadAudio = useCallback(async () => {
    if (state === 'loading') return;
    setState('loading');
    try {
      const token = await getAccessToken();
      const res = await fetch(`${DRIVE_API}/files/${audioFileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration);
        setState('ready');
        audio.play();
        setIsPlaying(true);
      });
      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime);
        if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
      });
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setProgress(100);
      });
      audio.addEventListener('error', () => {
        setState('error');
      });
      audio.load();
    } catch {
      setState('error');
    }
  }, [audioFileId, state]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * duration;
  };

  const stopAndClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
    setState('idle');
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Idle state: show play button
  if (state === 'idle') {
    return (
      <button
        onClick={loadAudio}
        className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all text-xs font-bold flex items-center gap-2"
      >
        <i className="fas fa-play"></i> Play Audio
      </button>
    );
  }

  // Loading state
  if (state === 'loading') {
    return (
      <div className="px-3 py-2 bg-indigo-50 text-indigo-500 rounded-xl text-xs font-bold flex items-center gap-2">
        <i className="fas fa-spinner fa-spin"></i> Loading...
      </div>
    );
  }

  // Error state: fallback to Drive link
  if (state === 'error') {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setState('idle')}
          className="px-3 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-bold flex items-center gap-2"
          title="Retry"
        >
          <i className="fas fa-redo"></i> Retry
        </button>
        {audioWebViewLink && (
          <a
            href={audioWebViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all text-xs font-bold flex items-center gap-2"
          >
            <i className="fab fa-google-drive"></i>
          </a>
        )}
      </div>
    );
  }

  // Ready state: inline player
  return (
    <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-2.5 py-1.5">
      <button
        onClick={togglePlay}
        className="w-7 h-7 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-600 transition-colors text-[10px]"
      >
        <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'}`}></i>
      </button>
      <span className="text-[10px] font-mono text-slate-500 w-9 text-right">{fmt(currentTime)}</span>
      <div
        className="flex-1 min-w-[80px] h-1.5 bg-slate-300 rounded-full cursor-pointer relative"
        onClick={handleSeek}
      >
        <div
          className="h-full bg-indigo-500 rounded-full transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-slate-400 w-9">{fmt(duration)}</span>
      <button
        onClick={stopAndClose}
        className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors text-xs"
        title="Close player"
      >
        <i className="fas fa-times"></i>
      </button>
    </div>
  );
};

export default DriveAudioPlayer;
