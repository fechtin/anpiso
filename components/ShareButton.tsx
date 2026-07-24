import React, { useState, useEffect, useRef } from 'react';
import { useLocale } from '../i18n';

interface Props {
  isSharing: boolean;
  shareLink: string | null;
  viewerCount: number;
  onStartSharing: () => void;
  onStopSharing: () => void;
}

const ShareButton: React.FC<Props> = ({ isSharing, shareLink, viewerCount, onStartSharing, onStopSharing }) => {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const autoCopiedRef = useRef(false);

  // Auto-copy link khi share bắt đầu
  useEffect(() => {
    if (shareLink && isSharing && !autoCopiedRef.current) {
      autoCopiedRef.current = true;
      navigator.clipboard.writeText(shareLink).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    }
    if (!isSharing) autoCopiedRef.current = false;
  }, [shareLink, isSharing]);

  const handleCopyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = shareLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isSharing) {
    return (
      <button
        onClick={onStartSharing}
        className="flex items-center h-7 sm:h-9 gap-1 sm:gap-1.5 px-2 sm:px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-bold transition-all active:scale-95 shadow-lg shadow-emerald-900/20"
        title="Share live transcript"
      >
        <i className="fas fa-share-alt"></i>
        <span className="hidden sm:inline">{t.share}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <div className="flex items-center h-7 sm:h-9 gap-1 sm:gap-1.5 bg-emerald-900/40 border border-emerald-500/30 rounded-lg sm:rounded-xl px-2 sm:px-2.5">
        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
        <span className="text-emerald-300 text-[9px] sm:text-[10px] font-bold">Live</span>
        {viewerCount > 0 && (
          <span className="bg-emerald-600 text-white text-[8px] sm:text-[9px] font-bold px-1 sm:px-1.5 py-0.5 rounded-md ml-0.5">
            {viewerCount}
          </span>
        )}
      </div>
      <button
        onClick={handleCopyLink}
        className={`flex items-center h-7 sm:h-9 gap-1 sm:gap-1.5 px-2 sm:px-2.5 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-bold transition-all active:scale-95 ${
          copied
            ? 'bg-emerald-600 text-white'
            : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
        }`}
        title="Copy share link"
      >
        <i className={`fas ${copied ? 'fa-check' : 'fa-link'}`}></i>
        <span className="hidden sm:inline">{copied ? t.copied : t.copyLink}</span>
      </button>
      <button
        onClick={onStopSharing}
        className="flex items-center justify-center h-7 w-7 sm:h-9 sm:w-9 bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-400 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-bold transition-all"
        title="Stop sharing"
      >
        <i className="fas fa-times"></i>
      </button>
    </div>
  );
};

export default ShareButton;
