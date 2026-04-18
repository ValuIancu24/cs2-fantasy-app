const express = require('express');
const db = require('../database');

const router = express.Router();

const PLAYER_SELECT = `SELECT p.id, p.nickname, pt.team_id, pt.tournament_id, p.price, t.name AS team_name
       FROM players p
       JOIN player_tournaments pt ON pt.player_id = p.id
       LEFT JOIN teams t ON t.id = pt.team_id AND t.tournament_id = pt.tournament_id`;

// GET /api/players?league_id=X      → players from that league's tournament
// GET /api/players?tournament_id=X  → players from that tournament
// GET /api/players                  → all players in DB (fallback)
router.get('/', (req, res) => {
  const leagueId = req.query.league_id ? parseInt(req.query.league_id, 10) : null;
  const tournamentId = req.query.tournament_id ? parseInt(req.query.tournament_id, 10) : null;

  if (tournamentId) {
    db.all(
      `${PLAYER_SELECT} WHERE pt.tournament_id = ? AND p.is_active = 1 ORDER BY t.name, p.nickname`,
      [tournamentId],
      (err, rows) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json(rows || []);
      }
    );
    return;
  }

  if (!leagueId) {
    db.all(
      `SELECT p.id, p.nickname, pt.team_id, pt.tournament_id, p.price, t.name AS team_name
       FROM players p
       LEFT JOIN player_tournaments pt ON pt.player_id = p.id
       LEFT JOIN teams t ON t.id = pt.team_id AND t.tournament_id = pt.tournament_id
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
      `${PLAYER_SELECT} WHERE pt.tournament_id = ? AND p.is_active = 1 ORDER BY t.name, p.nickname`,
      [league.tournament_id],
      (err, rows) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json(rows || []);
      }
    );
  });
});

// GET /api/players/:playerId?tournament_id=X
router.get('/:playerId', (req, res) => {
  const playerId = parseInt(req.params.playerId, 10);
  const tournamentId = req.query.tournament_id ? parseInt(req.query.tournament_id, 10) : null;

  if (!playerId) return res.status(400).json({ message: 'Invalid player ID' });

  if (tournamentId) {
    db.get(
      `${PLAYER_SELECT} WHERE p.id = ? AND pt.tournament_id = ?`,
      [playerId, tournamentId],
      (err, row) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        if (!row) return res.status(404).json({ message: 'Player not found' });
        res.json(row);
      }
    );
  } else {
    db.get(
      `SELECT p.id, p.nickname, p.price FROM players p WHERE p.id = ?`,
      [playerId],
      (err, row) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        if (!row) return res.status(404).json({ message: 'Player not found' });
        res.json(row);
      }
    );
  }
});

module.exports = router;
