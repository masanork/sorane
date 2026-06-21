import { DEFAULT_DIAGRAMS_CONFIG } from "../packages/core/src/config.ts";

/** Diagrams enabled — use in tests that exercise diagram rendering/compile. */
export const DIAGRAMS_ON = { ...DEFAULT_DIAGRAMS_CONFIG, enabled: true };