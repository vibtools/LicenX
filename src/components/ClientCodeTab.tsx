import React, { useState } from 'react';
import { Copy, Check, Terminal, Download, FolderArchive, FileCode, CheckCircle2, ShieldCheck, Cpu } from 'lucide-react';
import { api } from '../services/apiClient';

interface ClientCodeTabProps {
  publicKeyPem: string;
}

export const ClientCodeTab: React.FC<ClientCodeTabProps> = ({ publicKeyPem }) => {
  const [activeLang, setActiveLang] = useState<'python' | 'curl' | 'node' | 'csharp'>('python');
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const serverUrl = window.location.origin;

  const handleDownloadSdk = async () => {
    try {
      setDownloading(true);
      await api.downloadPythonSdk();
    } catch (err: any) {
      alert(err.message || 'Failed to download SDK package');
    } finally {
      setDownloading(false);
    }
  };

  const pythonQuickExample = `#!/usr/bin/env python3
"""
VCON Python Client SDK - Quick Integration Example
Module: x_license_python
"""

import sys
from x_license_python import XLicenseClient

def on_revoked(reason: str):
    print(f"\\n[CRITICAL] License terminated remotely by server: {reason}")
    sys.exit(1)

# 1. Initialize Client (Auto-loads <app_name>_vcon_config.json from project folder)
client = XLicenseClient(on_license_revoked=on_revoked)

# 2. Try saved session Auto-Login first (Strict online validation enforced)
res = client.auto_login()

if not res.success:
    # Prompt user for license key
    key = input("Please enter License Key: ").strip()
    res = client.login(key)

if res.success:
    print(f"[+] Access Granted! Tier: {client.get_tier()}")
    print(f"[+] Bound HWID: {res.hwid}")
    print(f"[+] Background Heartbeat Worker: Active (20-minute cycle)")
else:
    print(f"[-] Access Denied: {res.message} (Code: {res.code})")
    sys.exit(1)

# 3. Main Application Logic
# Note: When app terminates or exits, auto-logout automatically unbinds the hardware slot!
print("[*] Running core application logic...")
`;

  const curlCode = `# 1. Validate & Auto-bind Hardware Device with Multi-App Scoping
curl -X POST "${serverUrl}/api/v1/license/validate" \\
  -H "Content-Type: application/json" \\
  -d '{
    "license_key": "VCON-ABCD-EFGH-IJKL",
    "app_name": "vcon_default",
    "app_version": "1.0.0",
    "hwid": "HWID-9F82-BCA1-48C7-1122",
    "device_name": "DESKTOP-CLIENT",
    "os_info": "Windows 11 Pro 64-bit"
  }'

# 2. Get Server Ed25519 Public Key
curl "${serverUrl}/api/v1/public-key"

# 3. Heartbeat Ping (Periodic verification)
curl -X POST "${serverUrl}/api/v1/license/ping" \\
  -H "Content-Type: application/json" \\
  -d '{
    "license_key": "VCON-ABCD-EFGH-IJKL",
    "hwid": "HWID-9F82-BCA1-48C7-1122",
    "app_name": "vcon_default"
  }'

# 4. Instant Logout / Unbind Device (Releases hardware slot)
curl -X POST "${serverUrl}/api/v1/license/logout" \\
  -H "Content-Type: application/json" \\
  -d '{
    "license_key": "VCON-ABCD-EFGH-IJKL",
    "hwid": "HWID-9F82-BCA1-48C7-1122",
    "app_name": "vcon_default"
  }'
`;

  const nodeCode = `import crypto from 'crypto';

const SERVER_URL = '${serverUrl}';
const PUBLIC_KEY_PEM = \`${publicKeyPem || '-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----'}\`;

export async function validateLicense(licenseKey: string, hwid: string, appName = 'vcon_default'): Promise<boolean> {
  const res = await fetch(\`\${SERVER_URL}/api/v1/license/validate\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      license_key: licenseKey,
      hwid: hwid,
      app_name: appName,
      app_version: '1.0.0',
      device_name: 'NodeClient',
      os_info: process.platform,
      client_time: Date.now(),
    }),
  });

  if (!res.ok) return false;
  const json = await res.json();
  const signature = json.signature;
  delete json.signature;
  delete json.public_key;

  // Canonicalize & Verify Signature (RSA 2048-bit SHA-256)
  const sortedKeys = Object.keys(json).sort();
  const sortedObj: any = {};
  for (const k of sortedKeys) sortedObj[k] = json[k];
  const canonicalStr = JSON.stringify(sortedObj);

  const publicKey = crypto.createPublicKey(PUBLIC_KEY_PEM);
  if (publicKey.asymmetricKeyType === 'ed25519') {
    return crypto.verify(null, Buffer.from(canonicalStr), publicKey, Buffer.from(signature, 'base64'));
  }
  const verify = crypto.createVerify('SHA256');
  verify.update(canonicalStr);
  return verify.verify(publicKey, Buffer.from(signature, 'base64'));
}
`;

  const csharpCode = `using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

public class VconLicenseClient
{
    private static readonly string ServerUrl = "${serverUrl}";

    public static async Task<bool> ValidateAsync(string licenseKey, string hwid, string appName = "vcon_default")
    {
        using var client = new HttpClient();
        var payload = new
        {
            license_key = licenseKey,
            hwid = hwid,
            app_name = appName,
            app_version = "1.0.0",
            device_name = Environment.MachineName,
            os_info = Environment.OSVersion.ToString(),
            client_time = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        var response = await client.PostAsync($"{ServerUrl}/api/v1/license/validate", content);

        return response.IsSuccessStatusCode;
    }
}
`;

  const getCurrentCode = () => {
    switch (activeLang) {
      case 'python':
        return pythonQuickExample;
      case 'curl':
        return curlCode;
      case 'node':
        return nodeCode;
      case 'csharp':
        return csharpCode;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getCurrentCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3 font-mono text-xs max-w-5xl">
      {/* Python SDK Package Banner */}
      <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-indigo-950/50 border border-indigo-800/50 text-indigo-400">
            <FolderArchive className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-200 text-xs">
              Python Client Protection SDK (`x_license_python`)
            </div>
            <div className="text-[11px] text-slate-400">
              Modular Python package with HWID lock, Ed25519 signing, 20min daemon thread & auto slot release.
            </div>
          </div>
        </div>

        <button
          onClick={handleDownloadSdk}
          disabled={downloading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 font-medium transition-colors text-xs shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          {downloading ? 'Preparing ZIP...' : 'Download Python SDK (.ZIP)'}
        </button>
      </div>

      {/* SDK Architecture Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="p-2.5 rounded bg-slate-900/40 border border-slate-800 space-y-1">
          <div className="flex items-center gap-1.5 text-slate-200 font-medium text-[11px]">
            <FileCode className="w-3.5 h-3.5 text-indigo-400" />
            <span>config.py</span>
          </div>
          <p className="text-[10px] text-slate-400">Auto-loads downloaded global JSON configuration files.</p>
        </div>

        <div className="p-2.5 rounded bg-slate-900/40 border border-slate-800 space-y-1">
          <div className="flex items-center gap-1.5 text-slate-200 font-medium text-[11px]">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>device.py</span>
          </div>
          <p className="text-[10px] text-slate-400">HDD/SSD + CPU + Motherboard UUID SHA-256 fingerprinting.</p>
        </div>

        <div className="p-2.5 rounded bg-slate-900/40 border border-slate-800 space-y-1">
          <div className="flex items-center gap-1.5 text-slate-200 font-medium text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>login.py</span>
          </div>
          <p className="text-[10px] text-slate-400">Strict online authentication & Ed25519 signature checks.</p>
        </div>

        <div className="p-2.5 rounded bg-slate-900/40 border border-slate-800 space-y-1">
          <div className="flex items-center gap-1.5 text-slate-200 font-medium text-[11px]">
            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
            <span>storage.py & logout.py</span>
          </div>
          <p className="text-[10px] text-slate-400">20min background heartbeat daemon & instant slot releasing.</p>
        </div>
      </div>

      {/* Code Snippets Box */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-medium text-slate-300 uppercase tracking-wider text-xs">
            Integration Code & SDK Usage
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5">
            <button
              onClick={() => setActiveLang('python')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                activeLang === 'python' ? 'bg-indigo-600/90 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Python (SDK)
            </button>
            <button
              onClick={() => setActiveLang('curl')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                activeLang === 'curl' ? 'bg-indigo-600/90 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              cURL / REST
            </button>
            <button
              onClick={() => setActiveLang('node')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                activeLang === 'node' ? 'bg-indigo-600/90 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Node.js
            </button>
            <button
              onClick={() => setActiveLang('csharp')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                activeLang === 'csharp' ? 'bg-indigo-600/90 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              C# / .NET
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="p-3 bg-slate-950 border border-slate-800 rounded overflow-x-auto">
        <pre className="text-slate-300 text-[11px] leading-relaxed font-mono select-all">
          {getCurrentCode()}
        </pre>
      </div>
    </div>
  );
};
