export { chunkDocument, MIN_BODY, MAX_BODY, type Chunk } from "./chunker.ts";
export { hashContent, planIncremental, type IncrementalPlan } from "./incremental.ts";
export { slugifyHeading, SlugLedger } from "./heading-slug.ts";
export {
  RuriEmbeddings,
  DOC_PREFIX,
  QUERY_PREFIX,
  type EmbeddingProvider,
  type RuriOptions,
} from "./embeddings.ts";
export {
  IndexStore,
  SCHEMA_VERSION,
  type ChunkRow,
  type MetaFilter,
  type FtsHit,
  type VecHit,
  type Counts,
  type IndexMeta,
} from "./store.ts";
export {
  buildFtsQuery,
  makeSnippet,
  rrfFuse,
  RRF_K,
  checkModelMismatch,
  searchFts,
  searchHybrid,
  search,
  type SearchOptions,
  type SearchResult,
} from "./search.ts";
export { walkMarkdown } from "./walk.ts";
export { buildSearchIndex, type BuildIndexOptions, type BuildIndexResult } from "./build-index.ts";