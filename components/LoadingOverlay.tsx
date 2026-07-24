
import React, { useState, useEffect } from 'react';

const LoadingOverlay: React.FC = () => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-lg border border-slate-100 text-center animate-in zoom-in-95 duration-300 w-full max-w-sm mx-auto">
      <div className="flex items-center gap-4 w-full">
        <div className="relative shrink-0">
          {/* Outer Spinning Ring */}
          <div className="w-10 h-10 border-[3px] border-indigo-50 border-t-indigo-600 rounded-full animate-spin"></div>
          
          {/* Inner Timer Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-indigo-600 font-mono font-bold text-[10px] leading-none">
              {seconds}s
            </span>
          </div>
        </div>

        <div className="text-left flex-1">
          <h2 className="text-sm font-bold text-slate-700">Finalizing...</h2>
        </div>
      </div>
    </div>
  );
};

export default LoadingOverlay;
