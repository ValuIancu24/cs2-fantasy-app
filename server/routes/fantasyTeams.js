const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Calculate and persist total_points, rating_points, team_points for a fantasy team
function recalcTeamPoints(teamId, lineup, tournamentId, cb) {
  if (!lineup || lineup.length === 0) return cb(null, 0);

  let remaining = lineup.length;
  let totalRating = 0;
  let totalTeam = 0;
  let failed = false;

  const fail = (err) => {
    if (failed) return;
    failed = true;
    cb(err);
  };

  lineup.forEach(playerId => {
    db.get(
      `SELECT COALESCE(SUM(series_pts), 0) as pts FROM (
         SELECT SUM(kills) * 2 + SUM(assists) - SUM(deaths) as series_pts
         FROM player_stats
         WHERE player_id = ? AND tournament_id = ?
         GROUP BY series_id
       )`,
      [playerId, tournamentId],
      (err, kdaRow) => {
        if (err) return fail(err);
        totalRating += kdaRow?.pts || 0;
        db.get(
          `SELECT
             COUNT(DISTINCT CASE WHEN team_win IS NOT NULL AND team_win = 1 THEN series_id END) as wins,
             COUNT(DISTINCT CASE WHEN team_win IS NOT NULL AND team_win = 0 THEN series_id END) as losses
           FROM player_stats
           WHERE player_id = ? AND tournament_id = ?`,
          [playerId, tournamentId],
          (err2, teamRow) => {
            if (err2) return fail(err2);
            totalTeam += ((teamRow?.wins || 0) * 15) - ((teamRow?.losses || 0) * 15);
            remaining--;
            if (remaining === 0) {
              const total = totalRating + totalTeam;
              db.run(
                'UPDATE fantasy_teams SET rating_points = ?, team_points = ?, total_points = ? WHERE id = ?',
                [totalRating, totalTeam, total, teamId],
                (err3) => {
                  if (err3) return fail(err3);
                  cb(null, total);
                }
              );
            }
          }
        );
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
  if (!teamName.trim()) {
    return res.status(400).json({ message: 'Team name cannot be blank' });
  }
  if (teamName.trim().length > 30) {
    return res.status(400).json({ message: 'Team name cannot exceed 30 characters' });
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
      db.get('SELECT tournament_id FROM leagues WHERE id = ?', [leagueId], (_e, lg) => {
        const tid = lg?.tournament_id || null;
        db.all(
          `SELECT p.id, p.nickname, pt.team_id, t.name AS team_name
           FROM players p
           LEFT JOIN player_tournaments pt ON pt.player_id = p.id AND pt.tournament_id = ?
           LEFT JOIN teams t ON t.id = pt.team_id AND t.tournament_id = pt.tournament_id
           WHERE p.id IN (${placeholders})`,
          [tid, ...lineup],
          (err, players) => {
            if (err) return res.status(500).json({ message: 'Database error' });
            res.json({ ...team, lineup, players: players || [] });
          }
        );
      });
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

    if (teamName !== undefined && !teamName.trim()) {
      return res.status(400).json({ message: 'Team name cannot be blank' });
    }

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
            return res.status(400).json({ message: 'This team name is already taken in this league. Choose a different name.' });
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
         LEFT JOIN player_tournaments pt ON pt.player_id = p.id AND pt.tournament_id = ?
         LEFT JOIN teams t ON t.id = pt.team_id AND t.tournament_id = pt.tournament_id
         WHERE p.id IN (${placeholders})`,
        [tournamentId, ...lineup],
        (err, players) => {
          if (err) return res.status(500).json({ message: 'Database error' });

          const playerMap = {};
          (players || []).forEach(p => { playerMap[String(p.id)] = p; });

          let remaining = lineup.length;
          const results = [];

          const finalize = () => {
            const ordered = lineup.map(id => results.find(r => String(r.id) === String(id))).filter(Boolean);
            const totalRating = ordered.reduce((sum, p) => sum + p.rating_points, 0);
            const totalTeam = ordered.reduce((sum, p) => sum + p.team_points, 0);
            res.json({
              team_name: team.team_name,
              rating_points: totalRating,
              team_points: totalTeam,
              total_points: totalRating + totalTeam,
              lineup: ordered
            });
          };

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
                 SUM(ps.kills) * 2 + SUM(ps.assists) - SUM(ps.deaths) AS series_points,
                 MAX(ps.team_win) AS team_win
               FROM player_stats ps
               LEFT JOIN series_cache sc ON sc.id = ps.series_id
               WHERE ps.player_id = ? AND ps.tournament_id = ?
               GROUP BY ps.series_id
               ORDER BY sc.scheduled_at ASC`,
              [playerId, tournamentId],
              (err, seriesRows) => {
                const played = (err ? [] : (seriesRows || [])).map(s => ({
                  ...s,
                  upcoming: false,
                  team_points: s.team_win === 1 ? 15 : s.team_win === 0 ? -15 : 0
                }));

                const playerInfo = playerMap[String(playerId)] || { id: playerId, nickname: playerId, team_name: null };
                const teamName = playerInfo.team_name;

                if (!teamName) {
                  const kdaPoints = played.reduce((sum, s) => sum + (s.series_points || 0), 0);
                  const teamPoints = played.reduce((sum, s) => sum + s.team_points, 0);
                  results.push({ ...playerInfo, rating_points: kdaPoints, team_points: teamPoints, total_points: kdaPoints + teamPoints, series: played });
                  remaining--;
                  if (remaining === 0) finalize();
                  return;
                }

                // Fetch upcoming/ongoing series for this player's team (not yet finished, no TBD teams)
                db.all(
                  `SELECT sc.id AS series_id, sc.team1_name, sc.team2_name, sc.format, sc.scheduled_at,
                          CASE WHEN datetime(sc.scheduled_at) > datetime('now') THEN 'upcoming' ELSE 'ongoing' END AS match_status
                   FROM series_cache sc
                   WHERE sc.tournament_id = ?
                     AND (LOWER(sc.team1_name) = LOWER(?) OR LOWER(sc.team2_name) = LOWER(?))
                     AND sc.team1_name NOT LIKE '%TBD%'
                     AND sc.team2_name NOT LIKE '%TBD%'
                     AND sc.id NOT IN (
                       SELECT DISTINCT series_id FROM player_stats
                       WHERE tournament_id = ?
                     )
                   ORDER BY sc.scheduled_at ASC`,
                  [tournamentId, teamName, teamName, tournamentId],
                  (err2, upcomingRows) => {
                    const upcoming = (err2 ? [] : (upcomingRows || [])).map(s => ({
                      ...s,
                      upcoming: s.match_status === 'upcoming',
                      ongoing: s.match_status === 'ongoing',
                      kills: null, deaths: null, assists: null,
                      series_points: null, team_win: null, team_points: null
                    }));

                    const allSeries = [...played, ...upcoming];
                    const kdaPoints = played.reduce((sum, s) => sum + (s.series_points || 0), 0);
                    const teamPoints = played.reduce((sum, s) => sum + s.team_points, 0);

                    results.push({
                      ...playerInfo,
                      rating_points: kdaPoints,
                      team_points: teamPoints,
                      total_points: kdaPoints + teamPoints,
                      series: allSeries
                    });

                    remaining--;
                    if (remaining === 0) finalize();
                  }
                );
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
  const limit = parseInt(req.query.limit || '6', 10);
  const offset = (page - 1) * limit;
  const userId = req.user.id;

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

        // Check user has a team before computing rank
        db.get(
          `SELECT id, total_points FROM fantasy_teams WHERE league_id = ? AND user_id = ?`,
          [leagueId, userId],
          (err, userTeam) => {
            if (err) return res.status(500).json({ message: 'Database error' });
            if (!userTeam) {
              return res.json({ page, limit, total: row.count, teams: teams || [], userRank: null });
            }

            db.get(
              `SELECT COUNT(*) + 1 as rank FROM fantasy_teams
               WHERE league_id = ? AND (
                 total_points > ?
                 OR (total_points = ? AND id < ?)
               )`,
              [leagueId, userTeam.total_points, userTeam.total_points, userTeam.id],
              (err, rankRow) => {
                if (err) return res.status(500).json({ message: 'Database error' });
                res.json({ page, limit, total: row.count, teams: teams || [], userRank: rankRow?.rank || null });
              }
            );
          }
        );
      });
    }
  );
});

module.exports = router;
