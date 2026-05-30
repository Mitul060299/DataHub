/**
 * useDuckDB — Phase S2 client-side analytics
 *
 * Lazily initialises DuckDB-WASM in a Web Worker (loaded from jsDelivr CDN).
 * Fetches a short-lived S3 presigned URL for each dataset, registers the
 * Parquet file in the in-browser DuckDB instance, then runs arbitrary SQL
 * client-side — zero server memory cost for read queries.
 *
 * Usage:
 *   const { isReady, runQuery } = useDuckDB();
 *   const rows = await runQuery(datasetId, "SELECT region, SUM(sales) FROM dataset GROUP BY 1");
 *
 * Graceful degradation:
 *   - `isReady` is false until the WASM runtime has fully initialised.
 *   - If the presigned URL is unavailable (local:// storage path), `runQuery`
 *     throws and the caller should fall back to the server-side endpoint.
 *   - CORS must be enabled on the S3 bucket so the browser can range-fetch
 *     the Parquet file (allow GET + HEAD from the app origin).
 */
import { useEffect, useRef, useState } from "react";
import { api } from "../api";

// ── Types re-exported from @duckdb/duckdb-wasm (avoid deep import path churn) ──
type AsyncDuckDB = import("@duckdb/duckdb-wasm").AsyncDuckDB;
type AsyncDuckDBConnection = import("@duckdb/duckdb-wasm").AsyncDuckDBConnection;

// ── Module-level singleton so all component instances share one worker ──────

interface PresignedEntry {
  url: string;
  expiresAt: number; // epoch ms
  registered: boolean;
}

let _db: AsyncDuckDB | null = null;
let _initPromise: Promise<AsyncDuckDB> | null = null;
const _presignedCache = new Map<string, PresignedEntry>();

async function _initDuckDB(): Promise<AsyncDuckDB> {
  const duckdb = await import("@duckdb/duckdb-wasm");
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

  // Build a blob-URL worker so we don't need a dedicated worker file
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], {
      type: "text/javascript",
    }),
  );
  const worker = new Worker(workerUrl);
  const logger = new duckdb.VoidLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  return db;
}

function _getDB(): Promise<AsyncDuckDB> {
  if (_db) return Promise.resolve(_db);
  if (!_initPromise) {
    _initPromise = _initDuckDB().then((db) => {
      _db = db;
      return db;
    });
  }
  return _initPromise;
}

// ── Presigned URL fetching + caching ─────────────────────────────────────────

async function _getPresignedEntry(datasetId: string): Promise<PresignedEntry> {
  const cached = _presignedCache.get(datasetId);
  // Keep cached if still valid for at least 60 s
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached;

  const res = await api.get<{
    url: string;
    expires_at: string;
  }>(`/datasets/${datasetId}/presigned-url`);

  const entry: PresignedEntry = {
    url: res.data.url,
    expiresAt: new Date(res.data.expires_at).getTime(),
    registered: false,
  };
  _presignedCache.set(datasetId, entry);
  return entry;
}

// ── Public hook ───────────────────────────────────────────────────────────────

export interface DuckDBHook {
  /** True once the WASM runtime has finished loading and is ready for queries. */
  isReady: boolean;
  /** True while the WASM runtime is still loading. */
  isInitializing: boolean;
  /**
   * Run `sql` against the dataset's Parquet file in the browser.
   * The sql must reference the table as `dataset` (the same convention as
   * server-side DuckDB queries).
   *
   * @throws if the dataset has no S3 Parquet file or CORS isn't configured.
   */
  runQuery: (datasetId: string, sql: string) => Promise<Record<string, unknown>[]>;
}

export function useDuckDB(): DuckDBHook {
  const [isReady, setIsReady] = useState(!!_db);
  const [isInitializing, setIsInitializing] = useState(!_db);
  const connRef = useRef<AsyncDuckDBConnection | null>(null);

  useEffect(() => {
    if (_db) {
      setIsReady(true);
      setIsInitializing(false);
      return;
    }
    setIsInitializing(true);
    _getDB()
      .then(() => {
        setIsReady(true);
        setIsInitializing(false);
      })
      .catch(() => {
        setIsInitializing(false);
      });
  }, []);

  const runQuery = async (
    datasetId: string,
    sql: string,
  ): Promise<Record<string, unknown>[]> => {
    const db = await _getDB();

    // Fetch (or reuse cached) presigned URL and register the Parquet file
    const entry = await _getPresignedEntry(datasetId);
    if (!entry.registered) {
      const duckdb = await import("@duckdb/duckdb-wasm");
      await db.registerFileURL(
        `${datasetId}.parquet`,
        entry.url,
        duckdb.DuckDBDataProtocol.HTTP,
        false, // directIO — false allows range fetches
      );
      entry.registered = true;
    }

    // Rewrite `dataset` table reference to the registered parquet file
    const rewritten = sql.replace(
      /\bdataset\b/g,
      `read_parquet('${datasetId}.parquet')`,
    );

    const conn = await db.connect();
    connRef.current = conn;
    try {
      const result = await conn.query(rewritten);
      // Convert Apache Arrow table → plain JS objects
      return result.toArray().map((row) => {
        const obj: Record<string, unknown> = {};
        for (const key of result.schema.fields.map((f) => f.name)) {
          obj[key] = row[key] ?? null;
        }
        return obj;
      });
    } finally {
      await conn.close();
      connRef.current = null;
    }
  };

  return { isReady, isInitializing, runQuery };
}

/** Invalidate the cached presigned URL for a dataset (e.g. after upload). */
export function invalidateDuckDBCache(datasetId: string): void {
  const entry = _presignedCache.get(datasetId);
  if (entry) {
    entry.registered = false;
    entry.expiresAt = 0;
  }
}
