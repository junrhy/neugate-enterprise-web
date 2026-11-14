import { useState } from "react";
import Database from "@tauri-apps/plugin-sql";
import { useAuth } from "../../hooks/useAuth";

interface UserLoginProps {
  db: Database | null;
  onClose?: () => void;
}

export default function UserLogin({ db, onClose }: UserLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, loading, error } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(username, password, db);
      if (onClose) onClose();
    } catch (_) {}
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 999,
      background: "rgba(10, 14, 26, 0.85)",
      backdropFilter: "blur(12px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem"
    }}>
      <div style={{
        maxWidth: "400px",
        width: "100%",
        background: "var(--bg-card, #131b2e)",
        border: "1px solid var(--border, rgba(255,255,255,0.1))",
        borderRadius: "16px",
        padding: "2rem",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)"
      }}>
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div style={{ fontSize: "2.75rem", marginBottom: "0.5rem" }}>🔐</div>
          <h2 style={{ margin: "0 0 0.4rem 0", fontSize: "1.35rem", color: "var(--text-main)" }}>
            Login
          </h2>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-dim)" }}>
            Sign in to access company administration &amp; gate controls.
          </p>
        </div>

        {error && (
          <div style={{
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            background: "rgba(244, 63, 94, 0.15)",
            border: "1px solid rgba(244, 63, 94, 0.3)",
            color: "#f43f5e",
            fontSize: "0.82rem",
            fontWeight: 600,
            marginBottom: "1.25rem",
            textAlign: "center"
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>Username</label>
            <input
              type="text"
              required
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>Password</label>
            <input
              type="password"
              required
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            {onClose && (
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !username.trim() || !password}
              style={{ flex: 1 }}
            >
              {loading ? "Signing in..." : "🔑 Login"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
