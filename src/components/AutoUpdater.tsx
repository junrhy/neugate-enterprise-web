import { useState, useEffect } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';

import * as buildInfo from '../buildInfo';

// ─── Build info stamped by dynamic-release.sh ─────────────────────────────────
const BUILD_TIMESTAMP: string = (buildInfo as any).BUILD_TIMESTAMP || 'dev';
const PROD_SLUG: string       = (buildInfo as any).PROD_SLUG || '';
const LATEST_MANIFEST_URL: string = (buildInfo as any).LATEST_MANIFEST_URL || '';
// ─────────────────────────────────────────────────────────────────────────────

interface LatestManifest {
  timestamp: string;
  macos: string | null;
  windows: string | null;
  linux: string | null;
}

function formatTimestamp(ts: string): string {
  if (!ts || ts.length < 13) return ts;
  const y = ts.slice(0, 4), mo = ts.slice(4, 6), d = ts.slice(6, 8);
  const h = ts.slice(9, 11), m = ts.slice(11, 13);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(mo, 10) - 1]} ${parseInt(d, 10)}, ${y} · ${h}:${m}`;
}

function isNewer(remote: string, local: string): boolean {
  if (!remote) return false;
  if (local === 'dev') return true; // Allow testing updates in dev mode
  return remote > local;
}

function getPlatformUrl(manifest: LatestManifest): string | null {
  const ua = navigator.userAgent;
  if (ua.includes('Mac'))  return manifest.macos;
  if (ua.includes('Win'))  return manifest.windows;
  return manifest.linux;
}

export default function AutoUpdater() {
  const [checking, setChecking]       = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [tauriUpdate, setTauriUpdate] = useState<any>(null);
  const [manifest, setManifest]       = useState<LatestManifest | null>(null);
  const [statusMsg, setStatusMsg]     = useState<string | null>(null);

  // ── Fetch latest.json via backend proxy (to avoid CORS) or direct R2 fallback ──
  const fetchManifest = async (): Promise<LatestManifest | null> => {
    // 1. Try backend proxy (returns Access-Control-Allow-Origin: *)
    const slug = PROD_SLUG || 'neugate-enterprise-product';
    const proxyUrl = `https://enterprise.neulify.com/api/updates/${slug}/manifest?v=${Date.now()}`;
    try {
      const res = await fetch(proxyUrl, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.timestamp) return data as LatestManifest;
      }
    } catch {
      // Fallback
    }

    // 2. Direct R2 fallback
    const fallbackUrl = LATEST_MANIFEST_URL || `https://download.neulify.com/${slug}/downloads/latest.json`;
    try {
      const res = await fetch(`${fallbackUrl}?v=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        return await res.json() as LatestManifest;
      }
    } catch {
      // Fallthrough
    }
    return null;
  };

  // ── Tauri plugin-updater for OTA signed patches ────────────────────────────
  const checkTauriUpdater = async () => {
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update?.available) {
        setTauriUpdate(update);
        return { success: true, version: update.version };
      }
      return { success: true, version: null };
    } catch {
      return { success: false, version: null };
    }
  };

  const checkForUpdates = async (silent = false) => {
    setChecking(true);
    if (!silent) setStatusMsg(null);

    const [m, otaResult] = await Promise.all([
      fetchManifest(),
      checkTauriUpdater(),
    ]);

    if (m) {
      setManifest(m);
      const newerAvailable = isNewer(m.timestamp, BUILD_TIMESTAMP);

      if (!silent) {
        if (otaResult.version) {
          setStatusMsg(`🎉 Version ${otaResult.version} is available via OTA!`);
        } else if (newerAvailable) {
          setStatusMsg(`🆕 Newer build available from Cloudflare R2: ${formatTimestamp(m.timestamp)}`);
        } else {
          setStatusMsg('✅ Application is up to date.');
        }
      }
    } else {
      if (!silent) {
        if (otaResult.version) {
          setStatusMsg(`🎉 Version ${otaResult.version} is available via OTA!`);
        } else {
          setStatusMsg('✅ Application is up to date.');
        }
      }
    }

    setChecking(false);
  };

  const handleInstallTauriUpdate = async () => {
    if (!tauriUpdate) return;
    setDownloading(true);
    try {
      await tauriUpdate.downloadAndInstall((_event: any) => {});
      try {
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      } catch { window.location.reload(); }
    } catch (err: any) {
      setStatusMsg('❌ OTA install failed: ' + (err.message || err));
      setDownloading(false);
    }
  };

  const handleDownloadInstaller = async () => {
    if (!manifest) return;
    const url = getPlatformUrl(manifest);
    if (!url) return;
    await openUrl(url); // Opens system browser → user downloads fresh installer
  };

  useEffect(() => { checkForUpdates(true); }, []);

  const hasNewerInstaller = manifest && isNewer(manifest.timestamp, BUILD_TIMESTAMP);
  const installerUrl = manifest ? getPlatformUrl(manifest) : null;

  return (
    <div style={{
      padding: '1.25rem',
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-sm, 8px)',
      border: '1px solid var(--border)',
      marginTop: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.85rem'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>
            🔄 Application Software Auto-Updater
          </h4>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Checks OTA patches and the latest installer release from Cloudflare R2.
          </span>
        </div>
        <button
          type="button"
          onClick={() => checkForUpdates(false)}
          disabled={checking || downloading}
          className="btn btn-outline"
          style={{ fontSize: '0.78rem' }}
        >
          {checking ? '⏳ Checking...' : '🔍 Check for Updates'}
        </button>
      </div>

      {/* Build timestamp comparison */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.5rem',
        fontSize: '0.75rem',
        fontFamily: 'monospace',
        color: 'var(--text-muted)'
      }}>
        <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-input)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          📦 <strong>This build:</strong><br />
          {BUILD_TIMESTAMP === 'dev' ? '🛠️ Development' : formatTimestamp(BUILD_TIMESTAMP)}
        </div>
        <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-input)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          🌐 <strong>Latest release:</strong><br />
          {manifest
            ? formatTimestamp(manifest.timestamp)
            : BUILD_TIMESTAMP === 'dev'
              ? '🛠️ Development Mode'
              : '✅ Application Up to Date'}
        </div>
      </div>

      {/* Status message */}
      {statusMsg && (
        <div style={{
          fontSize: '0.8rem',
          fontWeight: 600,
          color: (tauriUpdate || hasNewerInstaller) ? 'var(--primary)' : 'var(--text)',
          background: 'var(--primary-dim)',
          padding: '0.6rem 0.85rem',
          borderRadius: '6px',
          border: '1px solid var(--border)'
        }}>
          {statusMsg}
        </div>
      )}

      {/* OTA Tauri Update panel */}
      {tauriUpdate && (
        <div style={{
          padding: '1rem',
          background: 'var(--success-dim)',
          border: '1px solid var(--success)',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--success)', fontWeight: 700 }}>
            🚀 OTA Patch Ready: v{tauriUpdate.version}
          </div>
          {tauriUpdate.body && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {tauriUpdate.body}
            </div>
          )}
          <button
            type="button"
            onClick={handleInstallTauriUpdate}
            disabled={downloading}
            className="btn btn-primary"
            style={{ fontSize: '0.8rem', width: 'fit-content' }}
          >
            {downloading ? '⚡ Installing...' : '⚡ Install OTA Patch & Restart'}
          </button>
        </div>
      )}

      {/* Newer installer available */}
      {hasNewerInstaller && installerUrl && (
        <div style={{
          padding: '1rem',
          background: 'rgba(56, 189, 248, 0.06)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem'
        }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary)' }}>
            📦 Fresh Installer Available — Build {formatTimestamp(manifest!.timestamp)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            A newer full installer is ready on Cloudflare R2. Download and reinstall for a clean fresh copy.
          </div>
          <button
            type="button"
            onClick={handleDownloadInstaller}
            className="btn btn-outline"
            style={{ fontSize: '0.78rem', width: 'fit-content' }}
          >
            ⬇️ Download Latest Installer
          </button>
        </div>
      )}

      {/* Always-visible clean reinstall link */}
      {!hasNewerInstaller && manifest && installerUrl && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>Need a clean reinstall?</span>
          <button
            type="button"
            onClick={handleDownloadInstaller}
            className="btn btn-outline"
            style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }}
          >
            ⬇️ Download Current Installer
          </button>
        </div>
      )}
    </div>
  );
}
