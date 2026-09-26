import { describe, it, expect } from 'vitest';
import {
  z,
  StringSchema,
  NumberSchema,
  BooleanSchema,
  EnumSchema,
  ArraySchema,
  RecordSchema,
  ObjectSchema,
  UnknownSchema,
} from '../../src/schema/schemas.js';

describe('Vision-Memory Exhaustive Schema Validation Suite', () => {
  describe('StringSchema', () => {
    it('handles valid strings, defaults, and optional', () => {
      const s = z.string().describe('test string');
      expect(s.parse('hello')).toBe('hello');
      expect(s.toJsonSchema()).toEqual({ type: 'string', description: 'test string' });

      const sOpt = z.string().optional();
      expect(sOpt.parse(undefined)).toBeUndefined();
      expect(sOpt.parse(null)).toBeUndefined();

      const sDef = z.string().default('fallback');
      expect(sDef.parse(undefined)).toBe('fallback');
      expect(sDef.parse(null)).toBe('fallback');
    });

    it('throws or fails safeParse on invalid input', () => {
      const s = z.string();
      expect(() => s.parse(123)).toThrow('must be a string');
      expect(() => s.parse(undefined)).toThrow('is required');

      const res = s.safeParse(123);
      expect(res.success).toBe(false);
      expect(res.error?.message).toContain('must be a string');
      expect(res.error?.errors.length).toBe(1);

      const good = s.safeParse('ok');
      expect(good.success).toBe(true);
      expect(good.data).toBe('ok');
    });

    it('supports chainable modifiers without errors', () => {
      const s = z.string().min(1).max(10).int().positive();
      expect(s.parse('abc')).toBe('abc');
    });
  });

  describe('NumberSchema', () => {
    it('handles numbers, defaults, optional, and errors', () => {
      const n = z.number().describe('a number');
      expect(n.parse(42)).toBe(42);
      expect(n.toJsonSchema()).toEqual({ type: 'number', description: 'a number' });

      const nOpt = z.number().optional();
      expect(nOpt.parse(undefined)).toBeUndefined();
      expect(nOpt.parse(null)).toBeUndefined();

      const nDef = z.number().default(100);
      expect(nDef.parse(undefined)).toBe(100);
      expect(nDef.parse(null)).toBe(100);

      expect(() => n.parse('not a number')).toThrow('must be a number');
      expect(() => n.parse(NaN)).toThrow('must be a number');
      expect(() => n.parse(undefined)).toThrow('is required');

      const badRes = n.safeParse('xyz');
      expect(badRes.success).toBe(false);
    });
  });

  describe('BooleanSchema', () => {
    it('handles booleans, defaults, optional, and errors', () => {
      const b = z.boolean().describe('flag');
      expect(b.parse(true)).toBe(true);
      expect(b.parse(false)).toBe(false);
      expect(b.toJsonSchema()).toEqual({ type: 'boolean', description: 'flag' });

      const bOpt = z.boolean().optional();
      expect(bOpt.parse(undefined)).toBeUndefined();
      expect(bOpt.parse(null)).toBeUndefined();

      const bDef = z.boolean().default(true);
      expect(bDef.parse(undefined)).toBe(true);
      expect(bDef.parse(null)).toBe(true);

      expect(() => b.parse('true')).toThrow('must be a boolean');
      expect(() => b.parse(undefined)).toThrow('is required');
    });
  });

  describe('EnumSchema', () => {
    it('handles enums, defaults, optional, and errors', () => {
      const e = z.enum(['apple', 'banana']).describe('fruit');
      expect(e.parse('apple')).toBe('apple');
      expect(e.toJsonSchema()).toEqual({
        type: 'string',
        enum: ['apple', 'banana'],
        description: 'fruit',
      });

      const eOpt = z.enum(['a', 'b']).optional();
      expect(eOpt.parse(undefined)).toBeUndefined();
      expect(eOpt.parse(null)).toBeUndefined();

      const eDef = z.enum(['x', 'y']).default('x');
      expect(eDef.parse(undefined)).toBe('x');
      expect(eDef.parse(null)).toBe('x');

      expect(() => e.parse('orange')).toThrow('one of');
      expect(() => e.parse(123)).toThrow('one of');
      expect(() => e.parse(undefined)).toThrow('is required');
    });
  });

  describe('ArraySchema', () => {
    it('handles arrays, defaults, optional, and errors', () => {
      const a = z.array(z.string()).describe('list of strings');
      expect(a.parse(['a', 'b'])).toEqual(['a', 'b']);
      expect(a.toJsonSchema()).toEqual({
        type: 'array',
        items: { type: 'string' },
        description: 'list of strings',
      });

      const aOpt = z.array(z.number()).optional();
      expect(aOpt.parse(undefined)).toBeUndefined();
      expect(aOpt.parse(null)).toBeUndefined();

      const aDef = z.array(z.string()).default(['def']);
      expect(aDef.parse(undefined)).toEqual(['def']);
      expect(aDef.parse(null)).toEqual(['def']);

      expect(() => a.parse('not array')).toThrow('must be an array');
      expect(() => a.parse(['valid', 123])).toThrow('must be a string');
      expect(() => a.parse(undefined)).toThrow('is required');
    });
  });

  describe('RecordSchema', () => {
    it('handles records, defaults, optional, and errors', () => {
      const r = z.record(z.number()).describe('record of numbers');
      expect(r.parse({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
      expect(r.toJsonSchema()).toEqual({
        type: 'object',
        additionalProperties: { type: 'number' },
        description: 'record of numbers',
      });

      const rOpt = z.record(z.string()).optional();
      expect(rOpt.parse(undefined)).toBeUndefined();
      expect(rOpt.parse(null)).toBeUndefined();

      const rDef = z.record(z.string()).default({ k: 'v' });
      expect(rDef.parse(undefined)).toEqual({ k: 'v' });
      expect(rDef.parse(null)).toEqual({ k: 'v' });

      expect(() => r.parse('not obj')).toThrow('must be an object');
      expect(() => r.parse([1, 2])).toThrow('must be an object');
      expect(() => r.parse({ a: 'not number' })).toThrow('must be a number');
      expect(() => r.parse(undefined)).toThrow('is required');
    });
  });

  describe('ObjectSchema & UnknownSchema', () => {
    it('handles objects, defaults, optional, passthrough, and unknown/any schema', () => {
      const u = z.unknown().describe('anything');
      expect(u.parse('any')).toBe('any');
      expect(u.parse({ any: true })).toEqual({ any: true });
      expect(u.toJsonSchema()).toEqual({ description: 'anything' });

      const anySchema = z.any();
      expect(anySchema.parse(123)).toBe(123);
      expect(anySchema.toJsonSchema()).toEqual({});

      const o = z
        .object({
          reqStr: z.string(),
          optNum: z.number().optional(),
          defBool: z.boolean().default(false),
        })
        .describe('an object')
        .passthrough();

      expect(o.parse({ reqStr: 'hi', optNum: 10 })).toEqual({
        reqStr: 'hi',
        optNum: 10,
        defBool: false,
      });

      expect(o.parse({ reqStr: 'hi' })).toEqual({
        reqStr: 'hi',
        defBool: false,
      });

      const jsonSchema = o.toJsonSchema();
      expect(jsonSchema.type).toBe('object');
      expect(jsonSchema.description).toBe('an object');
      expect(jsonSchema.required).toEqual(['reqStr']);

      const oOpt = o.optional();
      expect(oOpt.parse(undefined)).toBeUndefined();
      expect(oOpt.parse(null)).toBeUndefined();

      const oDef = o.default({ reqStr: 'defaultVal', optNum: 1, defBool: true });
      expect(oDef.parse(undefined)).toEqual({ reqStr: 'defaultVal', optNum: 1, defBool: true });

      expect(() => o.parse('string')).toThrow('must be an object');
      expect(() => o.parse(null)).toThrow('is required');
      expect(() => o.parse({})).toThrow('is required');
    });
  });
});
