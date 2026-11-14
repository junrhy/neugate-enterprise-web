import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import AutoUpdater from "./AutoUpdater";
import Database from "@tauri-apps/plugin-sql";
import UserManagement from "./admin/UserManagement";
import RoleManagement from "./admin/RoleManagement";
import { useAuth } from "../hooks/useAuth";

import { BranchLocation } from "../types";
import { checkSemaphoreCredits, checkUniSmsCredits, checkPhilSmsCredits, SmsCreditInfo } from "../utils/smsCredits";
import SmsCreditsCard from "./SmsCreditsCard";

export type ThemeColor = "ocean" | "emerald" | "rose" | "violet" | "amber";

export interface AppSettings {
  schoolName: string;
  companyName?: string;
  schoolTagline: string;
  themeColor: ThemeColor;
  showSimulator: boolean;
  smsGateway: "webhook" | "semaphore" | "unisms" | "philsms" | "mobile_gateway" | "pusher";
  broadcastDriver?: "pusher" | "soketi" | "reverb" | "log";
  pusherAppId: string;
  pusherAppKey: string;
  pusherAppSecret: string;
  pusherCluster: string;
  pusherHost?: string;
  pusherPathPrefix?: string;
  smsWebhookUrl: string;
  semaphoreApiKey: string;
  semaphoreSenderName: string;
  unismsApiKey: string;
  unismsSenderName: string;
  philsmsToken: string;
  philsmsSenderName: string;
  mobileGatewayIp: string;
  mobileGatewayPort: string;
  deviceLocation: string;
  themeMode: "light" | "dark";
  schoolLogo: string; // Base64 image data or empty for fallback
  gateBackground: string; // Base64 image data or empty for default
  scanCooldownSeconds: number; // Cooldown protection period in seconds to prevent duplicate scans
  enableBiradaAdvances?: boolean; // Enable/disable Trucking "Advances from Birada" column in Cash Advances
  enableShAdvances?: boolean; // Enable/disable Regular (SH) Cash Advances column
}

interface SettingsPageProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  db: Database | null;
  branches?: BranchLocation[];
}

const THEMES: { id: ThemeColor; label: string; primary: string; description: string }[] = [
  { id: "ocean",   label: "Ocean",   primary: "#00d4ff", description: "Cool cyan-blue — the default" },
  { id: "emerald", label: "Emerald", primary: "#10b981", description: "Rich green — nature & growth" },
  { id: "rose",    label: "Rose",    primary: "#f43f5e", description: "Warm rose-red — bold & vibrant" },
  { id: "violet",  label: "Violet",  primary: "#a855f7", description: "Deep purple — premium & calm" },
  { id: "amber",   label: "Amber",   primary: "#f59e0b", description: "Warm amber — energetic & warm" },
];

type SettingsTab = "branding" | "appearance" | "gate" | "sms" | "users" | "database" | "storage" | "license" | "developer";

const SETTINGS_TABS: { id: SettingsTab; icon: string; label: string; desc: string; adminOnly?: boolean }[] = [
  { id: "branding",   icon: "🏢", label: "Company Branding", desc: "Name & tagline", adminOnly: true },
  { id: "appearance", icon: "🎨", label: "Appearance",       desc: "Theme colors" },
  { id: "gate",       icon: "🚪", label: "Access Terminal",  desc: "Display & scanner options" },
  { id: "sms",        icon: "📱", label: "SMS / Notifications", desc: "Webhook & alerts", adminOnly: true },
  { id: "users",      icon: "👥", label: "Users & Roles",    desc: "Staff accounts & RBAC matrix", adminOnly: true },
  { id: "database",   icon: "🌐", label: "DB Connection",   desc: "SQLite LAN & Cloud Postgres", adminOnly: true },
  { id: "storage",    icon: "📁", label: "File Storage",     desc: "Local, Sync & S3 cloud", adminOnly: true },
  { id: "license",    icon: "🔑", label: "License & Payment", desc: "Hardware key & payment status" },
  { id: "developer",  icon: "🛠️", label: "Dev Settings",     desc: "Automation & Webhook Integration", adminOnly: true },
];

