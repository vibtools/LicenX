import React, { useState } from 'react';
import {
  UserCheck,
  KeyRound,
  Lock,
  Copy,
  Check,
  Loader2,
  FileCode,
} from 'lucide-react';
import { api, getAuthToken } from '../services/apiClient';

interface ProfileTabProps {
  username: string;
  onUsernameUpdated: (newUsername: string) => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({ username, onUsernameUpdated }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const token = getAuthToken() || '';

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setMessage({ success: false, text: 'Current password is required' });
      return;
    }

    if (newPassword && newPassword.length < 6) {
      setMessage({ success: false, text: 'New password must be at least 6 characters' });
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setMessage({ success: false, text: 'New passwords do not match' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await api.updateCredentials({
        currentPassword,
        newUsername: newUsername.trim() || undefined,
        newPassword: newPassword || undefined,
      });

      if (res.username && res.username !== username) {
        onUsernameUpdated(res.username);
      }

      setMessage({ success: true, text: 'Admin profile & credentials updated' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNewUsername('');
    } catch (err: any) {
      setMessage({ success: false, text: err.message || 'Update failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="space-y-3 font-mono text-xs max-w-3xl">
      {/* Profile Overview Card */}
      <div className="p-3.5 rounded bg-slate-900/40 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-slate-400" />
            <span className="font-medium text-slate-200 uppercase tracking-wider">Admin Profile</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-medium">
            SUPER ADMIN
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase block mb-1">Username</span>
            <span className="text-slate-200 font-medium text-xs">{username}</span>
          </div>

          <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase block mb-1">Access Role</span>
            <span className="text-emerald-400/90 font-medium text-xs">Root Master Control</span>
          </div>

          <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase block mb-1">Auth Type</span>
            <span className="text-slate-300 font-medium text-xs">PBKDF2-SHA512 Salted</span>
          </div>
        </div>
      </div>

      {/* Update Credentials Card */}
      <div className="p-3.5 rounded bg-slate-900/40 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-slate-400" />
            <span className="font-medium text-slate-200 uppercase tracking-wider">Security & Master Password</span>
          </div>

          {message && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded border ${
                message.success
                  ? 'bg-emerald-950/30 border-emerald-900/40 text-emerald-400'
                  : 'bg-rose-950/30 border-rose-900/40 text-rose-400'
              }`}
            >
              {message.text}
            </span>
          )}
        </div>

        <form onSubmit={handleUpdatePassword} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Current Master Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Change Username (Optional)</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder={username}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Leave blank to keep current"
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Leave blank to keep current"
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 font-medium disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
              Update Security Credentials
            </button>
          </div>
        </form>
      </div>

      {/* Bearer Token for CLI / Automation */}
      <div className="p-3.5 rounded bg-slate-900/40 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-slate-400" />
            <span className="font-medium text-slate-200 uppercase tracking-wider">Admin API Bearer Token</span>
          </div>

          <button
            onClick={handleCopyToken}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            {copiedToken ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copiedToken ? 'Copied' : 'Copy Token'}
          </button>
        </div>

        <input
          type="text"
          readOnly
          value={token}
          className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-400 select-all font-mono text-[10px] focus:outline-none"
        />
      </div>
    </div>
  );
};
