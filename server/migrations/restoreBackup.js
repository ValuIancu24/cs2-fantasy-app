const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.db');
const backupPath = path.join(__dirname, '..', 'backups', 'database.backup.db');

function restoreBackup() {
  try {
    if (!fs.existsSync(backupPath)) {
      console.error('❌ Backup file not found at:', backupPath);
      console.log('💡 Run createBackup.js first or check if backup exists');
      return;
    }

    const safetyPath = path.join(__dirname, '..', 'backups', 'database.before-restore.db');
    fs.copyFileSync(dbPath, safetyPath);
    console.log('✅ Safety copy created:', safetyPath);

    fs.copyFileSync(backupPath, dbPath);
    console.log('✅ Database restored from backup');
    console.log('ℹ️ Server needs to be restarted to apply changes');

  } catch (error) {
    console.error('❌ Restore failed:', error.message);
  }
}

if (require.main === module) {
  restoreBackup();
}

module.exports = restoreBackup;
