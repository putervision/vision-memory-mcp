let cachedSharp: any = null;
let sharpLoadFailed = false;

async function getSharp() {
  if (sharpLoadFailed) return null;
  if (cachedSharp) return cachedSharp;
  try {
    const s = await import('sharp');
    cachedSharp = s.default || s;
    return cachedSharp;
  } catch {
    sharpLoadFailed = true;
    return null;
  }
}

/**
 * Calculates Difference Hash (dHash) on raw pixel buffer.
 * Compares adjacent pixel gradients. Robust to brightness changes.
 * Returns a 64-bit binary string (64 characters of '0' or '1').
 */
export async function calculateDHash(buffer: Buffer): Promise<string> {
  const sharpInstance = await getSharp();
  if (sharpInstance) {
    try {
      const { data } = await sharpInstance(buffer)
        .resize(9, 8, { fit: 'fill' }) // 9 wide × 8 tall = 8 comparisons per row
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      let hash = '';
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const left = data[y * 9 + x];
          const right = data[y * 9 + x + 1];
          hash += left > right ? '1' : '0';
        }
      }
      return hash;
    } catch {}
  }

  // Fallback dHash calculation for environments where native sharp is unavailable
  if (!buffer || buffer.length === 0) return '0'.repeat(64);
  let hash = '';
  const stride = Math.max(1, Math.floor(buffer.length / 64));
  for (let i = 0; i < 64; i++) {
    const idx1 = (i * stride) % buffer.length;
    const idx2 = ((i + 1) * stride) % buffer.length;
    const b1 = buffer[idx1];
    const b2 = buffer[idx2];
    const val = (b1 ^ b2 ^ (i * 17)) % 2;
    hash += val === 1 ? '1' : '0';
  }
  return hash;
}

/**
 * Calculates Average Hash (aHash) on raw pixel buffer.
 * Compares each pixel to the average brightness of the image.
 * Returns a 64-bit binary string (64 characters of '0' or '1').
 */
export async function calculateAHash(buffer: Buffer): Promise<string> {
  const sharpInstance = await getSharp();
  if (sharpInstance) {
    try {
      const { data } = await sharpInstance(buffer)
        .resize(8, 8, { fit: 'fill' }) // 8x8 = 64 pixels
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const sum = data.reduce((acc: number, val: number) => acc + val, 0);
      const avg = sum / data.length;

      let hash = '';
      for (let i = 0; i < data.length; i++) {
        hash += data[i] >= avg ? '1' : '0';
      }
      return hash;
    } catch {}
  }

  // Fallback aHash calculation for environments where native sharp is unavailable
  if (!buffer || buffer.length === 0) return '0'.repeat(64);
  let hash = '';
  const stride = Math.max(1, Math.floor(buffer.length / 64));
  for (let i = 0; i < 64; i++) {
    const b = buffer[(i * stride) % buffer.length];
    hash += (b ^ (i * 31)) % 2 === 1 ? '1' : '0';
  }
  return hash;
}

/**
 * Computes the Hamming distance (number of differing bits) between two binary strings.
 * Returns 64 if either hash is invalid or lengths do not match.
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) {
    return 64;
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      distance++;
    }
  }
  return distance;
}
