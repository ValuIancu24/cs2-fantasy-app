# CS2 Fantasy

Fantasy esports web app for Counter-Strike 2. You pick a 5-player roster within a budget, join leagues with friends, and score points from real match results pulled from the GRID API.

## Stack

- **Frontend:** React 18 + Vite, React Router v6
- **Backend:** Node.js + Express, SQLite (`sqlite3`), JWT auth
- **Data source:** GRID GraphQL API (central-data + live series-state)
- **Scheduling:** `node-cron` for periodic stats/tournament sync

## Running it

Two npm projects. You'll need a `.env` in the project root:

```
JWT_SECRET=something-secret
GRID_API_KEY=your-grid-key
PORT=5000
LOCK_TEAMS_ENABLED=true
```

`GRID_API_KEY` is required — the backend will refuse to start without it. `LOCK_TEAMS_ENABLED` controls whether team-building is blocked once a tournament's first match has started; flip it to `false` if you want to keep editing teams during development.

```bash
cd server && npm install && npm run dev
cd client && npm install && npm run dev
```

API on `localhost:5000`, UI on `localhost:5173`. The SQLite file (`server/database.db`) is created on first run, and a default admin (`admin` / `admin123`) gets seeded if there isn't one already.

## How a tournament gets in

An admin pastes a tournament ID (e.g. : 829465) into the admin dashboard and then follows the user manual guide on the admin workflow.

If auto-sync is on, a 30s cron refreshes stats while matches are live. When the tournament's over, the admin flips its status to `historical` and from that point its data feeds the **player price calculation** for new tournaments (prices come from a weighted average of recent historical performance).

## Layout

```
client/   Vite + React frontend
server/   Express + SQLite backend
  routes/         HTTP endpoints
  services/       GRID adapter, auto-sync cron, lock helper
  middleware/     JWT + admin guards
  migrations/     schema additions, run on startup
```