export default function SettingsPage({ settings, onSave, db, branches }: SettingsPageProps) {
  const { user } = useAuth();
  const isAdmin = Boolean(
    user && (
      user.username?.toLowerCase() === "admin" ||
      String(user.role_id) === "1" ||
      user.role_id === "admin" ||
      user.permissions?.includes("*") ||
      user.permissions?.includes("settings") ||
      user.permissions?.some((p) => p.startsWith("settings"))
    )
  );
  const [form, setForm] = useState<AppSettings>({ ...settings });
  const [activeTab, setActiveTab] = useState<SettingsTab>("branding");
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [checkingSemaphoreCredits, setCheckingSemaphoreCredits] = useState(false);
  const [semaphoreCreditsInfo, setSemaphoreCreditsInfo] = useState<SmsCreditInfo | null>(null);

  const [checkingPhilSmsCredits, setCheckingPhilSmsCredits] = useState(false);
  const [philsmsCreditsInfo, setPhilsmsCreditsInfo] = useState<SmsCreditInfo | null>(null);

  const [checkingUniSMSCredits, setCheckingUniSMSCredits] = useState(false);
  const [unismsCreditsInfo, setUnismsCreditsInfo] = useState<SmsCreditInfo | null>(null);

  // Signatories State
  const [sigPreparedBy, setSigPreparedBy] = useState(() => localStorage.getItem("neugate_sig_prepared_by") || "JANE D. DOE");
  const [sigCheckedBy, setSigCheckedBy] = useState(() => localStorage.getItem("neugate_sig_checked_by") || "JOHN R. SMITH");
  const [sigApprovedBy, setSigApprovedBy] = useState(() => localStorage.getItem("neugate_sig_approved_by") || "MICHAEL A. TAYLOR");
  const [sigPreparedByImg, setSigPreparedByImg] = useState(() => localStorage.getItem("neugate_sig_prepared_by_img") || "");
  const [sigCheckedByImg, setSigCheckedByImg] = useState(() => localStorage.getItem("neugate_sig_checked_by_img") || "");
  const [sigApprovedByImg, setSigApprovedByImg] = useState(() => localStorage.getItem("neugate_sig_approved_by_img") || "");

  const [activeSignatoryPad, setActiveSignatoryPad] = useState<{
    role: "Prepared" | "Checked" | "Approved";
    title: string;
    currentImg: string;
  } | null>(null);

  // License state for disabling tabs if not active & paid
  const [isLicensedAndPaid, setIsLicensedAndPaid] = useState<boolean>(true);
  const [serverLicenseData, setServerLicenseData] = useState<{
    allow_db_settings?: boolean;
    allow_storage_settings?: boolean;
    allow_developer_settings?: boolean;
    allow_sms_settings?: boolean;
    allow_realtime_broadcast?: boolean;
  } | null>(null);

  const checkLicenseStatus = async () => {
    try {
      const savedKey = localStorage.getItem("neugate_license_key") || "";
      if (!savedKey || savedKey === "Not Activated") {
        setIsLicensedAndPaid(false);
        setServerLicenseData(null);
        setActiveTab("license");
        return;
      }

      const fp = await invoke<string>("get_machine_fingerprint").catch(() => "");
      const res = await fetch("https://enterprise.neulify.com/api/licenses/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-App-Token": "neulify_desktop_app_secret_token_2026",
        },
        body: JSON.stringify({
          license_key: savedKey.trim(),
          machine_id: fp,
          app_name: 'NeuGate',
        }),
      });

      const data = await res.json();
      if (res.ok && data.status === "success" && data.data?.is_active && (data.data?.payment_status === "paid" || data.data?.payment_status === "trial")) {
        setIsLicensedAndPaid(true);
        setServerLicenseData(data.data);

        // Auto-populate WebSocket Pusher credentials if returned by license server
        if (data.data?.pusher_app_key || data.data?.allow_realtime_broadcast === false) {
          const isRealtimeDisabled = data.data.allow_realtime_broadcast === false;
          const updated = {
            ...form,
            smsGateway: (isRealtimeDisabled && form.smsGateway === "pusher") ? ("webhook" as const) : form.smsGateway,
            pusherAppId: data.data.pusher_app_id || form.pusherAppId || '2059633',
            pusherAppKey: data.data.pusher_app_key || form.pusherAppKey || 'c322b7a972620c3a6479',
            pusherAppSecret: data.data.pusher_app_secret || form.pusherAppSecret || '0e1376df17ee7b1ec173',
            pusherHost: data.data.pusher_host || form.pusherHost || 'enterprise.neulify.com',
            pusherPathPrefix: data.data.pusher_path_prefix || form.pusherPathPrefix || '/soketi',
          };
          setForm(updated);
          onSave(updated);
        }
      } else {
        setIsLicensedAndPaid(false);
        setServerLicenseData(null);
        setActiveTab("license");
      }
    } catch (err) {
      console.error("Failed to verify license", err);
      setIsLicensedAndPaid(false);
      setServerLicenseData(null);
      setActiveTab("license");
    }
  };

  useEffect(() => {
    checkLicenseStatus();
  }, []);

  useEffect(() => {
    setForm({ ...settings });
  }, [settings]);

  const handleSave = () => {
    onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const hasChanges =
    form.schoolName !== settings.schoolName ||
    form.schoolTagline !== settings.schoolTagline ||
    form.themeColor !== settings.themeColor ||
    form.showSimulator !== settings.showSimulator ||
    form.smsGateway !== settings.smsGateway ||
    form.broadcastDriver !== settings.broadcastDriver ||
    form.pusherAppId !== settings.pusherAppId ||
    form.pusherAppKey !== settings.pusherAppKey ||
    form.pusherAppSecret !== settings.pusherAppSecret ||
    form.pusherCluster !== settings.pusherCluster ||
    form.pusherHost !== settings.pusherHost ||
    form.pusherPathPrefix !== settings.pusherPathPrefix ||
    form.smsWebhookUrl !== settings.smsWebhookUrl ||
    form.semaphoreApiKey !== settings.semaphoreApiKey ||
    form.semaphoreSenderName !== settings.semaphoreSenderName ||
    form.unismsApiKey !== settings.unismsApiKey ||
    form.unismsSenderName !== settings.unismsSenderName ||
    form.philsmsToken !== settings.philsmsToken ||
    form.philsmsSenderName !== settings.philsmsSenderName ||
    form.mobileGatewayIp !== settings.mobileGatewayIp ||
    form.mobileGatewayPort !== settings.mobileGatewayPort ||
    form.deviceLocation !== settings.deviceLocation ||
    form.themeMode !== settings.themeMode ||
    form.schoolLogo !== settings.schoolLogo ||
    form.gateBackground !== settings.gateBackground ||
    form.scanCooldownSeconds !== settings.scanCooldownSeconds ||
    form.enableBiradaAdvances !== settings.enableBiradaAdvances ||
    form.enableShAdvances !== settings.enableShAdvances;

  const handleTestWebhook = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (form.smsGateway === "pusher") {
        const pusherKey = form.pusherAppKey?.trim() || "f7fc5747ad0f8d43f520";
        if (!pusherKey) { setTestResult({ ok: false, msg: "Please enter an App Key." }); setTesting(false); return; }

        const appId = form.pusherAppId?.trim() || "2059633";
        const secret = form.pusherAppSecret?.trim() || "dafec1e4c71435d57595";
        const cluster = form.pusherCluster?.trim() || "mt1";

        const testData = JSON.stringify({
          employee_name: "Jun Rhy Crodua (Test Scan)",
          parent_phone: "09260049848",
          type: "IN",
          location: form.deviceLocation || "Main Turnstile",
          timestamp: new Date().toLocaleTimeString("en-PH"),
          message: "Test Pusher Push Notification from neuHR Console"
        });

        try {
          await invoke("send_pusher_event", {
            appId,
            key: pusherKey,
            secret,
            cluster,
            channelName: "neugate-enterprise-notifications",
            eventName: "gate-scan",
            dataJson: testData,
            host: (form.pusherHost || "enterprise.neulify.com").trim(),
            pathPrefix: (form.pusherPathPrefix || "/soketi").trim(),
          });
          setTestResult({ ok: true, msg: "✅ Real-time Pusher push event sent successfully!" });
        } catch (err: any) {
          const errMsg = typeof err === "string" ? err : err?.message || JSON.stringify(err);
          setTestResult({ ok: false, msg: `❌ Pusher error: ${errMsg}` });
        }

      } else if (form.smsGateway === "webhook") {
        if (!form.smsWebhookUrl.trim()) { setTestResult({ ok: false, msg: "Please enter a webhook URL first." }); setTesting(false); return; }
        const res = await fetch(form.smsWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: "09000000000", message: "[neuHR Test] Webhook connection test from the RFID app.", student: "Test Student", type: "TEST" }),
        });
        setTestResult({ ok: res.ok, msg: res.ok ? `✅ Webhook responded with HTTP ${res.status}` : `❌ Server returned HTTP ${res.status}` });

      } else if (form.smsGateway === "semaphore") {
        if (!form.semaphoreApiKey.trim()) { setTestResult({ ok: false, msg: "Please enter a Semaphore API Key first." }); setTesting(false); return; }
        const params = new URLSearchParams();
        params.append("apikey", form.semaphoreApiKey.trim());
        params.append("number", "09000000000");
        params.append("message", "[neuHR Test] Connection test from the RFID app.");
        if (form.semaphoreSenderName.trim()) params.append("sendername", form.semaphoreSenderName.trim());
        const res = await fetch("https://api.semaphore.co/api/v4/messages", { method: "POST", body: params });
        const data = await res.json();
        setTestResult({ ok: res.ok && Array.isArray(data), msg: res.ok && Array.isArray(data) ? "✅ Test SMS sent via Semaphore!" : `❌ Semaphore error: ${data.message || "Invalid API response"}` });

      } else if (form.smsGateway === "unisms") {
        if (!form.unismsApiKey.trim()) { setTestResult({ ok: false, msg: "Please enter a UniSMS API Secret Key first." }); setTesting(false); return; }
        try {
          await invoke("send_unisms_sms", {
            apiKey: form.unismsApiKey.trim(),
            recipient: "09170000000",
            content: "neuHR Notification: This is a test message to verify your connection.",
            senderId: form.unismsSenderName.trim() || null,
          });
          setTestResult({
            ok: true,
            msg: "✅ Connection successful! UniSMS API Key is valid.",
          });
        } catch (err: any) {
          const errMsg = typeof err === "string" ? err : err.message || JSON.stringify(err);
          if (errMsg.includes("HTTP 422") || errMsg.includes("sender_id") || errMsg.includes("content") || errMsg.includes("recipient")) {
            setTestResult({
              ok: true,
              msg: "✅ Connection successful! API Key authenticated properly with UniSMS.",
            });
          } else {
            setTestResult({
              ok: false,
              msg: `❌ UniSMS connection error: ${errMsg}`,
            });
          }
        }


      } else if (form.smsGateway === "philsms") {
        if (!form.philsmsToken.trim()) { setTestResult({ ok: false, msg: "Please enter a PhilSMS Token first." }); setTesting(false); return; }
        const res = await fetch("https://app.philsms.com/api/v3/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: form.philsmsToken.trim(), to: "09000000000", message: "[neuHR Test] Connection test from the RFID app.", from: form.philsmsSenderName.trim() || undefined }),
        });
        setTestResult({ ok: res.ok, msg: res.ok ? "✅ Test SMS sent via PhilSMS!" : `❌ PhilSMS error: HTTP ${res.status}` });

      } else if (form.smsGateway === "mobile_gateway") {
        if (!form.mobileGatewayIp.trim()) { setTestResult({ ok: false, msg: "Please enter the phone's IP address first." }); setTesting(false); return; }
        const url = `http://${form.mobileGatewayIp.trim()}:${form.mobileGatewayPort.trim() || "8080"}/send`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: "09000000000", message: "[neuHR Test] Connection test from the RFID app." }),
        });
        setTestResult({ ok: res.ok, msg: res.ok ? `✅ Mobile Gateway responded with HTTP ${res.status}` : `❌ Gateway returned HTTP ${res.status}` });
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: `❌ Request failed: ${err?.message ?? "Network error"}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="settings-layout">
      {/* ── Left Sidebar ─────────────────────────────────────── */}
      <div className="settings-sidebar">
        <div className="settings-sidebar-header">
          <span style={{ fontSize: "1.1rem" }}>⚙️</span>
          <span>Settings</span>
        </div>

        <nav className="settings-nav">
          {SETTINGS_TABS.map((tab) => {
            const isDbHidden = !isAdmin && tab.id === "database" && !(serverLicenseData?.allow_db_settings ?? true);
            const isStorageHidden = !isAdmin && tab.id === "storage" && !(serverLicenseData?.allow_storage_settings ?? true);
            const isDevHidden = !isAdmin && tab.id === "developer" && !(serverLicenseData?.allow_developer_settings ?? true);
            const isSmsHidden = !isAdmin && tab.id === "sms" && !(serverLicenseData?.allow_sms_settings ?? true);

            if (isDbHidden || isStorageHidden || isDevHidden || isSmsHidden) {
              return null;
            }

            const isLicenseLocked = !isLicensedAndPaid && tab.id !== "license";
            const isAdminLocked = tab.adminOnly && !isAdmin;

            const isDisabled = !isAdmin && (isLicenseLocked || isAdminLocked);

            let lockReason = "";
            if (isDisabled) {
              if (isAdminLocked) lockReason = "Administrator access required";
              else if (isLicenseLocked) lockReason = "License required";
            }

            return (
              <button
                key={tab.id}
                disabled={isDisabled}
                className={`settings-nav-item ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => !isDisabled && setActiveTab(tab.id)}
                style={{
                  opacity: isDisabled ? 0.45 : 1,
                  cursor: isDisabled ? "not-allowed" : "pointer",
                }}
                title={isDisabled ? lockReason : undefined}
              >
                <span className="settings-nav-icon">{tab.icon}</span>
                <div className="settings-nav-text">
                  <span className="settings-nav-label">
                    {tab.label} {isDisabled && "🔒"}
                  </span>
                  <span className="settings-nav-desc">
                    {isDisabled ? lockReason : tab.desc}
                  </span>
                </div>
                {activeTab === tab.id && <span className="settings-nav-arrow">›</span>}
              </button>
            );
          })}
        </nav>

        {/* Save button pinned to sidebar bottom */}
        <div className="settings-sidebar-footer">
          {saved && (
            <span style={{ fontSize: "0.72rem", color: "var(--success)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.5rem" }}>
              ✅ Saved
            </span>
          )}
          <button
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={handleSave}
            disabled={!hasChanges && !saved}
          >
            {saved ? "✓ Saved" : "Save Settings"}
          </button>
        </div>
      </div>

      {/* ── Right Content Panel ───────────────────────────────── */}
      <div className="settings-content">

        {/* ── Branding Tab ──────────────────────────────────── */}
        {activeTab === "branding" && (
          <div className="settings-section">
            <div className="settings-section-title">
              <h3>Company Branding</h3>
              <p>Customize how your organization is identified throughout the app and reports.</p>
            </div>

            <div className="settings-grid-2">
              {/* Left Column: Organization Details & Wallpapers */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div className="settings-field-group">
                  <div className="form-group">
                    <label className="form-label">Company / Organization Name</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Acme Corporation"
                      value={form.schoolName}
                      onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))}
                      maxLength={60}
                    />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                      {form.schoolName.length}/60 characters
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Tagline / Subtitle</label>
                    <input
                      className="form-input"
                      placeholder="e.g. RFID Entrance Tracker"
                      value={form.schoolTagline}
                      onChange={(e) => setForm((f) => ({ ...f, schoolTagline: e.target.value }))}
                      maxLength={60}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Company Logo</label>
                    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                      <div style={{
                        width: 54,
                        height: 54,
                        borderRadius: "10px",
                        border: "1px solid var(--border)",
                        background: "var(--bg-input)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.2rem",
                        overflow: "hidden"
                      }}>
                        {form.schoolLogo ? (
                          <img src={form.schoolLogo} alt="Uploaded logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <img src="/app-icon.png" alt="Fallback icon" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ fontSize: "0.78rem" }}
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "image/*";
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const img = new Image();
                                img.onload = () => {
                                  const canvas = document.createElement("canvas");
                                  const size = 128;
                                  canvas.width = size;
                                  canvas.height = size;
                                  const ctx = canvas.getContext("2d")!;
                                  ctx.drawImage(img, 0, 0, size, size);
                                  setForm((f) => ({ ...f, schoolLogo: canvas.toDataURL("image/jpeg", 0.8) }));
                                };
                                img.src = ev.target?.result as string;
                              };
                              reader.readAsDataURL(file);
                            };
                            input.click();
                          }}
                        >
                          📁 Upload Logo
                        </button>
                        {form.schoolLogo && (
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ fontSize: "0.78rem", padding: "0.5rem 0.8rem" }}
                            onClick={() => setForm((f) => ({ ...f, schoolLogo: "" }))}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dedicated Section: Industry & Cash Advances Modules */}
                <div className="settings-field-group">
                  <div style={{ fontSize: "0.88rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "0.2rem" }}>
                    💸 Cash Advances Ledger Columns &amp; Modules
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.75rem", lineHeight: 1.4 }}>
                    Enable or disable specific cash advance categories based on your business type.
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div className="form-group" style={{ padding: "0.85rem 1rem", background: "var(--bg-main)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-main)" }}>
                        <input
                          type="checkbox"
                          checked={form.enableShAdvances !== false}
                          onChange={(e) => setForm((f) => ({ ...f, enableShAdvances: e.target.checked }))}
                          style={{ width: "1.1rem", height: "1.1rem", accentColor: "var(--primary)" }}
                        />
                        Enable Regular (SH) Cash Advances Column
                      </label>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.35rem", marginLeft: "1.85rem", lineHeight: 1.4 }}>
                        Track standard employee Store / Household / Shortage (SH) cash advances. Turn OFF if your business does not issue regular employee cash advances.
                      </div>
                    </div>

                    <div className="form-group" style={{ padding: "0.85rem 1rem", background: "var(--bg-main)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-main)" }}>
                        <input
                          type="checkbox"
                          checked={!!form.enableBiradaAdvances}
                          onChange={(e) => setForm((f) => ({ ...f, enableBiradaAdvances: e.target.checked }))}
                          style={{ width: "1.1rem", height: "1.1rem", accentColor: "var(--primary)" }}
                        />
                        Enable Trucking "Advances from Birada" Column
                      </label>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.35rem", marginLeft: "1.85rem", lineHeight: 1.4 }}>
                        Turn this ON if your business is in Trucking / Logistics to track driver <em>Birada</em> trip cash advances separately in the Cash Advances Ledger. Leave OFF for standard corporate/commercial payroll.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Terminal Wallpaper Card */}
                <div className="settings-field-group">
                  <label className="form-label">Terminal Card Custom Background Image</label>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem", lineHeight: 1.5 }}>
                    Upload a custom background photo or wallpaper for the RFID access terminal scan card.
                  </p>

                  <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                    <div style={{
                      width: 140,
                      height: 80,
                      borderRadius: "10px",
                      border: "1px solid var(--border)",
                      background: form.gateBackground ? `url(${form.gateBackground}) center/cover no-repeat` : "var(--bg-input)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.2rem",
                      overflow: "hidden",
                      boxShadow: "var(--shadow)"
                    }}>
                      {!form.gateBackground && <span style={{ opacity: 0.4 }}>🖼️</span>}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ fontSize: "0.78rem" }}
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "image/*";
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const img = new Image();
                                img.onload = () => {
                                  const canvas = document.createElement("canvas");
                                  const maxW = 1280;
                                  const maxH = 720;
                                  let width = img.width;
                                  let height = img.height;

                                  if (width > maxW || height > maxH) {
                                    if (width / height > maxW / maxH) {
                                      height = Math.round((height * maxW) / width);
                                      width = maxW;
                                    } else {
                                      width = Math.round((width * maxH) / height);
                                      height = maxH;
                                    }
                                  }

                                  canvas.width = width;
                                  canvas.height = height;
                                  const ctx = canvas.getContext("2d")!;
                                  ctx.drawImage(img, 0, 0, width, height);
                                  setForm((f) => ({ ...f, gateBackground: canvas.toDataURL("image/jpeg", 0.85) }));
                                };
                                img.src = ev.target?.result as string;
                              };
                              reader.readAsDataURL(file);
                            };
                            input.click();
                          }}
                        >
                          🖼️ Upload Background Image
                        </button>
                        {form.gateBackground && (
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ fontSize: "0.78rem", padding: "0.5rem 0.8rem" }}
                            onClick={() => setForm((f) => ({ ...f, gateBackground: "" }))}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                        Supports JPG, PNG, WEBP. Automatically resized for high performance.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Signatories & Digital Signatures */}
              <div className="settings-field-group">
                <div style={{ fontSize: "0.9rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "0.25rem" }}>
                  ✍️ Report Signatories &amp; Digital Signatures
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.85rem", lineHeight: 1.5 }}>
                  Configure authorized signatories for printable Cash Disbursements, Payables, Vouchers, and Payroll reports.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  {/* Prepared By Card */}
                  <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.85rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <label className="form-label" style={{ fontSize: "0.78rem", fontWeight: 700 }}>PREPARED BY NAME</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ fontSize: "0.8rem" }}
                      value={sigPreparedBy}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSigPreparedBy(val);
                        localStorage.setItem("neugate_sig_prepared_by", val);
                      }}
                      placeholder="e.g. MARICEL BAYUBAY"
                    />
                    <div style={{ background: "#ffffff", border: "1px dashed var(--border)", borderRadius: "6px", padding: "0.4rem", height: "65px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {sigPreparedByImg ? (
                        <img src={sigPreparedByImg} alt="Prepared Signature" style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
                      ) : (
                        <span style={{ fontSize: "0.72rem", color: "#64748b" }}>No signature uploaded</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ fontSize: "0.72rem", flex: 1, padding: "0.3rem" }}
                        onClick={() => setActiveSignatoryPad({ role: "Prepared", title: "Prepared By Signature", currentImg: sigPreparedByImg })}
                      >
                        ✍️ {sigPreparedByImg ? "Edit Signature" : "Add Digital Signature"}
                      </button>
                      {sigPreparedByImg && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ fontSize: "0.72rem", padding: "0.3rem 0.5rem" }}
                          onClick={() => {
                            setSigPreparedByImg("");
                            localStorage.removeItem("neugate_sig_prepared_by_img");
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Checked By Card */}
                  <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.85rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <label className="form-label" style={{ fontSize: "0.78rem", fontWeight: 700 }}>CHECKED BY NAME</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ fontSize: "0.8rem" }}
                      value={sigCheckedBy}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSigCheckedBy(val);
                        localStorage.setItem("neugate_sig_checked_by", val);
                      }}
                      placeholder="e.g. LEONILA GECERA"
                    />
                    <div style={{ background: "#ffffff", border: "1px dashed var(--border)", borderRadius: "6px", padding: "0.4rem", height: "65px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {sigCheckedByImg ? (
                        <img src={sigCheckedByImg} alt="Checked Signature" style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
                      ) : (
                        <span style={{ fontSize: "0.72rem", color: "#64748b" }}>No signature uploaded</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ fontSize: "0.72rem", flex: 1, padding: "0.3rem" }}
                        onClick={() => setActiveSignatoryPad({ role: "Checked", title: "Checked By Signature", currentImg: sigCheckedByImg })}
                      >
                        ✍️ {sigCheckedByImg ? "Edit Signature" : "Add Digital Signature"}
                      </button>
                      {sigCheckedByImg && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ fontSize: "0.72rem", padding: "0.3rem 0.5rem" }}
                          onClick={() => {
                            setSigCheckedByImg("");
                            localStorage.removeItem("neugate_sig_checked_by_img");
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Approved By Card */}
                  <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.85rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <label className="form-label" style={{ fontSize: "0.78rem", fontWeight: 700 }}>APPROVED BY NAME</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ fontSize: "0.8rem" }}
                      value={sigApprovedBy}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSigApprovedBy(val);
                        localStorage.setItem("neugate_sig_approved_by", val);
                      }}
                      placeholder="e.g. MICHEAL H. TAN"
                    />
                    <div style={{ background: "#ffffff", border: "1px dashed var(--border)", borderRadius: "6px", padding: "0.4rem", height: "65px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {sigApprovedByImg ? (
                        <img src={sigApprovedByImg} alt="Approved Signature" style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
                      ) : (
                        <span style={{ fontSize: "0.72rem", color: "#64748b" }}>No signature uploaded</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ fontSize: "0.72rem", flex: 1, padding: "0.3rem" }}
                        onClick={() => setActiveSignatoryPad({ role: "Approved", title: "Approved By Signature", currentImg: sigApprovedByImg })}
                      >
                        ✍️ {sigApprovedByImg ? "Edit Signature" : "Add Digital Signature"}
                      </button>
                      {sigApprovedByImg && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ fontSize: "0.72rem", padding: "0.3rem 0.5rem" }}
                          onClick={() => {
                            setSigApprovedByImg("");
                            localStorage.removeItem("neugate_sig_approved_by_img");
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Appearance Tab ────────────────────────────────── */}
        {activeTab === "appearance" && (
          <div className="settings-section">
            <div className="settings-section-title">
              <h3>Appearance &amp; Theme Customization</h3>
              <p>Customize the visual styling, theme mode, and accent colors across your workspace.</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div className="settings-field-group">
                <div className="form-group">
                  <label className="form-label">Interface Mode</label>
                  <div style={{ display: "flex", gap: "1rem", maxWidth: "480px" }}>
                    <button
                      type="button"
                      className={`btn ${form.themeMode === "dark" ? "btn-primary" : "btn-outline"}`}
                      style={{ flex: 1, justifyContent: "center", padding: "0.75rem" }}
                      onClick={() => setForm((f) => ({ ...f, themeMode: "dark" }))}
                    >
                      🌙 Dark Mode
                    </button>
                    <button
                      type="button"
                      className={`btn ${form.themeMode === "light" ? "btn-primary" : "btn-outline"}`}
                      style={{ flex: 1, justifyContent: "center", padding: "0.75rem" }}
                      onClick={() => setForm((f) => ({ ...f, themeMode: "light" }))}
                    >
                      ☀️ Light Mode
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings-field-group">
                <div className="form-group">
                  <label className="form-label">Theme Accent Palette</label>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 0.85rem 0" }}>
                    Choose an accent color palette applied across buttons, active states, and indicators.
                  </p>
                  <div className="theme-grid">
                    {THEMES.map((t) => (
                      <div
                        key={t.id}
                        className={`theme-swatch ${form.themeColor === t.id ? "selected" : ""}`}
                        onClick={() => setForm((f) => ({ ...f, themeColor: t.id }))}
                        style={{ "--swatch-color": t.primary } as React.CSSProperties}
                      >
                        <div className="theme-swatch-dot" style={{ background: t.primary }} />
                        <div className="theme-swatch-info">
                          <span className="theme-swatch-name">{t.label}</span>
                          <span className="theme-swatch-desc">{t.description}</span>
                        </div>
                        {form.themeColor === t.id && (
                          <span className="theme-swatch-check">✓</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Gate Console Tab ──────────────────────────────── */}
        {activeTab === "gate" && (
          <div className="settings-section">
            <div className="settings-section-title">
              <h3>Access Terminal Options</h3>
              <p>Configure how the entrance RFID scanner screen behaves and what it displays.</p>
            </div>

            <div className="settings-grid-2">
              {/* Left Column: Scanner Settings */}
              <div className="settings-field-group">
                <div className="settings-toggle-row">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.2rem" }}>
                      Virtual RFID Simulator Panel
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                      Show a panel of registered employees you can click to simulate card scans.<br />
                      Useful for testing without physical RFID hardware.
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`toggle-btn ${form.showSimulator ? "on" : "off"}`}
                    onClick={() => setForm((f) => ({ ...f, showSimulator: !f.showSimulator }))}
                    aria-pressed={form.showSimulator}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem", marginTop: "0.5rem" }}>
                  <div className="form-group" style={{ marginBottom: "1rem" }}>
                    <label className="form-label">Double Tap Cooldown Protection (Seconds)</label>
                    <input
                      type="number"
                      min={0}
                      max={300}
                      className="form-input"
                      placeholder="e.g. 5"
                      value={form.scanCooldownSeconds ?? 5}
                      onChange={(e) => setForm((f) => ({ ...f, scanCooldownSeconds: Math.max(0, parseInt(e.target.value) || 0) }))}
                    />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.2rem", display: "block" }}>
                      Ignores duplicate card taps or rapid re-scans for the same employee within this window (Default: 5 seconds). Set to 0 to disable.
                    </span>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Gate / Device Location Name</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Main Gate, Library, Science Lab, Room 102"
                      value={form.deviceLocation}
                      onChange={(e) => setForm((f) => ({ ...f, deviceLocation: e.target.value }))}
                    />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.2rem", display: "block" }}>
                      Specifies where the reader is located. This location name will be saved in logs and sent in SMS/JSON payloads.
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Terminal Background Image & Kiosk Preview */}
              <div className="settings-field-group">
                <label className="form-label">Terminal Kiosk Wallpaper Background</label>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem", lineHeight: 1.5 }}>
                  Customize the full-screen wallpaper image displayed behind the RFID scanning card kiosk.
                </p>

                <div style={{
                  width: "100%",
                  height: 180,
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  background: form.gateBackground ? `url(${form.gateBackground}) center/cover no-repeat` : "var(--bg-main)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  boxShadow: "var(--shadow)",
                  position: "relative",
                  overflow: "hidden"
                }}>
                  {!form.gateBackground ? (
                    <>
                      <span style={{ fontSize: "2rem", opacity: 0.4 }}>🖼️</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>No custom wallpaper uploaded</span>
                    </>
                  ) : (
                    <div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,0.65)", color: "#fff", padding: "0.25rem 0.6rem", borderRadius: "4px", fontSize: "0.7rem" }}>
                      Current Terminal Wallpaper
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.85rem" }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ fontSize: "0.78rem", flex: 1 }}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const img = new Image();
                          img.onload = () => {
                            const canvas = document.createElement("canvas");
                            const maxW = 1280;
                            const maxH = 720;
                            let width = img.width;
                            let height = img.height;

                            if (width > maxW || height > maxH) {
                              if (width / height > maxW / maxH) {
                                height = Math.round((height * maxW) / width);
                                width = maxW;
                              } else {
                                width = Math.round((width * maxH) / height);
                                height = maxH;
                              }
                            }

                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext("2d")!;
                            ctx.drawImage(img, 0, 0, width, height);
                            setForm((f) => ({ ...f, gateBackground: canvas.toDataURL("image/jpeg", 0.85) }));
                          };
                          img.src = ev.target?.result as string;
                        };
                        reader.readAsDataURL(file);
                      };
                      input.click();
                    }}
                  >
                    🖼️ Upload Wallpaper Image
                  </button>
                  {form.gateBackground && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ fontSize: "0.78rem", padding: "0.5rem 0.8rem" }}
                      onClick={() => setForm((f) => ({ ...f, gateBackground: "" }))}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* ── SMS / Notifications Tab ───────────────────────── */}
        {activeTab === "sms" && (
          <div className="settings-section">
            <div className="settings-section-title">
              <h3>SMS / Notifications</h3>
              <p>Configure how SMS notifications are sent when employees tap their RFID card at the gate.</p>
            </div>

            {/* 🪙 Live SMS Credits & Quota Box */}
            <SmsCreditsCard gateway={form.smsGateway} style={{ marginBottom: "1.25rem" }} />

            <div className="settings-field-group">
              <div className="form-group">
                <label className="form-label">SMS Provider / Gateway</label>
                <select
                  className="form-select"
                  value={form.smsGateway}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, smsGateway: e.target.value as AppSettings["smsGateway"] }));
                    setTestResult(null);
                  }}
                >
                  <option value="pusher" disabled={serverLicenseData?.allow_realtime_broadcast === false}>
                    Soketi / Pusher Channels {serverLicenseData?.allow_realtime_broadcast === false ? "🔒 (Disabled by Admin)" : ""}
                  </option>
                  <option value="webhook">Custom Webhook (JSON POST)</option>
                  <option value="semaphore">Semaphore (semaphore.co)</option>
                  <option value="unisms">UniSMS (unisms.ph)</option>
                  <option value="philsms">PhilSMS (philsms.com)</option>
                  <option value="mobile_gateway">Mobile Phone Gateway (Android / iPhone)</option>
                </select>
                {serverLicenseData?.allow_realtime_broadcast === false && (
                  <div style={{ marginTop: "0.5rem", padding: "0.6rem 0.8rem", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", color: "var(--danger)", fontWeight: 600 }}>
                    🔒 Real-Time Broadcast (Soketi / Reverb) has been remotely disabled on your license by the administrator. Contact your vendor to unlock real-time streaming.
                  </div>
                )}
              </div>
            </div>

            {/* ── Pusher / Soketi Real-Time PWA Alerts ── */}
            {form.smsGateway === "pusher" && (
              <>
                <div className="settings-field-group">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div className="form-group">
                      <label className="form-label">App ID</label>
                      <input className="form-input" type="text" placeholder="2059633"
                        value={form.pusherAppId || ""}
                        onChange={(e) => { setForm((f) => ({ ...f, pusherAppId: e.target.value })); setTestResult(null); }}
                        spellCheck={false} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">App Key</label>
                      <input className="form-input" type="text" placeholder="f7fc5747ad0f8d43f520"
                        value={form.pusherAppKey || ""}
                        onChange={(e) => { setForm((f) => ({ ...f, pusherAppKey: e.target.value })); setTestResult(null); }}
                        spellCheck={false} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
                    <div className="form-group">
                      <label className="form-label">App Secret</label>
                      <input className="form-input" type="password" placeholder="dafec1e4c71435d57595"
                        value={form.pusherAppSecret || ""}
                        onChange={(e) => { setForm((f) => ({ ...f, pusherAppSecret: e.target.value })); setTestResult(null); }}
                        spellCheck={false} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Cluster</label>
                      <input className="form-input" type="text" placeholder="mt1"
                        value={form.pusherCluster || ""}
                        onChange={(e) => { setForm((f) => ({ ...f, pusherCluster: e.target.value })); setTestResult(null); }}
                        spellCheck={false} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
                    <div className="form-group">
                      <label className="form-label">Server Host (Soketi / Reverb)</label>
                      <input className="form-input" type="text" placeholder="enterprise.neulify.com"
                        value={form.pusherHost ?? "enterprise.neulify.com"}
                        onChange={(e) => { setForm((f) => ({ ...f, pusherHost: e.target.value })); setTestResult(null); }}
                        spellCheck={false} />
                      <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                        Leave as default or specify custom host domain.
                      </span>
                    </div>
                    <div className="form-group">
                      <label className="form-label">URL Path Prefix</label>
                      <input className="form-input" type="text" placeholder="/soketi"
                        value={form.pusherPathPrefix ?? "/soketi"}
                        onChange={(e) => { setForm((f) => ({ ...f, pusherPathPrefix: e.target.value })); setTestResult(null); }}
                        spellCheck={false} />
                      <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                        Use <code>/soketi</code> or <code>/reverb</code>.
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <button className="btn btn-outline" onClick={handleTestWebhook} disabled={testing || !(form.pusherAppKey || "f7fc5747ad0f8d43f520").trim()} style={{ fontSize: "0.8rem" }}>
                      {testing ? "⏳ Broadcasting..." : "⚡ Broadcast Test Event to Soketi"}
                    </button>
                    {testResult && <span style={{ fontSize: "0.78rem", fontWeight: 600, color: testResult.ok ? "var(--success)" : "var(--danger)" }}>{testResult.msg}</span>}
                  </div>
                </div>
                <div style={{ padding: "0.85rem 1rem", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", color: "var(--success)", lineHeight: 1.6 }}>
                  🚀 <strong>Direct Soketi Broadcaster Mode</strong> — Broadcasts real-time turnstile entry/exit events directly to Neulify Soketi (`enterprise.neulify.com`) for managers on the neuHR Portal page.
                </div>
              </>
            )}

            {/* ── Webhook ── */}
            {form.smsGateway === "webhook" && (
              <>
                <div className="settings-field-group">
                  <div className="form-group">
                    <label className="form-label">Broadcast Driver (Optional)</label>
                    <select
                      className="form-select"
                      value={form.broadcastDriver || ""}
                      onChange={(e) => setForm((f) => ({ ...f, broadcastDriver: e.target.value as any }))}
                    >
                      <option value="">None (Standard Webhook / n8n)</option>
                      <option value="log">Log Only (Testing)</option>
                    </select>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                      Optional driver used if routing webhooks through Laravel WebSocket broadcasting.
                    </span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Webhook URL</label>
                    <input className="form-input" type="url" placeholder="https://your-sms-gateway.com/webhook"
                      value={form.smsWebhookUrl}
                      onChange={(e) => { setForm((f) => ({ ...f, smsWebhookUrl: e.target.value })); setTestResult(null); }}
                      spellCheck={false} />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>The app will POST JSON to this URL each time an employee scans in or out.</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <button className="btn btn-outline" onClick={handleTestWebhook} disabled={testing || !form.smsWebhookUrl.trim()} style={{ fontSize: "0.8rem" }}>
                      {testing ? "⏳ Testing..." : "🔌 Test Connection"}
                    </button>
                    {testResult && <span style={{ fontSize: "0.78rem", fontWeight: 600, color: testResult.ok ? "var(--success)" : "var(--danger)" }}>{testResult.msg}</span>}
                  </div>
                </div>
                <div className="settings-preview-block">
                  <span className="settings-preview-label">Payload Format (POST JSON)</span>
                  <pre style={{ margin: 0, padding: "1rem", fontSize: "0.75rem", fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)", lineHeight: 1.7, overflowX: "auto" }}>{`{
${form.broadcastDriver ? `  "driver":       "${form.broadcastDriver}",        // Broadcaster connection target\n` : ""}  "channel_name": "neugate-enterprise-notifications", // Real-time WebSocket channel
  "event_name":   "gate-scan",             // Event trigger type
  "to":           "09171234567",           // Manager / Emergency contact phone number
  "message":      "Dear Manager, ...",     // Full SMS text
  "employee":     "Maria Santos",          // Employee name
  "type":         "IN" | "OUT",            // Gate event type
  "location":     "Main Turnstile"         // Device location
}`}</pre>
                </div>
              </>
            )}

            {/* ── Semaphore ── */}
            {form.smsGateway === "semaphore" && (
              <>
                <div className="settings-field-group">
                  <div className="form-group">
                    <label className="form-label">Semaphore API Key</label>
                    <input className="form-input" type="password" placeholder="Enter Semaphore API Key"
                      value={form.semaphoreApiKey}
                      onChange={(e) => { setForm((f) => ({ ...f, semaphoreApiKey: e.target.value })); setTestResult(null); }}
                      spellCheck={false} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sender Name (Optional)</label>
                    <input className="form-input" type="text" placeholder="e.g. SEMAPHORE"
                      value={form.semaphoreSenderName}
                      onChange={(e) => { setForm((f) => ({ ...f, semaphoreSenderName: e.target.value })); setTestResult(null); }}
                      spellCheck={false} />
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <button className="btn btn-outline" onClick={handleTestWebhook} disabled={testing || !form.semaphoreApiKey.trim()} style={{ fontSize: "0.8rem" }}>
                      {testing ? "⏳ Testing..." : "🔌 Test Semaphore connection"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={checkingSemaphoreCredits || !form.semaphoreApiKey.trim()}
                      style={{ fontSize: "0.8rem" }}
                      onClick={async () => {
                        setCheckingSemaphoreCredits(true);
                        setSemaphoreCreditsInfo(null);
                        try {
                          const info = await checkSemaphoreCredits(form.semaphoreApiKey.trim());
                          setSemaphoreCreditsInfo(info);
                        } finally {
                          setCheckingSemaphoreCredits(false);
                        }
                      }}
                    >
                      {checkingSemaphoreCredits ? "⏳ Fetching..." : "💳 Check Semaphore Credits"}
                    </button>
                    {testResult && <span style={{ fontSize: "0.78rem", fontWeight: 600, color: testResult.ok ? "var(--success)" : "var(--danger)" }}>{testResult.msg}</span>}
                  </div>

                  {semaphoreCreditsInfo && (
                    <div style={{
                      marginTop: "0.75rem",
                      padding: "0.75rem 1rem",
                      background: semaphoreCreditsInfo.error ? "rgba(239, 68, 68, 0.08)" : "var(--primary-dim)",
                      border: semaphoreCreditsInfo.error ? "1px solid rgba(239, 68, 68, 0.25)" : "1px solid rgba(0, 212, 255, 0.25)",
                      borderRadius: "var(--radius-sm)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem"
                    }}>
                      <span style={{ fontSize: "1.3rem" }}>{semaphoreCreditsInfo.error ? "⚠️" : "💰"}</span>
                      <div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>
                          Semaphore Account Balance {semaphoreCreditsInfo.accountName ? `• ${semaphoreCreditsInfo.accountName}` : ""}
                        </div>
                        {semaphoreCreditsInfo.error ? (
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--danger)" }}>
                            {semaphoreCreditsInfo.error}
                          </div>
                        ) : (
                          <div style={{ fontSize: "1.05rem", fontWeight: 800, color: (typeof semaphoreCreditsInfo.credits === "number" && semaphoreCreditsInfo.credits <= 20) ? "var(--danger)" : "var(--primary)" }}>
                            {typeof semaphoreCreditsInfo.credits === "number" ? `${semaphoreCreditsInfo.credits.toLocaleString()} SMS Credits Available` : semaphoreCreditsInfo.credits}
                          </div>
                        )}
                        {semaphoreCreditsInfo.checkedAt && (
                          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                            Last queried at {semaphoreCreditsInfo.checkedAt}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ padding: "0.85rem 1rem", background: "var(--primary-dim)", border: "1px solid rgba(0, 212, 255, 0.25)", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", color: "var(--primary)", lineHeight: 1.6 }}>
                  ℹ️ <strong>Semaphore Direct Connection</strong> — Queries Semaphore's public API directly. Ensure your account has sufficient credits.
                </div>
              </>
            )}

            {/* ── UniSMS ── */}
            {form.smsGateway === "unisms" && (
              <>
                <div className="settings-field-group">
                  <div className="form-group">
                    <label className="form-label">UniSMS Secret Key</label>
                    <input className="form-input" type="password" placeholder="sk_..."
                      value={form.unismsApiKey}
                      onChange={(e) => { setForm((f) => ({ ...f, unismsApiKey: e.target.value })); setTestResult(null); }}
                      spellCheck={false} />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Get your Secret Key from unismsapi.com dashboard.</span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sender ID (Registered Sender Name)</label>
                    <input className="form-input" type="text" placeholder="e.g. Unisoft"
                      value={form.unismsSenderName}
                      onChange={(e) => { setForm((f) => ({ ...f, unismsSenderName: e.target.value })); setTestResult(null); }}
                      spellCheck={false} />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Must match your registered Sender ID on UniSMS dashboard (e.g., Unisoft).</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <button className="btn btn-outline" onClick={handleTestWebhook} disabled={testing || !form.unismsApiKey.trim()} style={{ fontSize: "0.8rem" }}>
                      {testing ? "⏳ Testing..." : "🔌 Test UniSMS connection"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={checkingUniSMSCredits || !form.unismsApiKey.trim()}
                      style={{ fontSize: "0.8rem" }}
                      onClick={async () => {
                        setCheckingUniSMSCredits(true);
                        setUnismsCreditsInfo(null);
                        try {
                          const info = await checkUniSmsCredits(form.unismsApiKey.trim());
                          setUnismsCreditsInfo(info);
                        } finally {
                          setCheckingUniSMSCredits(false);
                        }
                      }}
                    >
                      {checkingUniSMSCredits ? "⏳ Fetching..." : "💳 Check UniSMS Credits"}
                    </button>
                    {testResult && <span style={{ fontSize: "0.78rem", fontWeight: 600, color: testResult.ok ? "var(--success)" : "var(--danger)" }}>{testResult.msg}</span>}
                  </div>

                  {unismsCreditsInfo && (
                    <div style={{
                      marginTop: "0.75rem",
                      padding: "0.75rem 1rem",
                      background: unismsCreditsInfo.error ? "rgba(239, 68, 68, 0.08)" : "var(--primary-dim)",
                      border: unismsCreditsInfo.error ? "1px solid rgba(239, 68, 68, 0.25)" : "1px solid rgba(0, 212, 255, 0.25)",
                      borderRadius: "var(--radius-sm)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem"
                    }}>
                      <span style={{ fontSize: "1.3rem" }}>{unismsCreditsInfo.error ? "⚠️" : "💰"}</span>
                      <div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>
                          UniSMS Account Balance {unismsCreditsInfo.accountName ? `• ${unismsCreditsInfo.accountName}` : ""}
                        </div>
                        {unismsCreditsInfo.error ? (
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--danger)" }}>
                            {unismsCreditsInfo.error}
                          </div>
                        ) : (
                          <div style={{ fontSize: "1.05rem", fontWeight: 800, color: (typeof unismsCreditsInfo.credits === "number" && unismsCreditsInfo.credits <= 20) ? "var(--danger)" : "var(--primary)" }}>
                            {typeof unismsCreditsInfo.credits === "number" ? `${unismsCreditsInfo.credits.toLocaleString()} SMS Credits Available` : unismsCreditsInfo.credits}
                          </div>
                        )}
                        {unismsCreditsInfo.checkedAt && (
                          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                            Last queried at {unismsCreditsInfo.checkedAt}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── PhilSMS ── */}
            {form.smsGateway === "philsms" && (
              <>
                <div className="settings-field-group">
                  <div className="form-group">
                    <label className="form-label">PhilSMS API Token</label>
                    <input className="form-input" type="password" placeholder="Enter PhilSMS Token"
                      value={form.philsmsToken}
                      onChange={(e) => { setForm((f) => ({ ...f, philsmsToken: e.target.value })); setTestResult(null); }}
                      spellCheck={false} />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Get your token from your philsms.com account dashboard.</span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sender Name (Optional)</label>
                    <input className="form-input" type="text" placeholder="e.g. CompanyName"
                      value={form.philsmsSenderName}
                      onChange={(e) => { setForm((f) => ({ ...f, philsmsSenderName: e.target.value })); setTestResult(null); }}
                      spellCheck={false} />
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <button className="btn btn-outline" onClick={handleTestWebhook} disabled={testing || !form.philsmsToken.trim()} style={{ fontSize: "0.8rem" }}>
                      {testing ? "⏳ Testing..." : "🔌 Test PhilSMS connection"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={checkingPhilSmsCredits || !form.philsmsToken.trim()}
                      style={{ fontSize: "0.8rem" }}
                      onClick={async () => {
                        setCheckingPhilSmsCredits(true);
                        setPhilsmsCreditsInfo(null);
                        try {
                          const info = await checkPhilSmsCredits(form.philsmsToken.trim());
                          setPhilsmsCreditsInfo(info);
                        } finally {
                          setCheckingPhilSmsCredits(false);
                        }
                      }}
                    >
                      {checkingPhilSmsCredits ? "⏳ Fetching..." : "💳 Check PhilSMS Balance"}
                    </button>
                    {testResult && <span style={{ fontSize: "0.78rem", fontWeight: 600, color: testResult.ok ? "var(--success)" : "var(--danger)" }}>{testResult.msg}</span>}
                  </div>

                  {philsmsCreditsInfo && (
                    <div style={{
                      marginTop: "0.75rem",
                      padding: "0.75rem 1rem",
                      background: philsmsCreditsInfo.error ? "rgba(239, 68, 68, 0.08)" : "var(--primary-dim)",
                      border: philsmsCreditsInfo.error ? "1px solid rgba(239, 68, 68, 0.25)" : "1px solid rgba(0, 212, 255, 0.25)",
                      borderRadius: "var(--radius-sm)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem"
                    }}>
                      <span style={{ fontSize: "1.3rem" }}>{philsmsCreditsInfo.error ? "⚠️" : "💰"}</span>
                      <div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>
                          PhilSMS Account Balance {philsmsCreditsInfo.accountName ? `• ${philsmsCreditsInfo.accountName}` : ""}
                        </div>
                        {philsmsCreditsInfo.error ? (
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--danger)" }}>
                            {philsmsCreditsInfo.error}
                          </div>
                        ) : (
                          <div style={{ fontSize: "1.05rem", fontWeight: 800, color: (typeof philsmsCreditsInfo.credits === "number" && philsmsCreditsInfo.credits <= 20) ? "var(--danger)" : "var(--primary)" }}>
                            {typeof philsmsCreditsInfo.credits === "number" ? `${philsmsCreditsInfo.credits.toLocaleString()} SMS Credits Available` : philsmsCreditsInfo.credits}
                          </div>
                        )}
                        {philsmsCreditsInfo.checkedAt && (
                          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                            Last queried at {philsmsCreditsInfo.checkedAt}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Mobile Phone Gateway ── */}
            {form.smsGateway === "mobile_gateway" && (
              <>
                <div className="settings-field-group">
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    <div className="form-group" style={{ flex: 2, minWidth: "200px" }}>
                      <label className="form-label">Phone IP Address (Local Wi-Fi)</label>
                      <input className="form-input" type="text" placeholder="e.g. 192.168.1.5"
                        value={form.mobileGatewayIp}
                        onChange={(e) => { setForm((f) => ({ ...f, mobileGatewayIp: e.target.value })); setTestResult(null); }} />
                    </div>
                    <div className="form-group" style={{ flex: 1, minWidth: "100px" }}>
                      <label className="form-label">Port</label>
                      <input className="form-input" type="text" placeholder="8080"
                        value={form.mobileGatewayPort}
                        onChange={(e) => { setForm((f) => ({ ...f, mobileGatewayPort: e.target.value })); setTestResult(null); }} />
                    </div>
                  </div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Works with Android SMS Gateway apps (e.g. SMSGG) and iPhone SMS Mobile API app. The phone must be on the same Wi-Fi network.</span>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem" }}>
                    <button className="btn btn-outline" onClick={handleTestWebhook} disabled={testing || !form.mobileGatewayIp.trim()} style={{ fontSize: "0.8rem" }}>
                      {testing ? "⏳ Testing..." : "🔌 Test Mobile Gateway"}
                    </button>
                    {testResult && <span style={{ fontSize: "0.78rem", fontWeight: 600, color: testResult.ok ? "var(--success)" : "var(--danger)" }}>{testResult.msg}</span>}
                  </div>
                </div>
              </>
            )}

            {/* ── Warning banners ── */}
            {form.smsGateway === "webhook" && !form.smsWebhookUrl.trim() && (
              <div style={{ padding: "0.85rem 1rem", background: "var(--warning-dim)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", color: "var(--warning)", lineHeight: 1.6 }}>
                ⚠️ <strong>No Webhook configured</strong> — SMS notifications are logged as <em>"Pending"</em> and not actually sent until a webhook is saved.
              </div>
            )}
            {form.smsGateway === "semaphore" && !form.semaphoreApiKey.trim() && (
              <div style={{ padding: "0.85rem 1rem", background: "var(--warning-dim)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", color: "var(--warning)", lineHeight: 1.6 }}>
                ⚠️ <strong>No API Key configured</strong> — SMS notifications are logged as <em>"Pending"</em> until a Semaphore key is saved.
              </div>
            )}
            {form.smsGateway === "unisms" && !form.unismsApiKey.trim() && (
              <div style={{ padding: "0.85rem 1rem", background: "var(--warning-dim)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", color: "var(--warning)", lineHeight: 1.6 }}>
                ⚠️ <strong>No API Key configured</strong> — SMS notifications are logged as <em>"Pending"</em> until a UniSMS key is saved.
              </div>
            )}
            {form.smsGateway === "philsms" && !form.philsmsToken.trim() && (
              <div style={{ padding: "0.85rem 1rem", background: "var(--warning-dim)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", color: "var(--warning)", lineHeight: 1.6 }}>
                ⚠️ <strong>No Token configured</strong> — SMS notifications are logged as <em>"Pending"</em> until a PhilSMS token is saved.
              </div>
            )}
            {form.smsGateway === "mobile_gateway" && !form.mobileGatewayIp.trim() && (
              <div style={{ padding: "0.85rem 1rem", background: "var(--warning-dim)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", color: "var(--warning)", lineHeight: 1.6 }}>
                ⚠️ <strong>No IP Address configured</strong> — Make sure the phone running the SMS gateway app is on the same Wi-Fi and its IP is set above.
              </div>
            )}
          </div>
        )}

        {/* ── TAB 4.5: USERS & ROLES ── */}
        {activeTab === "users" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            <UserManagement db={db} branches={branches} />
            <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.5rem 0" }} />
            <RoleManagement db={db} />
          </div>
        )}

        {/* ── TAB 5: SHARED DATABASE ── */}
        {activeTab === "database" && (
          <DatabaseTabSection />
        )}

        {/* ── TAB 6: FILE STORAGE ── */}
        {activeTab === "storage" && (
          <StorageTabSection />
        )}

        {/* ── TAB 7: LICENSE & PAYMENT ── */}
        {activeTab === "license" && (
          <LicenseTabSection onVerificationChange={(isOk) => setIsLicensedAndPaid(isOk)} />
        )}

        {/* ── TAB 8: DEV SETTINGS ── */}
        {activeTab === "developer" && (
          <DevSettingsTabSection />
        )}

      </div>

      {activeSignatoryPad && (
        <SignaturePadModal
          role={activeSignatoryPad.role}
          title={activeSignatoryPad.title}
          currentImg={activeSignatoryPad.currentImg}
          onSave={(dataUrl) => {
            if (activeSignatoryPad.role === "Prepared") {
              setSigPreparedByImg(dataUrl);
              localStorage.setItem("neugate_sig_prepared_by_img", dataUrl);
            } else if (activeSignatoryPad.role === "Checked") {
              setSigCheckedByImg(dataUrl);
              localStorage.setItem("neugate_sig_checked_by_img", dataUrl);
            } else if (activeSignatoryPad.role === "Approved") {
              setSigApprovedByImg(dataUrl);
              localStorage.setItem("neugate_sig_approved_by_img", dataUrl);
            }
          }}
          onClose={() => setActiveSignatoryPad(null)}
        />
      )}
    </div>
  );
}

function DatabaseTabSection() {
  const [currentDbPath, setCurrentDbPath] = useState("");
  const [customDbPathSetting, setCustomDbPathSetting] = useState("");
  const [postgresConnString, setPostgresConnString] = useState("");
  const [mssqlConnString, setMssqlConnString] = useState("");
  const [loading, setLoading] = useState(false);
  const [testingPostgres, setTestingPostgres] = useState(false);
  const [testingMssql, setTestingMssql] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dbSubTab, setDbSubTab] = useState<"sqlite" | "postgres" | "mssql">("sqlite");

  const fetchDbDetails = async () => {
    try {
      const activeDb = String((await invoke<string>("get_current_db_path")) || "");
      const rawCustomDb = await invoke<string | null>("get_custom_db_path_setting");
      const customDb = typeof rawCustomDb === "string" ? rawCustomDb : "";
      setCurrentDbPath(activeDb);
      setCustomDbPathSetting(customDb);
      if (customDb && (customDb.startsWith("postgres://") || customDb.startsWith("postgresql://"))) {
        setPostgresConnString(customDb);
        setDbSubTab("postgres");
      } else if (customDb && (customDb.startsWith("mssql://") || customDb.startsWith("sqlserver://") || customDb.includes("Server=") || customDb.includes("Data Source="))) {
        setMssqlConnString(customDb);
        setDbSubTab("mssql");
      }
    } catch (err) {
      console.error("Failed to load DB settings", err);
    }
  };

  useEffect(() => {
    fetchDbDetails();
  }, []);

  const handleSelectSharedDb = async () => {
    setMsg(null);
    try {
      setLoading(true);
      const path = await invoke<string>("select_shared_db_location");
      setCustomDbPathSetting(path);
      setMsg({ type: "success", text: "Database location updated! Please restart the application to connect." });
      fetchDbDetails();
    } catch (err) {
      if (err !== "Selection cancelled") setMsg({ type: "error", text: "Failed to set DB path: " + err });
    } finally {
      setLoading(false);
    }
  };

  const isPostgresActive = customDbPathSetting.startsWith("postgres://") || customDbPathSetting.startsWith("postgresql://");

  const handleRevertToLocal = async () => {
    if (!confirm("Are you sure you want to revert to default local database storage?")) return;
    // copyToLocal only applies to shared .db files, not PostgreSQL
    const copyToLocal = isPostgresActive
      ? false
      : confirm("Would you like to COPY data from the shared database to local storage?");
    setMsg(null);
    try {
      setLoading(true);
      await invoke("clear_shared_db_location", { copy_to_local: copyToLocal });
      setCustomDbPathSetting("");
      setPostgresConnString("");
      setMssqlConnString("");
      setMsg({ type: "success", text: "Reverted database storage path! Please restart the application." });
      fetchDbDetails();
    } catch (err) {
      setMsg({ type: "error", text: "Failed to revert database path: " + err });
    } finally {
      setLoading(false);
    }
  };

  const handleTestPostgres = async () => {
    if (!postgresConnString.trim()) { setMsg({ type: "error", text: "Please enter a PostgreSQL connection URL first." }); return; }
    setMsg(null);
    try {
      setTestingPostgres(true);
      await invoke("test_postgres_connection", { connectionString: postgresConnString.trim() });
      setMsg({ type: "success", text: "⚡ Connection successful! PostgreSQL database is reachable." });
    } catch (err) {
      setMsg({ type: "error", text: "❌ Connection failed: " + err });
    } finally {
      setTestingPostgres(false);
    }
  };

  const handleSaveCloudDb = async () => {
    if (!postgresConnString.trim()) { setMsg({ type: "error", text: "Please enter a PostgreSQL connection URL first." }); return; }
    setMsg(null);
    try {
      setLoading(true);
      await invoke("save_custom_db_connection", { connectionString: postgresConnString.trim() });
      setMsg({ type: "success", text: "Cloud connection saved! Restart the app to connect to Cloud PostgreSQL." });
      fetchDbDetails();
    } catch (err) {
      setMsg({ type: "error", text: "Failed to save cloud connection: " + err });
    } finally {
      setLoading(false);
    }
  };

  const handleTestMssql = async () => {
    if (!mssqlConnString.trim()) { setMsg({ type: "error", text: "Please enter an MS SQL Server connection string first." }); return; }
    setMsg(null);
    try {
      setTestingMssql(true);
      await invoke("test_mssql_connection", { connectionString: mssqlConnString.trim() });
      setMsg({ type: "success", text: "⚡ Connection successful! Microsoft SQL Server database is reachable." });
    } catch (err) {
      setMsg({ type: "error", text: "❌ Connection failed: " + err });
    } finally {
      setTestingMssql(false);
    }
  };

  const handleSaveMssqlDb = async () => {
    if (!mssqlConnString.trim()) { setMsg({ type: "error", text: "Please enter an MS SQL Server connection string first." }); return; }
    setMsg(null);
    try {
      setLoading(true);
      await invoke("save_custom_db_connection", { connectionString: mssqlConnString.trim() });
      setMsg({ type: "success", text: "MS SQL Server connection saved! Restart the app to connect to MS SQL Server." });
      fetchDbDetails();
    } catch (err) {
      setMsg({ type: "error", text: "Failed to save MS SQL Server connection: " + err });
    } finally {
      setLoading(false);
    }
  };

  let activeEngineLabel = "Local Offline Storage";
  let activeEngineBadge = "📁 Local SQLite";
  const safeDbSetting = typeof customDbPathSetting === "string" ? customDbPathSetting : "";
  if (safeDbSetting) {
    if (safeDbSetting.startsWith("postgres://") || safeDbSetting.startsWith("postgresql://")) {
      activeEngineLabel = "Cloud Database (PostgreSQL)";
      activeEngineBadge = "☁️ PostgreSQL";
    } else if (safeDbSetting.startsWith("mssql://") || safeDbSetting.startsWith("sqlserver://") || safeDbSetting.includes("Server=")) {
      activeEngineLabel = "Office Database (MS SQL Server)";
      activeEngineBadge = "🏢 MS SQL Server";
    } else {
      activeEngineLabel = "Shared Network Storage";
      activeEngineBadge = "🌐 Shared LAN";
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div>
        <h3 style={{ margin: "0 0 0.35rem 0", color: "var(--text-main)" }}>🗄️ Database Connection</h3>
        <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-dim)" }}>
          Your application connects to <strong>one database at a time</strong>. Choose how you want to store and access your data below.
        </p>
      </div>

      {/* Active Connection Banner */}
      <div style={{
        padding: "1rem 1.25rem",
        background: "rgba(0, 212, 255, 0.06)",
        border: "1px solid rgba(0, 212, 255, 0.25)",
        borderRadius: "10px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.75rem"
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-dim)", fontWeight: 700 }}>
            CURRENT ACTIVE CONNECTION
          </div>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-main)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>{activeEngineLabel}</span>
            <span style={{
              fontSize: "0.75rem",
              padding: "0.2rem 0.6rem",
              borderRadius: "20px",
              background: "rgba(0, 212, 255, 0.18)",
              color: "var(--primary)",
              border: "1px solid rgba(0, 212, 255, 0.3)",
              fontWeight: 600
            }}>
              {activeEngineBadge}
            </span>
          </div>
          <div style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--text-dim)", wordBreak: "break-all", marginTop: "0.1rem" }}>
            {currentDbPath || "Connecting..."}
          </div>
        </div>

        {customDbPathSetting && !isPostgresActive && (
          <button
            onClick={handleRevertToLocal}
            className="btn btn-outline btn-sm"
            disabled={loading}
            style={{ fontSize: "0.78rem" }}
          >
            🔄 Switch Back to Local Computer
          </button>
        )}
      </div>

      {msg && (
        <div style={{
          padding: "0.85rem 1rem", borderRadius: "var(--radius-sm)",
          background: msg.type === "success" ? "rgba(16,185,129,0.15)" : "rgba(244,63,94,0.15)",
          border: `1px solid ${msg.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)"}`,
          color: msg.type === "success" ? "var(--success)" : "var(--danger)",
          fontSize: "0.85rem", fontWeight: 600,
        }}>
          {msg.text}
        </div>
      )}

      {/* Sub-Tab Bar */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
        {[
          { id: "sqlite", label: "📁 Local / Shared File" },
          { id: "postgres", label: "☁️ PostgreSQL (Cloud)" },
          { id: "mssql", label: "🏢 SQL Server (Office Network)" },
        ].map((tab) => {
          const isActive = dbSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDbSubTab(tab.id as any)}
              style={{
                padding: "0.55rem 0.9rem",
                borderRadius: "6px",
                border: isActive ? "1px solid rgba(0, 212, 255, 0.4)" : "1px solid transparent",
                background: isActive ? "rgba(0, 212, 255, 0.12)" : "rgba(255,255,255,0.02)",
                color: isActive ? "var(--primary)" : "var(--text-main)",
                fontSize: "0.82rem",
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-Tab 1: SQLite / Shared File */}
      {dbSubTab === "sqlite" && (
        <div style={{ padding: "1.25rem", background: "var(--bg-main)", borderRadius: "8px", border: "1px solid var(--border)" }}>
          <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem" }}>
            📁 Single Computer or Shared Network File
          </h4>
          <div style={{ fontSize: "0.78rem", background: "rgba(0, 212, 255, 0.08)", padding: "0.85rem 1rem", borderRadius: "var(--radius-sm)", border: "1px solid rgba(0, 212, 255, 0.2)", color: "var(--text-main)", lineHeight: 1.5 }}>
            <strong>How this works:</strong>
            <ul style={{ margin: "0.4rem 0 0 1.2rem", padding: 0 }}>
              <li><strong>Default Local:</strong> Data is saved safely on this computer.</li>
              <li><strong>Shared Network Folder:</strong> Select a database file in a shared folder so multiple computers on the same Wi-Fi or office network can share data.</li>
            </ul>
          </div>
          <div className="form-group" style={{ marginTop: "1rem" }}>
            <label className="form-label">Active File Path</label>
            <div style={{ fontFamily: "monospace", fontSize: "0.8rem", padding: "0.6rem 0.85rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", wordBreak: "break-all", color: "var(--primary)" }}>
              {currentDbPath || "Finding database file..."}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <button onClick={handleSelectSharedDb} className="btn btn-primary" disabled={loading} style={{ fontSize: "0.8rem" }}>
              📁 Select Shared File Location...
            </button>
            {!isPostgresActive && <button onClick={handleRevertToLocal} className="btn btn-outline" disabled={loading || !customDbPathSetting} style={{ fontSize: "0.8rem" }}>
              🔄 Switch Back to Local Computer
            </button>}
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Cloud / PostgreSQL */}
      {dbSubTab === "postgres" && (
        <div style={{ padding: "1.25rem", background: "var(--bg-main)", borderRadius: "8px", border: "1px solid var(--border)" }}>
          <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem" }}>
            ☁️ Cloud Database (PostgreSQL)
          </h4>
          <div style={{ fontSize: "0.78rem", background: "rgba(168, 85, 247, 0.08)", padding: "0.85rem 1rem", borderRadius: "var(--radius-sm)", border: "1px solid rgba(168, 85, 247, 0.2)", color: "var(--text-main)", lineHeight: 1.5 }}>
            <strong>Connect via Internet:</strong>
            <p style={{ margin: "0.3rem 0 0 0" }}>
              Use an online database (like Supabase, Neon, or AWS) to sync multiple offices or gate consoles over the internet.
            </p>
          </div>
          <div className="form-group" style={{ marginTop: "1rem" }}>
            <label className="form-label">Cloud Database Link (URL)</label>
            <textarea
              placeholder="postgres://user:password@hostname:5432/neugate?sslmode=require"
              value={postgresConnString}
              onChange={(e) => setPostgresConnString(e.target.value)}
              className="form-input"
              rows={3}
              style={{ fontFamily: "monospace", fontSize: "0.8rem" }}
              disabled={loading || testingPostgres}
            />
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <button onClick={handleTestPostgres} className="btn btn-outline" disabled={loading || testingPostgres} style={{ fontSize: "0.8rem" }}>
              {testingPostgres ? "Testing..." : "⚡ Test Connection"}
            </button>
            <button onClick={handleSaveCloudDb} className="btn btn-primary" disabled={loading || testingPostgres} style={{ fontSize: "0.8rem" }}>
              💾 Save &amp; Connect to Cloud
            </button>
          </div>
        </div>
      )}

      {/* Sub-Tab 3: Microsoft SQL Server */}
      {dbSubTab === "mssql" && (
        <div style={{ padding: "1.25rem", background: "var(--bg-main)", borderRadius: "8px", border: "1px solid var(--border)" }}>
          <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem" }}>
            🏢 Office Server Database (Microsoft SQL Server)
          </h4>
          <div style={{ fontSize: "0.78rem", background: "rgba(59, 130, 246, 0.08)", padding: "0.85rem 1rem", borderRadius: "var(--radius-sm)", border: "1px solid rgba(59, 130, 246, 0.2)", color: "var(--text-main)", lineHeight: 1.5 }}>
            <strong>Connect to Office Server:</strong>
            <p style={{ margin: "0.3rem 0 0 0" }}>
              Connect directly to your company's dedicated SQL Server.
            </p>
          </div>
          <div className="form-group" style={{ marginTop: "1rem" }}>
            <label className="form-label">MS SQL Server Connection String / URI</label>
            <textarea
              placeholder="Server=192.168.1.100,1433;Database=neugate;User Id=sa;Password=YourPassword;"
              value={mssqlConnString}
              onChange={(e) => setMssqlConnString(e.target.value)}
              className="form-input"
              rows={3}
              style={{ fontFamily: "monospace", fontSize: "0.8rem" }}
              disabled={loading || testingMssql}
            />
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <button onClick={handleTestMssql} className="btn btn-outline" disabled={loading || testingMssql} style={{ fontSize: "0.8rem" }}>
              {testingMssql ? "Testing MSSQL Connection..." : "⚡ Test MS SQL Connection"}
            </button>
            <button onClick={handleSaveMssqlDb} className="btn btn-primary" disabled={loading || testingMssql} style={{ fontSize: "0.8rem" }}>
              💾 Save &amp; Connect MS SQL Server
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StorageTabSection() {
  const [storageMode, setStorageMode] = useState<"local" | "sync_folder" | "s3">("local");
  const [syncFolderPath, setSyncFolderPath] = useState("");
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3SecretKey, setS3SecretKey] = useState("");
  const [s3Region, setS3Region] = useState("us-east-1");
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3Endpoint, setS3Endpoint] = useState("");
  const [savingStorage, setSavingStorage] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadConfig = async () => {
    try {
      const cfg = await invoke<{
        mode: string;
        sync_folder_path: string | null;
        s3_access_key: string | null;
        s3_secret_key: string | null;
        s3_region: string | null;
        s3_bucket: string | null;
        s3_endpoint: string | null;
      }>("get_storage_config");

      setStorageMode((cfg.mode as any) || "local");
      setSyncFolderPath(cfg.sync_folder_path || "");
      setS3AccessKey(cfg.s3_access_key || "");
      setS3SecretKey(cfg.s3_secret_key || "");
      setS3Region(cfg.s3_region || "us-east-1");
      setS3Bucket(cfg.s3_bucket || "");
      setS3Endpoint(cfg.s3_endpoint || "");
    } catch (err) {
      console.error("Failed to load storage config", err);
    }
  };

  useState(() => {
    loadConfig();
  });

  const handleSelectSyncFolder = async () => {
    try {
      const selected = await invoke<string | null>("select_sync_folder");
      if (selected) setSyncFolderPath(selected);
    } catch (err) {
      setMsg({ type: "error", text: "Failed to pick sync folder: " + err });
    }
  };

  const handleSaveStorage = async () => {
    setSavingStorage(true);
    setMsg(null);
    try {
      await invoke("save_storage_config", {
        config: {
          mode: storageMode,
          sync_folder_path: syncFolderPath || null,
          s3_access_key: s3AccessKey || null,
          s3_secret_key: s3SecretKey || null,
          s3_region: s3Region || null,
          s3_bucket: s3Bucket || null,
          s3_endpoint: s3Endpoint || null,
        },
      });
      setMsg({ type: "success", text: "💾 Centralized File Storage settings saved successfully!" });
    } catch (err) {
      setMsg({ type: "error", text: "Failed to save file storage settings: " + err });
    } finally {
      setSavingStorage(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {msg && (
        <div style={{
          padding: "0.85rem 1rem", borderRadius: "var(--radius-sm)",
          background: msg.type === "success" ? "var(--success-dim)" : "var(--danger-dim)",
          border: `1px solid ${msg.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)"}`,
          color: msg.type === "success" ? "var(--success)" : "var(--danger)",
          fontSize: "0.85rem", fontWeight: 600,
        }}>
          {msg.text}
        </div>
      )}

      <div className="settings-field-group">
        <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--text-primary)", fontSize: "0.95rem" }}>
          📁 Centralized File Storage Manager
        </h4>
        <p style={{ color: "var(--text-dim)", fontSize: "0.8rem", margin: "0 0 1rem 0" }}>
          Configure where employee photos, exported attendance logs, and attachments are stored and shared.
        </p>

        <div className="form-group" style={{ marginBottom: "1rem" }}>
          <label className="form-label">Storage Engine Mode</label>
          <select value={storageMode} onChange={(e) => setStorageMode(e.target.value as any)} className="form-input">
            <option value="local">Local AppData Directory (Default)</option>
            <option value="sync_folder">Shared / Cloud Synced Local Folder (OneDrive/Dropbox)</option>
            <option value="s3">AWS S3 / Compatible Object Storage (Supabase/MinIO)</option>
          </select>
        </div>

        {storageMode === "sync_folder" && (
          <div style={{ padding: "1rem", borderRadius: "var(--radius-sm)", border: "1px dashed var(--accent)", background: "rgba(0,212,255,0.04)", marginTop: "1rem" }}>
            <h5 style={{ margin: "0 0 0.4rem 0", fontSize: "0.88rem" }}>📁 Synced Folder Location</h5>
            <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", margin: "0 0 0.75rem 0" }}>
              Select a local path synced via Dropbox, OneDrive, or Google Drive. All photos &amp; files will automatically be saved here.
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input type="text" value={syncFolderPath} readOnly placeholder="No folder selected..." className="form-input" style={{ flex: 1 }} />
              <button onClick={handleSelectSyncFolder} className="btn btn-outline" style={{ fontSize: "0.8rem" }}>
                📂 Select Folder
              </button>
            </div>
          </div>
        )}

        {storageMode === "s3" && (
          <div style={{ padding: "1rem", borderRadius: "var(--radius-sm)", border: "1px dashed var(--accent)", background: "rgba(168,85,247,0.04)", marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <h5 style={{ margin: 0, fontSize: "0.88rem" }}>☁️ AWS S3 / Cloud Storage Settings</h5>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div className="form-group">
                <label className="form-label">Access Key ID</label>
                <input type="text" value={s3AccessKey} onChange={(e) => setS3AccessKey(e.target.value)} placeholder="e.g. AKIA..." className="form-input" />
              </div>
              <div className="form-group">
                <label className="form-label">Secret Access Key</label>
                <input type="password" value={s3SecretKey} onChange={(e) => setS3SecretKey(e.target.value)} placeholder="e.g. wJalrXUtnFEMI..." className="form-input" />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0.75rem" }}>
              <div className="form-group">
                <label className="form-label">Region</label>
                <input type="text" value={s3Region} onChange={(e) => setS3Region(e.target.value)} placeholder="us-east-1" className="form-input" />
              </div>
              <div className="form-group">
                <label className="form-label">Bucket Name</label>
                <input type="text" value={s3Bucket} onChange={(e) => setS3Bucket(e.target.value)} placeholder="e.g. company-rfid-assets" className="form-input" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Endpoint URL <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(Optional — for MinIO/Supabase)</span></label>
              <input type="text" value={s3Endpoint} onChange={(e) => setS3Endpoint(e.target.value)} placeholder="e.g. https://your-supabase-project.supabase.co/storage/v1/s3" className="form-input" />
            </div>
          </div>
        )}

        <div style={{ marginTop: "1.25rem" }}>
          <button onClick={handleSaveStorage} className="btn btn-primary" disabled={savingStorage} style={{ fontSize: "0.8rem" }}>
            💾 Save File Storage Config
          </button>
        </div>
      </div>
    </div>
  );
}

function LicenseTabSection({ onVerificationChange }: { onVerificationChange?: (isOk: boolean) => void }) {
  const [activeKey, setActiveKey] = useState<string>("");
  const [fingerprint, setFingerprint] = useState<string>("");
  const [checking, setChecking] = useState(false);
  const [serverData, setServerData] = useState<{
    license_number: string;
    app_name: string | null;
    type: string;
    is_active: boolean;
    payment_status: string;
    expires_at?: string;
    client_name?: string;
    client_email?: string;
    client_contact?: string;
    client?: {
      id: number;
      name: string;
      email: string;
      contact_number: string;
    };
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadLocalKeyAndVerify = async () => {
    try {
      const savedKey = localStorage.getItem("neugate_license_key") || "Not Activated";
      setActiveKey(savedKey);

      const fp = await invoke<string>("get_machine_fingerprint");
      setFingerprint(fp);

      if (savedKey && savedKey !== "Not Activated") {
        verifyOnline(savedKey, fp);
      }
    } catch (err) {
      console.error("Failed to fetch fingerprint", err);
    }
  };

  const verifyOnline = async (keyToVerify?: string, fpToUse?: string) => {
    let key = keyToVerify || activeKey;
    let fp = fpToUse || fingerprint;

    if (!fp) {
      fp = await invoke<string>("get_machine_fingerprint").catch(() => "");
      if (fp) setFingerprint(fp);
    }

    if (!key) {
      key = localStorage.getItem("neugate_license_key") || "";
      if (key) setActiveKey(key);
    }

    if (!key || key === "Not Activated") {
      setErrorMsg("No active license key saved locally. Please enter or generate a license key.");
      onVerificationChange?.(false);
      return;
    }

    setChecking(true);
    setErrorMsg(null);

    try {
      const res = await fetch("https://enterprise.neulify.com/api/licenses/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-App-Token": "neulify_desktop_app_secret_token_2026",
        },
        body: JSON.stringify({
          license_key: key.trim(),
          machine_id: fp,
          app_name: 'NeuGate',
        }),
      });

      const data = await res.json();

      if (res.ok && data.status === "success") {
        setServerData(data.data);
        const isValidAndPaid = !!data.data?.is_active && (data.data?.payment_status === "paid" || data.data?.payment_status === "trial");
        onVerificationChange?.(isValidAndPaid);
      } else {
        setErrorMsg(data.message || "Server verification failed");
        onVerificationChange?.(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to connect to license verification server");
      onVerificationChange?.(false);
    } finally {
      setChecking(false);
    }
  };

  useState(() => {
    loadLocalKeyAndVerify();
  });

  const renderPaymentBadge = (status: string, expiresAt?: string | null) => {
    let label = "Unpaid";
    let color = "var(--text-main)";
    if (status === "paid") {
      label = "Paid";
      color = "#10b981";
    } else if (status === "trial") {
      label = `🧪 Trial Mode${expiresAt ? ` (Expires: ${new Date(expiresAt).toLocaleDateString()})` : ""}`;
      color = "#06b6d4";
    } else if (status === "partially_paid") {
      label = "Partially Paid";
    }

    return (
      <span style={{ fontSize: "0.82rem", color: color, fontWeight: 600 }}>
        {label}
      </span>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* License & Payment Status Overview */}
      <div className="settings-field-group">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h4 style={{ margin: 0, color: "var(--text-primary)", fontSize: "0.95rem" }}>
            🔑 License Key Details &amp; Payment Status
          </h4>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              className="btn btn-outline"
              onClick={async () => {
                try {
                  const { openUrl } = await import("@tauri-apps/plugin-opener");
                  await openUrl("https://enterprise.neulify.com/license-portal");
                } catch (_) {
                  window.open("https://enterprise.neulify.com/license-portal", "_blank");
                }
              }}
              style={{ fontSize: "0.78rem", color: "var(--primary-color)", borderColor: "var(--primary-color)" }}
            >
              🌐 Open License Portal
            </button>
            <button
              className="btn btn-outline"
              onClick={() => {
                const savedKey = localStorage.getItem("neugate_license_key");
                if (savedKey) verifyOnline(savedKey);
              }}
              disabled={checking}
              style={{ fontSize: "0.78rem" }}
            >
              {checking ? "⏳ Syncing..." : "🔄 Sync License Status"}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div style={{ padding: "0.75rem", background: "rgba(244, 63, 94, 0.1)", border: "1px solid rgba(244, 63, 94, 0.3)", borderRadius: "var(--radius-sm)", color: "#f43f5e", fontSize: "0.82rem", marginBottom: "1rem" }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Dynamic Account Details Grid */}
        {serverData && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", fontSize: "0.8rem", padding: "0.85rem", background: "rgba(255,255,255,0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", marginBottom: "1rem" }}>
            <div>
              <div style={{ color: "var(--text-dim)", marginBottom: "0.2rem" }}>Registered Client</div>
              <strong style={{ color: "var(--text-main)", display: "block" }}>
                {serverData.client_name || serverData.client?.name || "NeuGate Licensee"}
              </strong>
            </div>
            <div>
              <div style={{ color: "var(--text-dim)", marginBottom: "0.2rem" }}>Contact Particulars</div>
              <div style={{ color: "var(--text-main)", fontSize: "0.78rem" }}>
                <div>📧 {serverData.client_email || serverData.client?.email || "N/A"}</div>
                <div>📞 {serverData.client_contact || serverData.client?.contact_number || "N/A"}</div>
              </div>
            </div>
            <div>
              <div style={{ color: "var(--text-dim)", marginBottom: "0.2rem" }}>Payment Status</div>
              {renderPaymentBadge(serverData.payment_status, serverData.expires_at)}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{ padding: "1rem", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.4rem" }}>Registered Client</div>
            <strong style={{ fontSize: "0.88rem", color: "var(--text-main)", display: "block" }}>
              {serverData?.client_name || serverData?.client?.name || "NeuGate Licensee"}
            </strong>
          </div>

          <div style={{ padding: "1rem", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.4rem" }}>Contact Particulars</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-main)" }}>
              <div>📧 {serverData?.client_email || serverData?.client?.email || "N/A"}</div>
              <div>📞 {serverData?.client_contact || serverData?.client?.contact_number || "N/A"}</div>
            </div>
          </div>

          <div style={{ padding: "1rem", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.4rem" }}>Activation Status</div>
            {(() => {
              const isLocallySaved = activeKey && activeKey !== "Not Activated";
              const isInvalid = errorMsg || (serverData && !serverData.is_active);
              const isSuccess = isLocallySaved && !isInvalid && (serverData ? (serverData.is_active && (serverData.payment_status === "paid" || serverData.payment_status === "trial")) : true);

              return (
                <span style={{
                  padding: "0.25rem 0.75rem", borderRadius: "999px",
                  background: isSuccess ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)",
                  color: isSuccess ? "#10b981" : "#f43f5e",
                  fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase",
                }}>
                  {!isLocallySaved ? "Unactivated" : isInvalid ? "Invalid / Inactive License" : "Licensed / Activated"}
                </span>
              );
            })()}
          </div>

          <div style={{ padding: "1rem", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.4rem" }}>Account Status</div>
            <div>
              {serverData ? renderPaymentBadge(serverData.payment_status, serverData.expires_at) : (
                <span style={{ fontSize: "0.85rem", color: "var(--text-dim)", fontWeight: 600 }}>
                  {checking ? "Verifying..." : "—"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Note on unlocking settings tabs - only visible if conditions are NOT met */}
        {(!serverData || !serverData.is_active || (serverData.payment_status !== "paid" && serverData.payment_status !== "trial")) && (
          <div style={{
            padding: "0.75rem 1rem",
            background: "rgba(0, 212, 255, 0.05)",
            border: "1px solid rgba(0, 212, 255, 0.2)",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.78rem",
            color: "var(--text-main)",
            lineHeight: 1.5,
            marginBottom: "1rem"
          }}>
            💡 <strong>How to unlock all settings:</strong> Your license key must be <strong>Active</strong> and Account Status must be <strong>Paid</strong>. If you have recently paid or updated your license, click <strong>"🔄 Sync License Status"</strong> above to refresh and unlock all settings tabs.
          </div>
        )}

        {errorMsg && (
          <div style={{ fontSize: "0.8rem", color: "var(--danger)", background: "rgba(244, 63, 94, 0.1)", padding: "0.6rem 0.85rem", borderRadius: "var(--radius-sm)", marginBottom: "1rem" }}>
            ⚠️ {errorMsg}
          </div>
        )}

        <div className="form-group" style={{ marginTop: "0.5rem" }}>
          <label className="form-label">Active License Key</label>
          <input type="text" className="form-input" value={activeKey} readOnly style={{ fontFamily: "monospace", letterSpacing: "0.05em", fontWeight: 600 }} />
        </div>

        <div className="form-group" style={{ marginTop: "0.75rem" }}>
          <label className="form-label">Hardware Machine Fingerprint (UUID)</label>
          <input type="text" className="form-input" value={fingerprint} readOnly style={{ fontFamily: "monospace", letterSpacing: "0.05em" }} />
          <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.3rem", display: "block" }}>
            Locked to this hardware UUID for node-locked security.
          </span>
        </div>
      </div>

      <AutoUpdater />
    </div>
  );
}

function DevSettingsTabSection() {
  const [webhookEnabled, setWebhookEnabled] = useState(
    () => localStorage.getItem("neugate_dev_webhook_enabled") === "true"
  );
  const [webhookUrl, setWebhookUrl] = useState(
    () => localStorage.getItem("neugate_dev_webhook_url") || ""
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSave = () => {
    localStorage.setItem("neugate_dev_webhook_enabled", String(webhookEnabled));
    localStorage.setItem("neugate_dev_webhook_url", webhookUrl.trim());
    setTestResult({ ok: true, msg: "✅ Dev settings saved successfully." });
    setTimeout(() => setTestResult(null), 3000);
  };

  const handleTestConnection = async () => {
    if (!webhookUrl.trim()) {
      setTestResult({ ok: false, msg: "❌ Please enter a webhook URL first." });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const fp = await invoke<string>("get_machine_fingerprint").catch(() => "");
      const res = await fetch(webhookUrl.trim(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "test_connection",
          timestamp: new Date().toISOString(),
          company_name: localStorage.getItem("neugate_school_name") || "Acme Corporation",
          school_name: localStorage.getItem("neugate_school_name") || "Acme Corporation",
          license_key: localStorage.getItem("neugate_license_key") || undefined,
          machine_fingerprint: fp,
        }),
      });

      if (res.ok) {
        setTestResult({ ok: true, msg: `✅ Test webhook sent successfully (HTTP ${res.status}).` });
      } else {
        setTestResult({ ok: false, msg: `❌ Webhook returned HTTP ${res.status}.` });
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: `❌ Connection failed: ${err.message || "Network error"}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div className="settings-field-group">
        <h4 style={{ marginTop: 0, marginBottom: "0.5rem" }}>🛠️ Developer Settings</h4>
        <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", margin: "0 0 1.25rem 0" }}>
          Configure developer options and real-time event webhooks for external platforms like n8n, Zapier, or custom APIs.
        </p>

        {/* Webhook Toggle & Form */}
        <div style={{ padding: "1.25rem", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>⚡ Automation &amp; Webhook Integration</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
                Trigger automated workflows in n8n, Zapier, Make, or custom servers on RFID tap events &amp; employee updates.
              </div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={webhookEnabled}
                onChange={(e) => setWebhookEnabled(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          {webhookEnabled && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
              <div className="form-group">
                <label className="form-label">Webhook Endpoint URL</label>
                <input
                  type="text"
                  className="form-input"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://n8n.yourdomain.com/webhook/gate-events"
                  style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
                />
                <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.3rem", display: "block" }}>
                  Receives HTTP POST JSON payloads for RFID gate taps (IN/OUT), employee registration, and system events.
                </span>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <button className="btn btn-primary" onClick={handleSave} style={{ fontSize: "0.8rem" }}>
                  💾 Save Webhook
                </button>
                <button className="btn btn-outline" onClick={handleTestConnection} disabled={testing || !webhookUrl.trim()} style={{ fontSize: "0.8rem" }}>
                  {testing ? "⏳ Testing..." : "🔌 Test Connection"}
                </button>
              </div>

              {testResult && (
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: testResult.ok ? "var(--success)" : "var(--danger)", marginTop: "0.25rem" }}>
                  {testResult.msg}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignaturePadModal({
  role: _role,
  title,
  currentImg: _currentImg,
  onSave,
  onClose,
}: {
  role: "Prepared" | "Checked" | "Approved";
  title: string;
  currentImg: string;
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const [hasDrawn, setHasDrawn] = React.useState(false);
  const [penColor, setPenColor] = React.useState<"dark" | "blue" | "white">("dark");

  const getStrokeStyle = (color: "dark" | "blue" | "white") => {
    if (color === "blue") return "#1d4ed8";
    if (color === "white") return "#ffffff";
    return "#0f172a";
  };

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = getStrokeStyle(penColor);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [penColor]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    setHasDrawn(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = getStrokeStyle(penColor);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSaveCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/png"));
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Signature image should be smaller than 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          onSave(reader.result);
          onClose();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const padBg = penColor === "white" ? "#0f172a" : "#ffffff";
  const guideLineColor = penColor === "white" ? "rgba(255,255,255,0.25)" : "#94a3b8";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "var(--bg-card)",
          color: "var(--text-main)",
          border: "1px solid var(--border)",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "520px",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.2rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, color: "var(--primary)", fontSize: "1.1rem", fontWeight: 800 }}>
              ✍️ Digital Signature Pad ({title})
            </h3>
            <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.25rem" }}>
              Draw signature below using touchpad/mouse or upload a transparent PNG.
            </div>
          </div>
          <button type="button" className="btn btn-outline" style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem" }} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Ink Style Selection */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-main)", padding: "0.5rem 0.75rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-dim)" }}>✒️ Pen Ink Color:</span>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button
              type="button"
              className={`btn ${penColor === "dark" ? "btn-primary" : "btn-outline"}`}
              style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }}
              onClick={() => { setPenColor("dark"); clearCanvas(); }}
            >
              ● Black / Dark Ink
            </button>
            <button
              type="button"
              className={`btn ${penColor === "blue" ? "btn-primary" : "btn-outline"}`}
              style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }}
              onClick={() => { setPenColor("blue"); clearCanvas(); }}
            >
              ● Royal Blue
            </button>
            <button
              type="button"
              className={`btn ${penColor === "white" ? "btn-primary" : "btn-outline"}`}
              style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }}
              onClick={() => { setPenColor("white"); clearCanvas(); }}
            >
              ○ White Ink
            </button>
          </div>
        </div>

        {/* Canvas Drawing Area */}
        <div
          style={{
            background: padBg,
            borderRadius: "8px",
            border: "2px dashed var(--border)",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.2s",
          }}
        >
          <canvas
            ref={canvasRef}
            width={480}
            height={180}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            style={{ touchAction: "none", cursor: "crosshair", display: "block", width: "100%", height: "180px" }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "12px",
              left: "20px",
              right: "20px",
              borderTop: `1px dashed ${guideLineColor}`,
              pointerEvents: "none",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: "0.68rem", color: penColor === "white" ? "#94a3b8" : "#64748b", background: padBg, padding: "0 6px", transform: "translateY(-50%)" }}>
              Sign above line
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="btn btn-outline" style={{ fontSize: "0.78rem" }} onClick={clearCanvas}>
              🧹 Clear Pad
            </button>
            <label className="btn btn-outline" style={{ cursor: "pointer", fontSize: "0.78rem" }}>
              📁 Upload PNG
              <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: "none" }} />
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="btn btn-outline" style={{ fontSize: "0.78rem" }} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" style={{ fontSize: "0.78rem" }} onClick={handleSaveCanvas} disabled={!hasDrawn}>
              💾 Save Signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


