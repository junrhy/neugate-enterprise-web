import { useState, useEffect, useRef, useCallback } from "react";
import { Employee, AttendanceLog, BranchLocation } from "../types";
import { extractFaceDescriptor, matchFaceToEmployees } from "../utils/faceRecognition";

interface GateConsoleProps {
  employees: Employee[];
  branches?: BranchLocation[];
  onScan: (rfidTag: string, overridePin?: string) => Promise<{ employee: Employee | null; log: AttendanceLog | null; deniedReason?: string }>;
  recentLogs: AttendanceLog[];
  showSimulator: boolean;
  customBackground?: string;
}

type GateState = "idle" | "granted" | "denied";

export default function GateConsole({
  employees,
  branches = [],
  onScan,
  recentLogs,
  showSimulator,
  customBackground,
}: GateConsoleProps) {
  const [gateState, setGateState] = useState<GateState>("idle");
  const [scannedEmployee, setScannedEmployee] = useState<Employee | null>(null);
  const [lastLog, setLastLog] = useState<AttendanceLog | null>(null);
  const [deniedReason, setDeniedReason] = useState<string | null>(null);
  const [pendingOverride, setPendingOverride] = useState<{ tag: string; employee: Employee; reason: string } | null>(null);
  const [overridePinInput, setOverridePinInput] = useState("");
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const [activeBranchId, setActiveBranchId] = useState<string>(() => {
    return localStorage.getItem("neugate_terminal_branch_id") || (branches.length > 0 ? branches[0].id : "");
  });

  // Ensure activeBranchId stays synchronized if branches change
  useEffect(() => {
    if (branches.length > 0 && !branches.some((b) => b.id === activeBranchId)) {
      const fallbackId = branches[0].id;
      setActiveBranchId(fallbackId);
      localStorage.setItem("neugate_terminal_branch_id", fallbackId);
    }
  }, [branches, activeBranchId]);

  const [clock, setClock] = useState(new Date());
  const [rfidBuffer, setRfidBuffer] = useState("");
  const [faceCamActive, setFaceCamActive] = useState(false);
  const [faceCamStatus, setFaceCamStatus] = useState("Face Scanner Ready");
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isScanningFaceRef = useRef(false);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-reset gate back to idle after 4 seconds (pauses when waiting for manager override PIN)
  useEffect(() => {
    if (gateState !== "idle" && !pendingOverride) {
      const t = setTimeout(() => {
        setGateState("idle");
        setDeniedReason(null);
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [gateState, scannedEmployee, pendingOverride]);

  // Handle Face Scanner Stream
  useEffect(() => {
    if (!faceCamActive) {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        mediaStreamRef.current = null;
      }
      return;
    }

    let isMounted = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" } })
      .then((stream) => {
        if (!isMounted) {
          stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => { });
        }
        setFaceCamStatus("Camera Scanning...");
      })
      .catch((err) => {
        console.warn("Gate Console Face Cam error:", err);
        setFaceCamStatus("Camera permission denied");
        setFaceCamActive(false);
      });

    return () => {
      isMounted = false;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        mediaStreamRef.current = null;
      }
    };
  }, [faceCamActive]);

  // Periodic Face Matching Loop
  useEffect(() => {
    if (!faceCamActive || gateState !== "idle" || pendingOverride) return;

    const interval = setInterval(async () => {
      if (isScanningFaceRef.current || !videoRef.current) return;
      const video = videoRef.current;
      if (video.readyState < 2) return;

      isScanningFaceRef.current = true;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 160;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, 160, 160);
          const frameDataUrl = canvas.toDataURL("image/jpeg", 0.8);
          const scannedDescriptor = await extractFaceDescriptor(frameDataUrl);

          if (scannedDescriptor) {
            const { employee, similarity } = matchFaceToEmployees(scannedDescriptor, employees, 0.85);
            if (employee) {
              setFaceCamStatus(`Match Found: ${employee.name} (${Math.round(similarity * 100)}%)`);
              await processRfidTag(employee.id);
            }
          }
        }
      } catch (err) {
        console.warn("Face matching error:", err);
      } finally {
        isScanningFaceRef.current = false;
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [faceCamActive, gateState, employees, pendingOverride]);

  // Focus hidden input on mount and whenever gate is idle
  useEffect(() => {
    const active = document.activeElement;
    const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
    if (!isTyping && !pendingOverride) {
      hiddenInputRef.current?.focus();
    }
  }, [gateState, pendingOverride]);

  const processRfidTag = useCallback(async (tag: string, overridePin?: string) => {
    if (!tag.trim()) return;
    const result = await onScan(tag.trim(), overridePin);
    setScannedEmployee(result.employee);
    setLastLog(result.log);

    if (result.deniedReason) {
      setDeniedReason(result.deniedReason);
      setGateState("denied");
      if (result.employee && result.deniedReason.includes("Restricted")) {
        setPendingOverride({ tag: tag.trim(), employee: result.employee, reason: result.deniedReason });
      } else {
        setPendingOverride(null);
      }
    } else {
      setDeniedReason(null);
      setPendingOverride(null);
      setGateState(result.employee ? "granted" : "denied");
    }
  }, [onScan]);

  const handleAuthorizeOverride = async () => {
    if (!pendingOverride) return;
    const configuredPin = localStorage.getItem("neugate_geofence_override_pin") || "9999";
    if (overridePinInput.trim() !== configuredPin.trim()) {
      setOverrideError("Invalid Manager Override PIN code.");
      return;
    }
    setOverrideError(null);
    await processRfidTag(pendingOverride.tag, overridePinInput.trim());
    setPendingOverride(null);
    setOverridePinInput("");
  };

  // Global keydown RFID listener – buffers until Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isTypingInField = active && active !== hiddenInputRef.current && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
      if (isTypingInField || pendingOverride) return;

      if (e.key === "Enter") {
        if (rfidBuffer.length > 0) {
          processRfidTag(rfidBuffer);
          setRfidBuffer("");
        }
      } else if (e.key.length === 1) {
        setRfidBuffer((prev: string) => prev + e.key);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rfidBuffer, processRfidTag, pendingOverride]);

  const timeStr = clock.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = clock.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="gate-console" style={{ gridTemplateColumns: showSimulator ? "1fr 340px" : "1fr" }}>
      {/* Left: Gate Display */}
      <div
        className={`gate-display ${gateState}`}
        style={customBackground ? {
          backgroundImage: `linear-gradient(var(--gate-overlay, rgba(10, 14, 26, 0.82)), var(--gate-overlay, rgba(10, 14, 26, 0.88))), url(${customBackground})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
        } : undefined}
      >
        {/* Terminal Worksite Badge / Picker */}
        {branches && branches.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "1.25rem",
              left: "1.5rem",
              display: "flex",
              alignItems: "center",
              flexWrap: "nowrap",
              whiteSpace: "nowrap",
              gap: "0.5rem",
              zIndex: 10,
              background: "var(--bg-surface)",
              padding: "0.35rem 0.75rem",
              borderRadius: "12px",
              border: "1.5px solid var(--border-input)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
              📍 Worksite:
            </span>
            <select
              value={activeBranchId}
              onChange={(e) => {
                setActiveBranchId(e.target.value);
                localStorage.setItem("neugate_terminal_branch_id", e.target.value);
              }}
              className="form-select"
              style={{
                fontSize: "0.78rem",
                fontWeight: 700,
                color: "var(--text)",
                background: "transparent",
                border: "none",
                padding: "0 1.8rem 0 0.2rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
                width: "auto",
                flexShrink: 0,
              }}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Hidden input for RFID hardware */}
        <input
          ref={hiddenInputRef}
          className="rfid-scan-input"
          readOnly
          onBlur={() => {
            setTimeout(() => {
              const active = document.activeElement;
              const isTypingInField = active && active !== hiddenInputRef.current && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
              if (!isTypingInField && !pendingOverride) {
                hiddenInputRef.current?.focus();
              }
            }, 100);
          }}
          aria-hidden="true"
        />

        {/* Gate Status Badge */}
        <div className={`gate-status-badge ${gateState}`} style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
          <span style={{ whiteSpace: "nowrap" }}>
            {gateState === "idle" && (faceCamActive ? `📸 Face Scanner: ${faceCamStatus}` : "⬛ Waiting for RFID / QR / Fingerprint Scan")}
            {gateState === "granted" && "✅ Access Granted"}
            {gateState === "denied" && (pendingOverride ? "⚠️ Worksite Restricted" : "❌ Unknown Scan")}
          </span>
          <button
            type="button"
            className="btn btn-outline"
            style={{
              fontSize: "0.7rem",
              padding: "0.2rem 0.6rem",
              borderRadius: "12px",
              border: faceCamActive ? "1px solid var(--success)" : "1px solid var(--border-input)",
              color: faceCamActive ? "var(--success)" : "var(--text)",
              background: faceCamActive ? "var(--success-dim)" : "var(--bg-surface)",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
            onClick={() => setFaceCamActive(!faceCamActive)}
            title="Toggle Live Facial Recognition Scanner"
          >
            {faceCamActive ? "🟢 Face Recognition: ON" : "📸 Face Recognition"}
          </button>
        </div>

        {/* Employee Profile or Restriction UI */}
        {pendingOverride && pendingOverride.employee ? (
          <>
            <div className="student-photo-ring" style={{ border: "3px solid var(--warning)", boxShadow: "0 0 20px rgba(245, 158, 11, 0.3)" }}>
              {pendingOverride.employee.photo.startsWith("data:") ? (
                <img src={pendingOverride.employee.photo} alt={pendingOverride.employee.name} className="avatar-img" />
              ) : (
                pendingOverride.employee.photo
              )}
            </div>
            <div className="gate-student-name">{pendingOverride.employee.name}</div>
            <div className="gate-student-grade">{pendingOverride.employee.departmentJobTitle}</div>

            <div
              style={{
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: "12px",
                padding: "0.75rem 1.25rem",
                marginTop: "0.5rem",
                maxWidth: "460px",
                textAlign: "center",
              }}
            >
              <div style={{ color: "var(--danger)", fontWeight: 800, fontSize: "0.85rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem" }}>
                <span>⚠️ Worksite Geofence Restriction</span>
              </div>
              <div style={{ color: "var(--text)", fontSize: "0.78rem", marginTop: "0.3rem", lineHeight: 1.4 }}>
                {pendingOverride.reason}
              </div>
            </div>

            {/* Manager Override Form */}
            <div
              style={{
                marginTop: "0.85rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.45rem",
              }}
            >
              <label style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Manager / Guard Override PIN Code:
              </label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="password"
                  maxLength={4}
                  value={overridePinInput}
                  onChange={(e) => {
                    setOverridePinInput(e.target.value);
                    setOverrideError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAuthorizeOverride();
                  }}
                  placeholder="••••"
                  className="form-input"
                  style={{
                    width: "100px",
                    textAlign: "center",
                    letterSpacing: "0.25em",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: "1.1rem",
                    padding: "0.45rem",
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontSize: "0.8rem", padding: "0.5rem 1rem" }}
                  onClick={handleAuthorizeOverride}
                >
                  Authorize Clock-In
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: "0.8rem", padding: "0.5rem 0.8rem" }}
                  onClick={() => {
                    setPendingOverride(null);
                    setGateState("idle");
                    setDeniedReason(null);
                  }}
                >
                  Cancel
                </button>
              </div>
              {overrideError && (
                <span style={{ fontSize: "0.75rem", color: "var(--danger)", fontWeight: 700 }}>
                  {overrideError}
                </span>
              )}
            </div>
          </>
        ) : gateState !== "idle" && scannedEmployee ? (
          <>
            <div className="student-photo-ring">
              {scannedEmployee.photo.startsWith("data:") ? (
                <img src={scannedEmployee.photo} alt={scannedEmployee.name} className="avatar-img" />
              ) : (
                scannedEmployee.photo
              )}
            </div>
            <div className="gate-student-name">{scannedEmployee.name}</div>
            <div className="gate-student-grade">{scannedEmployee.departmentJobTitle}</div>
            <div className="gate-student-id">#{scannedEmployee.id}</div>
            {lastLog && (
              <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.4rem", justifyContent: "center", flexWrap: "wrap" }}>
                <span className={`badge ${lastLog.type === "IN" ? "badge-success" : "badge-warning"}`}>
                  {lastLog.type === "IN" ? "🟢 ENTERED" : "🟡 EXITED"}
                </span>
                {lastLog.status && (
                  <span className={`badge ${lastLog.status === "ON TIME" ? "badge-success" : lastLog.status === "LATE" ? "badge-danger" : lastLog.status === "OVERTIME" ? "badge-primary" : "badge-warning"}`}>
                    {lastLog.status === "ON TIME" ? "🟢 ON TIME" : lastLog.status === "LATE" ? "🔴 LATE" : lastLog.status === "OVERTIME" ? "⚡ OVERTIME" : lastLog.status === "OVER BREAK" ? "☕ OVER BREAK" : lastLog.status === "EARLY DEPARTURE" ? "⚠️ EARLY DEPARTURE" : "🌴 REST DAY"}
                  </span>
                )}
                {lastLog.location && (
                  <span className="badge" style={{ background: "rgba(14, 165, 233, 0.15)", color: "var(--primary)", border: "1px solid var(--primary-dim)" }}>
                    📍 {lastLog.location}
                  </span>
                )}
              </div>
            )}
          </>
        ) : gateState === "denied" ? (
          <>
            <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🪪</div>
            <div className="gate-student-name" style={{ color: "var(--danger)" }}>Unknown Scan</div>
            <div className="gate-student-grade">{deniedReason || "RFID, QR code, fingerprint, or face not registered in system"}</div>
          </>
        ) : faceCamActive ? (
          <>
            <div className="student-photo-ring" style={{ width: 140, height: 140, borderRadius: "50%", overflow: "hidden", border: "3px solid #10b981", boxShadow: "0 0 20px rgba(16, 185, 129, 0.5)", position: "relative", flexShrink: 0 }}>
              <video ref={videoRef} playsInline autoPlay muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", borderRadius: "50%", clipPath: "circle(50% at 50% 50%)" }} />
              <div style={{ position: "absolute", inset: 0, border: "2px dashed rgba(16, 185, 129, 0.7)", borderRadius: "50%", pointerEvents: "none" }} />
            </div>
            <div className="gate-student-name" style={{ fontSize: "1.1rem", color: "#10b981" }}>Live Face Detection</div>
            <div className="gate-student-grade">Look directly into camera for hands-free check-in</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: "4rem", marginBottom: "1rem", opacity: 0.3 }}>🪪</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Tap ID card, scan QR code, place finger, or enable Face Recognition</div>
          </>
        )}

        {/* Clock */}
        <div className="gate-time">{timeStr}</div>
        <div className="gate-date">{dateStr}</div>

        {/* Bottom hint */}
        <div className="scan-hint">
          <span className="scan-pulse" />
          {showSimulator ? "Scanner active — RFID / QR / Biometric readers ready" : "Scanner active — tap card, scan QR, or place finger"}
        </div>
      </div>

      {showSimulator && (
        <div className="simulator-panel">
          <h3>Virtual RFID Simulator</h3>
          <p style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "-0.5rem" }}>
            Click an employee card to simulate a scan
          </p>

          {employees.length === 0 ? (
            <div className="empty-state" style={{ padding: "2rem" }}>
              <div className="empty-state-icon">👤</div>
              <p>No employees registered yet</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {employees.map((e) => {
                const tagToScan = e.rfidTag || (e.fingerprints && e.fingerprints[0]?.token) || e.qrCode || "";
                return (
                  <div
                    key={e.id}
                    className="sim-student-card"
                    onClick={() => tagToScan && processRfidTag(tagToScan)}
                  >
                    <div className="sim-avatar">
                      {e.photo.startsWith("data:") ? (
                        <img src={e.photo} alt={e.name} className="avatar-img" />
                      ) : (
                        e.photo
                      )}
                    </div>
                    <div>
                      <div className="sim-student-name">{e.name}</div>
                      <div className="sim-student-grade">{e.departmentJobTitle}</div>
                    </div>
                    <div className="sim-rfid">{e.rfidTag ? `🪪 ${e.rfidTag}` : e.fingerprints && e.fingerprints.length > 0 ? `☝️ ${e.fingerprints.length} Finger(s)` : e.qrCode ? `📷 ${e.qrCode}` : "No Credential"}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem", marginTop: "0.5rem" }}>
            <h3 style={{ marginBottom: "0.75rem" }}>Recent Scans</h3>
            <div className="recent-scans">
              {recentLogs.slice(0, 8).length === 0 ? (
                <p style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>No scans yet today</p>
              ) : (
                recentLogs.slice(0, 8).map((log, i) => (
                  <div key={i} className="recent-scan-entry">
                    <span className={`scan-type-badge ${log.type.toLowerCase()}`}>{log.type}</span>
                    <span style={{ flex: 1, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.employeeName}
                    </span>
                    <span style={{ color: "var(--text-dim)", fontFamily: "JetBrains Mono, monospace", fontSize: "0.68rem", flexShrink: 0 }}>
                      {log.timestamp.split(", ")[1]?.split(":").slice(0, 2).join(":")}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
