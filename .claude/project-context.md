# CS2 Fantasy App — Project Context

Full documentation for the CS2 fantasy esports platform. Read this before making any changes.

---

## 1. What This App Does

A fantasy esports platform for CS2 (Counter-Strike 2) tournaments. Users:
1. Pick an active tournament
2. Join or create a league (public or private with invite code)
3. Draft a team of 5 players from that tournament's roster
4. Earn points based on real match K/D/A stats + series wins/losses
5. Compete on a leaderboard against other users in the same league

Stats are synced from the Grid.gg API by admins after matches are played.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, React Router v6 |
| Backend | Node.js, Express.js |
| Database | SQLite3 (single file: `server/database.db`) |
| Auth | JWT (jsonwebtoken) + bcrypt |
| External API | Grid.gg GraphQL API (tournament/match/player data) |
| File uploads | Multer (profile pics + tournament banners) |
| Language | JavaScript only — no TypeScript |

**No CSS framework** — custom CSS in `client/src/styles/`. Dark theme, purple accent (`#7c3aed`).

---

## 3. Project Structure

```
cs2-fantasy-app/
├── client/                    # React frontend (port 5173)
│   ├── public/
│   │   └── uploads/
│   │       ├── banners/       # Tournament header images
│   │       └── profiles/      # User profile pictures
│   └── src/
│       ├── pages/             # One file per route
│       ├── components/        # Shared components
│       ├── styles/            # One CSS file per page + global.css
│       ├── utils/             # flag.jsx (country flag helper)
│       ├── App.jsx            # Routes + AuthContext + nav header
│       └── main.jsx
│
├── server/                    # Express backend (port 5000)
│   ├── routes/                # REST API handlers
│   ├── services/              # gridApi.js + dataAdapter.js
│   ├── middleware/            # auth.js (JWT validation)
│   ├── database.js            # SQLite schema + migrations
│   ├── database.db            # SQLite database file
│   └── server.js              # App entry point
│
└── .env                       # JWT_SECRET, PORT
```

---

## 4. Database Schema

### users
```sql
id, username (UNIQUE), email (UNIQUE), password (bcrypt), role ('user'|'admin'),
country_code, profile_picture, created_at
```
Default admin: username=`admin`, password=`admin123`.

### tournaments
```sql
id (Grid tournament ID), name, name_short,
status ('active'|'historical'),
is_visible (1=visible, 0=hidden/off-the-record),
banner_url, last_synced
```
- `status='active' AND is_visible=1` → appears on My Fantasy page
- `status='historical' AND is_visible=1` → appears on Finished Tournaments page
- `is_visible=0` → hidden from users, used for off-the-record historical data (future: pricing/charts)

### teams
```sql
id (Grid team ID), name, tournament_id
PRIMARY KEY (id, tournament_id)
```
A team can appear in multiple tournaments with different IDs (Grid uses different IDs per event).

### players
```sql
id (Grid player ID), nickname, team_id, tournament_id,
is_active (0|1), last_synced
```
- `is_active=0` means admin deactivated player (excluded from team builder)
- **IMPORTANT**: `team_id` and `tournament_id` here are from the LAST sync. Use `player_tournaments` for the real many-to-many association.

### player_tournaments ← CRITICAL TABLE
```sql
player_id, tournament_id, team_id
PRIMARY KEY (player_id, tournament_id)
```
Many-to-many between players and tournaments. A player can be in multiple tournaments (e.g., same player at BLAST and IEM RIO). All queries filtering players by tournament MUST join through this table.

```sql
-- Correct pattern
SELECT p.* FROM players p
JOIN player_tournaments pt ON pt.player_id = p.id
WHERE pt.tournament_id = ? AND p.is_active = 1
```

### player_aliases
```sql
id, player_id, alias (lowercase)
UNIQUE (player_id, alias)
```
Used when Grid API returns different names for the same player across events.

### player_stats
```sql
id, player_id, series_id, tournament_id, game_number,
kills, deaths, assists, calculated_points,
team_win (1=won series, 0=lost), match_date
UNIQUE (player_id, series_id, game_number)
```
One row per player per game (map) per series.

### leagues
```sql
id, name, creator_id, status ('active'), tournament_id,
is_public (0|1), invite_code (6-char), join_code,
created_at
```

