/**
 * Frozen constants for the read-only search service.
 *
 * SCHEMA_VERSION MUST match the indexer's constant (Spec 08.1 §constants). The
 * search service applies it as a mandatory query-time filter so it never serves
 * rows written by an incompatible indexer version (Spec 08.2 §3.1).
 */
export const SCHEMA_VERSION = '1.0';

/** Frozen public contract version — see server.manifest.json `contract_frozen`. */
export const CONTRACT_VERSION = '1.0';

export const CHUNKS_TABLE = 'chunks';

// ── Embedding / enrichment models (shared local stack) ───────────────────────
export const DEFAULT_EMBED_MODEL = 'qwen3-embedding:8b';
export const DEFAULT_RERANK_MODEL = 'qwen3.5:9b';

// ── RRF fusion defaults (Spec 08.2 §2.3 step 3) ──────────────────────────────
export const DEFAULT_ALPHA = 0.65;
export const DEFAULT_RRF_K = 60;
/** Exact-identifier boost per whole-word hit, and the per-chunk cap. */
export const IDENTIFIER_BOOST = 0.15;
export const IDENTIFIER_BOOST_CAP = 0.3;

// ── Recency boost (Spec 08.2 §2.3 step 4) ────────────────────────────────────
export const DEFAULT_RECENCY_WEIGHT = 0.1;
export const RECENCY_DECAY_HALF_LIFE_DAYS = 30;

// ── Relevance gap filtering (Spec 08.2 §2.3 step 5) ──────────────────────────
export const DEFAULT_GAP_THRESHOLD = 0.25;

// ── Retrieval candidate fan-out (Spec 08.2 §2.3 step 2) ──────────────────────
export const DEFAULT_TOP_K_CANDIDATES = 50;

// ── Projection / truncation (Spec 08.2 §2.3 step 7) ──────────────────────────
export const DEFAULT_MAX_CHARS = 800;
export const DEFAULT_CONTEXT_PACK_MAX_CHARS = 12_000;
export const DEFAULT_MAX_FILES = 8;

// ── Result cache (Spec 08.2 §3.2) ────────────────────────────────────────────
export const RESULT_CACHE_TTL_MS = 60_000;
export const RESULT_CACHE_MAX_ENTRIES = 128;

// ── Schema-mismatch warning threshold (Spec 08.2 §5.2) ───────────────────────
export const SCHEMA_MISMATCH_WARN_RATIO = 0.1;

/**
 * Average chunk line span — used to widen the LanceDB neighbor lookup window
 * (Spec 08.2 §4.3 implementation note).
 */
export const AVG_CHUNK_LINES = 120;
