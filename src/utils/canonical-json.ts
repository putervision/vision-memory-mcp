/**
 * Canonical JSON Serialization Utility
 * 
 * Complies strictly with PuterVision Pentad System One specification §10.1:
 * 1. Object keys are sorted lexicographically (recursive, including nested objects).
 * 2. No trailing commas. No comments.
 * 3. `undefined` fields are omitted entirely (not serialized as `null`).
 * 4. Numbers: no `NaN`, no `Infinity`, no `-0`. Floats are rounded to 6 decimal places maximum.
 * 5. Arrays preserve insertion order; objects inside arrays follow the same key-sort rule.
 * 6. Serialization Preimage: The preimage to SHA-256 is the exact UTF-8 byte stream produced
 *    with zero extraneous whitespace and zero trailing newlines.
 */

export function canonicalJsonStringify(val: unknown): string {
  if (val === undefined) {
    return '';
  }
  if (val === null) {
    return 'null';
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      throw new Error(`Invalid non-finite number in canonical JSON: ${val}`);
    }
    if (Object.is(val, -0)) {
      return '0';
    }
    const rounded = Number(Math.round(Number(val + 'e+6')) + 'e-6');
    return String(rounded);
  }
  if (typeof val === 'boolean') {
    return val ? 'true' : 'false';
  }
  if (typeof val === 'string') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    const serializedItems = val.map((item) =>
      item === undefined ? 'null' : canonicalJsonStringify(item)
    );
    return '[' + serializedItems.join(',') + ']';
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val as Record<string, unknown>).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const v = (val as Record<string, unknown>)[key];
      if (v !== undefined) {
        parts.push(JSON.stringify(key) + ':' + canonicalJsonStringify(v));
      }
    }
    return '{' + parts.join(',') + '}';
  }
  return JSON.stringify(val);
}
