import { runSoraneAstroTsBackend } from "./backend-ts.ts";
import type { SoraneAstroBackendInput } from "./contract.ts";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const raw = await readStdin();
const input = JSON.parse(raw) as SoraneAstroBackendInput;
const output = await runSoraneAstroTsBackend(input);
process.stdout.write(`${JSON.stringify(output)}\n`);