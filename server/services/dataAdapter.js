const db = require('../database');
const gridApi = require('./gridApi');
const { sleep } = gridApi;

// Formula: 2×K + 1×A - 1×D applied to per-series totals
function calculateSeriesPoints(kills, deaths, assists) {
  return (kills * 2) + (assists * 1) - (deaths * 1);
}

async function syncTournament(tournamentId) {
  console.log(`[DATA ADAPTER] Syncing tournament ${tournamentId}...`);

  const matchesData = await gridApi.getTournamentMatches(tournamentId);

  if (!matchesData.edges || matchesData.edges.length === 0) {
    throw new Error('No matches found for this tournament');
  }

  const firstMatch = matchesData.edges[0].node;
  const tournamentName = firstMatch.tournament.name;
  const tournamentNameShort = firstMatch.tournament.nameShortened;

  // Find earliest and latest match dates
  const matchDates = matchesData.edges
    .map(e => e.node.startTimeScheduled)
    .filter(Boolean)
    .sort();
  const startDate = matchDates[0] || null;
  const endDate = matchDates[matchDates.length - 1] || null;

  await dbRun(
    `INSERT OR REPLACE INTO tournaments (id, name, name_short, status, start_date, end_date, last_synced)
     VALUES (?, ?, ?, 'active', ?, ?, CURRENT_TIMESTAMP)`,
    [tournamentId, tournamentName, tournamentNameShort, startDate, endDate]
  );
  console.log(`[DATA ADAPTER] Tournament "${tournamentName}" saved`);

  // Collect unique teams across all series
  const teamsMap = new Map();
  matchesData.edges.forEach(edge => {
    edge.node.teams.forEach(team => {
      if (team.baseInfo?.id && team.baseInfo?.name) {
        teamsMap.set(team.baseInfo.id, team.baseInfo.name);
      }
    });
  });

  for (const [teamId, teamName] of teamsMap.entries()) {
    await dbRun(
      `INSERT OR REPLACE INTO teams (id, name, tournament_id) VALUES (?, ?, ?)`,
      [teamId, teamName, tournamentId]
    );
  }
  console.log(`[DATA ADAPTER] ${teamsMap.size} teams saved`);

  // Fetch rosters for each team
  let totalPlayers = await syncRosters(teamsMap, tournamentId);

  // Second pass: retry teams that ended up with 0 players
  for (const [teamId, teamName] of teamsMap.entries()) {
    const row = await dbGet(
      'SELECT COUNT(*) as c FROM player_tournaments WHERE team_id = ? AND tournament_id = ?',
      [teamId, tournamentId]
    );
    if (row.c === 0) {
      console.log(`[DATA ADAPTER] Retrying roster for ${teamName} (0 players after first pass)...`);
      try {
        const roster = await gridApi.getTeamRoster(teamId);
        for (const edge of roster) {
          const player = edge.node;
          await upsertPlayer(player.id, player.nickname, teamId, tournamentId);
          totalPlayers++;
        }
        console.log(`[DATA ADAPTER] ${teamName}: ${roster.length} players on retry`);
      } catch (err) {
        console.error(`[DATA ADAPTER] Retry failed for ${teamName}:`, err.message);
      }
    }
  }

  console.log(`[DATA ADAPTER] ✅ Tournament sync complete: ${teamsMap.size} teams, ${totalPlayers} players`);
  return {
    success: true,
    tournament: { id: tournamentId, name: tournamentName },
    teams: teamsMap.size,
    players: totalPlayers,
    matches: matchesData.totalCount
  };
}

async function syncRosters(teamsMap, tournamentId) {
  let total = 0;
  for (const [teamId, teamName] of teamsMap.entries()) {
    try {
      const roster = await gridApi.getTeamRoster(teamId);
      for (const edge of roster) {
        const player = edge.node;
        await upsertPlayer(player.id, player.nickname, teamId, tournamentId);
        total++;
      }
      console.log(`[DATA ADAPTER] ${teamName}: ${roster.length} players synced`);
    } catch (err) {
      console.error(`[DATA ADAPTER] Failed to sync roster for ${teamName}:`, err.message);
    }
  }
  return total;
}

