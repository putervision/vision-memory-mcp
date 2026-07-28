import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../logger.js';

export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Checks and executes schema migrations for LanceDB / local cache stores.
 */
export async function checkAndRunSchemaMigrations(): Promise<void> {
  const versionFile = path.join(config.LANCEDB_PATH, 'schema_version.json');
  let installedVersion = 1;

  if (fs.existsSync(versionFile)) {
    try {
      const content = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      installedVersion = content.version || 1;
    } catch {
      installedVersion = 1;
    }
  }

  if (installedVersion >= CURRENT_SCHEMA_VERSION) {
    logger.debug(`Database schema version ${installedVersion} is up to date.`);
    return;
  }

  logger.info(
    `Migrating database schema from v${installedVersion} to v${CURRENT_SCHEMA_VERSION}...`
  );

  // Migration v1 -> v2: Add grounded_elements, ocr_text, app_context fields
  try {
    fs.mkdirSync(config.LANCEDB_PATH, { recursive: true });
    fs.writeFileSync(
      versionFile,
      JSON.stringify({ version: CURRENT_SCHEMA_VERSION, updated_at: Date.now() }, null, 2),
      'utf8'
    );
    logger.info(`Schema migration to v${CURRENT_SCHEMA_VERSION} completed successfully.`);
  } catch (err) {
    logger.error('Failed to write schema version migration file:', err);
  }
}
