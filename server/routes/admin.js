const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const scenarioConfig = require('../config/scenarios');
const gridApi = require('../services/gridApi');
const dataAdapter = require('../services/dataAdapter');

const router = express.Router();
const scenariosBasePath = path.join(__dirname, '..', '..', 'data', 'scenarios');

function loadScenario(scenarioId) {
  const filePath = path.join(scenariosBasePath, `scenario_${scenarioId}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function getCurrentScenario() {
  return loadScenario(scenarioConfig.activeScenario);
}

function ratingToPoints(rating) {
  return Math.round((rating - 1) / 0.02);
}

function applyMatchToFantasyTeams(match, stageId, callback) {
  db.all('SELECT * FROM fantasy_teams', [], (err, allTeams) => {
    if (err) return callback(err);

    let processed = 0;
    if (allTeams.length === 0) return callback(null);

    for (const team of allTeams) {
      const lineup = JSON.parse(team.lineup || '[]').map(String);
      const participatingStats = match.player_stats.filter(ps => lineup.includes(String(ps.player_id)));

      if (participatingStats.length === 0) {
        processed++;
        if (processed === allTeams.length) callback(null);
        continue;
      }

      let ratingPoints = 0;
      for (const ps of participatingStats) {
        ratingPoints += ratingToPoints(ps.rating);
      }

      let teamPoints = 0;
      const winner = match.winner;
      const teamsInMatch = new Set(match.player_stats.map(ps => ps.team));
      const loser = [...teamsInMatch].find(t => t !== winner);

      const hasWinnerPlayer = participatingStats.some(ps => ps.team === winner);
      const hasLoserPlayer = participatingStats.some(ps => ps.team === loser);

      if (hasWinnerPlayer) teamPoints += 5;
      else if (hasLoserPlayer) teamPoints -= 5;

      db.run(
        `UPDATE fantasy_teams SET rating_points = rating_points + ?, team_points = team_points + ?, total_points = total_points + ? + ? WHERE id = ?`,
        [ratingPoints, teamPoints, ratingPoints, teamPoints, team.id],
        (err) => {
          if (err) return callback(err);
          processed++;
          if (processed === allTeams.length) callback(null);
        }
      );
    }
  });
}

function simulateSingleMatch(match, stageId, callback) {
  db.get('SELECT id FROM simulated_matches WHERE match_id = ?', [match.match_id], (err, existing) => {
    if (err) return callback(err);
    if (existing) return callback(null, { skipped: true, reason: 'already_simulated' });

    db.run('INSERT INTO simulated_matches (match_id, stage_id) VALUES (?, ?)', [match.match_id, stageId], (err) => {
      if (err) return callback(err);
      applyMatchToFantasyTeams(match, stageId, (err) => {
        if (err) return callback(err);
        callback(null, { skipped: false });
      });
    });
  });
}

function recalculateAllPointsFromSimulatedMatches(callback) {
  db.run('UPDATE fantasy_teams SET rating_points = 0, team_points = 0, total_points = 0', [], (err) => {
    if (err) return callback(err);

    const scenario = getCurrentScenario();
    const matchesById = {};

    for (const m of scenario.quarter_finals || []) {
      matchesById[m.match_id] = { ...m, stageId: 'quarter_finals' };
    }
    for (const m of scenario.semi_finals || []) {
      matchesById[m.match_id] = { ...m, stageId: 'semi_finals' };
    }
    if (scenario.grand_final) {
      matchesById[scenario.grand_final.match_id] = { ...scenario.grand_final, stageId: 'grand_final' };
    }

    db.all('SELECT * FROM simulated_matches ORDER BY id ASC', [], (err, simulated) => {
      if (err) return callback(err);

      let processed = 0;
      if (simulated.length === 0) return callback(null);

      for (const row of simulated) {
        const m = matchesById[row.match_id];
        if (m) {
          applyMatchToFantasyTeams(m, m.stageId, (err) => {
            if (err) return callback(err);
            processed++;
            if (processed === simulated.length) callback(null);
          });
        } else {
          processed++;
          if (processed === simulated.length) callback(null);
        }
      }
    });
  });
}

// SIMULATE SINGLE MATCH
router.post('/simulate-match', authMiddleware, requireAdmin, (req, res) => {
  const { matchId, stageId } = req.body;
  if (!matchId || !stageId) {
    return res.status(400).json({ message: 'matchId and stageId required' });
  }

  const scenario = getCurrentScenario();
  let match = null;

  if (stageId === 'quarter_finals') {
    match = (scenario.quarter_finals || []).find(m => m.match_id === matchId);
  } else if (stageId === 'semi_finals') {
    match = (scenario.semi_finals || []).find(m => m.match_id === matchId);
  } else if (stageId === 'grand_final') {
    match = scenario.grand_final && scenario.grand_final.match_id === matchId ? scenario.grand_final : null;
  }

  if (!match) return res.status(404).json({ message: 'Match not found' });

  simulateSingleMatch(match, stageId, (err, result) => {
    if (err) return res.status(500).json({ message: 'Simulation failed' });
    if (result.skipped) return res.status(400).json({ message: 'Already simulated' });
    res.json({ message: 'Match simulated' });
  });
});

// SIMULATE STAGE
router.post('/simulate-stage', authMiddleware, requireAdmin, (req, res) => {
  const { stageId } = req.body;
  if (!stageId) return res.status(400).json({ message: 'stageId required' });

  const scenario = getCurrentScenario();
  let matches = [];

  if (stageId === 'quarter_finals') matches = scenario.quarter_finals || [];
  else if (stageId === 'semi_finals') matches = scenario.semi_finals || [];
  else if (stageId === 'grand_final') matches = scenario.grand_final ? [scenario.grand_final] : [];
  else return res.status(400).json({ message: 'Invalid stageId' });

  let simulatedCount = 0;
  let skippedCount = 0;
  let processed = 0;

  if (matches.length === 0) return res.json({ message: 'Stage completed', simulatedCount: 0, skippedCount: 0 });

  for (const match of matches) {
    simulateSingleMatch(match, stageId, (err, result) => {
      if (err) return res.status(500).json({ message: 'Simulation failed' });
      if (result.skipped) skippedCount++;
      else simulatedCount++;
      processed++;
      if (processed === matches.length) {
        res.json({ message: 'Stage completed', simulatedCount, skippedCount });
      }
    });
  }
});

// RESET MATCHES
router.post('/reset-match', authMiddleware, requireAdmin, (req, res) => {
  const { type, matchId, stageId } = req.body;
  if (!type) return res.status(400).json({ message: 'type required (match|stage|all)' });

  let query = '';
  let params = [];

  if (type === 'match') {
    if (!matchId) return res.status(400).json({ message: 'matchId required' });
    query = 'DELETE FROM simulated_matches WHERE match_id = ?';
    params = [matchId];
  } else if (type === 'stage') {
    if (!stageId) return res.status(400).json({ message: 'stageId required' });
    query = 'DELETE FROM simulated_matches WHERE stage_id = ?';
    params = [stageId];
  } else if (type === 'all') {
    query = 'DELETE FROM simulated_matches';
  } else {
    return res.status(400).json({ message: 'Invalid type' });
  }

  db.run(query, params, (err) => {
    if (err) return res.status(500).json({ message: 'Reset failed' });
    recalculateAllPointsFromSimulatedMatches((err) => {
      if (err) return res.status(500).json({ message: 'Recalculation failed' });
      res.json({ message: 'Reset completed' });
    });
  });
});

// ADMIN STATS
router.get('/stats', authMiddleware, requireAdmin, (req, res) => {
  db.get('SELECT COUNT(*) as c FROM users', [], (e1, r1) => {
    db.get('SELECT COUNT(*) as c FROM leagues', [], (e2, r2) => {
      db.get('SELECT COUNT(*) as c FROM fantasy_teams', [], (e3, r3) => {
        db.get('SELECT COUNT(*) as c FROM simulated_matches', [], (e4, r4) => {
          db.get('SELECT MAX(simulated_at) as ts FROM simulated_matches', [], (e5, r5) => {
            res.json({
              total_users: r1.c,
              total_leagues: r2.c,
              total_fantasy_teams: r3.c,
              total_matches_simulated: r4.c,
              last_simulation_timestamp: r5.ts,
              active_scenario: scenarioConfig.activeScenario
            });
          });
        });
      });
    });
  });
});

// PREVIEW TOURNAMENT MATCHES (no DB write)
router.get('/tournament/:tournamentId/matches', authMiddleware, requireAdmin, async (req, res) => {
  const tournamentId = parseInt(req.params.tournamentId, 10);
  if (!tournamentId) return res.status(400).json({ message: 'Invalid tournament ID' });

  try {
    const data = await gridApi.getTournamentMatches(tournamentId);
    const matches = data.edges.map(edge => {
      const node = edge.node;
      const teams = node.teams.map(t => t.baseInfo?.name).filter(Boolean);
      return {
        id: node.id,
        teams,
        title: node.title?.nameShortened || null,
        scheduledAt: node.startTimeScheduled || null,
        format: node.format?.nameShortened || null,
        tournament: node.tournament
          ? { id: node.tournament.id, name: node.tournament.name, nameShort: node.tournament.nameShortened }
          : null
      };
    });
    res.json({ totalCount: data.totalCount, matches });
  } catch (err) {
    console.error('[ADMIN] Failed to fetch tournament matches:', err.message);
    res.status(500).json({ message: err.message || 'Failed to fetch matches from Grid API' });
  }
});

// SYNC TOURNAMENT TO DB (teams + players)
router.post('/sync-tournament/:tournamentId', authMiddleware, requireAdmin, async (req, res) => {
  const tournamentId = parseInt(req.params.tournamentId, 10);
  if (!tournamentId) return res.status(400).json({ message: 'Invalid tournament ID' });

  try {
    const result = await dataAdapter.syncTournament(tournamentId);
    res.json(result);
  } catch (err) {
    console.error('[ADMIN] Sync tournament failed:', err.message);
    res.status(500).json({ message: err.message || 'Sync failed' });
  }
});

// CHANGE SCENARIO
router.put('/scenario', authMiddleware, requireAdmin, (req, res) => {
  const { scenarioId } = req.body;
  const id = parseInt(scenarioId, 10);
  if (![1, 2, 3, 4, 5].includes(id)) {
    return res.status(400).json({ message: 'scenarioId must be 1-5' });
  }

  const configPath = path.join(__dirname, '..', 'config', 'scenarios.js');
  const content = `module.exports = {\n  activeScenario: ${id}\n};\n`;
  fs.writeFileSync(configPath, content, 'utf-8');

  delete require.cache[require.resolve('../config/scenarios')];
  const updated = require('../config/scenarios');
  scenarioConfig.activeScenario = updated.activeScenario;

  res.json({ message: 'Scenario updated', activeScenario: updated.activeScenario });
});

module.exports = router;