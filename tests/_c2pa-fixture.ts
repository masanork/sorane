import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures/c2pa");

export const C2PA_TEST_CERT = join(FIXTURE_DIR, "es256_certs.pem");
export const C2PA_TEST_KEY = join(FIXTURE_DIR, "es256_private.key");