#!/usr/bin/env node
import { runSoraneAstroTsBackend } from "../src/backend-ts.ts";

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}
const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const output = await runSoraneAstroTsBackend(input);
process.stdout.write(`${JSON.stringify(output)}\n`);