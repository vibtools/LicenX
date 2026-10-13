import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AlertTriangle, AlertCircle, HelpCircle, X } from 'lucide-react';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  icon?: 'danger' | 'warning' | 'info';
}

type ConfirmFunction = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFunction | null>(null);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    options: ConfirmOptions;
  }>({
    isOpen: false,
    options: { message: '' },
  });

  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFunction>((input) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      const options: ConfirmOptions =
        typeof input === 'string'
          ? {
              message: input,
              danger:
                input.toLowerCase().includes('delete') ||
                input.toLowerCase().includes('reset') ||
                input.toLowerCase().includes('remove') ||
                input.toLowerCase().includes('unbind') ||
                input.toLowerCase().includes('revoke') ||
                input.toLowerCase().includes('logout') ||
                input.toLowerCase().includes('clear'),
            }
          : input;

      setModalState({
        isOpen: true,
        options: {
          title: options.title || 'Confirm Action',
          message: options.message,
          confirmText: options.confirmText || (options.danger ? 'Confirm' : 'Continue'),
          cancelText: options.cancelText || 'Cancel',
          danger: options.danger ?? true,
          icon: options.icon || (options.danger ? 'danger' : 'warning'),
        },
      });
    });
  }, []);

  const handleClose = (result: boolean) => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {modalState.isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => handleClose(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-4 shadow-2xl space-y-3.5 transform transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-1.5 rounded-lg border ${
                    modalState.options.danger
                      ? 'bg-red-500/10 border-red-500/20 text-red-400'
                      : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  }`}
                >
                  {modalState.options.danger ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : modalState.options.icon === 'info' ? (
                    <HelpCircle className="w-4 h-4 text-indigo-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white tracking-tight">
                    {modalState.options.title}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => handleClose(false)}
                className="text-slate-500 hover:text-slate-300 p-1 rounded-md transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Modal Message */}
            <div className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-line px-0.5">
              {modalState.options.message}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => handleClose(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 rounded-md transition"
              >
                {modalState.options.cancelText}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => handleClose(true)}
                className={`px-3.5 py-1.5 text-xs font-semibold text-white rounded-md transition shadow-sm ${
                  modalState.options.danger
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {modalState.options.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = (): ConfirmFunction => {
  const context = useContext(ConfirmContext);
  if (!context) {
    // Graceful fallback if invoked outside provider
    return (options) => {
      const msg = typeof options === 'string' ? options : options.message;
      return Promise.resolve(window.confirm(msg));
    };
  }
  return context;
};
