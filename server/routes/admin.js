const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../database');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const gridApi = require('../services/gridApi');
const dataAdapter = require('../services/dataAdapter');

const router = express.Router();

const bannersDir = path.join(__dirname, '..', '..', 'client', 'public', 'uploads', 'banners');
fs.mkdirSync(bannersDir, { recursive: true });

const ALLOWED_MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

const bannerStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'client', 'public', 'uploads', 'banners'),
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME_EXTENSIONS[file.mimetype];
    if (!ext) return cb(new Error('Invalid file type'));
    cb(null, `tournament_${req.params.id}_${Date.now()}${ext}`);
  }
});
const uploadBanner = multer({
  storage: bannerStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_EXTENSIONS[file.mimetype]) {
      return cb(new Error('Only JPEG, PNG, WebP and GIF images are allowed'));
    }
    cb(null, true);
  }
});

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

router.get('/tournament/:tournamentId/price-breakdown', authMiddleware, requireAdmin, async (req, res) => {
  const tournamentId = parseInt(req.params.tournamentId, 10);
  if (!tournamentId) return res.status(400).json({ message: 'Invalid tournament ID' });
  try {
    const result = await dataAdapter.getPriceBreakdown(tournamentId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to get price breakdown' });
  }
});

router.post('/calculate-prices/:tournamentId', authMiddleware, requireAdmin, async (req, res) => {
  const tournamentId = parseInt(req.params.tournamentId, 10);
  if (!tournamentId) return res.status(400).json({ message: 'Invalid tournament ID' });

  try {
    const result = await dataAdapter.calculatePrices(tournamentId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Price calculation failed' });
  }
});

router.get('/tournament/:tournamentId/players', authMiddleware, requireAdmin, (req, res) => {
  const tournamentId = parseInt(req.params.tournamentId, 10);

  db.all(
    `SELECT p.id, p.nickname, p.is_active, pt.team_id, t.name as team_name
     FROM players p
     JOIN player_tournaments pt ON pt.player_id = p.id
     LEFT JOIN teams t ON t.id = pt.team_id AND t.tournament_id = pt.tournament_id
     WHERE pt.tournament_id = ?
     ORDER BY t.name, p.nickname`,
    [tournamentId],
    (err, players) => {
      if (err) return res.status(500).json({ message: 'Database error' });

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

router.delete('/player-aliases/:aliasId', authMiddleware, requireAdmin, (req, res) => {
  db.run('DELETE FROM player_aliases WHERE id = ?', [req.params.aliasId], (err) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message: 'Deleted' });
  });
});

router.get('/tournaments', authMiddleware, requireAdmin, (_req, res) => {
  db.all(
    `SELECT id, name, name_short, status, is_visible, last_synced, banner_url, start_date, end_date, auto_sync_stats, auto_sync_tournament,
            (SELECT MIN(scheduled_at) FROM series_cache WHERE tournament_id = tournaments.id) AS lock_time
     FROM tournaments ORDER BY datetime(COALESCE(start_date, last_synced)) DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows || []);
    }
  );
});

router.patch('/tournaments/:id/status', authMiddleware, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ message: 'Invalid tournament ID' });

  const { status, is_visible } = req.body;
  const updates = [];
  const params = [];

  if (status !== undefined) {
    if (!['active', 'historical'].includes(status)) {
      return res.status(400).json({ message: "status must be 'active' or 'historical'" });
    }
    updates.push('status = ?');
    params.push(status);
  }
  if (is_visible !== undefined) {
    if (![0, 1, true, false].includes(is_visible)) {
      return res.status(400).json({ message: 'is_visible must be 0 or 1' });
    }
    updates.push('is_visible = ?');
    params.push(is_visible ? 1 : 0);
  }
  if (updates.length === 0) return res.status(400).json({ message: 'Nothing to update' });

  params.push(id);
  db.run(`UPDATE tournaments SET ${updates.join(', ')} WHERE id = ?`, params, function (err) {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (this.changes === 0) return res.status(404).json({ message: 'Tournament not found' });
    res.json({ success: true });
  });
});

router.patch('/tournaments/:id/auto-sync', authMiddleware, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ message: 'Invalid tournament ID' });

  const { type, enabled } = req.body;
  if (!['stats', 'tournament'].includes(type)) {
    return res.status(400).json({ message: "type must be 'stats' or 'tournament'" });
  }

  const col = type === 'stats' ? 'auto_sync_stats' : 'auto_sync_tournament';
  db.run(
    `UPDATE tournaments SET ${col} = ? WHERE id = ? AND status = 'active'`,
    [enabled ? 1 : 0, id],
    function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (this.changes === 0) return res.status(404).json({ message: 'Active tournament not found' });
      res.json({ success: true, [col]: enabled ? 1 : 0 });
    }
  );
});

router.get('/tournaments/:id/sync-logs', authMiddleware, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.all(
    `SELECT type, status, message, ran_at FROM sync_logs
     WHERE tournament_id = ?
     ORDER BY ran_at DESC
     LIMIT 20`,
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows || []);
    }
  );
});

router.delete('/tournaments/:id', authMiddleware, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ message: 'Invalid tournament ID' });

  db.run('BEGIN', (err) => {
    if (err) return res.status(500).json({ message: 'Failed to start transaction' });

    const rollback = (msg) => db.run('ROLLBACK', () => res.status(500).json({ message: msg }));

    db.serialize(() => {
      db.run('DELETE FROM player_stats WHERE tournament_id = ?', [id], (err) => { if (err) return rollback('Failed to delete player_stats'); });
      db.run('DELETE FROM series_cache WHERE tournament_id = ?', [id], (err) => { if (err) return rollback('Failed to delete series_cache'); });
      db.run('DELETE FROM player_tournaments WHERE tournament_id = ?', [id], (err) => { if (err) return rollback('Failed to delete player_tournaments'); });
      db.run('DELETE FROM teams WHERE tournament_id = ?', [id], (err) => { if (err) return rollback('Failed to delete teams'); });
      db.run('DELETE FROM fantasy_teams WHERE league_id IN (SELECT id FROM leagues WHERE tournament_id = ?)', [id], (err) => { if (err) return rollback('Failed to delete fantasy_teams'); });
      db.run('DELETE FROM league_members WHERE league_id IN (SELECT id FROM leagues WHERE tournament_id = ?)', [id], (err) => { if (err) return rollback('Failed to delete league_members'); });
      db.run('DELETE FROM leagues WHERE tournament_id = ?', [id], (err) => { if (err) return rollback('Failed to delete leagues'); });
      db.run('DELETE FROM tournaments WHERE id = ?', [id], function (err) {
        if (err) return rollback('Failed to delete tournament');
        if (this.changes === 0) return rollback('Tournament not found');
        db.run('COMMIT', (err) => {
          if (err) return rollback('Failed to commit');
          res.json({ success: true });
        });
      });
    });
  });
});

router.post('/tournaments/:id/banner', authMiddleware, requireAdmin,
  (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'Invalid tournament ID' });
    next();
  },
  uploadBanner.single('banner'),
  (req, res) => {
  const id = parseInt(req.params.id, 10);
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
