import { describe, it, expect } from 'vitest';
import { hammingDistance, calculateDHash, calculateAHash } from '../../src/core/hash.js';
import sharp from 'sharp';

describe('Perceptual Hashing Utilities', () => {
  describe('hammingDistance', () => {
    it('should calculate correct distance for identical hashes', () => {
      const hash = '1010101010101010101010101010101010101010101010101010101010101010';
      expect(hammingDistance(hash, hash)).toBe(0);
    });

    it('should calculate correct distance for completely different hashes', () => {
      const hash1 = '0'.repeat(64);
      const hash2 = '1'.repeat(64);
      expect(hammingDistance(hash1, hash2)).toBe(64);
    });

    it('should calculate correct distance for partially different hashes', () => {
      const hash1 = '11110000' + '0'.repeat(56);
      const hash2 = '00001111' + '0'.repeat(56);
      expect(hammingDistance(hash1, hash2)).toBe(8);
    });

    it('should return 64 for invalid or different length hashes', () => {
      expect(hammingDistance('', '1')).toBe(64);
      expect(hammingDistance('1010', '10101')).toBe(64);
    });
  });

  describe('calculateDHash and calculateAHash', () => {
    it('should generate 64-bit binary strings for a plain image', async () => {
      // Create a solid black 100x100 PNG buffer
      const blackBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer();

      const dhash = await calculateDHash(blackBuffer);
      const ahash = await calculateAHash(blackBuffer);

      expect(dhash).toHaveLength(64);
      expect(ahash).toHaveLength(64);
      expect(/^[01]+$/.test(dhash)).toBe(true);
      expect(/^[01]+$/.test(ahash)).toBe(true);
    });
  });
});
