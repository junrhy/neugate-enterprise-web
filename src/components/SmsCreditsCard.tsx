import React, { useState, useEffect } from "react";
import { checkActiveGatewayCredits, SmsCreditInfo } from "../utils/smsCredits";

export interface SmsCreditsCardProps {
  creditInfo?: SmsCreditInfo | null;
  loading?: boolean;
  onRefresh?: () => void;
  gateway?: string;
  style?: React.CSSProperties;
}

export default function SmsCreditsCard({
  creditInfo: propCreditInfo,
  loading: propLoading,
  onRefresh,
  gateway: propGateway,
  style,
}: SmsCreditsCardProps) {
  const [internalCreditInfo, setInternalCreditInfo] = useState<SmsCreditInfo | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);

  const isControlled = propCreditInfo !== undefined;
  const creditInfo = isControlled ? propCreditInfo : internalCreditInfo;
  const loading = propLoading !== undefined ? propLoading : internalLoading;

  const activeGateway = propGateway || creditInfo?.gateway || localStorage.getItem("neugate_sms_gateway") || "semaphore";

  const fetchCredits = async () => {
    if (onRefresh) {
      onRefresh();
      return;
    }
    setInternalLoading(true);
    try {
      const info = await checkActiveGatewayCredits();
      setInternalCreditInfo(info);
    } catch (err) {
      console.error("[SmsCreditsCard] Error fetching credits:", err);
    } finally {
      setInternalLoading(false);
    }
  };

  useEffect(() => {
    if (!isControlled) {
      fetchCredits();
    }
  }, [isControlled, activeGateway]);

  // Determine provider name
  const getProviderName = (gw: string) => {
    switch (gw) {
      case "semaphore":
        return "Semaphore";
      case "unisms":
        return "UniSMS";
      case "philsms":
        return "PhilSMS";
      case "mobile_gateway":
        return "Mobile Gateway";
      case "webhook":
        return "Custom Webhook";
      case "pusher":
        return "Soketi / Pusher";
      default:
        return gw ? gw.toUpperCase() : "SMS Provider";
    }
  };

  const providerName = getProviderName(activeGateway);

  // Check if credentials exist
  const checkConfigured = () => {
    if (activeGateway === "semaphore") {
      return Boolean(localStorage.getItem("neugate_semaphore_api_key")?.trim());
    }
    if (activeGateway === "unisms") {
      return Boolean(localStorage.getItem("neugate_unisms_api_key")?.trim());
    }
    if (activeGateway === "philsms") {
      return Boolean(localStorage.getItem("neugate_philsms_token")?.trim());
    }
    if (activeGateway === "mobile_gateway") {
      return Boolean(localStorage.getItem("neugate_mobile_gateway_ip")?.trim());
    }
    if (activeGateway === "webhook") {
      return Boolean(localStorage.getItem("neugate_sms_webhook")?.trim());
    }
    if (activeGateway === "pusher") {
      return Boolean(localStorage.getItem("neugate_pusher_app_key")?.trim());
    }
    return false;
  };

  const isConfigured = checkConfigured() && !creditInfo?.error?.includes("No ") && !creditInfo?.error?.includes("missing");

  // Calculate credits and percentage
  const numCredits = typeof creditInfo?.credits === "number" ? creditInfo.credits : 0;
  const isNumeric = typeof creditInfo?.credits === "number";
  const creditsPercentage = isNumeric ? Math.min(100, Math.max(0, (numCredits / 1000) * 100)) : (isConfigured ? 100 : 0);

  const isLowCredits = isNumeric && numCredits <= 50;

  return (
    <div
      style={{
        background: "var(--bg-card, #0e131d)",
        border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
        borderRadius: "14px",
        padding: "1.25rem 1.5rem",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        ...style,
      }}
    >
      {/* Top Header Row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "1.1rem", filter: "drop-shadow(0 2px 4px rgba(251,191,36,0.3))" }}>🪙</span>
          <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-main, #f1f5f9)" }}>
            SMS Credits
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #94a3b8)" }}>
            {providerName} balance. Each SMS (up to 160 characters) uses 1 credit.
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center" }}>
          <button
            type="button"
            onClick={fetchCredits}
            disabled={loading}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted, #94a3b8)",
              fontSize: "0.75rem",
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.2rem 0.4rem",
              transition: "color 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-main, #ffffff)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted, #94a3b8)")}
          >
            <span
              style={{
                display: "inline-block",
                transition: "transform 0.5s ease",
                transform: loading ? "rotate(360deg)" : "none",
                fontSize: "0.85rem",
              }}
            >
              🔄
            </span>
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* Main Counter & Status Row */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: "2.1rem",
            fontWeight: 800,
            fontFamily: "JetBrains Mono, monospace",
            color: "var(--text-main, #ffffff)",
            letterSpacing: "-0.5px",
            lineHeight: 1,
          }}
        >
          {isConfigured && isNumeric
            ? numCredits.toLocaleString()
            : isConfigured && creditInfo?.credits !== null && creditInfo?.credits !== undefined
            ? String(creditInfo.credits)
            : "0"}
        </span>
        <span style={{ fontSize: "0.85rem", color: "var(--text-muted, #94a3b8)", fontWeight: 500 }}>
          credits left
        </span>

        {/* Status Pill Badge */}
        <span
          style={{
            marginLeft: "auto",
            padding: "0.2rem 0.6rem",
            borderRadius: "4px",
            fontSize: "0.68rem",
            fontWeight: 700,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            ...( !isConfigured
              ? {
                  background: "rgba(100, 116, 139, 0.18)",
                  color: "#94a3b8",
                  border: "1px solid rgba(148, 163, 184, 0.25)",
                }
              : creditInfo?.error
              ? {
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "#f87171",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                }
              : !isLowCredits
              ? {
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#34d399",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                }
              : {
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "#f87171",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                }
            ),
          }}
        >
          {!isConfigured
            ? "NOT CONFIGURED"
            : creditInfo?.error
            ? "ERROR"
            : !isLowCredits
            ? "OK"
            : "LOW CREDITS"}
        </span>
      </div>

      {/* Progress Bar Track */}
      <div
        style={{
          height: "6px",
          width: "100%",
          borderRadius: "9999px",
          background: "var(--border, rgba(255, 255, 255, 0.08))",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: "9999px",
            transition: "width 0.5s ease-in-out, background-color 0.3s ease",
            width: `${isConfigured && !creditInfo?.error ? creditsPercentage : 0}%`,
            background: !isConfigured || creditInfo?.error
              ? "rgba(100, 116, 139, 0.4)"
              : isLowCredits
              ? "var(--danger, #ef4444)"
              : "var(--success, #10b981)",
          }}
        />
      </div>

      {/* Bottom Subtext */}
      <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-muted, #94a3b8)", lineHeight: 1.5 }}>
        {!isConfigured
          ? "No active credentials configured. Please enter your provider API key below to connect and view live balance."
          : creditInfo?.error
          ? `Error checking balance: ${creditInfo.error}`
          : `About ${isNumeric ? numCredits.toLocaleString() : "unlimited"} short SMS left · Provider: ${providerName}${creditInfo?.accountName ? ` (${creditInfo.accountName})` : ""} · Updated at ${creditInfo?.checkedAt || "Just now"}`}
      </p>
    </div>
  );
}

