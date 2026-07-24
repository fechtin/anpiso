import React, { useState } from 'react';
import { useLocale } from '../i18n';

interface Props {
  text: string;
  className?: string;
}

const CopyButton: React.FC<Props> = ({ text, className = '' }) => {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      disabled={!text}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all disabled:opacity-40 ${
        copied
          ? 'bg-emerald-50 text-emerald-600'
          : 'bg-white hover:bg-slate-100 text-slate-500 border border-slate-200'
      } ${className}`}
      title={copied ? t.copied : t.copy}
    >
      <i className={`fas ${copied ? 'fa-check' : 'fa-copy'} text-[10px]`}></i>
      {copied ? t.copied : t.copy}
    </button>
  );
};

export default CopyButton;
