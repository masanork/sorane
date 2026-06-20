export { chunkDocument, MIN_BODY, MAX_BODY, type Chunk } from "./chunker.ts";
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
  type SearchOptions,
  type SearchResult,
} from "./search.ts";
export { walkMarkdown } from "./walk.ts";
export { buildSearchIndex, type BuildIndexOptions, type BuildIndexResult } from "./build-index.ts";