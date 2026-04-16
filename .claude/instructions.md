# CS2 Fantasy App — Coding Instructions

These are the active coding standards for this project. Follow them exactly when writing or modifying code.

---

## 1. General Principles

- **Do not add features beyond what is asked.** No speculative abstractions, no extra configurability.
- **Do not add comments unless logic is non-obvious.** Existing code has no JSDoc, no inline noise.
- **Do not add error handling for scenarios that cannot happen.** Trust DB constraints and framework guarantees.
- **Do not create helpers for one-time use.** Abstract only when the same pattern appears 3+ times.
- **Read the file before editing it.** Never assume structure.

---

## 2. React / Frontend Standards

### Component Style
- **Functional components only**, no class components.
- **Named function declarations**, not arrow functions for top-level components:
  ```jsx
  // CORRECT
  function MyComponent({ prop }) { ... }
  export default MyComponent;

  // WRONG
  const MyComponent = ({ prop }) => { ... }
  ```
- **Single `.jsx` file per page or component.** Co-locate the CSS import at the top.
- **No TypeScript** — this project is pure JavaScript + JSX.

### State & Context
- Use `useContext(AuthContext)` to access `{ user, apiBase, setUser, loading }`.
- `apiBase` is always `'http://localhost:5000/api'` — always use it from context, never hardcode.
- Local state with `useState`, side effects with `useEffect`. No Redux, no Zustand.
- Auth token is stored in `localStorage` as `cs2_fantasy_token`.
- User object is stored in `localStorage` as `cs2_fantasy_user`.

