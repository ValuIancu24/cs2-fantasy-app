const express = require('express');
const db = require('../database');

const router = express.Router();

const PLAYER_SELECT = `SELECT p.id, p.nickname, pt.team_id, pt.tournament_id, COALESCE(pt.price, p.price) AS price, t.name AS team_name, p.image_url AS player_image_url, t.image_url AS team_image_url
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

// GET /api/players/:playerId/stats?tournament_id=X
router.get('/:playerId/stats', (req, res) => {
  const playerId = req.params.playerId;
  const tournamentId = req.query.tournament_id ? parseInt(req.query.tournament_id, 10) : null;
  if (!tournamentId) return res.status(400).json({ message: 'tournament_id required' });

  function mapsToWin(format) {
    if (!format) return 1;
    const m = format.match(/\d+/);
    return Math.ceil((m ? parseInt(m[0]) : 1) / 2);
  }

  db.all(
    `SELECT
       ps.series_id,
       ps.tournament_id,
       t.name AS tournament_name,
       datetime(COALESCE(t.start_date, t.last_synced)) AS sort_key,
       sc.team1_name,
       sc.team2_name,
       sc.format,
       sc.scheduled_at,
       SUM(ps.kills)   AS kills,
       SUM(ps.deaths)  AS deaths,
       SUM(ps.assists) AS assists,
       SUM(ps.kills) * 2 + SUM(ps.assists) - SUM(ps.deaths) AS kda_pts,
       MAX(ps.team_win) AS team_win,
       COUNT(DISTINCT ps.game_number) AS total_maps,
       team_t.name AS player_team_name,
       t1img.image_url AS team1_image_url,
       t2img.image_url AS team2_image_url
     FROM player_stats ps
     JOIN tournaments t ON t.id = ps.tournament_id
     LEFT JOIN series_cache sc ON sc.id = ps.series_id
     JOIN player_tournaments pt ON pt.player_id = ps.player_id AND pt.tournament_id = ps.tournament_id
     JOIN teams team_t ON team_t.id = pt.team_id AND team_t.tournament_id = pt.tournament_id
     LEFT JOIN teams t1img ON LOWER(t1img.name) = LOWER(sc.team1_name) AND t1img.tournament_id = ps.tournament_id
     LEFT JOIN teams t2img ON LOWER(t2img.name) = LOWER(sc.team2_name) AND t2img.tournament_id = ps.tournament_id
     WHERE ps.player_id = ?
       AND t.status = 'historical'
       AND t.id != ?
       AND datetime(COALESCE(t.start_date, t.last_synced)) < datetime(COALESCE(
           (SELECT start_date FROM tournaments WHERE id = ?),
           (SELECT last_synced FROM tournaments WHERE id = ?)
         ))
     GROUP BY ps.series_id
     ORDER BY sort_key DESC, sc.scheduled_at ASC`,
    [playerId, tournamentId, tournamentId, tournamentId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });

      const tournMap = new Map();
      for (const row of rows) {
        if (!tournMap.has(row.tournament_id)) {
          tournMap.set(row.tournament_id, {
            id: row.tournament_id,
            name: row.tournament_name,
            sort_key: row.sort_key,
            series: []
          });
        }
        const teamPts = row.team_win === 1 ? 15 : row.team_win === 0 ? -15 : 0;
        const totalPts = (row.kda_pts || 0) + teamPts;
        const mw = mapsToWin(row.format);
        const loserMaps = Math.max(0, (row.total_maps || 0) - mw);
        let team1_score = null, team2_score = null;
        if (row.team_win !== null) {
          const playerIsTeam1 = row.player_team_name === row.team1_name;
          const playerWon = row.team_win === 1;
          team1_score = (playerWon === playerIsTeam1) ? mw : loserMaps;
          team2_score = (playerWon === playerIsTeam1) ? loserMaps : mw;
        }
        tournMap.get(row.tournament_id).series.push({
          series_id: row.series_id,
          tournament_id: row.tournament_id,
          scheduled_at: row.scheduled_at,
          team1_name: row.team1_name,
          team2_name: row.team2_name,
          team1_image_url: row.team1_image_url || null,
          team2_image_url: row.team2_image_url || null,
          format: row.format,
          kills: row.kills || 0,
          deaths: row.deaths || 0,
          assists: row.assists || 0,
          kda_pts: row.kda_pts || 0,
          team_pts: teamPts,
          total_pts: totalPts,
          team_win: row.team_win,
          team1_score,
          team2_score,
        });
      }

      const tournaments = [...tournMap.values()]
        .sort((a, b) => b.sort_key.localeCompare(a.sort_key))
        .slice(0, 2)
        .filter(t => t.series.length > 0);

      for (const t of tournaments) {
        t.series.sort((a, b) => {
          if (!a.scheduled_at) return 1;
          if (!b.scheduled_at) return -1;
          return new Date(a.scheduled_at) - new Date(b.scheduled_at);
        });
      }

      res.json({ tournaments });
    }
  );
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
