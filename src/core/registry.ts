import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../logger.js';

export const REGISTRY_PATH = path.join(os.homedir(), '.vision-memory-mcp', 'projects.json');
const REGISTRY_TTL_MS = 5000;

interface CacheEntry {
  registry: Record<string, string>;
  timestamp: number;
}

let registryCache: CacheEntry | null = null;

function cleanupTempRegistryFiles(): void {
  try {
    const home = path.dirname(REGISTRY_PATH);
    if (!fs.existsSync(home)) return;
    const files = fs.readdirSync(home);
    for (const f of files) {
      if (f.startsWith('projects.json.tmp.')) {
        try {
          fs.unlinkSync(path.join(home, f));
        } catch {}
      }
    }
  } catch {}
}

export function getRegistry(): Record<string, string> {
  cleanupTempRegistryFiles();
  const now = Date.now();
  if (registryCache && now - registryCache.timestamp < REGISTRY_TTL_MS) {
    return registryCache.registry;
  }

  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
      try {
        const registry = JSON.parse(raw) || {};
        registryCache = { registry, timestamp: now };
        return registry;
      } catch (parseErr) {
        logger.error('Corrupt registry file detected at:', REGISTRY_PATH, parseErr);
      }
    }
  } catch (e) {
    logger.warn('Failed to read global vision-memory-mcp registry:', e);
  }
  return {};
}

export function registerProject(name: string, projectPath: string): void {
  try {
    const resolvedPath = path.resolve(projectPath);
    if (resolvedPath === os.homedir()) return;

    registryCache = null;
    const registry = getRegistry();
    registry[name.toLowerCase()] = resolvedPath;
    const dir = path.dirname(REGISTRY_PATH);
    fs.mkdirSync(dir, { recursive: true });

    const tempPath = `${REGISTRY_PATH}.tmp.${Math.random().toString(36).substring(2)}`;
    fs.writeFileSync(tempPath, JSON.stringify(registry, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    try {
      fs.renameSync(tempPath, REGISTRY_PATH);
    } catch {
      fs.copyFileSync(tempPath, REGISTRY_PATH);
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }
  } catch (e) {
    logger.error('Failed to register project in global vision-memory-mcp registry:', e);
  }
}

export function unregisterProject(name: string): void {
  try {
    registryCache = null;
    const registry = getRegistry();
    delete registry[name.toLowerCase()];
    const tempPath = `${REGISTRY_PATH}.tmp.${Math.random().toString(36).substring(2)}`;
    fs.writeFileSync(tempPath, JSON.stringify(registry, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    try {
      fs.renameSync(tempPath, REGISTRY_PATH);
    } catch {
      fs.copyFileSync(tempPath, REGISTRY_PATH);
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }
  } catch (e) {
    logger.error('Failed to unregister project from global vision-memory-mcp registry:', e);
  }
}

export function getProjectFromRegistry(name: string): string | undefined {
  const registry = getRegistry();
  return registry[name.toLowerCase()];
}
