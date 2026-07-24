import React, { useEffect, useState } from 'react';
import { parseError } from '../utils/errorMessages';
import { useLocale } from '../i18n';

interface ErrorDisplayProps {
  errorMessage: string | null;
  onRetry: () => void;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ errorMessage, onRetry }) => {
  const { t } = useLocale();
  const friendly = parseError(errorMessage);
  const [showDetails, setShowDetails] = useState(false);
  const [countdown, setCountdown] = useState(friendly.retryDelaySeconds || 0);

  useEffect(() => {
    setCountdown(friendly.retryDelaySeconds || 0);
  }, [friendly.retryDelaySeconds, errorMessage]);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = window.setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const canRetry = countdown === 0;
  const title = t[friendly.titleKey];
  const desc = t[friendly.descKey];
  const retryLabel = canRetry ? t.tryAgain : t.errorRetryIn(countdown);

  return (
    <div className="text-center p-8 bg-red-50 rounded-3xl border border-red-100 max-w-2xl mx-auto">
      <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
        <i className="fas fa-exclamation-triangle text-2xl"></i>
      </div>
      <h3 className="text-red-700 font-extrabold text-base sm:text-lg mb-2">{title}</h3>
      <p className="text-red-600 text-sm leading-relaxed">{desc}</p>

      {friendly.helpUrl && (
        <a
          href={friendly.helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 text-xs text-red-500 hover:text-red-700 underline"
        >
          {t.errorLearnMore} <i className="fas fa-external-link-alt text-[10px] ml-1"></i>
        </a>
      )}

      <div className="flex justify-center gap-3 mt-5">
        <button
          onClick={onRetry}
          disabled={!canRetry}
          className={`px-6 py-2 rounded-xl font-bold shadow-lg shadow-red-100 transition-transform ${
            canRetry
              ? 'bg-red-600 text-white active:scale-95 hover:bg-red-700'
              : 'bg-red-200 text-red-400 cursor-not-allowed'
          }`}
        >
          {retryLabel}
        </button>
      </div>

      <button
        onClick={() => setShowDetails(s => !s)}
        className="mt-4 text-[11px] text-red-400 hover:text-red-600 underline"
      >
        {showDetails ? t.errorHideDetails : t.errorShowDetails}
      </button>

      {showDetails && (
        <pre className="mt-3 p-3 bg-red-100/70 rounded-xl text-[10px] text-red-700 text-left whitespace-pre-wrap break-all max-h-48 overflow-auto custom-scrollbar">
          {friendly.technicalDetails}
        </pre>
      )}
    </div>
  );
};

export default ErrorDisplay;
