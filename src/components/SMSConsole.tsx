import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { checkActiveGatewayCredits, SmsCreditInfo } from "../utils/smsCredits";
import SmsCreditsCard from "./SmsCreditsCard";

interface SMSConsoleProps {
  onNavigateToSettings?: () => void;
  smsLogs?: any[];
  onDelete?: (id: any) => void;
  onClearAll?: () => void;
  [key: string]: any;
}

export default function SmsConsole(_props: SMSConsoleProps = {}) {
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [logs, setLogs] = useState<{ id: string; recipient: string; message: string; gateway: string; status: string; timestamp: string }[]>([]);
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
      const gateway = localStorage.getItem("neugate_sms_gateway") || "semaphore";

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
        if (!webhookUrl) throw new Error("Webhook URL is missing. Configure it in SMS Settings.");
        await fetch(webhookUrl.trim(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: recipient.trim(), message: message.trim(), type: "MANUAL" }),
        });
      }

      // Auto-refresh credits
      setTimeout(() => fetchCredits(), 1200);

      const newLog = {
        id: `sms-${Date.now()}`,
        recipient: recipient.trim(),
        message: message.trim(),
        gateway: (gateway || "SMS").toUpperCase(),
        status: "SENT",
        timestamp: new Date().toLocaleTimeString(),
      };
      setLogs((prev) => [newLog, ...prev]);
      setRecipient("");
      setMessage("");
    } catch (err: any) {
      console.error("[SMS Console Error]:", err);
      alert(err.message || "Failed to dispatch SMS");
    } finally {
      setSending(false);
    }
  };

  const smsSegments = Math.ceil(message.length / 160) || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-main)", margin: "0 0 0.35rem 0" }}>
          💬 SMS Console &amp; Outbound Dispatch
        </h2>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-dim)" }}>
          Send direct SMS alerts and notifications through your configured SMS gateway.
        </p>
      </div>

      {/* 💳 SMS Gateway & Live Credit Status Card with Progress Bar */}
      <SmsCreditsCard
        creditInfo={creditInfo}
        loading={loadingCredits}
        onRefresh={fetchCredits}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "1.5rem" }}>
        {/* Send Form */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.5rem" }}>
          <h3 style={{ margin: "0 0 1.25rem 0", color: "var(--text-main)", fontSize: "1.1rem" }}>📲 Compose SMS</h3>
          <form onSubmit={handleSendMessage} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="form-group">
              <label className="form-label">Recipient Mobile Number</label>
              <input
                type="text"
                required
                className="form-input"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="e.g. 09171234567 or +639171234567"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Message Content</label>
              <textarea
                required
                rows={5}
                className="form-input"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type SMS text message here..."
                style={{ resize: "vertical", fontFamily: "inherit" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem" }}>
                <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
                  {smsSegments} SMS credit{smsSegments > 1 ? "s" : ""} required
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
                  {message.length} characters ({160 - (message.length % 160 || 160)} left in segment)
                </span>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={sending} style={{ padding: "0.75rem", fontWeight: 700 }}>
              {sending ? "⏳ Dispatching SMS..." : "🚀 Dispatch SMS"}
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
                <th>Gateway</th>
                <th>Recipient</th>
                <th>Message Content</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-dim)" }}>
                    No outbound SMS sent yet in this session.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>{log.timestamp}</td>
                    <td>
                      <span className="badge badge-primary">{log.gateway}</span>
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
