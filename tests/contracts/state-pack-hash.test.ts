import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { canonicalJsonStringify } from '../../src/utils/canonical-json.js';

describe('Vision-Memory Canonical StatePack Contract', () => {
  const fixturePath = path.resolve(__dirname, '../fixtures/canonical-state-pack.json');
  const fixtureRaw = fs.readFileSync(fixturePath, 'utf8');
  const fixture = JSON.parse(fixtureRaw);

  const EXPECTED_PACK_HASH = '283cbb0c60496b6beca4237341fb3bb1ae76490628a81b54b46953058eb9bd21';
  const EXPECTED_FULL_HASH = '376e80f562b8edab8d51fe40faf76140c65253a215bca87ee7dd89224636e079';

  it('computes exact canonical pack_hash matching EXPECTED_PACK_HASH', () => {
    const { pack_hash, ...rest } = fixture;
    const cjson = canonicalJsonStringify(rest);
    const hash = crypto.createHash('sha256').update(cjson, 'utf8').digest('hex');

    expect(pack_hash).toBe(EXPECTED_PACK_HASH);
    expect(hash).toBe(EXPECTED_PACK_HASH);
  });

  it('computes exact byte-for-byte full canonical serialized hash', () => {
    const fullCjson = canonicalJsonStringify(fixture);
    const fullHash = crypto.createHash('sha256').update(fullCjson, 'utf8').digest('hex');
    expect(fullHash).toBe(EXPECTED_FULL_HASH);
  });
});
