const db = require('../database');
const gridApi = require('./gridApi');

function calculatePoints(kills, deaths, assists) {
  // Formula: K×2 + A×1 - D×1.5
  return (kills * 2) + (assists * 1) - (deaths * 1.5);
}

async function syncTournament(tournamentId) {
  console.log(`[DATA ADAPTER] Syncing tournament ${tournamentId}...`);
  
  try {
    const matchesData = await gridApi.getTournamentMatches(tournamentId);
    
    if (!matchesData.edges || matchesData.edges.length === 0) {
      throw new Error('No matches found for this tournament');
    }

    const firstMatch = matchesData.edges[0].node;
    const tournamentName = firstMatch.tournament.name;
    const tournamentNameShort = firstMatch.tournament.nameShortened;

    // Insert/Update tournament
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO tournaments (id, name, name_short, status, last_synced)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [tournamentId, tournamentName, tournamentNameShort, 'active'],
        (err) => (err ? reject(err) : resolve())
      );
    });

    console.log(`[DATA ADAPTER] Tournament "${tournamentName}" saved`);

    // Collect unique teams
    const teamsMap = new Map();
    matchesData.edges.forEach(edge => {
      edge.node.teams.forEach(team => {
        if (team.baseInfo && team.baseInfo.id && team.baseInfo.name) {
          teamsMap.set(team.baseInfo.id, team.baseInfo.name);
        }
      });
    });

    console.log(`[DATA ADAPTER] Found ${teamsMap.size} unique teams`);

    // Insert teams
    for (const [teamId, teamName] of teamsMap.entries()) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO teams (id, name, tournament_id)
           VALUES (?, ?, ?)`,
          [teamId, teamName, tournamentId],
          (err) => (err ? reject(err) : resolve())
        );
      });
    }

    // Fetch rosters for each team
    let totalPlayers = 0;
    for (const [teamId, teamName] of teamsMap.entries()) {
      try {
        const roster = await gridApi.getTeamRoster(teamId);
        
        for (const edge of roster) {
          const player = edge.node;
          await new Promise((resolve, reject) => {
            db.run(
              `INSERT OR REPLACE INTO players (id, nickname, team_id, tournament_id, last_synced)
               VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
              [player.id, player.nickname, teamId, tournamentId],
              (err) => (err ? reject(err) : resolve())
            );
          });
          totalPlayers++;
        }
        
        console.log(`[DATA ADAPTER] ${teamName}: ${roster.length} players synced`);
      } catch (error) {
        console.error(`[DATA ADAPTER] Failed to sync roster for team ${teamId}:`, error.message);
      }
    }

    console.log(`[DATA ADAPTER] ✅ Sync complete: ${teamsMap.size} teams, ${totalPlayers} players, ${matchesData.totalCount} matches`);

    return {
      success: true,
      tournament: { id: tournamentId, name: tournamentName },
      teams: teamsMap.size,
      players: totalPlayers,
      matches: matchesData.totalCount
    };
  } catch (error) {
    console.error('[DATA ADAPTER] Sync failed:', error.message);
    throw error;
  }
}

async function syncMatchStats(seriesId, tournamentId) {
  console.log(`[DATA ADAPTER] Syncing stats for series ${seriesId}...`);
  
  try {
    const seriesState = await gridApi.getMatchStats(seriesId);
    
    if (!seriesState.finished) {
      throw new Error('Match is not finished yet');
    }

    if (!seriesState.games || seriesState.games.length === 0) {
      throw new Error('No game data available for this match');
    }

    let playersUpdated = 0;

    for (const game of seriesState.games) {
      const gameNumber = game.sequenceNumber;

      for (const team of game.teams) {
        for (const player of team.players) {
          const playerName = player.name;

          // Find player ID in database by nickname
          const dbPlayer = await new Promise((resolve, reject) => {
            db.get(
              'SELECT id FROM players WHERE nickname = ? AND tournament_id = ?',
              [playerName, tournamentId],
              (err, row) => (err ? reject(err) : resolve(row))
            );
          });

          if (!dbPlayer) {
            console.warn(`[DATA ADAPTER] Player "${playerName}" not found in database`);
            continue;
          }

          const points = calculatePoints(player.kills, player.deaths, player.killAssistsGiven);

          await new Promise((resolve, reject) => {
            db.run(
              `INSERT OR REPLACE INTO player_stats 
               (player_id, series_id, tournament_id, game_number, kills, deaths, assists, calculated_points, match_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
              [dbPlayer.id, seriesId, tournamentId, gameNumber, player.kills, player.deaths, player.killAssistsGiven, points],
              (err) => (err ? reject(err) : resolve())
            );
          });

          playersUpdated++;
        }
      }
    }

    // Recalculate total points for all fantasy teams
    await recalculateFantasyPoints(tournamentId);

    console.log(`[DATA ADAPTER] ✅ Stats synced: ${playersUpdated} player performances recorded`);

    return {
      success: true,
      playersUpdated,
      gamesProcessed: seriesState.games.length
    };
  } catch (error) {
    console.error('[DATA ADAPTER] Failed to sync match stats:', error.message);
    throw error;
  }
}

async function recalculateFantasyPoints(tournamentId) {
  console.log(`[DATA ADAPTER] Recalculating fantasy points for tournament ${tournamentId}...`);

  // Get all fantasy teams in leagues associated with this tournament
  const teams = await new Promise((resolve, reject) => {
    db.all(
      `SELECT ft.id, ft.lineup, ft.league_id
       FROM fantasy_teams ft
       JOIN leagues l ON ft.league_id = l.id
       WHERE l.tournament_id = ?`,
      [tournamentId],
      (err, rows) => (err ? reject(err) : resolve(rows || []))
    );
  });

  for (const team of teams) {
    const lineup = JSON.parse(team.lineup);
    
    // Calculate total points for this lineup
    let totalPoints = 0;
    for (const playerId of lineup) {
      const playerPoints = await new Promise((resolve, reject) => {
        db.get(
          `SELECT COALESCE(SUM(calculated_points), 0) as total
           FROM player_stats
           WHERE player_id = ? AND tournament_id = ?`,
          [playerId, tournamentId],
          (err, row) => (err ? reject(err) : resolve(row?.total || 0))
        );
      });
      totalPoints += playerPoints;
    }

    // Update fantasy team
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE fantasy_teams SET total_points = ?, rating_points = ?, team_points = 0 WHERE id = ?',
        [totalPoints, totalPoints, team.id],
        (err) => (err ? reject(err) : resolve())
      );
    });
  }

  console.log(`[DATA ADAPTER] ✅ Recalculated points for ${teams.length} fantasy teams`);
}

module.exports = {
  syncTournament,
  syncMatchStats,
  calculatePoints
};
