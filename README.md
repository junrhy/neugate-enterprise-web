# NeuGate Enterprise Web — Online Access Control & HR Payroll

Standalone online web edition of **NeuGate Enterprise**, ready to run locally and deploy to **Render.com**.

Shares the **exact same PostgreSQL database and authentication** (`neugate.*` schema) as the desktop version.

---

## 🚀 Features

- **Full Parity with Desktop**: Employee Directory, Attendance Logs & Geofence Clock-In, Face Recognition, Leave & Overtime Approvals, Payroll & Payslips, 13th Month Pay, Disbursements, Accounts Payable, Cash Advances, Holiday Management, and HR Analytics.
- **Identical Database & Auth**: Connects directly to your PostgreSQL database (`neugate` schema). Users log in using their existing accounts from `neugate.users` and roles/permissions.
- **Web File Export & Import**: Directly export CSVs/JSON and import files in standard web browsers.
- **Modern Full-Stack Architecture**:
  - **Frontend**: Vite 7 + React 19 + TypeScript + Tailwind/CSS
  - **Backend**: Express + `pg` connection pool with SSL support
  - **Ready for Render.com**: Multi-stage `Dockerfile` and `render.yaml` included.

---

## 🛠️ Local Development

### 1. Prerequisites
- Node.js 18+ or 20+
- PostgreSQL database with `neugate` schema

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` and set your PostgreSQL connection string:
```ini
PORT=3001
DATABASE_URL=postgres://user:password@host:5432/dbname?sslmode=require
DB_SSL=true
```

### 3. Install & Run
```bash
# Install dependencies
npm install

# Run backend + frontend concurrently in dev mode
npm run dev
```

- Frontend UI: `http://localhost:3000`
- Express API server: `http://localhost:3001`

---

## 🌐 Deploy to Render.com

### Option 1: Using the Render Dashboard (Web Service)
1. Push this directory (`/Users/junrhycrodua/Job/JRC/web-apps/neugate-enterprise-web`) to a GitHub or GitLab repository.
2. In the [Render Dashboard](https://dashboard.render.com):
   - Click **New +** → **Web Service**.
   - Connect your repository.
   - Choose **Node** runtime (or Docker).
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node server.js`
3. Add Environment Variables under **Environment**:
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: `postgres://user:password@host:port/dbname?sslmode=require`
   - `DB_SSL`: `true`
4. Click **Deploy Web Service**!

---

## 📁 Project Structure

```
neugate-enterprise-web/
├── server.js               # Express server: handles DB queries, auth, and serves dist/
├── render.yaml             # Render Blueprint configuration
├── Dockerfile              # Multi-stage production container
├── vite.config.ts          # Vite configuration with web adapters
├── schema_setup.sql        # PostgreSQL schema setup script
├── src/
│   ├── App.tsx             # Main application component
│   ├── buildInfo.ts        # Build metadata (tracked in git)
│   ├── components/         # All attendance, gate, payroll, HR, and settings components
│   ├── hooks/useAuth.tsx   # Authentication provider matching neugate.users
│   ├── lib/                # Web adapters for database, dialog, fs, and window
│   └── utils/
│       ├── dbHelper.ts
│       ├── faceRecognition.ts
│       ├── geofence.ts
│       ├── payroll.ts
│       └── schedule.ts
```
