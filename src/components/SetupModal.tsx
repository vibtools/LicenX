import React, { useState } from 'react';
import { ShieldCheck, KeyRound, Loader2 } from 'lucide-react';
import { api, setAuthToken } from '../services/apiClient';

interface SetupModalProps {
  hasTursoEnv: boolean;
  onCompleted: (username: string) => void;
}

export const SetupModal: React.FC<SetupModalProps> = ({ hasTursoEnv, onCompleted }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [enableR2, setEnableR2] = useState(false);
  const [r2Config, setR2Config] = useState({
    accountId: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in required fields');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload: any = {
        username: username.trim(),
        password,
      };

      if (enableR2 && r2Config.accountId && r2Config.bucketName) {
        payload.r2Config = r2Config;
      }

      const res = await api.initSetup(payload);
      setAuthToken(res.token);
      onCompleted(res.username);
    } catch (err: any) {
      setError(err.message || 'Setup initialization failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-xs font-mono">
      <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-lg shadow-xl overflow-hidden">
        <div className="p-3.5 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-slate-900 text-slate-400 border border-slate-800">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="font-mono text-xs font-medium text-slate-200 uppercase tracking-wide">
              VCON Server Setup
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
            {hasTursoEnv ? 'TURSO CLOUD' : 'LIBSQL DB READY'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {error && (
            <div className="p-2 text-xs text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded font-mono">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] font-mono text-slate-400 block mb-1">Admin Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none font-mono"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-mono text-slate-400 block mb-1">Master Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none font-mono"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-mono text-slate-400 block mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none font-mono"
              required
            />
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <label className="flex items-center gap-2 cursor-pointer text-[11px] font-mono text-slate-300 select-none">
              <input
                type="checkbox"
                checked={enableR2}
                onChange={(e) => setEnableR2(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
              />
              Configure Cloudflare R2 Storage (Optional)
            </label>
          </div>

          {enableR2 && (
            <div className="space-y-2 p-2.5 rounded bg-slate-900/40 border border-slate-800">
              <div>
                <label className="text-[10px] font-mono text-slate-400 block mb-1">R2 Account ID</label>
                <input
                  type="text"
                  value={r2Config.accountId}
                  onChange={(e) => setR2Config({ ...r2Config, accountId: e.target.value })}
                  placeholder="e.g. 9b88d40a..."
                  className="w-full px-2 py-1 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 font-mono focus:border-indigo-500/80 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-slate-400 block mb-1">R2 Access Key ID</label>
                <input
                  type="text"
                  value={r2Config.accessKeyId}
                  onChange={(e) => setR2Config({ ...r2Config, accessKeyId: e.target.value })}
                  className="w-full px-2 py-1 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 font-mono focus:border-indigo-500/80 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-slate-400 block mb-1">R2 Secret Access Key</label>
                <input
                  type="password"
                  value={r2Config.secretAccessKey}
                  onChange={(e) => setR2Config({ ...r2Config, secretAccessKey: e.target.value })}
                  className="w-full px-2 py-1 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 font-mono focus:border-indigo-500/80 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-slate-400 block mb-1">R2 Bucket Name</label>
                <input
                  type="text"
                  value={r2Config.bucketName}
                  onChange={(e) => setR2Config({ ...r2Config, bucketName: e.target.value })}
                  placeholder="e.g. vcon-licenses"
                  className="w-full px-2 py-1 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 font-mono focus:border-indigo-500/80 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-mono font-medium rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <KeyRound className="w-3.5 h-3.5" />
              )}
              Initialize VCON System
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
