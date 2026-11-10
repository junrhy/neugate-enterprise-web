import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ActivationScreenProps {
  onActivated: () => void;
}

export default function ActivationScreen({ onActivated }: ActivationScreenProps) {
  const [fingerprint, setFingerprint] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchFingerprint() {
      try {
        const res = await invoke<string>("get_machine_fingerprint");
        if (res) {
          setFingerprint(res);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("Failed to invoke get_machine_fingerprint:", err);
      }
      
      // Fallback if desktop backend call fails
      let localFallback = localStorage.getItem("neugate_fallback_fp");
      if (!localFallback) {
        localFallback = "NEUG-WIN-" + Math.random().toString(36).substring(2, 10).toUpperCase();
        localStorage.setItem("neugate_fallback_fp", localFallback);
      }
      setFingerprint(localFallback);
      setLoading(false);
    }
    fetchFingerprint();
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(fingerprint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) {
      setError("Please enter your activation license key.");
      return;
    }

    setActivating(true);
    setError(null);

    try {
      const valid = await invoke<boolean>("activate_license_key", { key: licenseKey.trim() });
      if (valid) {
        localStorage.setItem("neugate_license_key", licenseKey.trim());
        onActivated();
      } else {
        setError("Activation failed. Invalid license key.");
      }
    } catch (err: any) {
      setError(typeof err === "string" ? err : "Invalid license key for this machine fingerprint.");
    } finally {
      setActivating(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "radial-gradient(circle at top right, rgba(0, 212, 255, 0.05), transparent 45%), var(--bg)",
      padding: "2rem"
    }}>
      <div style={{
        maxWidth: "440px",
        width: "100%",
        padding: "2.5rem",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow)"
      }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "60px",
            height: "60px",
            borderRadius: "var(--radius)",
            background: "var(--primary-dim)",
            border: "1px solid rgba(0,212,255,0.2)",
            marginBottom: "1rem",
            color: "var(--primary)"
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: "28px", height: "28px" }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)", marginBottom: "0.5rem" }}>NeuGate Activation</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: "1.5" }}>
            A valid license key is required to authorize and run this RFID entrance system workspace.
          </p>
        </div>

        {error && (
          <div style={{
            padding: "0.85rem 1rem",
            borderRadius: "var(--radius-sm)",
            background: "var(--danger-dim)",
            border: "1px solid rgba(239, 68, 68, 0.15)",
            color: "var(--danger)",
            fontSize: "0.82rem",
            fontWeight: 600,
            marginBottom: "1.5rem",
            textAlign: "center"
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "1rem" }}>
            Reading system identifiers...
          </div>
        ) : (
          <form onSubmit={handleActivate} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            
            <div className="form-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Machine Fingerprint</label>
                <button
                  type="button"
                  onClick={handleCopy}
                  style={{
                    background: "none",
                    border: "none",
                    color: copied ? "var(--success)" : "var(--primary)",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: 0
                  }}
                >
                  {copied ? "✓ Copied" : "Copy Fingerprint"}
                </button>
              </div>
              <div style={{
                padding: "0.75rem 1rem",
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "0.82rem",
                textAlign: "center",
                fontWeight: 600,
                userSelect: "all"
              }}>
                {fingerprint}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="license-key">License Key</label>
              <input
                id="license-key"
                type="text"
                className="form-input"
                placeholder="NEUG-XXXX-XXXX-XXXX"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  textAlign: "center",
                  fontSize: "0.9rem",
                  fontWeight: 600
                }}
                disabled={activating}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: "100%",
                padding: "0.75rem",
                justifyContent: "center",
                fontWeight: 700,
                marginTop: "0.5rem"
              }}
              disabled={activating || !licenseKey.trim()}
            >
              {activating ? "Verifying..." : "Activate Workspace"}
            </button>
          </form>
        )}

        <div style={{
          textAlign: "center",
          marginTop: "2rem",
          fontSize: "0.78rem",
          color: "var(--text-dim)",
          lineHeight: "1.5"
        }}>
          Provide your machine fingerprint to receive your activation key or request via the{" "}
          <button
            type="button"
            onClick={async () => {
              try {
                const { openUrl } = await import("@tauri-apps/plugin-opener");
                await openUrl("https://enterprise.neulify.com/license-portal");
              } catch (_) {
                window.open("https://enterprise.neulify.com/license-portal", "_blank");
              }
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--primary)",
              textDecoration: "underline",
              fontWeight: 700,
              cursor: "pointer",
              padding: 0,
              font: "inherit"
            }}
          >
            License Portal
          </button>.
        </div>
      </div>
    </div>
  );
}