### league_members
```sql
id, league_id, user_id, joined_at
UNIQUE (league_id, user_id)
```

### fantasy_teams
```sql
id, user_id, league_id, team_name, lineup (JSON array of player IDs),
budget_spent, total_points, rating_points, team_points,
created_at
UNIQUE (user_id, league_id)
UNIQUE (league_id, team_name)
```

### series_cache
```sql
id (series ID), tournament_id, team1_name, team2_name,
format ('BO1'|'BO3'|'BO5'), scheduled_at
```

---

## 5. Scoring System

```
Rating Points = (kills × 2) + (assists × 1) - (deaths × 1)  [per series, summed across games]
Team Points   = +15 per series WIN, -15 per series LOSS
Total Points  = Rating Points + Team Points
```

Points are recalculated via `dataAdapter.recalculateFantasyPoints(tournamentId)` after each stats sync.

---

## 6. Team Builder Constraints

- **5 players** per fantasy team (exactly).
- **Max 2 players** from the same real CS2 team.
- **Budget**: each player has a price (from `players.price`), total must not exceed budget cap.
  - **NOTE**: Pricing system is a planned feature — not yet fully implemented.
- Players with `is_active=0` do not appear in the builder.

---

## 7. API Endpoints Summary

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/tournaments/active` | Active visible tournaments |
| GET | `/api/players` | All active players (optional `?league_id=`) |

### Authenticated (JWT required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/profile` | Current user info |
| PUT | `/api/auth/profile` | Update username/email/country |
| PUT | `/api/auth/password` | Change password |
| POST | `/api/auth/profile-picture` | Upload profile picture |
| GET | `/api/tournaments/historical` | Finished visible tournaments |
| GET | `/api/tournaments/:id/info` | Single tournament details |
| GET | `/api/tournaments/:id/leagues` | Leagues for a tournament |
| POST | `/api/leagues` | Create league |
| GET | `/api/leagues` | User's leagues |
| POST | `/api/leagues/:id/join` | Join league |
| DELETE | `/api/leagues/:id/leave` | Leave league |
| GET | `/api/leagues/:id/members` | League member list |
| POST | `/api/fantasy-teams` | Create fantasy team |
| GET | `/api/fantasy-teams/:leagueId` | User's team for league |
| PUT | `/api/fantasy-teams/:id` | Update team |
| GET | `/api/fantasy-teams/:leagueId/breakdown` | Per-series stat breakdown |
| GET | `/api/fantasy-teams/league/:leagueId/leaderboard` | League standings (paginated, 6/page) |

### Admin only (`role='admin'` required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | System stats |
| GET | `/api/admin/tournaments` | All tournaments |
| PATCH | `/api/admin/tournaments/:id/status` | Update status/visibility |
| DELETE | `/api/admin/tournaments/:id` | Delete tournament + data |
| POST | `/api/admin/tournaments/:id/banner` | Upload banner image |
| GET | `/api/admin/tournament/:id/matches` | Preview matches from Grid |
| POST | `/api/admin/sync-tournament/:id` | Sync tournament from Grid |
| POST | `/api/admin/sync-stats/:id` | Sync match stats from Grid |
| GET | `/api/admin/tournament/:id/players` | Players grouped by team |
| PATCH | `/api/admin/players/:id/active` | Toggle player active |
| GET | `/api/admin/players/:id/aliases` | Player aliases |
| POST | `/api/admin/players/:id/aliases` | Add alias |
| DELETE | `/api/admin/player-aliases/:id` | Delete alias |
| POST | `/api/admin/wipe-tournament-data` | Wipe all data |

---

## 8. External API: Grid.gg

Base URLs:
- Central data: `https://api-op.grid.gg/central-data/graphql`
- Live data: `https://api-op.grid.gg/live-data-feed/series-state/graphql`

Functions in `server/services/gridApi.js`:
- `getTournamentMatches(tournamentId)` — paginated GraphQL, returns all series
- `getTeamRoster(teamId)` — returns active CS2 players for a team (game title ID 25)
- `getMatchStats(seriesId)` — returns per-game K/D/A for all players in a series

**Known issues:**
- Grid can have multiple team IDs for the same organization across tournaments (e.g., "B8" vs "B8 Esports")
- Grid sometimes returns partial rosters — `dataAdapter` has a retry pass for 0-player teams
- Player aliases are needed when Grid uses different nicknames across events

