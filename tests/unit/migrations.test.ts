import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { checkAndRunSchemaMigrations, CURRENT_SCHEMA_VERSION } from '../../src/core/migrations.js';
import { config } from '../../src/config.js';

describe('Schema Migrations Engine', () => {
  const testDbDir = path.join(process.cwd(), '.test-migrations-db');
  const originalPath = config.LANCEDB_PATH;

  beforeEach(() => {
    config.LANCEDB_PATH = testDbDir;
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
  });

  it('should create schema_version.json if not present and set current version', async () => {
    await checkAndRunSchemaMigrations();

    const versionFile = path.join(testDbDir, 'schema_version.json');
    expect(fs.existsSync(versionFile)).toBe(true);

    const content = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    expect(content.version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('should skip migration if database is already at current schema version', async () => {
    fs.mkdirSync(testDbDir, { recursive: true });
    const versionFile = path.join(testDbDir, 'schema_version.json');
    fs.writeFileSync(
      versionFile,
      JSON.stringify({ version: CURRENT_SCHEMA_VERSION, updated_at: Date.now() }),
      'utf8'
    );

    await checkAndRunSchemaMigrations();
    const content = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    expect(content.version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('should handle corrupted versionFile gracefully and update to current version', async () => {
    fs.mkdirSync(testDbDir, { recursive: true });
    const versionFile = path.join(testDbDir, 'schema_version.json');
    fs.writeFileSync(versionFile, 'invalid-json', 'utf8');

    await checkAndRunSchemaMigrations();

    const content = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    expect(content.version).toBe(CURRENT_SCHEMA_VERSION);
  });
});
