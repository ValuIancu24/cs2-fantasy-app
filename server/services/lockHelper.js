const db = require('../database');

function getTournamentLockTime(tournamentId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT MIN(scheduled_at) AS lock_time FROM series_cache WHERE tournament_id = ?`,
      [tournamentId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row?.lock_time || null);
      }
    );
  });
}

function isTournamentLocked(lockTime) {
  if (process.env.LOCK_TEAMS_ENABLED !== 'true') return false;
  if (!lockTime) return false;
  return new Date() >= new Date(lockTime);
}

module.exports = { getTournamentLockTime, isTournamentLocked };