---

## 9. Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Public landing page (redirects to `/my-fantasy` if logged in) |
| `/login` | Login | Auth form |
| `/register` | Register | Account creation |
| `/my-fantasy` | MyFantasy | Active tournament cards → navigate to leagues |
| `/finished-tournaments` | FinishedTournaments | Historical tournament cards |
| `/tournament/:id/leagues` | TournamentLeagues | View/join/create leagues; read-only if tournament is historical |
| `/team-builder/:leagueId` | TeamBuilder | Draft 5-player team |
| `/my-team` | MyTeam | View team + per-series breakdown; `?league=X` pre-selects league |
| `/leaderboard` | Leaderboard | League standings; `?league=X` pre-selects league |
| `/leagues` | LeaguesRedirect | Smart redirect based on user's league count |
| `/profile` | Profile | User settings + profile picture |
| `/admin` | AdminDashboard | Admin toolkit (sync, manage, delete tournaments) |

### AuthContext (App.jsx)
Available in every component via `useContext(AuthContext)`:
```js
{
  user: { id, username, email, role, country_code, profile_picture },
  setUser,
  loading,
  apiBase: 'http://localhost:5000/api'
}
```

---

## 10. Implemented Features

- [x] User registration + login (JWT)
- [x] Profile page (update username, email, country, password, profile picture)
- [x] Country flags (flagcdn.com)
- [x] Active tournament listing with banner images
- [x] Finished/historical tournament page
- [x] Public and private leagues (invite codes visible to all members)
- [x] Fantasy team builder (5 players, max 2/team constraint)
- [x] Per-series K/D/A stat breakdown in My Team page
- [x] Leaderboard with pagination (6 teams/page)
- [x] Admin: tournament sync from Grid API
- [x] Admin: stats sync + auto fantasy point recalculation
- [x] Admin: player active/inactive toggle
- [x] Admin: player alias management for name matching
- [x] Admin: tournament banner upload
- [x] Admin: mark tournament as finished / reactivate
- [x] Admin: hide/show tournaments (is_visible flag)
- [x] Admin: delete tournament + all related data
- [x] Admin: wipe all data
- [x] Multi-tournament player support (player_tournaments junction table)
- [x] Read-only league view for finished tournaments
- [x] SearchableSelect reusable dropdown component

---

## 11. Planned Features (not yet implemented)

### Pricing System
- Each player gets a price based on weighted average performance across last 3 historical tournaments
- Budget cap for fantasy team selection
- Admin can trigger repricing
- Blocked by: need enough historical tournament data synced (off-the-record)

### Charts / Statistics
- Per-player performance trend (Recharts library)
- KDA breakdown chart
- Win rate over time
- Shown on player profile or My Team page

### Role System
- Roles: AWPer, Entry Fragger, Support, Lurker, IGL
- Point bonuses per role
- Affects team builder selection

### Team Edit Lock
- Prevent team edits after first match of tournament starts
- Already has a memory entry: `project_edit_team_timing.md`
- Deferred — to be implemented at the end

---

## 12. Known Data Issues / Edge Cases

1. **Multiple team IDs for same org**: Grid assigns different IDs to the same team across tournaments (e.g., "Aurora" = 50074 at one event, 55711 at another). Both are valid — queries are scoped by `tournament_id`.

2. **Player name mismatches**: Grid API may call the same player by different names across events. Use `player_aliases` to handle this. Admin can add aliases manually.

3. **Partial roster sync**: Grid sometimes returns 0 players for a team on first API call. `dataAdapter.syncTournament` has a second-pass retry for teams with 0 players.

4. **is_active preservation**: When re-syncing a tournament, player `is_active` flags must not be reset. Always use `upsertPlayer()` pattern, never `INSERT OR REPLACE INTO players`.

5. **Historical stats gap**: When a tournament is synced after it's finished, `team_win` is detected from the series result. Series with no winner cannot award team points.

---

## 13. Dev Setup

```bash
# Backend (port 5000)
cd server && npm run dev

# Frontend (port 5173)
cd client && npm run dev
```

Environment variables in `.env` (server root):
```
JWT_SECRET=<secret>
PORT=5000
```

Default admin credentials:
- Username: `admin`
- Password: `admin123`
