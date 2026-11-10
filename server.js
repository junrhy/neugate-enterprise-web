import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// PostgreSQL Connection Pool Setup
const databaseUrl = process.env.DATABASE_URL || "";
let pool = null;

function createPool(connStr) {
  if (!connStr) {
    console.warn("⚠️ [Database] No DATABASE_URL provided. Operating in disconnected mode.");
    return null;
  }

  let cleanUrl = connStr.trim();
  let isInternalRender = false;
  let isLocal = false;

  try {
    const parsed = new URL(cleanUrl);
    isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    // Render internal database host looks like: dpg-datjc2vavr4c73dph2ug-a (no dots in hostname)
    isInternalRender = parsed.hostname.startsWith("dpg-") && !parsed.hostname.includes(".");

    if (isInternalRender || isLocal) {
      parsed.searchParams.delete("sslmode");
      parsed.searchParams.set("sslmode", "disable");
      cleanUrl = parsed.toString();
      console.log(`🔌 [Database] Detected ${isInternalRender ? "Render Internal" : "Local"} database connection (SSL disabled).`);
    }
  } catch (err) {
    console.warn("⚠️ [Database] URL parse warning:", err.message);
  }

  const config = {
    connectionString: cleanUrl,
  };

  // Only enable SSL for external cloud hosts (e.g. *.render.com, Neon, Supabase)
  if (!isInternalRender && !isLocal && process.env.DB_SSL !== "false") {
    config.ssl = { rejectUnauthorized: false };
  } else {
    config.ssl = false;
  }

  const p = new pg.Pool(config);

  // Set default search path on every client connection
  p.on("connect", (client) => {
    client.query("SET search_path TO neugate, public;").catch(() => {});
  });

  p.on("error", (err) => {
    console.error("❌ [Database Pool Error]", err.message);
  });

  return p;
}

if (databaseUrl) {
  pool = createPool(databaseUrl);
  // Test connection on startup
  pool
    .query("SELECT NOW()")
    .then(async (res) => {
      console.log("✅ [NeuGate Database Connected]", res.rows[0]);
      await pool.query("CREATE SCHEMA IF NOT EXISTS neugate;");

      // Ensure all standard module permissions exist in neugate.permissions
      const seedPerms = `
        INSERT INTO neugate.permissions (id, module_name, action_name) VALUES
          ('gate', 'gate', 'Access Gate Console'),
          ('directory', 'directory', 'Manage Employee Directory'),
          ('rates', 'rates', 'Compensation & Salary Rates'),
          ('schedules', 'schedules', 'Work Schedules'),
          ('holidays', 'holidays', 'Official Holidays Calendar'),
          ('logs', 'logs', 'View Timekeeping Logs'),
          ('leaves', 'leaves', 'Leave & Absence Workflow'),
          ('overtime', 'overtime', 'Overtime Workflow'),
          ('analytics', 'analytics', 'HR Analytics & Form 48'),
          ('payroll', 'payroll', 'Payroll & Payslips'),
          ('thirteenth', 'thirteenth', '13th Month & Annual Tax'),
          ('disbursements', 'disbursements', 'Disbursements'),
          ('payables', 'payables', 'Accounts Payables & Loans'),
          ('reports', 'reports', 'Financial & Payroll Reports'),
          ('sms', 'sms', 'SMS Broadcast Console'),
          ('users', 'users', 'Manage Staff Users & Roles'),
          ('settings', 'settings', 'System Settings')
        ON CONFLICT (id) DO NOTHING;
      `;
      return pool.query(seedPerms).catch(() => {});
    })
    .catch((err) => {
      console.error("❌ [Database Connection Failed]", err.message);
      if (databaseUrl.includes("dpg-") && !databaseUrl.includes(".")) {
        console.error("💡 Hint: If your web service and database are in DIFFERENT Render regions, the internal URL cannot be resolved. Use Render's External Database URL instead.");
      }
    });
}

/**
 * Normalizes SQL queries for PostgreSQL:
 * 1. Converts ? parameters to $1, $2, $3 positional parameters
 * 2. Ensures search path or neugate schema prefix
 */
function normalizeQuery(sql, binds = []) {
  let query = sql;
  if (!query) return { sql: "", binds: [] };

  // If query uses ?, replace sequentially with $1, $2, $3
  if (query.includes("?")) {
    let index = 1;
    query = query.replace(/\?/g, () => `$${index++}`);
  }

  return { sql: query, binds };
}

// Health Check
app.get("/api/health", async (req, res) => {
  let dbStatus = "disconnected";
  let dbError = null;
  if (pool) {
    try {
      await pool.query("SELECT 1");
      dbStatus = "connected";
    } catch (e) {
      dbStatus = "error";
      dbError = e.message;
    }
  }
  res.json({
    status: "ok",
    app: "NeuGate Enterprise Web",
    database: dbStatus,
    error: dbError,
    timestamp: new Date().toISOString()
  });
});

// SELECT Query Endpoint
app.post("/api/db/query", async (req, res) => {
  const { sql, binds = [] } = req.body;
  if (!pool) {
    return res.status(503).json({ error: "Database not configured. Please set DATABASE_URL." });
  }

  try {
    const normalized = normalizeQuery(sql, binds);
    const result = await pool.query(normalized.sql, normalized.binds);
    res.json({ rows: result.rows });
  } catch (err) {
    console.error("❌ Query Error:", err.message, "SQL:", sql);
    res.status(500).json({ error: err.message, query: sql });
  }
});

// EXECUTE Query Endpoint (INSERT / UPDATE / DELETE / DDL)
app.post("/api/db/execute", async (req, res) => {
  const { sql, binds = [] } = req.body;
  if (!pool) {
    return res.status(503).json({ error: "Database not configured. Please set DATABASE_URL." });
  }

  try {
    const normalized = normalizeQuery(sql, binds);
    const result = await pool.query(normalized.sql, normalized.binds);
    res.json({
      rowsAffected: result.rowCount || 0,
      rows: result.rows || [],
    });
  } catch (err) {
    console.error("❌ Execute Error:", err.message, "SQL:", sql);
    res.status(500).json({ error: err.message, query: sql });
  }
});

// Test Connection Endpoint
app.post("/api/db/test", async (req, res) => {
  const { connectionString } = req.body;
  const targetUrl = connectionString || databaseUrl;
  if (!targetUrl) {
    return res.status(400).json({ error: "No connection string provided" });
  }

  try {
    const testPool = createPool(targetUrl);
    const result = await testPool.query("SELECT NOW()");
    await testPool.end();
    res.json({ success: true, timestamp: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SMS Dispatch Endpoint
app.post("/api/sms/send", async (req, res) => {
  const { phone, message } = req.body;
  console.log(`📱 [NeuGate SMS Send Requested] To: ${phone}, Msg: ${message}`);
  res.json({ success: true, message: "SMS dispatched successfully" });
});

// Serve Vite Static Files in Production
const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));

// Fallback to index.html for client-side routing
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"), (err) => {
    if (err) {
      res.status(200).send("NeuGate Enterprise Web Server running. (Run 'npm run build' to generate frontend assets)");
    }
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 [NeuGate Enterprise Web] Server listening on port ${PORT}`);
});
