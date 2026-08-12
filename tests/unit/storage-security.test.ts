import { describe, it, expect } from 'vitest';
import { validateFilter } from '../../src/core/storage.js';

describe('Storage Security & Filter Validation', () => {
  it('should allow valid/whitelisted SQL filter predicates', () => {
    expect(() => validateFilter(undefined)).not.toThrow();
    expect(() => validateFilter('')).not.toThrow();
    expect(() => validateFilter("git_branch = 'main'")).not.toThrow();
    expect(() => validateFilter("id = 'state-123'")).not.toThrow();
    expect(() => validateFilter("id IN ('s1', 's2')")).not.toThrow();
    expect(() => validateFilter("from_state_id = 'a' OR to_state_id = 'b'")).not.toThrow();
    expect(() =>
      validateFilter("git_branch = 'main' AND source_url = 'https://example.com'")
    ).not.toThrow();
  });

  it('should reject unwhitelisted or SQL injection filter attempts', () => {
    expect(() => validateFilter("'; DROP TABLE visual_states; --")).toThrow();
    expect(() => validateFilter('1=1')).toThrow();
    expect(() => validateFilter("id = '1' UNION SELECT * FROM visual_states")).toThrow();
    expect(() => validateFilter('DELETE FROM visual_states')).toThrow();
  });
});
