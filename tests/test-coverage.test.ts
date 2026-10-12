import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { runCoverage, verifyCoverageTransforms } from "../scripts/test-coverage.ts";

test("coverage maps TypeScript and child CLI execution to the original lines and rejects untested code", async t => {
  const cwd = mkdtempSync(join(tmpdir(), "sorane-coverage-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, "packages")); mkdirSync(join(cwd, "tests"));
  writeFileSync(join(cwd, "package.json"), '{"type":"module"}');
  const source = [
    "export interface Input { label: string; enabled: boolean; }",
    "export function greet(input: Input): string {",
    "  if (input.enabled) return `こんにちは ${input.label}`;",
    "  return `無効 ${input.label}`;",
    "}",
    "export function unused(input: Input): string {",
    "  const messages = [",
    "    `未実行 ${input.label}`,",
    "    'This code must lower coverage until the test calls it.',",
    "    'TypeScript types and Japanese strings must keep their line mapping.',",
    "  ];",
    "  return messages.join(' / ');",
    "}",
  ].join("\n") + "\n";
  writeFileSync(join(cwd, "packages/runtime.ts"), source);
  writeFileSync(join(cwd, "cli.mjs"), `import ${JSON.stringify(import.meta.resolve("tsx/esm"))};
const {greet,unused}=await import('./packages/runtime.ts');
greet({label:'CLI',enabled:false});
if(process.env.SORANE_COVERAGE_FIXTURE_FULL==='1')unused({label:'CLI',enabled:true});\n`);
  writeFileSync(join(cwd, "tests/runtime.test.ts"), `import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {greet} from '../packages/runtime.ts';
test('parent test and child CLI',()=>{
  assert.equal(greet({label:'テスト',enabled:true}),'こんにちは テスト');
  execFileSync(process.execPath,['cli.mjs'],{stdio:'ignore'});
});\n`);
  const partial = join(cwd, "partial"), full = join(cwd, "full");
  assert.equal(await runCoverage({ cwd, reportsDir: partial, env: { ...process.env, SORANE_COVERAGE_FIXTURE_FULL: "0" }, quiet: true }), 1,
    "coverage gate must fail while the long function is never executed");
  const lcov = readFileSync(join(partial, "lcov.info"), "utf8");
  assert.match(lcov, /SF:packages\/runtime\.ts/);
  assert.match(lcov, /DA:3,[1-9]\d*/); assert.match(lcov, /DA:4,[1-9]\d*/, "child CLI branch is covered");
  assert.match(lcov, /DA:12,0/, "uncalled original line is not falsely marked covered");
  const fullCode = await runCoverage({ cwd, reportsDir: full, env: { ...process.env, SORANE_COVERAGE_FIXTURE_FULL: "1" }, quiet: true });
  const summary = JSON.parse(readFileSync(join(full, "coverage-summary.json"), "utf8"));
  assert.equal(verifyCoverageTransforms(join(full, "tmp"), cwd), 1);
  assert.equal(fullCode, 0, JSON.stringify(summary.total));
  assert.equal(summary.total.lines.pct, 100); assert.equal(summary.total.functions.pct, 100);
});

test("coverage refuses mixed generated offsets and missing maps before accepting a report", t => {
  const cwd = mkdtempSync(join(tmpdir(), "sorane-coverage-profiles-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const url = pathToFileURL(join(realpathSync(cwd), "packages/runtime.ts")).href;
  const report = (lines: number[], mapped = true) => ({ result: [{ url }], "source-map-cache": {
    [url]: mapped ? { lineLengths: lines, data: { mappings: "AAAA", sourcesContent: ["original TypeScript"] } } : {},
  } });
  writeFileSync(join(cwd, "first.json"), JSON.stringify(report([30, 20])));
  assert.equal(verifyCoverageTransforms(cwd, cwd), 1);
  writeFileSync(join(cwd, "second.json"), JSON.stringify(report([40, 25])));
  assert.throws(() => verifyCoverageTransforms(cwd, cwd), /Mixed TypeScript transforms/);
  writeFileSync(join(cwd, "second.json"), JSON.stringify(report([30, 20], false)));
  assert.throws(() => verifyCoverageTransforms(cwd, cwd), /Missing TypeScript source map/);
});
