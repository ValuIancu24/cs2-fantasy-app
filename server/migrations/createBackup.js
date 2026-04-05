const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.db');
const backupDir = path.join(__dirname, '..', 'backups');
const backupPath = path.join(backupDir, 'database.backup.db');

function createBackup() {
  try {
    // Create backups directory if not exists
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
      console.log('✅ Created backups directory');
    }

    // Only create backup if it doesn't exist (preserve original)
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(dbPath, backupPath);
      console.log('✅ Database backup created at:', backupPath);
    } else {
      console.log('ℹ️ Backup already exists, skipping...');
    }

    // Also create timestamped backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const timestampedPath = path.join(backupDir, `database.${timestamp}.db`);
    fs.copyFileSync(dbPath, timestampedPath);
    console.log('✅ Timestamped backup created:', timestampedPath);

  } catch (error) {
    console.error('❌ Backup failed:', error.message);
  }
}

// Run if executed directly
if (require.main === module) {
  createBackup();
}

module.exports = createBackup;
