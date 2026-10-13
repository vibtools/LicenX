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
  ExternalLink,
  RefreshCw,
  Eye,
  EyeOff,
  Layers,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/apiClient';
import { AdminApiKeyRecord, CreatedAdminApiKey } from '../types';

interface AdminApisTabProps {
  onNavigateToTab?: (tab: string) => void;
}

export const AdminApisTab: React.FC<AdminApisTabProps> = () => {
  const [keys, setKeys] = useState<AdminApiKeyRecord[]>([]);
  const [apps, setApps] = useState<{ id: string; display_name: string; app_slug: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Key creation modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPrefix, setNewKeyPrefix] = useState('live');
  const [selectedAppId, setSelectedAppId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdKeyData, setCreatedKeyData] = useState<CreatedAdminApiKey | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Active code snippet tab ('php' | 'node' | 'curl')
  const [activeSnippetTab, setActiveSnippetTab] = useState<'php' | 'node' | 'curl'>('php');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Live API Sandbox / Tester state
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

  // Load API keys and registered apps
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
      setError(err.message || 'Failed to load Admin API keys');
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
        // Pre-fill tester key with the created secret
        setTesterKey(res.key.secret);
        await loadData();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate Admin API key');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteKey = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to revoke and delete API key "${name}"? External systems using it will immediately lose access.`)) {
      return;
    }

    try {
      await api.deleteAdminApiKey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete API key');
    }
  };

  const handleRunSandboxTest = async () => {
    if (!testerKey.trim()) {
      setError('Please enter or generate a Secret API Key to test.');
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
          notes: 'Tested via Admin APIs Sandbox Console',
        }),
      });

      const data = await response.json();
      const endTime = performance.now();
      setTestTimeMs(Math.round(endTime - startTime));
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
/**
 * WooCommerce Order Completed Hook: Create License Key & PIN Automatically
 */
add_action('woocommerce_order_status_completed', 'vcon_auto_create_license_on_order');

function vcon_auto_create_license_on_order($order_id) {
    $order = wc_get_order($order_id);
    $api_secret = '${createdKeyData?.secret || 'vcon_sec_YOUR_SECRET_KEY_HERE'}';
    $endpoint   = '${baseUrl}/api/v1/admin/licenses';

    $payload = [
        'prefix'         => 'WOO',
        'tier'           => 'Pro',
        'validity_type'  => 'daily',
        'validity_value' => 30,
        'device_limit'   => 1,
        'customer_name'  => $order->get_billing_first_name() . ' ' . $order->get_billing_last_name(),
        'customer_email' => $order->get_billing_email(),
        'notes'          => 'WooCommerce Order #' . $order_id,
    ];

    $response = wp_remote_post($endpoint, [
        'headers' => [
            'Content-Type'  => 'application/json',
            'Authorization' => 'Bearer ' . $api_secret,
        ],
        'body'    => json_encode($payload),
        'timeout' => 15,
    ]);

    if (!is_wp_error($response)) {
        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!empty($body['success']) && !empty($body['license'])) {
            $license_key = $body['license']['key'];
            $license_pin = $body['license']['pin'];

            // Store in order meta and display to customer
            $order->update_meta_data('_vcon_license_key', $license_key);
            $order->update_meta_data('_vcon_license_pin', $license_pin);
            $order->add_order_note("VCON License created: {$license_key} (PIN: {$license_pin})");
            $order->save();
        }
    }
}`;

  const nodeSnippet = `// Node.js / Express Checkout Integration
import axios from 'axios';