async function syncTournamentStats(tournamentId) {
  console.log(`[DATA ADAPTER] Syncing stats for tournament ${tournamentId}...`);

  const matchesData = await gridApi.getTournamentMatches(tournamentId);
  if (!matchesData.edges || matchesData.edges.length === 0) {
    throw new Error('No matches found for this tournament');
  }

  // Build series metadata + teamName→teamId map
  const seriesInfoMap = new Map();
  const teamNameToId = new Map();

  matchesData.edges.forEach(edge => {
    const node = edge.node;
    const teams = node.teams.map(t => t.baseInfo?.name).filter(Boolean);
    seriesInfoMap.set(node.id, {
      team1: teams[0] || null,
      team2: teams[1] || null,
      format: node.format?.nameShortened || null,
      scheduledAt: node.startTimeScheduled || null
    });
    node.teams.forEach(t => {
      if (t.baseInfo?.id && t.baseInfo?.name) {
        teamNameToId.set(t.baseInfo.name.toLowerCase(), t.baseInfo.id);
      }
    });
  });

  let seriesSynced = 0;
  let seriesSkipped = 0;
  let seriesFailed = 0;
  const errors = [];

  for (const [seriesId, info] of seriesInfoMap.entries()) {
    await dbRun(
      `INSERT OR REPLACE INTO series_cache (id, tournament_id, team1_name, team2_name, format, scheduled_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [seriesId, tournamentId, info.team1, info.team2, info.format, info.scheduledAt]
    );

    try {
      let seriesState;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          seriesState = await gridApi.getMatchStats(seriesId);
          break;
        } catch (e) {
          if (e.message && e.message.includes('rate limit') && attempt < 3) {
            const wait = attempt * 2000;
            console.warn(`[DATA ADAPTER] Rate limit hit, waiting ${wait}ms before retry ${attempt}/3...`);
            await sleep(wait);
          } else {
            throw e;
          }
        }
      }

      if (!seriesState.finished) { seriesSkipped++; await sleep(500); continue; }
      if (!seriesState.games || seriesState.games.length === 0) { seriesSkipped++; await sleep(500); continue; }

      // Determine which team won this series
      const winningTeamName = (seriesState.teams || []).find(t => t.won)?.name?.toLowerCase() || null;

      for (const game of seriesState.games) {
        for (const team of game.teams) {
          const teamWon = winningTeamName && team.name.toLowerCase() === winningTeamName ? 1 : 0;
          // Auto-fetch roster if team has no players in DB
          const teamId = teamNameToId.get(team.name.toLowerCase());
          if (teamId) {
            const teamPlayerCount = await dbGet(
              'SELECT COUNT(*) as c FROM player_tournaments WHERE team_id = ? AND tournament_id = ?',
              [teamId, tournamentId]
            );
            if (teamPlayerCount.c === 0) {
              console.log(`[DATA ADAPTER] Auto-fetching roster for missing team "${team.name}"...`);
              try {
                const roster = await gridApi.getTeamRoster(teamId);
                for (const edge of roster) {
                  const p = edge.node;
                  await upsertPlayer(p.id, p.nickname, teamId, tournamentId);
                }
                console.log(`[DATA ADAPTER] Auto-fetched ${roster.length} players for "${team.name}"`);
              } catch (e) {
                console.error(`[DATA ADAPTER] Auto-fetch failed for "${team.name}":`, e.message);
              }
            }
          }

          for (const player of team.players) {
            const dbPlayer = await findPlayer(player, tournamentId);
            if (!dbPlayer) {
              console.warn(`[DATA ADAPTER] Player "${player.name}" (id: ${player.id}) not found in DB (series ${seriesId})`);
              continue;
            }

            await dbRun(
              `INSERT OR REPLACE INTO player_stats
               (player_id, series_id, tournament_id, game_number, kills, deaths, assists, calculated_points, team_win, match_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)`,
              [dbPlayer.id, seriesId, tournamentId, game.sequenceNumber,
               player.kills, player.deaths, player.killAssistsGiven, teamWon]
            );
          }
        }
      }

      seriesSynced++;
      console.log(`[DATA ADAPTER] Series ${seriesId} synced (${seriesState.games.length} maps)`);
    } catch (err) {
      console.error(`[DATA ADAPTER] Failed to sync series ${seriesId}:`, err.message);
      errors.push({ seriesId, error: err.message });
      seriesFailed++;
    }

    await sleep(500);
  }

  await recalculateFantasyPoints(tournamentId);

  console.log(`[DATA ADAPTER] ✅ Stats sync: ${seriesSynced} synced, ${seriesSkipped} not finished, ${seriesFailed} failed`);
  return {
    success: true,
    seriesSynced,
    seriesSkipped,
    seriesFailed,
    totalSeries: seriesInfoMap.size,
    errors: errors.slice(0, 3)
  };
}

// Find a player by: 1) Grid API ID, 2) case-insensitive nickname, 3) alias
async function findPlayer(player, tournamentId) {
  // 1. Match by Grid API player ID
  if (player.id) {
    const byId = await dbGet(
      `SELECT p.id FROM players p
       JOIN player_tournaments pt ON pt.player_id = p.id
       WHERE p.id = ? AND pt.tournament_id = ?`,
      [String(player.id), tournamentId]
    );
    if (byId) return byId;
  }

  // 2. Case-insensitive nickname match
  const byNick = await dbGet(
    `SELECT p.id FROM players p
     JOIN player_tournaments pt ON pt.player_id = p.id
     WHERE LOWER(p.nickname) = LOWER(?) AND pt.tournament_id = ?`,
    [player.name, tournamentId]
  );
  if (byNick) return byNick;

  // 3. Alias match
  const byAlias = await dbGet(
    `SELECT p.id FROM players p
     JOIN player_aliases pa ON pa.player_id = p.id
     JOIN player_tournaments pt ON pt.player_id = p.id
     WHERE LOWER(pa.alias) = LOWER(?) AND pt.tournament_id = ?`,
    [player.name, tournamentId]
  );
  return byAlias || null;
}

// Insert player if not exists (preserving is_active), then upsert tournament association
async function upsertPlayer(playerId, nickname, teamId, tournamentId) {
  await dbRun(
    `INSERT OR IGNORE INTO players (id, nickname, is_active, last_synced)
     VALUES (?, ?, 1, CURRENT_TIMESTAMP)`,
    [playerId, nickname]
  );
  await dbRun(
    `UPDATE players SET nickname = ?, last_synced = CURRENT_TIMESTAMP WHERE id = ?`,
    [nickname, playerId]
  );
  await dbRun(
    `INSERT OR REPLACE INTO player_tournaments (player_id, tournament_id, team_id)
     VALUES (?, ?, ?)`,
    [playerId, tournamentId, teamId]
  );
}

async function calculatePrices(tournamentId) {
  console.log(`[DATA ADAPTER] Calculating prices for tournament ${tournamentId}...`);

  // Reset all players in this tournament to default price
  await dbRun(
    `UPDATE players SET price = 190000 WHERE id IN (
       SELECT player_id FROM player_tournaments WHERE tournament_id = ?
     )`,
    [tournamentId]
  );

  // Only calculate for active players — inactive ones keep the 190000 default
  const players = await dbAll(
    `SELECT pt.player_id FROM player_tournaments pt
     JOIN players p ON p.id = pt.player_id
     WHERE pt.tournament_id = ? AND p.is_active = 1`,
    [tournamentId]
  );

  if (players.length === 0) {
    console.log(`[DATA ADAPTER] No active players found for tournament ${tournamentId}`);
    return { success: true, calculated: 0 };
  }

  const scores = new Map();

  for (const { player_id } of players) {
    // Get last 2 historical tournaments this player has stats in (excluding current)
    const historicalTournaments = await dbAll(
      `SELECT DISTINCT ps.tournament_id
       FROM player_stats ps
       JOIN tournaments t ON t.id = ps.tournament_id
       WHERE ps.player_id = ? AND t.status = 'historical' AND t.id != ?
         AND COALESCE(t.start_date, t.last_synced) < COALESCE(
           (SELECT start_date FROM tournaments WHERE id = ?),
           (SELECT last_synced FROM tournaments WHERE id = ?)
         )
       ORDER BY COALESCE(t.start_date, t.last_synced) DESC
       LIMIT 2`,
      [player_id, tournamentId, tournamentId, tournamentId]
    );

    if (historicalTournaments.length === 0) {
      scores.set(player_id, null);
      continue;
    }

    // Compute avg pts per series for each tournament
    const tournamentAvgs = [];
    for (const { tournament_id } of historicalTournaments) {
      const seriesStats = await dbAll(
        `SELECT
           SUM(kills) * 2 + SUM(assists) - SUM(deaths) +
           (CASE WHEN MAX(team_win) = 1 THEN 15 ELSE -15 END) as pts
         FROM player_stats
         WHERE player_id = ? AND tournament_id = ?
         GROUP BY series_id`,
        [player_id, tournament_id]
      );
      if (seriesStats.length === 0) continue;
      const avg = seriesStats.reduce((s, r) => s + (r.pts || 0), 0) / seriesStats.length;
      tournamentAvgs.push(avg);
    }

    if (tournamentAvgs.length === 0) {
      scores.set(player_id, null);
      continue;
    }

    // Weighted average: most recent = 65%, older = 35%
    // tournamentAvgs[0] = most recent (ORDER BY last_synced DESC)
    let score;
    if (tournamentAvgs.length === 1) {
      score = tournamentAvgs[0];
    } else {
      score = tournamentAvgs[0] * 0.65 + tournamentAvgs[1] * 0.35;
    }

    scores.set(player_id, score);
  }

  const validScores = [...scores.values()].filter(s => s !== null);
  const minScore = validScores.length > 0 ? Math.min(...validScores) : 0;
  const maxScore = validScores.length > 0 ? Math.max(...validScores) : 0;
  const range = maxScore - minScore;

  let calculated = 0;
  for (const { player_id } of players) {
    const score = scores.get(player_id);
    let price;

    if (score === null || validScores.length === 0) {
      price = 190000;
    } else if (range === 0) {
      price = 205000;
    } else {
      price = Math.round(170000 + (score - minScore) / range * 70000);
    }

    await dbRun(`UPDATE players SET price = ? WHERE id = ?`, [price, player_id]);
    calculated++;
  }

  console.log(`[DATA ADAPTER] ✅ Prices calculated for ${calculated} players (min score: ${minScore?.toFixed(1)}, max: ${maxScore?.toFixed(1)})`);
  return { success: true, calculated, minScore, maxScore };
}

async function recalculateFantasyPoints(tournamentId) {
  console.log(`[DATA ADAPTER] Recalculating fantasy points for tournament ${tournamentId}...`);

  const teams = await dbAll(
    `SELECT ft.id, ft.lineup
     FROM fantasy_teams ft
     JOIN leagues l ON ft.league_id = l.id
     WHERE l.tournament_id = ?`,
    [tournamentId]
  );

  for (const team of teams) {
    const lineup = JSON.parse(team.lineup || '[]');
    let totalRating = 0;
    let totalTeam = 0;

    for (const playerId of lineup) {
      const kdaRow = await dbGet(
        `SELECT COALESCE(SUM(series_pts), 0) as total FROM (
           SELECT SUM(kills) * 2 + SUM(assists) - SUM(deaths) as series_pts
           FROM player_stats
           WHERE player_id = ? AND tournament_id = ?
           GROUP BY series_id
         )`,
        [playerId, tournamentId]
      );
      totalRating += kdaRow?.total || 0;

      const teamRow = await dbGet(
        `SELECT
           COUNT(DISTINCT CASE WHEN team_win = 1 THEN series_id END) as wins,
           COUNT(DISTINCT CASE WHEN team_win = 0 THEN series_id END) as losses
         FROM player_stats
         WHERE player_id = ? AND tournament_id = ?`,
        [playerId, tournamentId]
      );
      totalTeam += ((teamRow?.wins || 0) * 15) - ((teamRow?.losses || 0) * 15);
    }

    await dbRun(
      'UPDATE fantasy_teams SET rating_points = ?, team_points = ?, total_points = ? WHERE id = ?',
      [totalRating, totalTeam, totalRating + totalTeam, team.id]
    );
  }

  console.log(`[DATA ADAPTER] ✅ Recalculated points for ${teams.length} fantasy teams`);
}

// ── SQLite promise helpers ───────────────────────────────────────────────────

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, err => (err ? reject(err) : resolve()));
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

async function getPriceBreakdown(tournamentId) {
  const players = await dbAll(
    `SELECT p.id, p.nickname, p.price, t.name AS team_name
     FROM players p
     JOIN player_tournaments pt ON pt.player_id = p.id
     LEFT JOIN teams t ON t.id = pt.team_id AND t.tournament_id = pt.tournament_id
     WHERE pt.tournament_id = ? AND p.is_active = 1
     ORDER BY t.name, p.nickname`,
    [tournamentId]
  );

  const result = [];

  for (const player of players) {
    const historicalTournaments = await dbAll(
      `SELECT DISTINCT ps.tournament_id, t.name AS tournament_name
       FROM player_stats ps
       JOIN tournaments t ON t.id = ps.tournament_id
       WHERE ps.player_id = ? AND t.status = 'historical' AND t.id != ?
         AND COALESCE(t.start_date, t.last_synced) < COALESCE(
           (SELECT start_date FROM tournaments WHERE id = ?),
           (SELECT last_synced FROM tournaments WHERE id = ?)
         )
       ORDER BY COALESCE(t.start_date, t.last_synced) DESC
       LIMIT 2`,
      [player.id, tournamentId, tournamentId, tournamentId]
    );

    const tournamentsUsed = [];
    for (const { tournament_id, tournament_name } of historicalTournaments) {
      const seriesStats = await dbAll(
        `SELECT ps.series_id,
                SUM(ps.kills) * 2 + SUM(ps.assists) - SUM(ps.deaths) +
                (CASE WHEN MAX(ps.team_win) = 1 THEN 15 ELSE -15 END) as pts,
                sc.team1_name, sc.team2_name, sc.format, sc.scheduled_at
         FROM player_stats ps
         LEFT JOIN series_cache sc ON sc.id = ps.series_id
         WHERE ps.player_id = ? AND ps.tournament_id = ?
         GROUP BY ps.series_id
         ORDER BY sc.scheduled_at ASC`,
        [player.id, tournament_id]
      );
      if (seriesStats.length === 0) continue;
      const avg = seriesStats.reduce((s, r) => s + (r.pts || 0), 0) / seriesStats.length;
      tournamentsUsed.push({ id: tournament_id, name: tournament_name, series: seriesStats, avg });
    }

    let score = null;
    if (tournamentsUsed.length === 1) {
      score = tournamentsUsed[0].avg;
    } else if (tournamentsUsed.length >= 2) {
      score = tournamentsUsed[0].avg * 0.65 + tournamentsUsed[1].avg * 0.35;
    }

    result.push({ ...player, score, tournaments_used: tournamentsUsed });
  }

  const validScores = result.map(p => p.score).filter(s => s !== null);
  const minScore = validScores.length > 0 ? Math.min(...validScores) : null;
  const maxScore = validScores.length > 0 ? Math.max(...validScores) : null;

  return { players: result, min_score: minScore, max_score: maxScore };
}

module.exports = {
  syncTournament,
  syncTournamentStats,
  recalculateFantasyPoints,
  calculatePrices,
  getPriceBreakdown,
  calculateSeriesPoints
};
