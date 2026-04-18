const db = require('../database');

function resetGridData(callback) {
  console.log('🗑️ Resetting Grid API data...');

  db.serialize(() => {
    db.run('DELETE FROM player_stats', (err) => {
      if (err) console.error('Error deleting player_stats:', err);
      else console.log('✅ Deleted player_stats');
    });

    db.run('DELETE FROM player_tournaments', (err) => {
      if (err) console.error('Error deleting player_tournaments:', err);
      else console.log('✅ Deleted player_tournaments');
    });

    db.run('DELETE FROM players', (err) => {
      if (err) console.error('Error deleting players:', err);
      else console.log('✅ Deleted players');
    });

    db.run('DELETE FROM series_cache', (err) => {
      if (err) console.error('Error deleting series_cache:', err);
      else console.log('✅ Deleted series_cache');
    });

    db.run('DELETE FROM teams', (err) => {
      if (err) console.error('Error deleting teams:', err);
      else console.log('✅ Deleted teams');
    });

    db.run('DELETE FROM tournaments', (err) => {
      if (err) console.error('Error deleting tournaments:', err);
      else console.log('✅ Deleted tournaments');
    });

    db.run('UPDATE leagues SET tournament_id = NULL', (err) => {
      if (err) {
        console.error('Error updating leagues:', err);
      } else {
        console.log('✅ Reset tournament_id in leagues');
        console.log('✅ Grid API data reset complete');
        console.log('ℹ️ Users, leagues, and fantasy_teams preserved');
      }
      if (callback) callback(err);
    });
  });
}

if (require.main === module) {
  resetGridData((err) => {
    process.exit(err ? 1 : 0);
  });
}

module.exports = resetGridData;
