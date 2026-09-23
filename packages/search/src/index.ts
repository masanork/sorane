export {
  chunkDocument,
  MIN_BODY,
  MIN_BODY_STRUCTURED,
  MAX_BODY,
  type Chunk,
  type ChunkDocumentOptions,
} from "./chunker.ts";
export { hashContent, planIncremental, type IncrementalPlan } from "./incremental.ts";
export { slugifyHeading, SlugLedger } from "./heading-slug.ts";
export {
  IndexStore,
  SCHEMA_VERSION,
  type ChunkRow,
  type MetaFilter,
  type FtsHit,
  type Counts,
} from "./store.ts";
export {
  buildFtsQuery,
  makeSnippet,
  searchFts,
  search,
  type SearchOptions,
  type SearchResult,
} from "./search.ts";
export { walkMarkdown } from "./walk.ts";
export { buildSearchIndex, type BuildIndexOptions, type BuildIndexResult } from "./build-index.ts";
export {
  searchChunksFromKnowledgeIr,
  searchTagsFromConcept,
} from "./from-ir.ts";
export {
  buildFtsWebIndex,
  toSnippet,
  defaultSourceUrl,
  FTS_WEB_INDEX_SCHEMA_VERSION,
  SNIPPET_LEN,
  type WebChunk,
  type FtsWebIndex,
  type FtsWebChunk,
} from "./web-export.ts";
export { deriveWebIndex, type DeriveResult } from "./derive-web-index.ts";
export {
  copySearchScript,
  readSearchScript,
} from "./vendor-web.ts";
export {
  emitSearchAssets,
  type EmitSearchAssetsOptions,
  type EmitSearchAssetsResult,
} from "./emit-search-assets.ts";
export {
  buildSearchServiceWorkerSource,
  writeSearchServiceWorker,
  type WriteSearchServiceWorkerOptions,
} from "./offline-sw.ts";
