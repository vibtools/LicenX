import React, { useState } from 'react';
import { LogIn, Loader2, Shield } from 'lucide-react';
import { api, setAuthToken } from '../services/apiClient';

interface LoginModalProps {
  onLoginSuccess: (username: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.login({ username, password });
      setAuthToken(res.token);
      onLoginSuccess(res.username);
    } catch (err: any) {
      setError(err.message || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-xs font-mono">
      <div className="w-full max-w-sm bg-slate-950 border border-slate-800 rounded-lg shadow-xl overflow-hidden">
        <div className="p-3.5 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-slate-900 text-slate-400 border border-slate-800">
              <Shield className="w-4 h-4" />
            </div>
            <span className="font-mono text-xs font-medium text-slate-200 uppercase tracking-wider">
              Admin Authentication
            </span>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
            SECURE
          </span>
        </div>

        <form onSubmit={handleLogin} className="p-4 space-y-3">
          {error && (
            <div className="p-2 text-xs text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded font-mono">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] font-mono text-slate-400 block mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none font-mono"
              autoFocus
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-mono text-slate-400 block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none font-mono"
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-mono font-medium rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogIn className="w-3.5 h-3.5" />
              )}
              Authenticate & Open Dashboard
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
