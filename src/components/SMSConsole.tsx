import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { checkActiveGatewayCredits, SmsCreditInfo } from "../utils/smsCredits";

interface SMSConsoleProps {
  onNavigateToSettings?: () => void;
  smsLogs?: any[];
  onDelete?: (id: any) => void;
  onClearAll?: () => void;
  [key: string]: any;
}

export default function SmsConsole(props: SMSConsoleProps = {}) {
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<"sms" | "telegram" | "whatsapp" | "signal" | "viber">(() => {
    const gateway = localStorage.getItem("neugate_sms_gateway") || "semaphore";
    if (gateway === "telegram") return "telegram";
    if (gateway === "whatsapp") return "whatsapp";
    if (gateway === "signal") return "signal";
    if (gateway === "viber") return "viber";
    return "sms";
  });
  const [logs, setLogs] = useState<{ id: string; recipient: string; message: string; channel: string; status: string; timestamp: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [creditInfo, setCreditInfo] = useState<SmsCreditInfo | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);

  const fetchCredits = async () => {
    setLoadingCredits(true);
    try {
      const info = await checkActiveGatewayCredits();
      setCreditInfo(info);
    } catch (err: any) {
      console.error("[SMS Credits Error]:", err);
    } finally {
      setLoadingCredits(false);
    }
  };

  useEffect(() => {
    fetchCredits();
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim() || !message.trim()) return;

    setSending(true);

    try {
      if (channel === "sms") {
        const gateway = localStorage.getItem("neugate_sms_gateway") || "webhook";
        if (gateway === "semaphore") {
          const apiKey = localStorage.getItem("neugate_semaphore_api_key") || "";
          const sender = localStorage.getItem("neugate_semaphore_sender_name") || "";
          if (!apiKey) throw new Error("Semaphore API key is missing. Configure it in SMS Settings.");
          const params = new URLSearchParams();
          params.append("apikey", apiKey.trim());
          params.append("number", recipient.trim());
          params.append("message", message.trim());
          if (sender.trim()) params.append("sendername", sender.trim());
          const res = await fetch("https://api.semaphore.co/api/v4/messages", { method: "POST", body: params });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(`Semaphore error: ${data.message || res.statusText}`);
          }
        } else if (gateway === "unisms") {
          const apiKey = localStorage.getItem("neugate_unisms_api_key") || "";
          const sender = localStorage.getItem("neugate_unisms_sender_name") || "";
          if (!apiKey) throw new Error("UniSMS API key is missing. Configure it in SMS Settings.");
          try {
            await invoke("send_unisms_sms", {
              apiKey: apiKey.trim(),
              recipient: recipient.trim(),
              content: message.trim(),
              senderId: sender.trim() || null,
            });
          } catch {
            const res = await fetch("https://unismsapi.com/api/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                api_key: apiKey.trim(),
                recipient: recipient.trim(),
                message: message.trim(),
                sender_id: sender.trim() || undefined,
              }),
            });
            if (!res.ok) throw new Error(`UniSMS dispatch error: ${res.statusText}`);
          }
        } else if (gateway === "philsms") {
          const token = localStorage.getItem("neugate_philsms_token") || "";
          const sender = localStorage.getItem("neugate_philsms_sender_name") || "";
          if (!token) throw new Error("PhilSMS Token is missing. Configure it in SMS Settings.");
          const res = await fetch("https://app.philsms.com/api/v3/sms/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: token.trim(),
              to: recipient.trim(),
              message: message.trim(),
              from: sender.trim() || undefined,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(`PhilSMS error: ${data.message || res.statusText}`);
          }
        } else if (gateway === "webhook") {
          const webhookUrl = localStorage.getItem("neugate_sms_webhook") || "";
          if (webhookUrl) {
            await fetch(webhookUrl.trim(), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ to: recipient.trim(), message: message.trim(), type: "MANUAL" }),
            });
          }
        }

        // Auto-refresh credits
        setTimeout(() => fetchCredits(), 1200);
      } else if (channel === "telegram") {
        const botToken = localStorage.getItem("neugate_telegram_bot_token") || "";
        const defaultChat = localStorage.getItem("neugate_telegram_chat_id") || "";
        const target = recipient.trim() || defaultChat.trim();
        if (botToken && target) {
          await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: target, text: message, parse_mode: "HTML" }),
          });
        }
      } else if (channel === "whatsapp") {
        const mode = localStorage.getItem("neugate_whatsapp_mode") || "cloud_api";
        const token = localStorage.getItem("neugate_whatsapp_token") || "";
        const phoneId = localStorage.getItem("neugate_whatsapp_phone_id") || "";
        const customUrl = localStorage.getItem("neugate_whatsapp_custom_url") || "";

        if (mode === "cloud_api" && token && phoneId) {
          await fetch(`https://graph.facebook.com/v18.0/${phoneId.trim()}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token.trim()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: recipient.replace(/[^0-9]/g, ""),
              type: "text",
              text: { body: message },
            }),
          });
        } else if (customUrl) {
          await fetch(customUrl.trim(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: recipient, message }),
          });
        }
      } else if (channel === "signal") {
        const apiUrl = localStorage.getItem("neugate_signal_api_url") || "http://localhost:8080";
        const sender = localStorage.getItem("neugate_signal_sender_number") || "";
        if (apiUrl) {
          await fetch(`${apiUrl.trim().replace(/\/+$/, "")}/v2/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: message,
              number: sender.trim(),
              recipients: [recipient.trim()],
            }),
          });
        }
      } else if (channel === "viber") {
        const token = localStorage.getItem("neugate_viber_auth_token") || "";
        const sender = localStorage.getItem("neugate_viber_sender_name") || "NeuApp";
        if (token) {
          await fetch("https://chatapi.viber.com/pa/send_message", {
            method: "POST",
            headers: {
              "X-Viber-Auth-Token": token.trim(),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              receiver: recipient.trim(),
              min_api_version: 1,
              type: "text",
              sender: { name: sender.trim() },
              text: message,
            }),
          });
        }
      }

      const newLog = {
        id: `msg-${Date.now()}`,
        recipient: recipient.trim(),
        message: message.trim(),
        channel: channel.toUpperCase(),
        status: "SENT",
        timestamp: new Date().toLocaleTimeString(),
      };
      setLogs((prev) => [newLog, ...prev]);
      setRecipient("");
      setMessage("");
    } catch (err: any) {
      console.error("[Messaging Console Error]:", err);
      alert(err.message || "Failed to dispatch message");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-main)", margin: "0 0 0.35rem 0" }}>
          💬 Multi-Channel Messaging &amp; Alert Console
        </h2>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-dim)" }}>
          Send instant notifications via SMS Gateway, Telegram Bot, WhatsApp, Signal, or Viber.
        </p>
      </div>

      {/* 💳 SMS Gateway & Live Credit Status Card */}
      <div
        style={{
          background: "var(--bg-card, rgba(255, 255, 255, 0.03))",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "1rem 1.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div
            style={{
              width: "46px",
              height: "46px",
              borderRadius: "10px",
              background: "var(--primary-dim, rgba(0, 212, 255, 0.1))",
              border: "1px solid rgba(0, 212, 255, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.45rem",
              flexShrink: 0,
            }}
          >
            💳
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-dim)" }}>
                Active SMS Gateway
              </span>
              <span className="badge badge-primary" style={{ textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.5px" }}>
                {creditInfo?.gateway || localStorage.getItem("neugate_sms_gateway") || "Not Configured"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
              {loadingCredits ? (
                <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-muted)" }}>
                  ⏳ Checking remaining credits...
                </span>
              ) : creditInfo?.error ? (
                <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--danger)" }}>
                  ⚠️ {creditInfo.error}
                </span>
              ) : creditInfo?.credits !== undefined && creditInfo?.credits !== null ? (
                <>
                  <span
                    style={{
                      fontSize: "1.35rem",
                      fontWeight: 800,
                      color:
                        typeof creditInfo.credits === "number" && creditInfo.credits <= 20
                          ? "var(--danger)"
                          : "var(--primary)",
                    }}
                  >
                    {typeof creditInfo.credits === "number"
                      ? `${creditInfo.credits.toLocaleString()} SMS Credits Left`
                      : creditInfo.credits}
                  </span>
                  {creditInfo.accountName && (
                    <span style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontWeight: 600 }}>
                      • {creditInfo.accountName}
                    </span>
                  )}
                </>
              ) : (
                <span style={{ fontSize: "0.95rem", color: "var(--text-muted)" }}>
                  Click refresh to check remaining credits
                </span>
              )}
            </div>
            {creditInfo?.checkedAt && (
              <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
                Last checked at {creditInfo.checkedAt}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={fetchCredits}
            disabled={loadingCredits}
            style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.5rem 0.85rem" }}
          >
            {loadingCredits ? "⏳ Refreshing..." : "🔄 Refresh Balance"}
          </button>
          {props.onNavigateToSettings && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={props.onNavigateToSettings}
              style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.5rem 0.85rem" }}
            >
              ⚙️ SMS Settings
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "1.5rem" }}>
        {/* Send Form */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.5rem" }}>
          <h3 style={{ margin: "0 0 1.25rem 0", color: "var(--text-main)", fontSize: "1.1rem" }}>📲 Compose Message</h3>
          <form onSubmit={handleSendMessage} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="form-group">
              <label className="form-label">Dispatch Channel</label>
              <select
                className="form-select"
                value={channel}
                onChange={(e) => setChannel(e.target.value as any)}
              >
                <option value="sms">📱 SMS Gateway (Semaphore/UniSMS/PhilSMS)</option>
                <option value="telegram">Telegram Bot API</option>
                <option value="whatsapp">WhatsApp Business API</option>
                <option value="signal">Signal Messenger (signal-cli)</option>
                <option value="viber">Viber Business API</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">
                {channel === "telegram"
                  ? "Recipient Chat ID / Username"
                  : channel === "signal"
                  ? "Recipient Signal Phone Number"
                  : channel === "viber"
                  ? "Recipient Viber Phone Number / User ID"
                  : "Recipient Mobile Number"}
              </label>
              <input
                type="text"
                required
                className="form-input"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={
                  channel === "telegram"
                    ? "e.g. 123456789 or @chatname"
                    : channel === "signal"
                    ? "e.g. +639171234567"
                    : channel === "viber"
                    ? "e.g. +639171234567 or Viber ID"
                    : "e.g. 09171234567"
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Message Body</label>
              <textarea
                required
                rows={4}
                className="form-input"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type notification message here..."
                style={{ resize: "vertical", fontFamily: "inherit" }}
              />
              <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", alignSelf: "flex-end", marginTop: "0.25rem" }}>
                {message.length} characters
              </span>
            </div>

            <button type="submit" className="btn btn-primary" disabled={sending} style={{ padding: "0.75rem", fontWeight: 700 }}>
              {sending ? "⏳ Dispatching Message..." : `🚀 Dispatch via ${channel.toUpperCase()}`}
            </button>
          </form>
        </div>

        {/* Messaging Logs Table */}
        <div className="table-card" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--text-main)" }}>
            📜 Outbound Dispatch Activity Logs
          </div>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Channel</th>
                <th>Recipient</th>
                <th>Message Content</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-dim)" }}>
                    No outbound messages sent yet in this session.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>{log.timestamp}</td>
                    <td>
                      <span className="badge badge-primary">{log.channel}</span>
                    </td>
                    <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{log.recipient}</td>
                    <td style={{ fontSize: "0.82rem", color: "var(--text-main)", maxWidth: "180px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{log.message}</td>
                    <td>
                      <span className="badge badge-success">✅ {log.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
