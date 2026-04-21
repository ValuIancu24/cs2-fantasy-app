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
              (ps_agg.cnt > 0) AS has_stats,
              t1.image_url AS team1_image_url,
              t2.image_url AS team2_image_url
       FROM series_cache sc
       LEFT JOIN (SELECT series_id, COUNT(*) AS cnt FROM player_stats GROUP BY series_id) ps_agg
         ON ps_agg.series_id = sc.id
       LEFT JOIN teams t1 ON LOWER(t1.name) = LOWER(sc.team1_name) AND t1.tournament_id = sc.tournament_id
       LEFT JOIN teams t2 ON LOWER(t2.name) = LOWER(sc.team2_name) AND t2.tournament_id = sc.tournament_id
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
        const upcoming = (series || []).filter(s => !s.has_stats).map(s => ({
          ...s,
          ongoing: s.scheduled_at ? new Date(s.scheduled_at) <= new Date() : false
        }));

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
                if (!info?.winning_team) {
                  return { ...s, team1_score: null, team2_score: null };
                }
                const mapsNeeded = mapsToWin(s.format);
                const totalMaps = info.total_maps || 0;
                const winnerScore = mapsNeeded;
                const loserScore = Math.max(0, totalMaps - mapsNeeded);
                const wl = (info.winning_team || '').toLowerCase();
                const t1l = (s.team1_name || '').toLowerCase();
                const t2l = (s.team2_name || '').toLowerCase();
                const team1Won = wl === t1l || wl.includes(t1l) || t1l.includes(wl);
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
        db.all(
          `SELECT name, image_url FROM teams
           WHERE tournament_id = (SELECT tournament_id FROM series_cache WHERE id = ?)
             AND (LOWER(name) = LOWER(?) OR LOWER(name) = LOWER(?))`,
          [seriesId, series.team1_name || '', series.team2_name || ''],
          (err, teamRows) => {
            const imgMap = {};
            (teamRows || []).forEach(t => { imgMap[t.name.toLowerCase()] = t.image_url; });
            const enrichedSeries = {
              ...series,
              team1_image_url: imgMap[(series.team1_name || '').toLowerCase()] || null,
              team2_image_url: imgMap[(series.team2_name || '').toLowerCase()] || null,
            };
            return res.json({ series: enrichedSeries, finished: false, teams: [] });
          }
        );
        return;
      }

      // Get per-player stats aggregated across all games in series
      db.all(
        `SELECT ps.player_id, p.nickname, t.name AS team_name, t.image_url AS team_image_url,
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
              const winningTeam = scoreInfo?.winning_team || null;
              const totalMaps = scoreInfo?.total_maps || 0;
              const winnerScore = mapsNeeded;
              const loserScore = winningTeam ? Math.max(0, totalMaps - mapsNeeded) : 0;

              // Group players by team, sorted by total fantasy points desc
              const teamMap = {};
              const teamImageMap = {};
              (players || []).forEach(p => {
                const teamPts = p.team_win === 1 ? 15 : p.team_win === 0 ? -15 : 0;
                const totalPts = p.kda_points + teamPts;
                if (!teamMap[p.team_name]) teamMap[p.team_name] = [];
                teamMap[p.team_name].push({ ...p, team_points: teamPts, total_points: totalPts });
                if (p.team_image_url) teamImageMap[p.team_name] = p.team_image_url;
              });

              Object.values(teamMap).forEach(arr => arr.sort((a, b) => b.total_points - a.total_points));

              // Resolve series name → actual teams table name (handles AURORA vs Aurora Gaming etc.)
              const resolveTeamName = (seriesName) => {
                if (!seriesName) return seriesName;
                const lower = seriesName.toLowerCase();
                const exact = Object.keys(teamMap).find(k => k.toLowerCase() === lower);
                if (exact) return exact;
                return Object.keys(teamMap).find(k =>
                  k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())
                ) || seriesName;
              };

              const t1Resolved = resolveTeamName(series.team1_name);
              const t2Resolved = resolveTeamName(series.team2_name);

              const winCount = {
                [t1Resolved]: winningTeam === t1Resolved ? winnerScore : loserScore,
                [t2Resolved]: winningTeam === t2Resolved ? winnerScore : loserScore
              };

              const teams = [series.team1_name, series.team2_name]
                .filter(Boolean)
                .map(name => {
                  const resolved = resolveTeamName(name);
                  const otherResolved = resolveTeamName(name === series.team1_name ? series.team2_name : series.team1_name);
                  return {
                    name,
                    image_url: teamImageMap[resolved] || null,
                    score: winCount[resolved] || 0,
                    won: (winCount[resolved] || 0) > (winCount[otherResolved] || 0),
                    players: teamMap[resolved] || []
                  };
                });

              res.json({ series, finished: true, teams });
            }
          );
        }
      );
    });
  });
});

module.exports = router;
