const express = require('express');
const db = require('../database');

const router = express.Router();

// GET /api/players?league_id=X  →  players from that league's tournament
// GET /api/players               →  all players in DB (fallback)
router.get('/', (req, res) => {
  const leagueId = req.query.league_id ? parseInt(req.query.league_id, 10) : null;

  if (!leagueId) {
    db.all(
      `SELECT p.id, p.nickname, p.team_id, p.tournament_id, t.name AS team_name
       FROM players p
       LEFT JOIN teams t ON t.id = p.team_id AND t.tournament_id = p.tournament_id
       WHERE p.is_active = 1
       ORDER BY t.name, p.nickname`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json(rows || []);
      }
    );
    return;
  }

  db.get('SELECT tournament_id FROM leagues WHERE id = ?', [leagueId], (err, league) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!league || !league.tournament_id) {
      return res.status(404).json({ message: 'League or tournament not found' });
    }

    db.all(
      `SELECT p.id, p.nickname, p.team_id, p.tournament_id, t.name AS team_name
       FROM players p
       LEFT JOIN teams t ON t.id = p.team_id AND t.tournament_id = p.tournament_id
       WHERE p.tournament_id = ? AND p.is_active = 1
       ORDER BY t.name, p.nickname`,
      [league.tournament_id],
      (err, rows) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json(rows || []);
      }
    );
  });
});

module.exports = router;
