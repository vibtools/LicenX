import React, { useState, useEffect } from 'react';
import {
  Webhook,
  Plus,
  Key,
  Copy,
  Check,
  Trash2,
  Play,
  Code,
  Shield,
  Clock,
  AlertCircle,
  RefreshCw,
  BookOpen,
  Layers,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { api } from '../services/apiClient';
import { AdminApiKeyRecord, CreatedAdminApiKey } from '../types';
import { useConfirm } from '../context/ConfirmContext';

interface AdminApisTabProps {
  onNavigateToTab?: (tab: string) => void;
}

export const AdminApisTab: React.FC<AdminApisTabProps> = () => {
  const confirm = useConfirm();
  const [keys, setKeys] = useState<AdminApiKeyRecord[]>([]);
  const [apps, setApps] = useState<{ id: string; display_name: string; app_slug: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Tab switcher: 'keys' | 'docs'
  const [activeMainTab, setActiveMainTab] = useState<'keys' | 'docs'>('keys');

  // Key creation modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPrefix, setNewKeyPrefix] = useState('live');
  const [selectedAppId, setSelectedAppId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdKeyData, setCreatedKeyData] = useState<CreatedAdminApiKey | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Bulk Clean Keys modal state
  const [isCleanModalOpen, setIsCleanModalOpen] = useState(false);
  const [isCleaningKeys, setIsCleaningKeys] = useState(false);

  // Code snippets tab
  const [activeSnippetTab, setActiveSnippetTab] = useState<'php' | 'node' | 'python' | 'curl'>('php');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Selected endpoint in Documentation tab
  const [selectedDocEndpoint, setSelectedDocEndpoint] = useState<'create' | 'inspect' | 'reset' | 'status'>('create');
  const [copiedEndpointUrl, setCopiedEndpointUrl] = useState(false);

  // Sandbox state
  const [testerKey, setTesterKey] = useState('');
  const [testerPrefix, setTesterPrefix] = useState('STORE');
  const [testerTier, setTesterTier] = useState('Standard');
  const [testerValidityType, setTesterValidityType] = useState('daily');
  const [testerValidityValue, setTesterValidityValue] = useState(30);
  const [testerDeviceLimit, setTesterDeviceLimit] = useState(1);
  const [testerCustomerName, setTesterCustomerName] = useState('Rahim Khan');
  const [testerCustomerEmail, setTesterCustomerEmail] = useState('customer@example.com');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testTimeMs, setTestTimeMs] = useState<number | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [keysRes, appsRes] = await Promise.all([
        api.getAdminApiKeys().catch(() => ({ success: true, keys: [] })),
        api.getApps().catch(() => ({ apps: [] })),
      ]);
      setKeys(keysRes.keys || []);
      setApps(appsRes.apps || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    try {
      setIsCreating(true);
      setError(null);
      const res = await api.createAdminApiKey({
        name: newKeyName.trim(),
        prefix: newKeyPrefix.trim() || 'live',
        app_id: selectedAppId || null,
        permissions: ['licenses:create', 'licenses:read', 'licenses:manage'],
      });

      if (res.success && res.key) {
        setCreatedKeyData(res.key);
        setTesterKey(res.key.secret);
        await loadData();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate key');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteKey = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Revoke & Delete API Key',
      message: `Revoke and permanently delete API key "${name}"? External systems using it will lose access immediately.`,
      confirmText: 'Delete Key',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteAdminApiKey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      setActionSuccess(`Deleted "${name}"`);
      setTimeout(() => setActionSuccess(null), 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to delete key');
    }
  };

  const handleBulkCleanKeys = async () => {
    try {
      setIsCleaningKeys(true);
      setError(null);
      await Promise.all(keys.map((k) => api.deleteAdminApiKey(k.id).catch(() => null)));
      await loadData();
      setIsCleanModalOpen(false);
      setActionSuccess('Cleaned all test keys');
      setTimeout(() => setActionSuccess(null), 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to clean keys');
    } finally {
      setIsCleaningKeys(false);
    }
  };

  const handleRunSandboxTest = async () => {
    if (!testerKey.trim()) {
      setError('Secret key required');
      return;
    }

    try {
      setIsTesting(true);
      setTestResult(null);
      const startTime = performance.now();

      const response = await fetch('/api/v1/admin/licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testerKey.trim()}`,
        },
        body: JSON.stringify({
          prefix: testerPrefix.trim() || 'STORE',
          tier: testerTier,
          device_limit: Number(testerDeviceLimit) || 1,
          validity_type: testerValidityType,
          validity_value: Number(testerValidityValue) || 0,
          customer_name: testerCustomerName,
          customer_email: testerCustomerEmail,
          notes: 'Sandbox Test',
        }),
      });

      const data = await response.json();
      setTestTimeMs(Math.round(performance.now() - startTime));
      setTestResult({
        status: response.status,
        statusText: response.statusText,
        data,
      });
    } catch (err: any) {
      setTestResult({
        status: 500,
        statusText: 'Network Error',
        error: err.message,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-license-server.com';

  const phpSnippet = `<?php
add_action('woocommerce_order_status_completed', 'vcon_issue_license');

function vcon_issue_license($order_id) {
    $order = wc_get_order($order_id);
    if (!$order || $order->get_meta('_vcon_license_key')) return;

    $response = wp_remote_post('${baseUrl}/api/v1/admin/licenses', [
        'headers' => [
            'Content-Type'  => 'application/json',
            'Authorization' => 'Bearer ${createdKeyData?.secret || 'vcon_sec_YOUR_SECRET_KEY'}',
        ],
        'body' => json_encode([
            'prefix'         => 'WOO',
            'tier'           => 'Pro',
            'validity_type'  => 'daily',
            'validity_value' => 30,
            'device_limit'   => 1,
            'customer_name'  => $order->get_billing_first_name() . ' ' . $order->get_billing_last_name(),
            'customer_email' => $order->get_billing_email(),
            'notes'          => 'Order #' . $order_id,
        ]),
        'timeout' => 15,
    ]);

    if (!is_wp_error($response)) {
        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!empty($body['license'])) {
            $order->update_meta_data('_vcon_license_key', sanitize_text_field($body['license']['key']));
            $order->update_meta_data('_vcon_license_pin', sanitize_text_field($body['license']['pin']));
            $order->save();
        }
    }
}`;

  const nodeSnippet = `import axios from 'axios';

async function issueLicense(order) {
  const res = await axios.post('${baseUrl}/api/v1/admin/licenses', {
    prefix: 'STORE',
    tier: 'Pro',
    validity_type: 'daily',
    validity_value: 30,
    device_limit: 1,
    customer_name: order.customerName,
    customer_email: order.customerEmail,
    notes: 'Order #' + order.id,
  }, {
    headers: {
      'Authorization': 'Bearer ${createdKeyData?.secret || 'vcon_sec_YOUR_SECRET_KEY'}',
      'Content-Type': 'application/json',
    },
  });
  return res.data.license; // { key, pin, status, ... }
}`;

  const pythonSnippet = `import requests

res = requests.post(
    '${baseUrl}/api/v1/admin/licenses',
    headers={
        'Authorization': 'Bearer ${createdKeyData?.secret || 'vcon_sec_YOUR_SECRET_KEY'}',
        'Content-Type': 'application/json'
    },
    json={
        'prefix': 'STORE',
        'tier': 'Pro',
        'validity_type': 'hourly',
        'validity_value': 24,
        'device_limit': 1,
        'customer_name': 'Customer',
        'customer_email': 'user@example.com'
    }
)
license = res.json().get('license')
print(license['key'], license['pin'])`;

  const curlSnippet = `curl -X POST "${baseUrl}/api/v1/admin/licenses" \\
  -H "Authorization: Bearer ${createdKeyData?.secret || 'vcon_sec_YOUR_SECRET_KEY'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prefix": "STORE",
    "tier": "Pro",
    "device_limit": 1,
    "validity_type": "hourly",
    "validity_value": 24
  }'`;

  return (
    <div className="space-y-4">
      {/* Compact Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900 border border-slate-800 rounded-lg p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-md text-indigo-400">
            <Webhook className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-white tracking-tight">Admin APIs</h1>
            <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded">
              REST v1
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {keys.length > 0 && (
            <button
              onClick={() => setIsCleanModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-md transition"
              title="Delete all test keys"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clean Keys ({keys.length})</span>
            </button>
          )}
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-md transition"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => {
              setNewKeyName('');
              setNewKeyPrefix('live');
              setSelectedAppId('');
              setCreatedKeyData(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New API Key</span>
          </button>
        </div>
      </div>

      {/* Main Mode Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveMainTab('keys')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md transition ${
            activeMainTab === 'keys'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>API Keys & Sandbox</span>
          <span className="ml-1 text-[10px] px-1 bg-black/25 rounded font-mono">
            {keys.length}
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('docs')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md transition ${
            activeMainTab === 'docs'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>API Docs & Endpoints</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-400 text-[11px] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-[10px] hover:underline">Dismiss</button>
        </div>
      )}

      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-md text-red-400 text-[11px] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[10px] hover:underline">Dismiss</button>
        </div>
      )}

      {/* VIEW 1: API KEYS & LIVE SANDBOX */}
      {activeMainTab === 'keys' && (
        <div className="space-y-4">
          {/* Active Keys Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs font-semibold text-white">Active API Keys</span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                  {keys.length}
                </span>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1.5 text-indigo-400" />
                Loading keys...
              </div>
            ) : keys.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <Key className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                <div className="font-medium text-slate-300 mb-1">No API Keys Generated</div>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="mt-2 px-3 py-1.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition"
                >
                  Generate API Key
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-medium">
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Prefix</th>
                      <th className="py-2 px-3">Scopes</th>
                      <th className="py-2 px-3">Last Used</th>
                      <th className="py-2 px-3">Created</th>
                      <th className="py-2 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {keys.map((k) => {
                      let perms: string[] = [];
                      try {
                        perms = JSON.parse(k.permissions_json);
                      } catch {
                        perms = ['all'];
                      }

                      return (
                        <tr key={k.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-2 px-3 font-medium text-white">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              <span>{k.name}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono text-indigo-300">
                            {k.key_prefix}...
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex flex-wrap gap-1">
                              {perms.map((p, idx) => (
                                <span
                                  key={idx}
                                  className="px-1 py-0.2 text-[9px] bg-slate-800 text-slate-300 border border-slate-700/60 rounded"
                                >
                                  {p}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-slate-400">
                            {k.last_used_at ? (
                              <span className="flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5 text-slate-500" />
                                {new Date(k.last_used_at).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-slate-600 italic">Never</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-400">
                            {new Date(k.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => handleDeleteKey(k.id, k.name)}
                              className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition"
                              title="Delete key"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sandbox & Snippets in 2 Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Live Sandbox Tester */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-white">Live API Sandbox</span>
                </div>
                {testTimeMs !== null && (
                  <span className="text-[10px] font-mono text-slate-500">{testTimeMs}ms</span>
                )}
              </div>

              <div className="space-y-2.5 text-[11px]">
                <div>
                  <label className="block text-slate-300 mb-1">Secret Key (Bearer Token):</label>
                  <input
                    type="text"
                    value={testerKey}
                    onChange={(e) => setTesterKey(e.target.value)}
                    placeholder="vcon_sec_..."
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-300 mb-1">Prefix:</label>
                    <input
                      type="text"
                      value={testerPrefix}
                      onChange={(e) => setTesterPrefix(e.target.value.toUpperCase())}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">Tier:</label>
                    <select
                      value={testerTier}
                      onChange={(e) => setTesterTier(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none"
                    >
                      <option value="Standard">Standard</option>
                      <option value="Pro">Pro</option>
                      <option value="Enterprise">Enterprise</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">Devices:</label>
                    <input
                      type="number"
                      min="1"
                      value={testerDeviceLimit}
                      onChange={(e) => setTesterDeviceLimit(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 mb-1">Validity Type:</label>
                    <select
                      value={testerValidityType}
                      onChange={(e) => setTesterValidityType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none"
                    >
                      <option value="daily">Daily</option>
                      <option value="hourly">Hourly</option>
                      <option value="lifetime">Lifetime</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">Value (Days/Hrs):</label>
                    <input
                      type="number"
                      value={testerValidityValue}
                      onChange={(e) => setTesterValidityValue(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  onClick={handleRunSandboxTest}
                  disabled={isTesting}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-semibold rounded transition"
                >
                  {isTesting ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3 fill-current" />
                  )}
                  <span>Run Test (POST /licenses)</span>
                </button>

                {testResult && (
                  <div className="pt-2 border-t border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">Response:</span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded font-mono ${
                          testResult.status === 201 || testResult.status === 200
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        HTTP {testResult.status}
                      </span>
                    </div>

                    {testResult.data?.license && (
                      <div className="flex items-center gap-2 p-1.5 bg-slate-950 border border-slate-800 rounded font-mono text-[11px]">
                        <span className="text-emerald-400 font-bold select-all flex-1">
                          {testResult.data.license.key}
                        </span>
                        <span className="text-amber-300 font-bold">
                          PIN: {testResult.data.license.pin}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Code Snippets */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                  <Code className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs font-semibold text-white">Integration Snippets</span>
                </div>

                <div className="flex items-center gap-1 bg-slate-950 p-0.5 border border-slate-800 rounded">
                  <button
                    onClick={() => setActiveSnippetTab('php')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                      activeSnippetTab === 'php' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    PHP
                  </button>
                  <button
                    onClick={() => setActiveSnippetTab('node')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                      activeSnippetTab === 'node' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Node
                  </button>
                  <button
                    onClick={() => setActiveSnippetTab('python')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                      activeSnippetTab === 'python' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Python
                  </button>
                  <button
                    onClick={() => setActiveSnippetTab('curl')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                      activeSnippetTab === 'curl' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    cURL
                  </button>
                </div>
              </div>

              <div className="relative">
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-slate-300 overflow-x-auto leading-relaxed max-h-64">
                  {activeSnippetTab === 'php' && phpSnippet}
                  {activeSnippetTab === 'node' && nodeSnippet}
                  {activeSnippetTab === 'python' && pythonSnippet}
                  {activeSnippetTab === 'curl' && curlSnippet}
                </pre>
                <button
                  onClick={() => {
                    const text =
                      activeSnippetTab === 'php'
                        ? phpSnippet
                        : activeSnippetTab === 'node'
                        ? nodeSnippet
                        : activeSnippetTab === 'python'
                        ? pythonSnippet
                        : curlSnippet;
                    navigator.clipboard.writeText(text);
                    setCopiedSnippet(true);
                    setTimeout(() => setCopiedSnippet(false), 2000);
                  }}
                  className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded border border-slate-700"
                >
                  {copiedSnippet ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSnippet ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: COMPACT API DOCS & ENDPOINTS */}
      {activeMainTab === 'docs' && (
        <div className="space-y-4">
          {/* Header Spec Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] font-mono">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              <span className="text-slate-300">
                <strong className="text-white">Auth Header:</strong> Authorization: Bearer vcon_sec_...
              </span>
            </div>
            <div className="text-slate-400">
              <strong className="text-white">Base:</strong> {baseUrl}/api/v1/admin
            </div>
          </div>

          {/* Validity Types Compact Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px]">
            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="font-bold text-sky-400 flex items-center justify-between">
                <span>Hourly Validity</span>
                <code className="text-[10px] text-slate-400">hourly</code>
              </div>
              <div className="text-slate-400 text-[10px] mt-1">
                Clock starts on 1st client activation (value in hours).
              </div>
            </div>

            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="font-bold text-emerald-400 flex items-center justify-between">
                <span>Daily Validity</span>
                <code className="text-[10px] text-slate-400">daily</code>
              </div>
              <div className="text-slate-400 text-[10px] mt-1">
                Clock starts on 1st client activation (value in days).
              </div>
            </div>

            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="font-bold text-purple-400 flex items-center justify-between">
                <span>Lifetime Validity</span>
                <code className="text-[10px] text-slate-400">lifetime</code>
              </div>
              <div className="text-slate-400 text-[10px] mt-1">
                Permanent access without expiration date.
              </div>
            </div>
          </div>

          {/* Endpoints Reference Navigator */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            {/* Endpoint Selector Tabs */}
            <div className="p-2 bg-slate-950/70 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button
                onClick={() => setSelectedDocEndpoint('create')}
                className={`px-2.5 py-1.5 rounded text-left transition border ${
                  selectedDocEndpoint === 'create'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-bold">
                  <span className="text-emerald-400">POST</span>
                  <span>/licenses</span>
                </div>
              </button>

              <button
                onClick={() => setSelectedDocEndpoint('inspect')}
                className={`px-2.5 py-1.5 rounded text-left transition border ${
                  selectedDocEndpoint === 'inspect'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-bold">
                  <span className="text-sky-400">GET</span>
                  <span>/licenses/:key</span>
                </div>
              </button>

              <button
                onClick={() => setSelectedDocEndpoint('reset')}
                className={`px-2.5 py-1.5 rounded text-left transition border ${
                  selectedDocEndpoint === 'reset'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-bold">
                  <span className="text-emerald-400">POST</span>
                  <span>/licenses/:key/reset</span>
                </div>
              </button>

              <button
                onClick={() => setSelectedDocEndpoint('status')}
                className={`px-2.5 py-1.5 rounded text-left transition border ${
                  selectedDocEndpoint === 'status'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-bold">
                  <span className="text-amber-400">PATCH</span>
                  <span>/licenses/:key/status</span>
                </div>
              </button>
            </div>

            {/* Selected Endpoint Body */}
            <div className="p-3.5 space-y-3 text-[11px]">
              {selectedDocEndpoint === 'create' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-800 font-mono text-[10px]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-400">POST</span>
                      <span className="text-white">{baseUrl}/api/v1/admin/licenses</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${baseUrl}/api/v1/admin/licenses`);
                        setCopiedEndpointUrl(true);
                        setTimeout(() => setCopiedEndpointUrl(false), 2000);
                      }}
                      className="text-slate-400 hover:text-white"
                    >
                      {copiedEndpointUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>

                  <div className="text-slate-300 text-[11px]">
                    <strong>Action:</strong> Generates unique license key & 4-digit PIN upon order completion.
                  </div>

                  {/* Parameters Table */}
                  <div className="border border-slate-800 rounded overflow-hidden">
                    <table className="w-full text-left text-[10px] border-collapse">
                      <thead>
                        <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                          <th className="py-1.5 px-2.5">Field</th>
                          <th className="py-1.5 px-2.5">Type</th>
                          <th className="py-1.5 px-2.5">Default</th>
                          <th className="py-1.5 px-2.5">Values / Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 font-mono text-slate-300 bg-slate-950/40">
                        <tr>
                          <td className="py-1.5 px-2.5 text-indigo-300">prefix</td>
                          <td className="py-1.5 px-2.5 text-slate-400">string</td>
                          <td className="py-1.5 px-2.5">"VCON"</td>
                          <td className="py-1.5 px-2.5 font-sans text-slate-300">e.g. "STORE", "VIP"</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 text-indigo-300">tier</td>
                          <td className="py-1.5 px-2.5 text-slate-400">string</td>
                          <td className="py-1.5 px-2.5">"Standard"</td>
                          <td className="py-1.5 px-2.5 font-sans text-slate-300">Standard, Pro, Enterprise</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 text-indigo-300">validity_type</td>
                          <td className="py-1.5 px-2.5 text-slate-400">string</td>
                          <td className="py-1.5 px-2.5">"lifetime"</td>
                          <td className="py-1.5 px-2.5 font-sans text-slate-300">"hourly" | "daily" | "lifetime"</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 text-indigo-300">validity_value</td>
                          <td className="py-1.5 px-2.5 text-slate-400">number</td>
                          <td className="py-1.5 px-2.5">0</td>
                          <td className="py-1.5 px-2.5 font-sans text-slate-300">Hours or days count</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 text-indigo-300">device_limit</td>
                          <td className="py-1.5 px-2.5 text-slate-400">number</td>
                          <td className="py-1.5 px-2.5">1</td>
                          <td className="py-1.5 px-2.5 font-sans text-slate-300">Allowed hardware slots</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 text-indigo-300">customer_email</td>
                          <td className="py-1.5 px-2.5 text-slate-400">string</td>
                          <td className="py-1.5 px-2.5">""</td>
                          <td className="py-1.5 px-2.5 font-sans text-slate-300">Customer email</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] font-mono">
                    <pre className="p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-300 overflow-x-auto">
{`// Sample Request Body
{
  "prefix": "STORE",
  "tier": "Pro",
  "validity_type": "hourly",
  "validity_value": 24,
  "device_limit": 1
}`}
                    </pre>
                    <pre className="p-2.5 bg-slate-950 border border-slate-800 rounded text-emerald-300 overflow-x-auto">
{`// 201 Created Response
{
  "success": true,
  "license": {
    "key": "STORE-91B2-C4D8-E7F0",
    "pin": "4819",
    "status": "active"
  }
}`}
                    </pre>
                  </div>
                </div>
              )}

              {selectedDocEndpoint === 'inspect' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-800 font-mono text-[10px]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sky-400">GET</span>
                      <span className="text-white">{baseUrl}/api/v1/admin/licenses/:license_key</span>
                    </div>
                  </div>
                  <div className="text-slate-300">
                    <strong>Action:</strong> Returns real-time status, PIN, device usage, and bound hardware list.
                  </div>
                  <pre className="p-2.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-slate-300 overflow-x-auto">
{`// 200 OK Response
{
  "success": true,
  "license": {
    "key": "STORE-91B2-C4D8-E7F0",
    "pin": "4819",
    "status": "active",
    "bound_devices_count": 1,
    "device_limit": 1,
    "devices": [{ "hwid": "...", "device_name": "DESKTOP-1", "ip_address": "..." }]
  }
}`}
                  </pre>
                </div>
              )}

              {selectedDocEndpoint === 'reset' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-800 font-mono text-[10px]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-400">POST</span>
                      <span className="text-white">{baseUrl}/api/v1/admin/licenses/:license_key/reset</span>
                    </div>
                  </div>
                  <div className="text-slate-300">
                    <strong>Action:</strong> Unbinds all devices for the license, freeing up hardware slots.
                  </div>
                  <pre className="p-2.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-emerald-300 overflow-x-auto">
{`// 200 OK Response
{
  "success": true,
  "message": "All devices unbound successfully. License is fresh and ready for new hardware.",
  "reset_devices_count": 1
}`}
                  </pre>
                </div>
              )}

              {selectedDocEndpoint === 'status' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-800 font-mono text-[10px]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-amber-400">PATCH</span>
                      <span className="text-white">{baseUrl}/api/v1/admin/licenses/:license_key/status</span>
                    </div>
                  </div>
                  <div className="text-slate-300">
                    <strong>Action:</strong> Updates license status to <code className="text-emerald-300">"active"</code>, <code className="text-amber-300">"suspended"</code>, or <code className="text-red-400">"revoked"</code>.
                  </div>
                  <pre className="p-2.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-slate-300 overflow-x-auto">
{`// Request Body: { "status": "revoked" }
// 200 OK Response:
{
  "success": true,
  "message": "License status updated to revoked",
  "status": "revoked"
}`}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: New API Key */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Generate Admin API Key</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {!createdKeyData ? (
              <form onSubmit={handleCreateKey} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Key Name:</label>
                  <input
                    type="text"
                    required
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. WooCommerce Store"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Prefix:</label>
                    <input
                      type="text"
                      value={newKeyPrefix}
                      onChange={(e) => setNewKeyPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 font-mono text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">App Scope:</label>
                    <select
                      value={selectedAppId}
                      onChange={(e) => setSelectedAppId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none"
                    >
                      <option value="">Global</option>
                      {apps.map((app) => (
                        <option key={app.id} value={app.id}>
                          {app.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-3 py-1.5 text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating || !newKeyName.trim()}
                    className="px-3.5 py-1.5 font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 rounded transition"
                  >
                    {isCreating ? 'Generating...' : 'Generate'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded text-amber-300 text-[11px]">
                  Copy this secret key now. It is never displayed again.
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-400 mb-1 block">Secret Token:</label>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 bg-slate-950 border border-indigo-500/40 rounded px-2.5 py-2 font-mono text-[11px] text-indigo-300 select-all break-all">
                      {createdKeyData.secret}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createdKeyData.secret);
                        setCopiedSecret(true);
                        setTimeout(() => setCopiedSecret(false), 2000);
                      }}
                      className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition"
                    >
                      {copiedSecret ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded transition text-[11px]"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Bulk Clean Test Keys */}
      {isCleanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-4 shadow-2xl space-y-3 text-xs">
            <div className="flex items-center gap-2 text-red-400 font-bold">
              <Trash2 className="w-4 h-4" />
              <span>Clean All API Keys?</span>
            </div>

            <p className="text-slate-300 text-[11px]">
              This will remove all {keys.length} API keys currently listed. You can generate new keys at any time.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCleanModalOpen(false)}
                className="px-3 py-1.5 text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkCleanKeys}
                disabled={isCleaningKeys}
                className="px-3.5 py-1.5 font-semibold text-white bg-red-600 hover:bg-red-500 disabled:bg-slate-800 rounded transition"
              >
                {isCleaningKeys ? 'Cleaning...' : `Delete All ${keys.length}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
