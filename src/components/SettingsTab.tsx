import React, { useEffect, useState } from 'react';
import {
  Cloud,
  Database,
  KeyRound,
  Shield,
  Copy,
  Check,
  Download,
} from 'lucide-react';
import { api } from '../services/apiClient';
import { R2Config, R2Backup } from '../types';

interface SettingsTabProps {
  publicKeyPem: string;
  onPublicKeyUpdated: (key: string) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  publicKeyPem,
  onPublicKeyUpdated,
}) => {
  const [loading, setLoading] = useState(true);
  const [tursoUrl, setTursoUrl] = useState('');
  const [hasTursoEnv, setHasTursoEnv] = useState(false);

  // R2 State
  const [r2Config, setR2Config] = useState<R2Config>({
    accountId: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    publicUrl: '',
  });
  const [r2Saving, setR2Saving] = useState(false);
  const [r2Testing, setR2Testing] = useState(false);
  const [r2StatusMessage, setR2StatusMessage] = useState<{ success: boolean; text: string } | null>(null);

  // Backups
  const [backups, setBackups] = useState<R2Backup[]>([]);

  // Admin Credentials
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [credSaving, setCredSaving] = useState(false);
  const [credMessage, setCredMessage] = useState<{ success: boolean; text: string } | null>(null);

  // Copy Key
  const [copiedKey, setCopiedKey] = useState(false);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [sRes, bRes] = await Promise.all([api.getSettings(), api.getR2Backups()]);
      if (sRes) {
        setTursoUrl(sRes.tursoUrl || '');
        setHasTursoEnv(Boolean(sRes.hasTursoEnv));
        if (sRes.r2Config) {
          setR2Config({
            accountId: sRes.r2Config.accountId || '',
            accessKeyId: sRes.r2Config.accessKeyId || '',
            secretAccessKey: sRes.r2Config.secretAccessKey || '',
            bucketName: sRes.r2Config.bucketName || '',
            publicUrl: sRes.r2Config.publicUrl || '',
          });
        }
      }
      const backupList = bRes?.backups || (Array.isArray(bRes) ? (bRes as any) : []);
      setBackups(Array.isArray(backupList) ? backupList : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleTestR2 = async () => {
    setR2Testing(true);
    setR2StatusMessage(null);
    try {
      const res = await api.testR2Config(r2Config);
      setR2StatusMessage({ success: res.success, text: res.message });
    } catch (err: any) {
      setR2StatusMessage({ success: false, text: err.message || 'Test failed' });
    } finally {
      setR2Testing(false);
    }
  };

  const handleSaveR2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setR2Saving(true);
    setR2StatusMessage(null);
    try {
      const res = await api.saveR2Config(r2Config);
      setR2StatusMessage({ success: true, text: res.message || 'Saved successfully' });
    } catch (err: any) {
      setR2StatusMessage({ success: false, text: err.message || 'Save failed' });
    } finally {
      setR2Saving(false);
    }
  };

  const handleUpdateCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredSaving(true);
    setCredMessage(null);
    try {
      await api.updateCredentials({
        currentPassword,
        newUsername: newUsername.trim() || undefined,
        newPassword: newPassword || undefined,
      });
      setCredMessage({ success: true, text: 'Credentials updated successfully' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setCredMessage({ success: false, text: err.message || 'Update failed' });
    } finally {
      setCredSaving(false);
    }
  };

  const handleRotateCryptoKeys = async () => {
    if (!confirm('Warning: Rotating the Ed25519 keypair will require updating the public key in your client applications! Proceed?')) {
      return;
    }
    try {
      const res = await api.rotateCryptoKeys();
      onPublicKeyUpdated(res.publicKeyPem);
      alert('Ed25519 keypair rotated successfully.');
    } catch (err: any) {
      alert(err.message || 'Failed to rotate keys');
    }
  };

  const copyPublicKey = () => {
    navigator.clipboard.writeText(publicKeyPem);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="space-y-4 font-mono text-xs max-w-4xl">
      {/* Database Connection */}
      <div className="p-3.5 rounded bg-slate-900/40 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-400" />
            <span className="font-medium text-slate-300 uppercase">Turso / libSQL Database</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
            {hasTursoEnv ? 'TURSO CLOUD CONNECTED' : 'LIBSQL DB PERSISTED'}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-300">
          <span className="text-slate-500">Database Connection URL:</span>
          <span className="text-slate-300 font-medium">{tursoUrl}</span>
        </div>
      </div>

      {/* Cloudflare R2 Storage Settings */}
      <div className="p-3.5 rounded bg-slate-900/40 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-slate-400" />
            <span className="font-medium text-slate-300 uppercase">Cloudflare R2 Object Storage</span>
          </div>
          {r2StatusMessage && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded border ${
                r2StatusMessage.success
                  ? 'bg-emerald-950/30 border-emerald-900/40 text-emerald-400'
                  : 'bg-rose-950/30 border-rose-900/40 text-rose-400'
              }`}
            >
              {r2StatusMessage.text}
            </span>
          )}
        </div>

        <form onSubmit={handleSaveR2} className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Account ID</label>
              <input
                type="text"
                value={r2Config.accountId}
                onChange={(e) => setR2Config({ ...r2Config, accountId: e.target.value })}
                placeholder="Cloudflare Account ID"
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Bucket Name</label>
              <input
                type="text"
                value={r2Config.bucketName}
                onChange={(e) => setR2Config({ ...r2Config, bucketName: e.target.value })}
                placeholder="e.g. vcon-licenses"
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Access Key ID</label>
              <input
                type="text"
                value={r2Config.accessKeyId}
                onChange={(e) => setR2Config({ ...r2Config, accessKeyId: e.target.value })}
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Secret Access Key</label>
              <input
                type="password"
                value={r2Config.secretAccessKey}
                onChange={(e) => setR2Config({ ...r2Config, secretAccessKey: e.target.value })}
                placeholder="••••••••••••••••"
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Public Domain / Custom Worker URL (Optional)</label>
            <input
              type="text"
              value={r2Config.publicUrl || ''}
              onChange={(e) => setR2Config({ ...r2Config, publicUrl: e.target.value })}
              placeholder="https://licenses.yourdomain.com"
              className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleTestR2}
              disabled={r2Testing}
              className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 disabled:opacity-50 transition-colors"
            >
              {r2Testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              type="submit"
              disabled={r2Saving}
              className="px-3 py-1.5 rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 font-medium disabled:opacity-50 transition-colors"
            >
              {r2Saving ? 'Saving...' : 'Save R2 Config'}
            </button>
          </div>
        </form>
      </div>

      {/* Cryptographic Signing Keys */}
      <div className="p-3.5 rounded bg-slate-900/40 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            <span className="font-medium text-slate-300 uppercase">RSA 2048-bit Enterprise Public Key</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
              High Security
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRotateCryptoKeys}
              className="text-[11px] text-slate-400 hover:text-rose-400 transition-colors"
            >
              Rotate RSA Keys
            </button>
            <button
              onClick={copyPublicKey}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
            >
              {copiedKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copiedKey ? 'Copied' : 'Copy PEM'}
            </button>
          </div>
        </div>

        <textarea
          readOnly
          rows={9}
          value={publicKeyPem}
          className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-300 text-[10px] select-all font-mono focus:outline-none leading-relaxed"
        />
      </div>

      {/* Admin Security */}
      <div className="p-3.5 rounded bg-slate-900/40 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-slate-400" />
            <span className="font-medium text-slate-300 uppercase">Change Admin Password</span>
          </div>
          {credMessage && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded border ${
                credMessage.success
                  ? 'bg-emerald-950/30 border-emerald-900/40 text-emerald-400'
                  : 'bg-rose-950/30 border-rose-900/40 text-rose-400'
              }`}
            >
              {credMessage.text}
            </span>
          )}
        </div>

        <form onSubmit={handleUpdateCreds} className="space-y-2.5">
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">New Username</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Leave blank to keep"
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Leave blank to keep"
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={credSaving}
              className="px-3 py-1.5 rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 font-medium disabled:opacity-50 transition-colors"
            >
              {credSaving ? 'Updating...' : 'Update Credentials'}
            </button>
          </div>
        </form>
      </div>

      {/* R2 Backup History */}
      {backups.length > 0 && (
        <div className="p-3.5 rounded bg-slate-900/40 border border-slate-800 space-y-2">
          <span className="font-medium text-slate-300 uppercase block pb-2 border-b border-slate-800/80">
            R2 Backup Archive ({backups.length})
          </span>
          <div className="space-y-1">
            {backups.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between py-1 px-2 rounded bg-slate-950 border border-slate-900 text-[11px]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-300 font-medium">{b.filename}</span>
                  <span className="text-slate-500">({b.record_count} keys)</span>
                </div>
                {b.r2_url && (
                  <a
                    href={b.r2_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
