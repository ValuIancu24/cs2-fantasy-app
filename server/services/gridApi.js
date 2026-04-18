const fetch = require('node-fetch');

const GRID_CENTRAL_ENDPOINT = 'https://api-op.grid.gg/central-data/graphql';
const GRID_SERIES_STATE_ENDPOINT = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
const GRID_API_KEY = process.env.GRID_API_KEY;
if (!GRID_API_KEY) {
  throw new Error('Missing required environment variable: GRID_API_KEY');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const REQUEST_TIMEOUT_MS = 30000;

async function executeGraphQL(endpoint, query, variables = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': GRID_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal
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
    if (error.name === 'AbortError') {
      throw new Error(`Grid API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    console.error('[GRID API] Request failed:', error.message);
    throw error;
  } finally {
    clearTimeout(timer);
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
    const data = await executeGraphQL(GRID_CENTRAL_ENDPOINT, query, { tournamentId: String(tournamentId), after });

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
            roles {
              name
            }
          }
        }
      }
    }
  `;

  console.log(`[GRID API] Fetching roster for team ${teamId}...`);
  const data = await executeGraphQL(GRID_CENTRAL_ENDPOINT, query, { teamId: String(teamId) });

  if (!data.players || !data.players.edges) {
    throw new Error('Invalid response from Grid API: players not found');
  }

  const cs2Players = data.players.edges.filter(edge => {
    const node = edge.node;
    // Must be CS2 player
    if (!node.title || node.title.name !== 'Counter Strike 2') return false;
    // Must have role "player" (excludes coaches, analysts, substitutes)
    if (node.roles && node.roles.length > 0) {
      return node.roles.some(r => r.name?.toLowerCase() === 'player');
    }
    return true; // if roles not available, keep player
  });

  console.log(`[GRID API] Found ${cs2Players.length} CS2 active players`);
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
              id
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
  const data = await executeGraphQL(GRID_SERIES_STATE_ENDPOINT, query, { seriesId: String(seriesId) });

  if (!data.seriesState) {
    throw new Error('Invalid response from Grid API: seriesState not found');
  }

  console.log(`[GRID API] Series finished: ${data.seriesState.finished}, Games: ${data.seriesState.games?.length || 0}`);
  return data.seriesState;
}

module.exports = {
  getTournamentMatches,
  getTeamRoster,
  getMatchStats,
  sleep
};
