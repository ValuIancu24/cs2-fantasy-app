const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Calculate and persist total_points for a fantasy team
function recalcTeamPoints(teamId, lineup, tournamentId, cb) {
  if (!lineup || lineup.length === 0) return cb(null, 0);

  let remaining = lineup.length;
  let total = 0;

  lineup.forEach(playerId => {
    db.get(
      `SELECT COALESCE(SUM(series_pts), 0) as pts FROM (
         SELECT SUM(kills) * 2 + SUM(assists) - SUM(deaths) as series_pts
         FROM player_stats
         WHERE player_id = ? AND tournament_id = ?
         GROUP BY series_id
       )`,
      [playerId, tournamentId],
      (_err, row) => {
        total += row?.pts || 0;
        remaining--;
        if (remaining === 0) {
          db.run(
            'UPDATE fantasy_teams SET total_points = ?, rating_points = ?, team_points = 0 WHERE id = ?',
            [total, total, teamId],
            () => cb(null, total)
          );
        }
      }
    );
  });
}

function validateLineup(lineup) {
  if (!Array.isArray(lineup) || lineup.length !== 5) {
    return 'Lineup must contain exactly 5 players';
  }
  const unique = new Set(lineup.map(String));
  if (unique.size !== 5) {
    return 'Lineup cannot contain duplicate players';
  }
  return null;
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

  db.run(
    `INSERT INTO fantasy_teams (user_id, league_id, team_name, lineup, budget_spent)
     VALUES (?, ?, ?, ?, ?)`,
    [req.user.id, leagueId, teamName.trim(), JSON.stringify(lineup.map(String)), 0],
    function (err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          return res.status(400).json({ message: 'Already have a team in this league or name taken' });
        }
        return res.status(500).json({ message: 'Failed to create team' });
      }
      const newId = this.lastID;
      db.get('SELECT tournament_id FROM leagues WHERE id = ?', [leagueId], (_e, lg) => {
        if (lg && lg.tournament_id) {
          recalcTeamPoints(newId, lineup.map(String), lg.tournament_id, () => {
            res.status(201).json({ id: newId });
          });
        } else {
          res.status(201).json({ id: newId });
        }
      });
    }
  );
});

// GET USER'S TEAM FOR LEAGUE
router.get('/:leagueId', authMiddleware, (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);

  db.get(
    'SELECT * FROM fantasy_teams WHERE league_id = ? AND user_id = ?',
    [leagueId, req.user.id],
    (err, team) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (!team) return res.status(404).json({ message: 'Team not found' });

      const lineup = JSON.parse(team.lineup || '[]');

      if (lineup.length === 0) {
        return res.json({ ...team, lineup, players: [] });
      }

      const placeholders = lineup.map(() => '?').join(',');
      db.all(
        `SELECT p.id, p.nickname, p.team_id, t.name AS team_name
         FROM players p
         LEFT JOIN teams t ON t.id = p.team_id
         WHERE p.id IN (${placeholders})`,
        lineup,
        (err, players) => {
          if (err) return res.status(500).json({ message: 'Database error' });
          res.json({ ...team, lineup, players: players || [] });
        }
      );
    }
  );
});

// UPDATE FANTASY TEAM
router.put('/:id', authMiddleware, (req, res) => {
  const teamId = parseInt(req.params.id, 10);
  const { teamName, lineup } = req.body;

  db.get('SELECT * FROM fantasy_teams WHERE id = ? AND user_id = ?', [teamId, req.user.id], (err, team) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!team) return res.status(404).json({ message: 'Team not found' });

    const validationError = validateLineup(lineup);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    db.run(
      'UPDATE fantasy_teams SET team_name = ?, lineup = ?, budget_spent = 0 WHERE id = ?',
      [teamName || team.team_name, JSON.stringify(lineup.map(String)), teamId],
      (err) => {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({ message: 'Team name taken' });
          }
          return res.status(500).json({ message: 'Update failed' });
        }
        db.get('SELECT tournament_id FROM leagues WHERE id = ?', [team.league_id], (_e, lg) => {
          if (lg && lg.tournament_id) {
            recalcTeamPoints(teamId, lineup.map(String), lg.tournament_id, () => {
              res.json({ message: 'Team updated' });
            });
          } else {
            res.json({ message: 'Team updated' });
          }
        });
      }
    );
  });
});

// GET TEAM BREAKDOWN — per player, per series K/D/A + points
router.get('/:leagueId/breakdown', authMiddleware, (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);

  db.get(
    `SELECT ft.*, l.tournament_id FROM fantasy_teams ft
     JOIN leagues l ON l.id = ft.league_id
     WHERE ft.league_id = ? AND ft.user_id = ?`,
    [leagueId, req.user.id],
    (err, team) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (!team) return res.status(404).json({ message: 'Team not found' });

      const lineup = JSON.parse(team.lineup || '[]');
      const tournamentId = team.tournament_id;

      if (lineup.length === 0) {
        return res.json({ team_name: team.team_name, total_points: 0, lineup: [] });
      }

      const placeholders = lineup.map(() => '?').join(',');

      // Fetch player info
      db.all(
        `SELECT p.id, p.nickname, t.name AS team_name
         FROM players p
         LEFT JOIN teams t ON t.id = p.team_id
         WHERE p.id IN (${placeholders})`,
        lineup,
        (err, players) => {
          if (err) return res.status(500).json({ message: 'Database error' });

          const playerMap = {};
          (players || []).forEach(p => { playerMap[String(p.id)] = p; });

          let remaining = lineup.length;
          const results = [];

          lineup.forEach(playerId => {
            // Per-series breakdown for this player
            db.all(
              `SELECT
                 ps.series_id,
                 sc.team1_name,
                 sc.team2_name,
                 sc.format,
                 sc.scheduled_at,
                 SUM(ps.kills)   AS kills,
                 SUM(ps.deaths)  AS deaths,
                 SUM(ps.assists) AS assists,
                 SUM(ps.kills) * 2 + SUM(ps.assists) - SUM(ps.deaths) AS series_points
               FROM player_stats ps
               LEFT JOIN series_cache sc ON sc.id = ps.series_id
               WHERE ps.player_id = ? AND ps.tournament_id = ?
               GROUP BY ps.series_id
               ORDER BY sc.scheduled_at ASC`,
              [playerId, tournamentId],
              (err, seriesRows) => {
                const series = err ? [] : (seriesRows || []);
                const totalPoints = series.reduce((sum, s) => sum + (s.series_points || 0), 0);
                const playerInfo = playerMap[String(playerId)] || { id: playerId, nickname: playerId, team_name: null };

                results.push({
                  ...playerInfo,
                  total_points: totalPoints,
                  series
                });

                remaining--;
                if (remaining === 0) {
                  // Re-order results to match lineup order
                  const ordered = lineup.map(id => results.find(r => String(r.id) === String(id))).filter(Boolean);
                  const teamTotal = ordered.reduce((sum, p) => sum + p.total_points, 0);
                  res.json({
                    team_name: team.team_name,
                    total_points: teamTotal,
                    lineup: ordered
                  });
                }
              }
            );
          });
        }
      );
    }
  );
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
