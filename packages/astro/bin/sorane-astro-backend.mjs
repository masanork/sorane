#!/usr/bin/env node
import { runSoraneAstroBackendBin } from "../src/backend-bin.ts";

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}
const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const output = await runSoraneAstroBackendBin(input);
process.stdout.write(`${JSON.stringify(output)}\n`);