async function issueCustomerLicense(customerData) {
  const API_SECRET = '${createdKeyData?.secret || 'vcon_sec_YOUR_SECRET_KEY_HERE'}';
  const SERVER_URL = '${baseUrl}/api/v1/admin/licenses';

  const response = await axios.post(SERVER_URL, {
    prefix: 'STORE',
    tier: 'Pro',
    validity_type: 'daily',
    validity_value: 30,
    device_limit: 1,
    customer_name: customerData.name,
    customer_email: customerData.email,
    notes: \`Store Order #\${customerData.orderId}\`,
  }, {
    headers: {
      'Authorization': \`Bearer \${API_SECRET}\`,
      'Content-Type': 'application/json',
    },
  });

  const { license } = response.data;
  console.log('Created Key:', license.key);
  console.log('Created PIN:', license.pin);
  return license;
}`;

  const curlSnippet = `curl -X POST "${baseUrl}/api/v1/admin/licenses" \\
  -H "Authorization: Bearer ${createdKeyData?.secret || 'vcon_sec_YOUR_SECRET_KEY_HERE'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prefix": "STORE",
    "tier": "Standard",
    "device_limit": 1,
    "validity_type": "daily",
    "validity_value": 30,
    "customer_name": "Rahim Khan",
    "customer_email": "customer@example.com",
    "notes": "Direct cURL test"
  }'`;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
            <Webhook className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Admin APIs Hub</h1>
              <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                REST v1
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Automate license generation, PIN inspection, and hardware unbinding for external selling stores (WooCommerce, Shopify, PHP & Node.js).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => {
              setNewKeyName('');
              setNewKeyPrefix('live');
              setSelectedAppId('');
              setCreatedKeyData(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Generate New API Key
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs hover:underline">Dismiss</button>
        </div>
      )}

      {/* Grid: API Keys Table & Overview */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Active Admin API Keys</h2>
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
              {keys.length}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Secrets are hashed with SHA-256 and never stored in plaintext.
          </p>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
            Loading API keys...
          </div>
        ) : keys.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Key className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-medium text-white mb-1">No Admin API Keys Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              Generate an Admin API Key to enable automated license creation from your WooCommerce or custom web store.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition"
            >
              Generate First API Key
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-medium">
                  <th className="py-3 px-4">Key Name</th>
                  <th className="py-3 px-4">Identifier / Prefix</th>
                  <th className="py-3 px-4">Permissions Scope</th>
                  <th className="py-3 px-4">Last Used</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
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
                    <tr key={k.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span>{k.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono bg-slate-800/80 px-2 py-0.5 rounded text-indigo-300 border border-slate-700/60">
                          {k.key_prefix}...
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {perms.map((p, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-300 border border-slate-700 rounded"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {k.last_used_at ? (
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {new Date(k.last_used_at).toLocaleDateString()}{' '}
                            <span className="text-slate-500">{new Date(k.last_used_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Never</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {new Date(k.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDeleteKey(k.id, k.name)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition"
                          title="Revoke and delete API Key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* Live Interactive API Tester Sandbox */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Live API Test Sandbox</h2>
            <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              Interactive
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Simulate an external e-commerce store checkout call right from your browser.
          </p>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Authorization API Secret Key:
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={testerKey}
                  onChange={(e) => setTesterKey(e.target.value)}
                  placeholder="vcon_sec_..."
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Enter your secret key (starting with <code className="text-slate-400">vcon_sec_</code>).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">License Prefix:</label>
                <input
                  type="text"
                  value={testerPrefix}
                  onChange={(e) => setTesterPrefix(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Tier:</label>
                <select
                  value={testerTier}
                  onChange={(e) => setTesterTier(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                >
                  <option value="Standard">Standard</option>
                  <option value="Pro">Pro</option>
                  <option value="Enterprise">Enterprise</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Validity Type:</label>
                <select
                  value={testerValidityType}
                  onChange={(e) => setTesterValidityType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                >
                  <option value="daily">Daily</option>
                  <option value="hourly">Hourly</option>
                  <option value="lifetime">Lifetime</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Validity Days/Hrs:</label>
                <input
                  type="number"
                  value={testerValidityValue}
                  onChange={(e) => setTesterValidityValue(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Device Limit:</label>
                <input
                  type="number"
                  min="1"
                  value={testerDeviceLimit}
                  onChange={(e) => setTesterDeviceLimit(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Customer Name:</label>
                <input
                  type="text"
                  value={testerCustomerName}
                  onChange={(e) => setTesterCustomerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Customer Email:</label>
                <input
                  type="email"
                  value={testerCustomerEmail}
                  onChange={(e) => setTesterCustomerEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <button
              onClick={handleRunSandboxTest}
              disabled={isTesting}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-semibold rounded-lg transition shadow-sm"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Sending Request...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Test License Generation (POST /api/v1/admin/licenses)
                </>
              )}
            </button>
          </div>

          {/* Response Viewer */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
                <span className="text-xs font-semibold text-slate-400">Response Payload</span>
                {testResult && (
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded ${
                        testResult.status === 201 || testResult.status === 200
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}
                    >
                      HTTP {testResult.status} {testResult.statusText}
                    </span>
                    {testTimeMs !== null && (
                      <span className="text-[11px] font-mono text-slate-500">
                        {testTimeMs}ms
                      </span>
                    )}
                  </div>
                )}
              </div>

              {testResult ? (
                <div className="space-y-3">
                  {testResult.data?.license && (
                    <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-emerald-400 font-medium">Generated License:</span>
                        <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">
                          SUCCESS
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-900 border border-emerald-900/60 rounded px-2.5 py-1.5 font-mono text-xs text-emerald-300 font-bold select-all">
                          {testResult.data.license.key}
                        </div>
                        <div className="bg-slate-900 border border-emerald-900/60 rounded px-2.5 py-1.5 font-mono text-xs text-amber-300 font-bold">
                          PIN: {testResult.data.license.pin}
                        </div>
                      </div>
                    </div>
                  )}

                  <pre className="text-[11px] font-mono text-slate-300 bg-slate-900 p-3 rounded-lg overflow-x-auto max-h-56 leading-relaxed">
                    {JSON.stringify(testResult.data || testResult, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="h-56 flex flex-col items-center justify-center text-slate-600 text-xs text-center">
                  <Play className="w-8 h-8 mb-2 opacity-30" />
                  <span>Configure options on the left and click test</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Endpoint: <code className="text-slate-400">POST /api/v1/admin/licenses</code></span>
              <span>Header: <code className="text-slate-400">Authorization: Bearer &lt;key&gt;</code></span>
            </div>
          </div>
        </div>
      </div>

      {/* Ready-to-Use Code Snippets Documentation */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Integration Guide & Ready-to-Use Code Snippets</h2>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 border border-slate-800 rounded-lg">
            <button
              onClick={() => setActiveSnippetTab('php')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                activeSnippetTab === 'php'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              WooCommerce (PHP)
            </button>
            <button
              onClick={() => setActiveSnippetTab('node')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                activeSnippetTab === 'node'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Node.js
            </button>
            <button
              onClick={() => setActiveSnippetTab('curl')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                activeSnippetTab === 'curl'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              cURL CLI
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="relative">
            <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed max-h-96">
              {activeSnippetTab === 'php' && phpSnippet}
              {activeSnippetTab === 'node' && nodeSnippet}
              {activeSnippetTab === 'curl' && curlSnippet}
            </pre>
            <button
              onClick={() => {
                const text =
                  activeSnippetTab === 'php'
                    ? phpSnippet
                    : activeSnippetTab === 'node'
                    ? nodeSnippet
                    : curlSnippet;
                navigator.clipboard.writeText(text);
                setCopiedSnippet(true);
                setTimeout(() => setCopiedSnippet(false), 2000);
              }}
              className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition"
            >
              {copiedSnippet ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Generate New API Key */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Generate Admin API Key</h3>
                  <p className="text-xs text-slate-400">Create credentials for external store automation</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {!createdKeyData ? (
              <form onSubmit={handleCreateKey} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Key Friendly Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. WooCommerce Store Checkout"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Key Prefix
                    </label>
                    <input
                      type="text"
                      value={newKeyPrefix}
                      onChange={(e) => setNewKeyPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      placeholder="live / store / shop"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500 transition"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">e.g. <code className="text-slate-400">vcon_{newKeyPrefix || 'live'}_...</code></p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Bound App (Optional)
                    </label>
                    <select
                      value={selectedAppId}
                      onChange={(e) => setSelectedAppId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                    >
                      <option value="">Global (All Apps)</option>
                      {apps.map((app) => (
                        <option key={app.id} value={app.id}>
                          {app.display_name} ({app.app_slug})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 text-xs space-y-1">
                  <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-indigo-400" /> Default Scopes Included:
                  </div>
                  <p className="text-[11px]">
                    <code className="text-indigo-300">licenses:create</code>, <code className="text-indigo-300">licenses:read</code>, <code className="text-indigo-300">licenses:manage</code>
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating || !newKeyName.trim()}
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 rounded-lg transition"
                  >
                    {isCreating ? 'Generating...' : 'Generate API Key'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>Copy your Secret API Key now!</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    For security reasons, this secret key is <strong>never displayed again</strong>. Make sure to copy and save it in your store plugin or environment config now.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Secret API Key (Bearer Token):</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-950 border border-indigo-500/40 rounded-lg px-3 py-2.5 font-mono text-xs text-indigo-300 font-semibold select-all break-all">
                      {createdKeyData.secret}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createdKeyData.secret);
                        setCopiedSecret(true);
                        setTimeout(() => setCopiedSecret(false), 2000);
                      }}
                      className="p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition"
                      title="Copy Secret Key"
                    >
                      {copiedSecret ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-1 font-mono text-slate-400">
                  <div>Name: <span className="text-white">{createdKeyData.name}</span></div>
                  <div>Prefix: <span className="text-indigo-400">{createdKeyData.key_prefix}</span></div>
                </div>

                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition"
                >
                  Done & Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
