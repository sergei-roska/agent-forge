import { createHash } from 'node:crypto';
import fs from 'node:fs';

export interface FileFingerprint {
  size_bytes: number;
  /** Nanosecond-precision mtime from fs.statSync({ bigint: true }). */
  mtime_ns: bigint;
  /** Full SHA-256 hex digest of file contents. */
  sha256: string;
}

/** Compute fingerprint for a file by streaming its contents. */
export async function computeFingerprint(filePath: string): Promise<FileFingerprint> {
  const stat = fs.statSync(filePath, { bigint: true });

  const sha256 = await hashFileStreamed(filePath);

  return {
    size_bytes: Number(stat.size),
    mtime_ns: stat.mtimeNs,
    sha256,
  };
}

function hashFileStreamed(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Returns true if the stored fingerprint still matches the file on disk.
 * Compares size + mtime first (fast path); only hashes if both match.
 */
export async function fingerprintChanged(
  filePath: string,
  stored: { size_bytes: number; mtime_ns: bigint | number | string; content_hash_sha256: string },
): Promise<boolean> {
  const stat = fs.statSync(filePath, { bigint: true });

  if (Number(stat.size) !== stored.size_bytes) return true;
  if (stat.mtimeNs !== BigInt(stored.mtime_ns)) return true;

  const currentHash = await hashFileStreamed(filePath);
  return currentHash !== stored.content_hash_sha256;
}
