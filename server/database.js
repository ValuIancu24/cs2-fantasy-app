const path = require('path');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'database.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error(err);
  else console.log('✅ Connected to SQLite');
});

function initDatabase() {
  db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON');

    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      country_code TEXT,
      profile_picture TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS leagues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      creator_id INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      join_code TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS league_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(league_id, user_id),
      FOREIGN KEY (league_id) REFERENCES leagues(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS fantasy_teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      league_id INTEGER NOT NULL,
      team_name TEXT NOT NULL,
      lineup TEXT NOT NULL,
      budget_spent INTEGER NOT NULL,
      total_points INTEGER DEFAULT 0,
      rating_points INTEGER DEFAULT 0,
      team_points INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, league_id),
      UNIQUE(league_id, team_name),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (league_id) REFERENCES leagues(id)
    )`);

    db.run(`DROP TABLE IF EXISTS simulated_matches`);

    db.run(`CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      name_short TEXT,
      status TEXT DEFAULT 'active',
      last_synced DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS teams (
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      tournament_id INTEGER NOT NULL,
      PRIMARY KEY (id, tournament_id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      team_id TEXT,
      tournament_id INTEGER,
      last_synced DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS player_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT,
      series_id TEXT,
      tournament_id INTEGER,
      game_number INTEGER,
      kills INTEGER,
      deaths INTEGER,
      assists INTEGER,
      calculated_points REAL,
      match_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(player_id, series_id, game_number),
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS series_cache (
      id TEXT PRIMARY KEY,
      tournament_id INTEGER,
      team1_name TEXT,
      team2_name TEXT,
      format TEXT,
      scheduled_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS player_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      UNIQUE(player_id, alias),
      FOREIGN KEY (player_id) REFERENCES players(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS player_tournaments (
      player_id TEXT NOT NULL,
      tournament_id INTEGER NOT NULL,
      team_id TEXT,
      PRIMARY KEY (player_id, tournament_id),
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
    )`);

    // Migrations — silently ignore if column already exists
    db.run(`ALTER TABLE leagues ADD COLUMN tournament_id INTEGER`, () => {});
    db.run(`ALTER TABLE tournaments ADD COLUMN is_visible INTEGER DEFAULT 1`, () => {});
    db.run(`UPDATE tournaments SET is_visible = 1 WHERE is_visible IS NULL`, () => {});
    // Backfill player_tournaments from existing players rows
    db.run(`INSERT OR IGNORE INTO player_tournaments (player_id, tournament_id, team_id)
            SELECT id, tournament_id, team_id FROM players WHERE tournament_id IS NOT NULL`, () => {});
    db.run(`ALTER TABLE leagues ADD COLUMN is_public BOOLEAN DEFAULT 1`, () => {});
    db.run(`ALTER TABLE leagues ADD COLUMN invite_code TEXT`, () => {});
    db.run(`ALTER TABLE players ADD COLUMN is_active INTEGER DEFAULT 1`, () => {});
    db.run(`ALTER TABLE player_stats ADD COLUMN team_win INTEGER`, () => {});
    db.run(`ALTER TABLE tournaments ADD COLUMN banner_url TEXT`, () => {});
    db.run(`ALTER TABLE players ADD COLUMN price INTEGER DEFAULT 190000`, () => {});
    db.run(`ALTER TABLE tournaments ADD COLUMN start_date TEXT`, () => {});
    db.run(`ALTER TABLE tournaments ADD COLUMN end_date TEXT`, () => {});
    db.run(`ALTER TABLE player_tournaments ADD COLUMN price INTEGER`, () => {});
    db.run(`ALTER TABLE fantasy_teams ADD COLUMN captain_id TEXT`, () => {});
    db.run(`ALTER TABLE tournaments ADD COLUMN auto_sync_stats INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE tournaments ADD COLUMN auto_sync_tournament INTEGER DEFAULT 0`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      ran_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    )`);

    // Migrate player_tournaments to add ON DELETE CASCADE if missing
    db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='player_tournaments'`, [], (err, row) => {
      if (err || !row) return;
      if (row.sql && row.sql.includes('ON DELETE CASCADE')) return; // already migrated

      console.log('[DB] Migrating player_tournaments to add ON DELETE CASCADE...');
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS player_tournaments_new (
          player_id TEXT NOT NULL,
          tournament_id INTEGER NOT NULL,
          team_id TEXT,
          PRIMARY KEY (player_id, tournament_id),
          FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
          FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
        )`);
        db.run(`INSERT OR IGNORE INTO player_tournaments_new SELECT player_id, tournament_id, team_id FROM player_tournaments`);
        db.run(`DROP TABLE player_tournaments`);
        db.run(`ALTER TABLE player_tournaments_new RENAME TO player_tournaments`, (err) => {
          if (err) console.error('[DB] player_tournaments migration failed:', err.message);
          else console.log('[DB] player_tournaments migrated with ON DELETE CASCADE');
        });
      });
    });

    // Migrate teams table to composite PK (id, tournament_id) if still on old single-column PK
    db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='teams'`, [], (err, row) => {
      if (err || !row) return;
      const hasCompositePK = row.sql && row.sql.includes('PRIMARY KEY (id, tournament_id)');
      if (hasCompositePK) return; // already migrated

      console.log('[DB] Migrating teams table to composite primary key...');
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS teams_new (
          id TEXT NOT NULL,
          name TEXT NOT NULL,
          tournament_id INTEGER NOT NULL,
          PRIMARY KEY (id, tournament_id),
          FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
        )`);
        db.run(`INSERT OR IGNORE INTO teams_new (id, name, tournament_id) SELECT id, name, tournament_id FROM teams`);
        db.run(`DROP TABLE teams`);
        db.run(`ALTER TABLE teams_new RENAME TO teams`, (err) => {
          if (err) console.error('[DB] Teams migration failed:', err.message);
          else console.log('[DB] Teams table migrated to composite PK');
        });
      });
    });

    db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
      if (!row) {
        const passwordHash = bcrypt.hashSync('admin123', 10);
        db.run(
          `INSERT INTO users (username, email, password, role, country_code)
           VALUES (?, ?, ?, ?, ?)`,
          ['admin', 'admin@example.com', passwordHash, 'admin', 'RO'],
          () => console.log('✅ Admin user created')
        );
      }
    });
  });
}

initDatabase();
module.exports = db;