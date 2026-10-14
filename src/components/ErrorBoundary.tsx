import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public componentDidCatch() {
    console.error('Unhandled Application Error caught by ErrorBoundary');
  }

  private handleReset = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false });
    window.location.href = '/vcon';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans selection:bg-rose-950 selection:text-rose-200">
          <div className="w-full max-w-lg bg-slate-900/90 border border-slate-800 rounded-xl shadow-2xl p-6 space-y-4 backdrop-blur-md">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800/80">
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-100">Application Error Encountered</h2>
                <p className="text-xs text-slate-400">A runtime error occurred while rendering the dashboard.</p>
              </div>
            </div>

            {this.state.hasError && (
              <div className="p-3 rounded-lg bg-slate-950/80 border border-rose-950/50 text-rose-300 text-xs">
                <p className="font-semibold text-rose-400 mb-1">
                  Something went wrong while displaying the dashboard.
                </p>
                <p className="text-slate-400">
                  Reload the page or return to admin login. If the problem
                  continues, contact your administrator.
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-sm cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload Dashboard
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                Admin Login
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
