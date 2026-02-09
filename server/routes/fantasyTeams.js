const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const playersPath = path.join(__dirname, '..', '..', 'data', 'players.json');
const players = JSON.parse(fs.readFileSync(playersPath, 'utf-8'));

const BUDGET = 1000000;

function validateLineup(lineup) {
  if (!Array.isArray(lineup) || lineup.length !== 5) {
    return 'Lineup must contain exactly 5 players';
  }

  const selectedPlayers = lineup.map(id => players.find(p => p.id === String(id)));

  if (selectedPlayers.some(p => !p)) {
    return 'Invalid player in lineup';
  }

  const budgetSpent = selectedPlayers.reduce((sum, p) => sum + p.price, 0);
  if (budgetSpent > BUDGET) {
    return 'Budget exceeded';
  }

  const teamCounts = {};
  for (const p of selectedPlayers) {
    teamCounts[p.real_team] = (teamCounts[p.real_team] || 0) + 1;
    if (teamCounts[p.real_team] > 2) {
      return 'Maximum 2 players allowed from the same real team';
    }
  }

  return null;
}

function calculateBudget(lineup) {
  const selectedPlayers = lineup.map(id => players.find(p => p.id === String(id)));
  return selectedPlayers.reduce((sum, p) => sum + (p ? p.price : 0), 0);
}

// CREATE FANTASY TEAM
router.post('/', authMiddleware, (req, res) => {
  const { leagueId, teamName, lineup } = req.body;

  if (!leagueId || !teamName || !Array.isArray(lineup)) {
    return res.status(400).json({ message: 'leagueId, teamName and lineup required' });
  }

  const validationError = validateLineup(lineup);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  const budgetSpent = calculateBudget(lineup);

  db.run(
    `INSERT INTO fantasy_teams (user_id, league_id, team_name, lineup, budget_spent)
     VALUES (?, ?, ?, ?, ?)`,
    [req.user.id, leagueId, teamName.trim(), JSON.stringify(lineup.map(String)), budgetSpent],
    function(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          return res.status(400).json({ message: 'Already have team or name taken' });
        }
        return res.status(500).json({ message: 'Failed to create team' });
      }
      res.status(201).json({ id: this.lastID });
    }
  );
});

// GET USER'S TEAM FOR LEAGUE
router.get('/:leagueId', authMiddleware, (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);

  db.get('SELECT * FROM fantasy_teams WHERE league_id = ? AND user_id = ?', [leagueId, req.user.id], (err, team) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!team) return res.status(404).json({ message: 'Team not found' });

    const lineup = JSON.parse(team.lineup || '[]');
    const detailedPlayers = lineup.map(id => players.find(p => p.id === String(id))).filter(Boolean);

    res.json({ ...team, lineup, players: detailedPlayers });
  });
});

// UPDATE FANTASY TEAM
router.put('/:id', authMiddleware, (req, res) => {
  const teamId = parseInt(req.params.id, 10);
  const { teamName, lineup } = req.body;

  db.get('SELECT * FROM fantasy_teams WHERE id = ? AND user_id = ?', [teamId, req.user.id], (err, team) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!team) return res.status(404).json({ message: 'Team not found' });

    if (!Array.isArray(lineup) || lineup.length !== 5) {
      return res.status(400).json({ message: 'Lineup must be 5 players' });
    }

    const validationError = validateLineup(lineup);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const budgetSpent = calculateBudget(lineup);

    db.run(
      'UPDATE fantasy_teams SET team_name = ?, lineup = ?, budget_spent = ? WHERE id = ?',
      [teamName || team.team_name, JSON.stringify(lineup.map(String)), budgetSpent, teamId],
      (err) => {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({ message: 'Team name taken' });
          }
          return res.status(500).json({ message: 'Update failed' });
        }
        res.json({ message: 'Team updated' });
      }
    );
  });
});

// LEAGUE LEADERBOARD
router.get('/league/:leagueId/leaderboard', authMiddleware, (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '10', 10);
  const offset = (page - 1) * limit;

  db.all(
    `SELECT ft.*, u.username, u.country_code
     FROM fantasy_teams ft
     JOIN users u ON u.id = ft.user_id
     WHERE ft.league_id = ?
     ORDER BY ft.total_points DESC, ft.id ASC
     LIMIT ? OFFSET ?`,
    [leagueId, limit, offset],
    (err, teams) => {
      if (err) return res.status(500).json({ message: 'Database error' });

      db.get('SELECT COUNT(*) as count FROM fantasy_teams WHERE league_id = ?', [leagueId], (err, row) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json({ page, limit, total: row.count, teams: teams || [] });
      });
    }
  );
});

module.exports = router;