import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const contactHtml = join(websiteRoot, 'dist', 'contact.html');

if (!existsSync(contactHtml)) {
  console.warn('[sorane] contact.html not found — skip kototoi patch');
  process.exit(0);
}

const MARKER = '<!-- kototoi-form -->';
const embed = [
  '<div id="kototoi-form" class="kototoi-form" data-kototoi-auto></div>',
].join('\n');

const headInject = [
  '<link rel="stylesheet" href="./kototoi-form.css">',
].join('\n');

const bodyInject = [
  '<script src="./kototoi-form.js" defer></script>',
].join('\n');

let html = readFileSync(contactHtml, 'utf8');
if (html.includes(MARKER)) {
  html = html.replace(MARKER, embed);
} else if (!html.includes('id="kototoi-form"')) {
  html = html.replace('</main>', `${embed}\n</main>`);
}

if (!html.includes('kototoi-form.css')) {
  html = html.replace('</head>', `${headInject}\n</head>`);
}
if (!html.includes('kototoi-form.js')) {
  html = html.replace('</body>', `${bodyInject}\n</body>`);
}

writeFileSync(contactHtml, html);
console.log('[sorane] patched contact.html for kototoi');