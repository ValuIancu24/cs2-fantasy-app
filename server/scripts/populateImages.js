require('dotenv').config({ path: '../../.env' });

const fs = require('fs');
const path = require('path');
const db = require('../database');

const TEAMS_DIR = path.join(__dirname, '..', '..', 'client', 'public', 'images', 'teams');
const PLAYERS_DIR = path.join(__dirname, '..', '..', 'client', 'public', 'images', 'players');

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .trim();
}

function buildFileMap(dir) {
  const files = fs.readdirSync(dir);
  const map = new Map();
  for (const f of files) {
    const stem = normalize(path.parse(f).name);
    map.set(stem, f);
  }
  return map;
}

// Manual overrides for team names that don't normalize predictably
const TEAM_OVERRIDES = {
  'natus vincere': 'navi',
  'ninjas in pyjamas': 'nip',
  'red canids': 'red_canids',
};

function matchTeam(name, fileMap) {
  const norm = normalize(name);
  const lower = name.toLowerCase();

  if (TEAM_OVERRIDES[lower] && fileMap.has(TEAM_OVERRIDES[lower])) return fileMap.get(TEAM_OVERRIDES[lower]);
  if (fileMap.has(norm)) return fileMap.get(norm);

  const compact = norm.replace(/_/g, '');
  if (fileMap.has(compact)) return fileMap.get(compact);

  const words = norm.split('_').filter(w => w.length >= 2);
  for (const word of words) {
    if (fileMap.has(word)) return fileMap.get(word);
  }

  for (const [stem, file] of fileMap.entries()) {
    if (norm.includes(stem) && stem.length >= 2) return file;
  }

  return null;
}

function run() {
  const teamFiles = buildFileMap(TEAMS_DIR);
  const playerFiles = buildFileMap(PLAYERS_DIR);

  setTimeout(() => {
    db.all('SELECT id, nickname FROM players', [], (err, players) => {
      if (err) { console.error('DB error:', err.message); return; }

      let matched = 0, unmatched = [];
      for (const p of players) {
        const norm = normalize(p.nickname);
        const file = playerFiles.get(norm) || null;
        if (file) {
          const url = `/images/players/${file}`;
          db.run('UPDATE players SET image_url = ? WHERE id = ?', [url, p.id]);
          matched++;
        } else {
          unmatched.push(p.nickname);
        }
      }
      console.log(`[PLAYERS] Matched: ${matched}/${players.length}`);
      if (unmatched.length) console.log(`[PLAYERS] No image found for: ${unmatched.join(', ')}`);
    });

    db.all('SELECT id, name, tournament_id FROM teams', [], (err, teams) => {
      if (err) { console.error('DB error:', err.message); return; }

      const seen = new Set();
      let matched = 0, unmatched = [];
      for (const t of teams) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);

        const file = matchTeam(t.name, teamFiles);
        if (file) {
          const url = `/images/teams/${file}`;
          db.run('UPDATE teams SET image_url = ? WHERE id = ?', [url, t.id]);
          matched++;
        } else {
          unmatched.push(t.name);
        }
      }
      console.log(`[TEAMS] Matched: ${matched}/${seen.size}`);
      if (unmatched.length) console.log(`[TEAMS] No image found for: ${unmatched.join(', ')}`);

      setTimeout(() => process.exit(0), 500);
    });
  }, 500);
}

run();
