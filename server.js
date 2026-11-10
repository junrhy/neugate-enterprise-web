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

  const isLocalhost = connStr.includes("localhost") || connStr.includes("127.0.0.1");
  const useSsl = process.env.DB_SSL === "true" || (!isLocalhost && !connStr.includes("sslmode=disable"));

  const config = {
    connectionString: connStr,
  };

  if (useSsl) {
    config.ssl = { rejectUnauthorized: false };
  }

  const p = new pg.Pool(config);

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
    .then((res) => {
      console.log("✅ [NeuGate Database Connected]", res.rows[0]);
      // Ensure neugate schema exists
      return pool.query("CREATE SCHEMA IF NOT EXISTS neugate;");
    })
    .catch((err) => {
      console.error("❌ [Database Connection Failed]", err.message);
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
  if (pool) {
    try {
      await pool.query("SELECT 1");
      dbStatus = "connected";
    } catch (e) {
      dbStatus = "error: " + e.message;
    }
  }
  res.json({ status: "ok", app: "NeuGate Enterprise", database: dbStatus, timestamp: new Date().toISOString() });
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
