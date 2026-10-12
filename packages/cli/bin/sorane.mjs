#!/usr/bin/env node
// A cached ESM import avoids registering a second loader when the runtime
// already preloads tsx (for example, source-mapped coverage collection).
import "tsx/esm";
await import("../src/main.ts");
