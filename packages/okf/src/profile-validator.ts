import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_PROFILE_RE } from "./profile.ts";

const validators = new Map<string, ReturnType<Ajv["compile"]>>();

export function profileSchemaPath(profile: string): string {
  const match = profile.match(SUPPORTED_PROFILE_RE);
  if (!match) throw new Error(`unsupported profile: ${profile}`);
  return join(dirname(fileURLToPath(import.meta.url)), "../profile", `sorane-okf-${match[1]}.schema.json`);
}

export function getProfileValidator(profile: string): ReturnType<Ajv["compile"]> {
  const path = profileSchemaPath(profile);
  let validator = validators.get(path);
  if (!validator) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    validator = ajv.compile(JSON.parse(readFileSync(path, "utf8")));
    validators.set(path, validator);
  }
  return validator;
}
