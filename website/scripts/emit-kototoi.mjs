/**
 * kototoi 埋め込み資産を dist に配置する。
 * - JS/CSS: website/static/ または KOTOTOI_CLIENT_DIST（ローカル開発）
 * - kototoi-form.json: sorane.yaml の kototoi 節から生成
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(websiteRoot, 'dist');
const staticDir = join(websiteRoot, 'static');

function resolveClientDist() {
  const env = process.env.KOTOTOI_CLIENT_DIST?.trim();
  if (env && existsSync(join(env, 'kototoi-form.js'))) return env;
  const sibling = join(websiteRoot, '../../kototoi/packages/client/dist');
  if (existsSync(join(sibling, 'kototoi-form.js'))) return sibling;
  if (existsSync(join(staticDir, 'kototoi-form.js'))) return staticDir;
  throw new Error(
    'kototoi client not found — run npm run build:client in kototoi or copy assets to website/static/',
  );
}

function loadKototoiConfig() {
  const raw = yaml.load(readFileSync(join(websiteRoot, 'sorane.yaml'), 'utf8'));
  const kototoi = raw.kototoi;
  if (!kototoi?.endpoint || !kototoi?.site_id) {
    throw new Error('website/sorane.yaml: kototoi.endpoint and kototoi.site_id are required');
  }
  if (!kototoi.form) throw new Error('website/sorane.yaml: kototoi.form is required');
  return {
    endpoint: String(kototoi.endpoint).trim(),
    siteId: String(kototoi.site_id).trim(),
    form: kototoi.form,
  };
}

mkdirSync(distDir, { recursive: true });
const clientDist = resolveClientDist();
for (const name of ['kototoi-form.js', 'kototoi-form.css']) {
  copyFileSync(join(clientDist, name), join(distDir, name));
}

const config = loadKototoiConfig();
writeFileSync(join(distDir, 'kototoi-form.json'), `${JSON.stringify(config, null, 2)}\n`);
console.log('[sorane] kototoi assets → dist/');