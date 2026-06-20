export { describe, test, it, before, after, beforeEach, afterEach } from "node:test";

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = (o: Record<string, unknown>) => Object.keys(o).filter((k) => o[k] !== undefined);
  const ak = keys(ao);
  const bk = keys(bo);
  return ak.length === bk.length && ak.every((k) => deepEqual(ao[k], bo[k]));
}

function fail(msg: string): never {
  throw new Error(msg);
}

interface Matchers {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toContain(expected: unknown): void;
  toMatch(expected: RegExp | string): void;
}

function makeMatchers(actual: unknown, neg: boolean): Matchers {
  const check = (pass: boolean, ko: string): void => {
    if (neg ? !pass : pass) return;
    fail(ko);
  };
  return {
    toBe(expected) {
      check(Object.is(actual, expected), `expected ${expected}, got ${actual}`);
    },
    toEqual(expected) {
      check(deepEqual(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toContain(expected) {
      if (typeof actual === "string") check(actual.includes(String(expected)), `missing ${expected}`);
      else if (Array.isArray(actual)) check(actual.some((v) => v === expected), `missing ${expected}`);
      else fail("toContain requires string or array");
    },
    toMatch(expected) {
      const s = String(actual);
      check(expected instanceof RegExp ? expected.test(s) : s.includes(expected), `no match ${expected}`);
    },
  };
}

export function expect(actual: unknown): Matchers & { not: Matchers } {
  const m = makeMatchers(actual, false) as Matchers & { not: Matchers };
  m.not = makeMatchers(actual, true);
  return m;
}