### API Calls
```jsx
// Standard fetch pattern — always use apiBase from context
useEffect(() => {
  fetch(`${apiBase}/endpoint`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('cs2_fantasy_token')}` }
  })
    .then(r => r.json())
    .then(data => setState(data))
    .catch(() => setState(fallback))
    .finally(() => setLoading(false));
}, [apiBase]);
```
- Use `fetch`, not axios.
- Always include `Authorization: Bearer <token>` header for protected endpoints.
- Use `.catch(() => setState([]))` pattern — don't let errors crash the UI.
- Use `.finally(() => setLoading(false))` to always clear loading state.

### Navigation
- Use `useNavigate()` from React Router v6.
- Links in nav: `<Link to="/path">Label</Link>`.
- Programmatic navigation: `navigate('/path')`.
- URL params for pre-selection: `navigate(\`/my-team?league=\${id}\`)`.

### Routing (App.jsx)
- Protected routes: `<ProtectedRoute>` wrapper (redirects to `/login` if not authenticated).
- Admin-only routes: `<ProtectedRoute adminOnly>`.
- Route paths are defined in `App.jsx`. Add new routes there.

---

## 3. CSS Standards

### Naming
- **BEM-ish class names**, kebab-case, prefixed with page or component name:
  - Page: `.myfantasy-title`, `.myfantasy-empty`, `.tournament-card`
  - Component: `.ss-wrapper`, `.ss-trigger`, `.ss-dropdown`
  - Admin: `.admin-section`, `.admin-table`
- **One CSS file per page** in `client/src/styles/`. Import it at the top of the JSX file.
- **Global utility classes** in `global.css`: `.muted`, `.btn-primary`, `.btn-outlined`, `.btn-text`, `.panel`.

### Button Classes
```css
.btn-primary       /* filled purple button */
.btn-outlined      /* outline button */
.btn-text          /* text-only link-style button */
.btn-primary.small /* smaller variant */
.btn-outlined.small
```

### Colors & Theme
- Dark background: `#0f0f14` (root), `#16161e` (panels)
- Primary purple: `#7c3aed`, accent: `#a855f7`
- Muted text: `#666`, secondary text: `#9ca3af`
- Borders: `rgba(255,255,255,0.07)` to `rgba(255,255,255,0.12)`
- Never use inline styles for colors — use CSS classes.

### Responsive
- No mobile-first breakpoints currently. Do not add responsive breakpoints unless asked.

---

## 4. Node.js / Backend Standards

### Route Structure
```js
// File: server/routes/<resource>.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

router.get('/endpoint', authMiddleware, (req, res) => { ... });

module.exports = router;
```
- **CommonJS only** (`require`/`module.exports`). The server is `"type": "commonjs"`.
- Route files are mounted in `server.js` under `/api/<resource>`.

### Database Queries
- Use the `db` object from `require('../database')`.
- **Callback pattern** for routes (not async/await):
  ```js
  db.get('SELECT ...', [params], (err, row) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json(row);
  });
  ```
- **Async/await pattern** only in `services/` (dataAdapter.js uses `dbRun`/`dbGet` promise wrappers).
- Use `db.serialize(() => { ... })` for sequential multi-step writes (e.g., deletes across tables).
- Use `INSERT OR IGNORE` + separate `UPDATE` to preserve existing fields on upsert.
- Use `INSERT OR REPLACE` only when full overwrite is acceptable.

### Auth Pattern
```js
// Public route — no middleware
router.get('/endpoint', (req, res) => { ... });

// Authenticated route
router.get('/endpoint', authMiddleware, (req, res) => {
  const userId = req.user.id;
  // ...
});

// Admin-only route
router.post('/endpoint', authMiddleware, requireAdmin, (req, res) => { ... });
```

### Error Responses
```js
// Input validation
if (!id) return res.status(400).json({ message: 'Invalid ID' });

// Not found
if (!row) return res.status(404).json({ message: 'Not found' });

// DB error
if (err) return res.status(500).json({ message: 'Database error' });

// Success
res.json({ success: true });
res.json({ message: 'Updated' });
```

---

## 5. Database Conventions

- **SQLite3** via `require('../database')`.
- Schema is defined in `server/database.js` using `db.serialize()` with `CREATE TABLE IF NOT EXISTS`.
- **Migrations**: Add new columns with `ALTER TABLE ... ADD COLUMN` inside a try/catch (already-exists errors are silently ignored).
- **Junction tables** for many-to-many: `player_tournaments(player_id, tournament_id, team_id)`.
- Never delete from `player_tournaments` when syncing new tournaments — use `INSERT OR REPLACE`.
- `is_active` field on `players` must be preserved across re-syncs. Use the `upsertPlayer` pattern.

### upsertPlayer Pattern (IMPORTANT)
```js
// CORRECT — preserves is_active, handles multi-tournament
async function upsertPlayer(playerId, nickname, teamId, tournamentId) {
  await dbRun(`INSERT OR IGNORE INTO players (id, nickname, is_active, last_synced) VALUES (?, ?, 1, CURRENT_TIMESTAMP)`, [playerId, nickname]);
  await dbRun(`UPDATE players SET nickname = ?, last_synced = CURRENT_TIMESTAMP WHERE id = ?`, [nickname, playerId]);
  await dbRun(`INSERT OR REPLACE INTO player_tournaments (player_id, tournament_id, team_id) VALUES (?, ?, ?)`, [playerId, tournamentId, teamId]);
}

// WRONG — overwrites is_active and wipes other tournament associations
await dbRun(`INSERT OR REPLACE INTO players ...`);
```

---

## 6. Grid API Integration

- External API: Grid.gg GraphQL (Central Data + Live Data Feed).
- API key is embedded in `server/services/gridApi.js` (not in .env, by design).
- All Grid API calls go through `server/services/gridApi.js`.
- All DB sync logic goes through `server/services/dataAdapter.js`.
- Rate limiting: `sleep(200ms)` between roster fetches to avoid hitting Grid API limits.

### Player Lookup Order (findPlayer)
1. By Grid player ID (exact match in `player_tournaments`)
2. By normalized nickname (lowercase, trimmed) in `player_tournaments` JOIN `players`
3. By alias in `player_aliases` JOIN `player_tournaments`

---

## 7. File Organization

```
server/
  routes/          # One file per resource (auth, leagues, players, fantasyTeams, tournaments, admin)
  services/        # Business logic (gridApi.js, dataAdapter.js)
  middleware/      # Express middleware (auth.js)
  migrations/      # One-off migration scripts
  database.js      # Schema + DB init
  server.js        # App setup, middleware, route mounting

client/src/
  pages/           # One file per page/route
  components/      # Shared reusable components (SearchableSelect, etc.)
  styles/          # One CSS file per page, plus global.css
  utils/           # Pure utility functions (flag.jsx)
  App.jsx          # Routes, AuthContext, nav
  main.jsx         # Entry point
```

- **Do not create new folders** unless absolutely necessary.
- **Do not create new utility files** for one-off functions — put helpers inline or in the relevant module.

---

## 8. What NOT to Do

- Do not use TypeScript, Tailwind, Redux, Axios, or any new framework/library without asking first.
- Do not add loading skeletons, toast notifications, or animation libraries without asking.
- Do not refactor working code that wasn't part of the request.
- Do not add `console.log` statements in frontend code.
- Do not add `console.log` in backend routes (only in services where `[DATA ADAPTER]` prefix is used).
- Do not create README or documentation files unless asked.
- Do not add `.env.example` or configuration documentation files.
- Do not install new npm packages without asking first.
