import { safePath } from './source-limits.ts';
export type ContentChange = {path:string; before:string|null; text:string|null};
export type ContentDraft = {schema:1; repository:string; changes:ContentChange[]};
export const MAX_DRAFT_REQUEST = 196608;
const SHA256 = /^[0-9a-f]{64}$/;
const bytes = (text:string) => new TextEncoder().encode(text);
const object = (value:unknown): value is Record<string,unknown> => !!value && typeof value==='object' && !Array.isArray(value);
function exact(value:Record<string,unknown>, keys:string[]) {
  if (Object.keys(value).length!==keys.length || Object.keys(value).some(key=>!keys.includes(key))) throw new Error('invalid_content_draft');
}

/** Closed data format, shared by admission and the builder. No authority claims. */
export function contentDraft(value:unknown): ContentDraft {
  if (!object(value)) throw new Error('invalid_content_draft');
  exact(value,['schema','repository','changes']);
  if (value.schema!==1 || typeof value.repository!=='string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.repository) ||
    !Array.isArray(value.changes) || !value.changes.length || value.changes.length>16) throw new Error('invalid_content_draft');
  let size=0;
  const paths=new Set<string>();
  const changes=value.changes.map((change):ContentChange=>{
    if (!object(change)) throw new Error('invalid_content_draft');
    exact(change,['path','before','text']);
    if (typeof change.path!=='string' || !safePath(change.path) || !change.path.endsWith('.md') || paths.has(change.path) ||
      !(change.before===null || typeof change.before==='string' && SHA256.test(change.before)) ||
      !(change.text===null || typeof change.text==='string') || change.before===null && change.text===null)
      throw new Error('invalid_content_draft');
    paths.add(change.path);
    if (change.text!==null) {
      const encoded=bytes(change.text);
      // Reject NUL and unpaired surrogates instead of silently replacing input.
      if (change.text.includes('\0') || new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(encoded)!==change.text || encoded.length>65536)
        throw new Error('invalid_content_draft');
      size+=encoded.length;
    }
    if (size>131072) throw new Error('invalid_content_draft');
    return {path:change.path,before:change.before,text:change.text};
  }).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  return {schema:1,repository:value.repository,changes};
}
export async function draftDigest(draft:ContentDraft): Promise<string> {
  const hash=await crypto.subtle.digest('SHA-256',bytes(JSON.stringify(draft)));
  return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}
