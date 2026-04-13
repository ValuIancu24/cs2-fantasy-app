const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/tournaments/active
router.get('/active', (req, res) => {
  db.all(
    `SELECT id, name, name_short, status, last_synced, banner_url FROM tournaments WHERE status = 'active' ORDER BY last_synced DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows || []);
    }
  );
});

// GET /api/tournaments/:tournamentId/leagues
router.get('/:tournamentId/leagues', authMiddleware, (req, res) => {
  const tournamentId = parseInt(req.params.tournamentId, 10);
  if (!tournamentId) return res.status(400).json({ message: 'Invalid tournament ID' });

  db.all(
    `SELECT
       l.id,
       l.name,
       l.is_public,
       l.invite_code,
       l.created_at,
       l.creator_id,
       u.username AS creator_name,
       u.profile_picture AS creator_picture,
       u.country_code AS creator_country,
       (SELECT COUNT(*) FROM league_members lm WHERE lm.league_id = l.id) AS member_count,
       EXISTS(SELECT 1 FROM league_members lm2 WHERE lm2.league_id = l.id AND lm2.user_id = ?) AS is_member
     FROM leagues l
     JOIN users u ON u.id = l.creator_id
     WHERE l.tournament_id = ?
     ORDER BY l.created_at DESC`,
    [req.user.id, tournamentId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows || []);
    }
  );
});

module.exports = router;
