const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

// En test ou par défaut, cibler IROKO_DATA_DIR
const dataDir = process.env.IROKO_DATA_DIR;
if (!dataDir) {
  // Ne rien faire si IROKO_DATA_DIR n'est pas défini pour éviter d'altérer la base réelle
  process.exit(0);
}

const dbPath = path.join(dataDir, 'iroko_runtime.db');
try {
  const db = new DatabaseSync(dbPath);
  db.exec("DELETE FROM mcp_servers WHERE name IN ('test_calc', 'disabled_server', 'unapproved_server')");
  console.log('Cleaned db successfully');
} catch (err) {
  console.error(err);
}
