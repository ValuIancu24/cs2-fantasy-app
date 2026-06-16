const cron = require('node-cron');
const db = require('../database');
const dataAdapter = require('./dataAdapter');

const STATS_INTERVAL = '*/30 * * * * *';
const TOURNAMENT_INTERVAL = '*/30 * * * * *';

function logSync(tournamentId, type, status, message) {
  db.run(
    `INSERT INTO sync_logs (tournament_id, type, status, message) VALUES (?, ?, ?, ?)`,
    [tournamentId, type, status, message || null]
  );
}

function startAutoSync() {
  cron.schedule(STATS_INTERVAL, async () => {
    db.all(
      `SELECT id FROM tournaments WHERE status = 'active' AND auto_sync_stats = 1`,
      [],
      async (err, rows) => {
        if (err || !rows) return;
        for (const row of rows) {
          try {
            await dataAdapter.syncTournamentStats(row.id);
            logSync(row.id, 'stats', 'success', null);
            console.log(`[AUTO-SYNC] Stats synced for tournament ${row.id}`);
          } catch (e) {
            logSync(row.id, 'stats', 'error', e.message || 'Unknown error');
            console.error(`[AUTO-SYNC] Stats sync failed for tournament ${row.id}:`, e.message);
          }
        }
      }
    );
  });

  cron.schedule(TOURNAMENT_INTERVAL, async () => {
    db.all(
      `SELECT id FROM tournaments WHERE status = 'active' AND auto_sync_tournament = 1`,
      [],
      async (err, rows) => {
        if (err || !rows) return;
        for (const row of rows) {
          try {
            await dataAdapter.syncTournament(row.id);
            logSync(row.id, 'tournament', 'success', null);
            console.log(`[AUTO-SYNC] Tournament synced for tournament ${row.id}`);
          } catch (e) {
            logSync(row.id, 'tournament', 'error', e.message || 'Unknown error');
            console.error(`[AUTO-SYNC] Tournament sync failed for tournament ${row.id}:`, e.message);
          }
        }
      }
    );
  });

  console.log('[AUTO-SYNC] Cron jobs started (30s intervals)');
}

module.exports = { startAutoSync };
