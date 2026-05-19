import { describe, it, expect } from 'vitest';
import { assertSchemaVersion } from '../../src/storage/lancedb.js';
import { ErrorCode, IndexerError } from '../../src/errors/codes.js';
import { SCHEMA_VERSION } from '../../src/constants.js';

describe('schema version guard', () => {
  it('passes for current SCHEMA_VERSION', () => {
    expect(() => assertSchemaVersion(SCHEMA_VERSION)).not.toThrow();
  });

  it('throws SCHEMA_MISMATCH for stale version', () => {
    expect(() => assertSchemaVersion('0.9')).toThrowError(IndexerError);
  });

  it('thrown error has SCHEMA_MISMATCH code', () => {
    try {
      assertSchemaVersion('0.9');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(IndexerError);
      expect((e as IndexerError).code).toBe(ErrorCode.SCHEMA_MISMATCH);
    }
  });

  it('thrown error carries batch_version and required_version in details', () => {
    try {
      assertSchemaVersion('0.9');
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as IndexerError;
      expect(err.details?.batch_version).toBe('0.9');
      expect(err.details?.required_version).toBe(SCHEMA_VERSION);
    }
  });

  it('throws for any version other than current', () => {
    for (const bad of ['0.1', '2.0', '', 'latest']) {
      expect(() => assertSchemaVersion(bad)).toThrow();
    }
  });
});
