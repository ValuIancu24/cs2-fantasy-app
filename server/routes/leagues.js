const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// CREATE LEAGUE
router.post('/', authMiddleware, (req, res) => {
  const { name, isPrivate, joinCode } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'League name is required' });
  }
  const code = isPrivate ? (joinCode || Math.random().toString(36).substring(2, 8).toUpperCase()) : null;

  db.run(
    'INSERT INTO leagues (name, creator_id, status, join_code) VALUES (?, ?, ?, ?)',
    [name.trim(), req.user.id, 'active', code],
    function(err) {
      if (err) return res.status(500).json({ message: 'Failed to create league' });
      
      const leagueId = this.lastID;
      db.run('INSERT INTO league_members (league_id, user_id) VALUES (?, ?)', [leagueId, req.user.id], (err) => {
        if (err) return res.status(500).json({ message: 'Failed to join league' });
        res.status(201).json({ id: leagueId, name: name.trim(), join_code: code });
      });
    }
  );
});

// GET USER'S LEAGUES
router.get('/', authMiddleware, (req, res) => {
  db.all(
    `SELECT l.*, 
            (SELECT COUNT(*) FROM league_members lm WHERE lm.league_id = l.id) as member_count
     FROM leagues l
     JOIN league_members m ON m.league_id = l.id
     WHERE m.user_id = ?
     ORDER BY l.created_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows || []);
    }
  );
});

// JOIN LEAGUE
router.post('/:id/join', authMiddleware, (req, res) => {
  const leagueId = parseInt(req.params.id, 10);
  const { joinCode } = req.body || {};

  db.get('SELECT * FROM leagues WHERE id = ?', [leagueId], (err, league) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!league) return res.status(404).json({ message: 'League not found' });
    if (league.status !== 'active') return res.status(400).json({ message: 'League not active' });
    if (league.join_code && (!joinCode || joinCode.toUpperCase() !== league.join_code.toUpperCase())) {
      return res.status(400).json({ message: 'Invalid join code' });
    }

    db.run('INSERT INTO league_members (league_id, user_id) VALUES (?, ?)', [leagueId, req.user.id], (err) => {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') return res.status(400).json({ message: 'Already joined' });
        return res.status(500).json({ message: 'Failed to join' });
      }
      res.json({ message: 'Joined successfully' });
    });
  });
});

// LEAVE LEAGUE
router.delete('/:id/leave', authMiddleware, (req, res) => {
  const leagueId = parseInt(req.params.id, 10);

  db.run('DELETE FROM fantasy_teams WHERE league_id = ? AND user_id = ?', [leagueId, req.user.id], (err) => {
    if (err) return res.status(500).json({ message: 'Failed to delete team' });
    
    db.run('DELETE FROM league_members WHERE league_id = ? AND user_id = ?', [leagueId, req.user.id], (err) => {
      if (err) return res.status(500).json({ message: 'Failed to leave' });
      res.json({ message: 'Left successfully' });
    });
  });
});

// GET LEAGUE MEMBERS
router.get('/:id/members', authMiddleware, (req, res) => {
  const leagueId = parseInt(req.params.id, 10);

  db.get('SELECT * FROM leagues WHERE id = ?', [leagueId], (err, league) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!league) return res.status(404).json({ message: 'League not found' });

    db.all(
      `SELECT u.id, u.username, u.country_code, u.profile_picture, u.role, lm.joined_at
       FROM league_members lm
       JOIN users u ON u.id = lm.user_id
       WHERE lm.league_id = ?
       ORDER BY lm.joined_at ASC`,
      [leagueId],
      (err, members) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json({ league, members: members || [] });
      }
    );
  });
});

module.exports = router;