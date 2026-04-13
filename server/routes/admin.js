const express = require('express');
const path = require('path');
const multer = require('multer');
const db = require('../database');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const gridApi = require('../services/gridApi');
const dataAdapter = require('../services/dataAdapter');

const router = express.Router();

// Multer config for tournament banners
const bannerStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'client', 'public', 'uploads', 'banners'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `tournament_${req.params.id}${ext}`);
  }
});
const uploadBanner = multer({
  storage: bannerStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    cb(null, /image\/(jpeg|png|webp|gif)/.test(file.mimetype));
  }
});

// ── STATS ────────────────────────────────────────────────────────────────────

router.get('/stats', authMiddleware, requireAdmin, (req, res) => {
  db.get('SELECT COUNT(*) as c FROM users', [], (e1, r1) => {
    db.get('SELECT COUNT(*) as c FROM leagues', [], (e2, r2) => {
      db.get('SELECT COUNT(*) as c FROM fantasy_teams', [], (e3, r3) => {
        db.get('SELECT COUNT(*) as c FROM tournaments', [], (e4, r4) => {
          db.get('SELECT COUNT(*) as c FROM players WHERE is_active = 1', [], (_e5, r5) => {
            res.json({
              total_users: r1?.c ?? 0,
              total_leagues: r2?.c ?? 0,
              total_fantasy_teams: r3?.c ?? 0,
              total_tournaments: r4?.c ?? 0,
              total_players: r5?.c ?? 0
            });
          });
        });
      });
    });
  });
});

// ── TOURNAMENT SYNC ──────────────────────────────────────────────────────────

router.get('/tournament/:tournamentId/matches', authMiddleware, requireAdmin, async (req, res) => {
  const tournamentId = parseInt(req.params.tournamentId, 10);
  if (!tournamentId) return res.status(400).json({ message: 'Invalid tournament ID' });

  try {
    const data = await gridApi.getTournamentMatches(tournamentId);
    const matches = data.edges.map(edge => {
      const node = edge.node;
      const teams = node.teams.map(t => t.baseInfo?.name).filter(Boolean);
      return {
        id: node.id,
        teams,
        scheduledAt: node.startTimeScheduled || null,
        format: node.format?.nameShortened || null,
        tournament: node.tournament
          ? { id: node.tournament.id, name: node.tournament.name, nameShort: node.tournament.nameShortened }
          : null
      };
    });
    res.json({ totalCount: data.totalCount, matches });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch matches from Grid API' });
  }
});

router.post('/sync-tournament/:tournamentId', authMiddleware, requireAdmin, async (req, res) => {
  const tournamentId = parseInt(req.params.tournamentId, 10);
  if (!tournamentId) return res.status(400).json({ message: 'Invalid tournament ID' });

  try {
    const result = await dataAdapter.syncTournament(tournamentId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Sync failed' });
  }
});

router.post('/sync-stats/:tournamentId', authMiddleware, requireAdmin, async (req, res) => {
  const tournamentId = parseInt(req.params.tournamentId, 10);
  if (!tournamentId) return res.status(400).json({ message: 'Invalid tournament ID' });

  try {
    const result = await dataAdapter.syncTournamentStats(tournamentId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Stats sync failed' });
  }
});

// ── PLAYER MANAGEMENT ────────────────────────────────────────────────────────

// GET players for a tournament, grouped by team
router.get('/tournament/:tournamentId/players', authMiddleware, requireAdmin, (req, res) => {
  const tournamentId = parseInt(req.params.tournamentId, 10);

  db.all(
    `SELECT p.id, p.nickname, p.is_active, p.team_id, t.name as team_name
     FROM players p
     LEFT JOIN teams t ON t.id = p.team_id AND t.tournament_id = p.tournament_id
     WHERE p.tournament_id = ?
     ORDER BY t.name, p.nickname`,
    [tournamentId],
    (err, players) => {
      if (err) return res.status(500).json({ message: 'Database error' });

      // Group by team
      const teamsMap = {};
      (players || []).forEach(p => {
        const key = p.team_name || 'Unknown';
        if (!teamsMap[key]) teamsMap[key] = { team_name: key, team_id: p.team_id, players: [] };
        teamsMap[key].players.push({ id: p.id, nickname: p.nickname, is_active: p.is_active });
      });

      res.json(Object.values(teamsMap));
    }
  );
});

// GET aliases for a player
router.get('/players/:playerId/aliases', authMiddleware, requireAdmin, (req, res) => {
  db.all(
    'SELECT id, alias FROM player_aliases WHERE player_id = ?',
    [req.params.playerId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows || []);
    }
  );
});

// TOGGLE player active status
router.patch('/players/:playerId/active', authMiddleware, requireAdmin, (req, res) => {
  const { is_active } = req.body;
  db.run(
    'UPDATE players SET is_active = ? WHERE id = ?',
    [is_active ? 1 : 0, req.params.playerId],
    (err) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Updated' });
    }
  );
});

// ADD alias for a player
router.post('/players/:playerId/aliases', authMiddleware, requireAdmin, (req, res) => {
  const { alias } = req.body;
  if (!alias || !alias.trim()) return res.status(400).json({ message: 'Alias required' });

  db.run(
    'INSERT OR IGNORE INTO player_aliases (player_id, alias) VALUES (?, ?)',
    [req.params.playerId, alias.trim().toLowerCase()],
    function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ id: this.lastID, alias: alias.trim().toLowerCase() });
    }
  );
});

// DELETE alias
router.delete('/player-aliases/:aliasId', authMiddleware, requireAdmin, (req, res) => {
  db.run('DELETE FROM player_aliases WHERE id = ?', [req.params.aliasId], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message: 'Deleted' });
  });
});

// ── WIPE ─────────────────────────────────────────────────────────────────────

router.post('/wipe-tournament-data', authMiddleware, requireAdmin, (req, res) => {
  db.serialize(() => {
    db.run('DELETE FROM player_stats');
    db.run('DELETE FROM player_aliases');
    db.run('DELETE FROM series_cache');
    db.run('DELETE FROM players');
    db.run('DELETE FROM teams');
    db.run('DELETE FROM tournaments');
    db.run(
      `UPDATE fantasy_teams SET lineup = '[]', total_points = 0, rating_points = 0, team_points = 0`,
      (err) => {
        if (err) return res.status(500).json({ message: 'Wipe failed' });
        res.json({ message: 'All tournament data wiped. Fantasy team lineups reset.' });
      }
    );
  });
});

// ── TOURNAMENT BANNER ─────────────────────────────────────────────────────────

router.post('/tournaments/:id/banner', authMiddleware, requireAdmin, uploadBanner.single('banner'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ message: 'Invalid tournament ID' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const bannerUrl = `/uploads/banners/${req.file.filename}`;
  db.run(
    `UPDATE tournaments SET banner_url = ? WHERE id = ?`,
    [bannerUrl, id],
    function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (this.changes === 0) return res.status(404).json({ message: 'Tournament not found' });
      res.json({ success: true, banner_url: bannerUrl });
    }
  );
});

module.exports = router;
