const express = require('express');
const db = require('../database');

const router = express.Router();

function mapsToWin(format) {
  if (!format) return 2;
  const n = parseInt(format.replace(/\D/g, ''), 10);
  return Math.ceil(n / 2);
}

// GET /api/matches/tournament/:tournamentId — all matches for tournament
router.get('/tournament/:tournamentId', (req, res) => {
  const tournamentId = parseInt(req.params.tournamentId, 10);
  if (!tournamentId) return res.status(400).json({ message: 'Invalid tournament ID' });

  db.get('SELECT id, name, name_short, banner_url FROM tournaments WHERE id = ?', [tournamentId], (err, tournament) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

    db.all(
      `SELECT sc.*,
              (SELECT COUNT(*) FROM player_stats ps WHERE ps.series_id = sc.id) > 0 AS has_stats
       FROM series_cache sc
       WHERE sc.tournament_id = ?
         AND (sc.team1_name IS NOT NULL AND sc.team1_name NOT LIKE '%TBD%')
         AND (sc.team2_name IS NOT NULL AND sc.team2_name NOT LIKE '%TBD%')
         AND EXISTS (
           SELECT 1 FROM teams t
           JOIN player_tournaments pt ON pt.team_id = t.id AND pt.tournament_id = sc.tournament_id
           JOIN players p ON p.id = pt.player_id AND p.is_active = 1
           WHERE t.tournament_id = sc.tournament_id
             AND (LOWER(t.name) = LOWER(sc.team1_name) OR LOWER(t.name) = LOWER(sc.team2_name))
         )
       ORDER BY sc.scheduled_at ASC`,
      [tournamentId],
      (err, series) => {
        if (err) return res.status(500).json({ message: 'Database error' });

        const finishedSeries = (series || []).filter(s => s.has_stats);
        const upcoming = (series || []).filter(s => !s.has_stats);

        if (finishedSeries.length === 0) {
          return res.json({ tournament, upcoming, results: [] });
        }

        const placeholders = finishedSeries.map(() => '?').join(',');
        const finishedIds = finishedSeries.map(s => s.id);

        db.all(
          `SELECT ps.series_id,
                  COUNT(DISTINCT ps.game_number) AS total_maps,
                  MAX(CASE WHEN ps.team_win = 1 THEN t.name ELSE NULL END) AS winning_team
           FROM player_stats ps
           JOIN player_tournaments pt ON pt.player_id = ps.player_id AND pt.tournament_id = ps.tournament_id
           JOIN teams t ON t.id = pt.team_id AND t.tournament_id = pt.tournament_id
           WHERE ps.series_id IN (${placeholders})
           GROUP BY ps.series_id`,
          finishedIds,
          (err, scoreRows) => {
            if (err) return res.status(500).json({ message: 'Database error' });

            const scoreMap = {};
            (scoreRows || []).forEach(r => {
              scoreMap[r.series_id] = { total_maps: r.total_maps, winning_team: r.winning_team };
            });

            const results = finishedSeries
              .map(s => {
                const info = scoreMap[s.id];
                const mapsNeeded = mapsToWin(s.format);
                const totalMaps = info?.total_maps || 0;
                const winnerScore = mapsNeeded;
                const loserScore = totalMaps - mapsNeeded;
                const team1Won = info?.winning_team === s.team1_name;
                return {
                  ...s,
                  team1_score: team1Won ? winnerScore : loserScore,
                  team2_score: team1Won ? loserScore : winnerScore
                };
              })
              .reverse();

            res.json({ tournament, upcoming, results });
          }
        );
      }
    );
  });
});

// GET /api/matches/:seriesId — single match detail
router.get('/:seriesId', (req, res) => {
  const seriesId = req.params.seriesId;

  db.get('SELECT * FROM series_cache WHERE id = ?', [seriesId], (err, series) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!series) return res.status(404).json({ message: 'Series not found' });

    db.get('SELECT COUNT(*) AS c FROM player_stats WHERE series_id = ?', [seriesId], (err, countRow) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      const finished = (countRow?.c || 0) > 0;

      if (!finished) {
        return res.json({ series, finished: false, teams: [] });
      }

      // Get per-player stats aggregated across all games in series
      db.all(
        `SELECT ps.player_id, p.nickname, t.name AS team_name,
                SUM(ps.kills) AS kills,
                SUM(ps.deaths) AS deaths,
                SUM(ps.assists) AS assists,
                SUM(ps.kills) * 2 + SUM(ps.assists) - SUM(ps.deaths) AS kda_points,
                MAX(ps.team_win) AS team_win
         FROM player_stats ps
         JOIN players p ON p.id = ps.player_id
         JOIN player_tournaments pt ON pt.player_id = ps.player_id AND pt.tournament_id = ps.tournament_id
         JOIN teams t ON t.id = pt.team_id AND t.tournament_id = pt.tournament_id
         WHERE ps.series_id = ?
         GROUP BY ps.player_id`,
        [seriesId],
        (err, players) => {
          if (err) return res.status(500).json({ message: 'Database error' });

          // Get total maps and winning team for score calculation
          db.get(
            `SELECT COUNT(DISTINCT ps.game_number) AS total_maps,
                    MAX(CASE WHEN ps.team_win = 1 THEN t.name ELSE NULL END) AS winning_team
             FROM player_stats ps
             JOIN player_tournaments pt ON pt.player_id = ps.player_id AND pt.tournament_id = ps.tournament_id
             JOIN teams t ON t.id = pt.team_id AND t.tournament_id = pt.tournament_id
             WHERE ps.series_id = ?`,
            [seriesId],
            (err, scoreInfo) => {
              if (err) return res.status(500).json({ message: 'Database error' });

              const mapsNeeded = mapsToWin(series.format);
              const totalMaps = scoreInfo?.total_maps || 0;
              const winnerScore = mapsNeeded;
              const loserScore = totalMaps - mapsNeeded;
              const winningTeam = scoreInfo?.winning_team;
              const winCount = {
                [series.team1_name]: winningTeam === series.team1_name ? winnerScore : loserScore,
                [series.team2_name]: winningTeam === series.team2_name ? winnerScore : loserScore
              };

              // Group players by team, sorted by total fantasy points desc
              const teamMap = {};
              (players || []).forEach(p => {
                const teamPts = p.team_win === 1 ? 15 : -15;
                const totalPts = p.kda_points + teamPts;
                if (!teamMap[p.team_name]) teamMap[p.team_name] = [];
                teamMap[p.team_name].push({ ...p, team_points: teamPts, total_points: totalPts });
              });

              Object.values(teamMap).forEach(arr => arr.sort((a, b) => b.total_points - a.total_points));

              const teams = [series.team1_name, series.team2_name]
                .filter(Boolean)
                .map(name => ({
                  name,
                  score: winCount[name] || 0,
                  won: (winCount[name] || 0) > (winCount[name === series.team1_name ? series.team2_name : series.team1_name] || 0),
                  players: teamMap[name] || []
                }));

              res.json({ series, finished: true, teams });
            }
          );
        }
      );
    });
  });
});

module.exports = router;
