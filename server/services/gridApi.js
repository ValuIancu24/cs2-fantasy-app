const fetch = require('node-fetch');

const GRID_API_ENDPOINT = 'https://api-op.grid.gg/central-data/graphql';
const GRID_API_KEY = process.env.GRID_API_KEY || 'VhaPE8O7TdF0MQCRyUSnA5yJTMleFuzCv07LKFsG';

async function executeGraphQL(query, variables = {}) {
  try {
    console.log('[GRID API] Executing query...');
    const response = await fetch(GRID_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': GRID_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Grid API HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      console.error('[GRID API] GraphQL Errors:', JSON.stringify(data.errors, null, 2));
      throw new Error(`GraphQL Error: ${data.errors[0].message}`);
    }

    return data.data;
  } catch (error) {
    console.error('[GRID API] Request failed:', error.message);
    throw error;
  }
}

async function getTournamentMatches(tournamentId) {
  const query = `
    query GetTournamentMatches($tournamentId: ID!, $after: Cursor) {
      allSeries(
        filter: { tournamentId: $tournamentId }
        orderBy: StartTimeScheduled
        first: 50
        after: $after
      ) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title {
              nameShortened
            }
            tournament {
              id
              nameShortened
              name
            }
            startTimeScheduled
            format {
              nameShortened
            }
            teams {
              baseInfo {
                id
                name
              }
            }
          }
        }
      }
    }
  `;

  console.log(`[GRID API] Fetching matches for tournament ${tournamentId}...`);

  let allEdges = [];
  let totalCount = 0;
  let after = null;

  do {
    const data = await executeGraphQL(query, { tournamentId: String(tournamentId), after });

    if (!data.allSeries || !data.allSeries.edges) {
      throw new Error('Invalid response from Grid API: allSeries not found');
    }

    totalCount = data.allSeries.totalCount;
    allEdges = allEdges.concat(data.allSeries.edges);

    const pageInfo = data.allSeries.pageInfo;
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;

    console.log(`[GRID API] Fetched ${allEdges.length}/${totalCount} matches...`);
  } while (after !== null);

  console.log(`[GRID API] Done — ${allEdges.length} matches total`);
  return { totalCount, edges: allEdges };
}

async function getTeamRoster(teamId) {
  const query = `
    query GetTeamRoster($teamId: ID!) {
      players(filter: { teamIdFilter: { id: $teamId } }) {
        edges {
          node {
            id
            nickname
            title {
              name
            }
          }
        }
      }
    }
  `;

  console.log(`[GRID API] Fetching roster for team ${teamId}...`);
  const data = await executeGraphQL(query, { teamId: String(teamId) });
  
  if (!data.players || !data.players.edges) {
    throw new Error('Invalid response from Grid API: players not found');
  }

  // Filter only CS2 players
  const cs2Players = data.players.edges.filter(
    edge => edge.node.title && edge.node.title.name === 'Counter Strike 2'
  );

  console.log(`[GRID API] Found ${cs2Players.length} CS2 players`);
  return cs2Players;
}

async function getMatchStats(seriesId) {
  const query = `
    query GetMatchStats($seriesId: ID!) {
      seriesState(id: $seriesId) {
        valid
        format
        started
        finished
        teams {
          name
          won
        }
        games(filter: { finished: true }) {
          sequenceNumber
          teams {
            name
            players {
              name
              kills
              deaths
              killAssistsGiven
            }
          }
        }
      }
    }
  `;

  console.log(`[GRID API] Fetching stats for series ${seriesId}...`);
  const data = await executeGraphQL(query, { seriesId: String(seriesId) });
  
  if (!data.seriesState) {
    throw new Error('Invalid response from Grid API: seriesState not found');
  }

  console.log(`[GRID API] Series finished: ${data.seriesState.finished}, Games: ${data.seriesState.games?.length || 0}`);
  return data.seriesState;
}

module.exports = {
  getTournamentMatches,
  getTeamRoster,
  getMatchStats
};
