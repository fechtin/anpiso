
import React from 'react';

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'info' | 'success';
  hideCancel?: boolean;
}

const ConfirmDialog: React.FC<Props> = ({ 
  isOpen, 
  title, 
  message, 
  confirmLabel = "Xác nhận", 
  cancelLabel = "Hủy", 
  onConfirm, 
  onCancel,
  type = 'danger',
  hideCancel = false
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'danger': return 'fa-sign-out-alt';
      case 'success': return 'fa-check-circle';
      default: return 'fa-info-circle';
    }
  };

  const getColorClass = () => {
    switch (type) {
      case 'danger': return 'bg-red-50 text-red-500';
      case 'success': return 'bg-emerald-50 text-emerald-500';
      default: return 'bg-indigo-50 text-indigo-500';
    }
  };

  const getButtonClass = () => {
    switch (type) {
      case 'danger': return 'bg-red-500 text-white shadow-red-100 hover:bg-red-600';
      case 'success': return 'bg-emerald-600 text-white shadow-emerald-100 hover:bg-emerald-700';
      default: return 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-600';
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onCancel}
      />
      
      {/* Dialog Card */}
      <div className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl border border-slate-100 p-8 text-center animate-in zoom-in-95 fade-in duration-300">
        <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${getColorClass()}`}>
          <i className={`fas ${getIcon()} text-2xl`}></i>
        </div>

        <h3 className="text-xl font-black text-slate-800 mb-2">{title}</h3>
        <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8 whitespace-pre-wrap">
          {message}
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={onConfirm}
            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg ${getButtonClass()}`}
          >
            {confirmLabel}
          </button>
          {!hideCancel && (
            <button
              onClick={onCancel}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
            >
              {cancelLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
