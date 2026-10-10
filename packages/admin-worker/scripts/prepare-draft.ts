import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import { contentDraft, MAX_DRAFT_REQUEST } from '../../ssg-worker/src/draft-input.ts';
import { safePath } from '../../ssg-worker/src/source-limits.ts';

// Read selected local files only. No network, tokens, repository writes or model.
const {values}=parseArgs({options:{cwd:{type:'string'},base:{type:'string'},'repository-id':{type:'string'},revision:{type:'string'},
  message:{type:'string'},path:{type:'string',multiple:true},out:{type:'string'}}});
const root=realpathSync(values.cwd??process.cwd()), base=values.base, revision=Number(values.revision);
if (!base || !/^[0-9a-f]{40}$/.test(base) || !Number.isSafeInteger(revision) || revision<1 || revision>=Number.MAX_SAFE_INTEGER ||
  !values.message?.trim() || values.message.length>1000 || !values.path?.length || values.path.length>16 || new Set(values.path).size!==values.path.length)
  throw new Error('Use --base SHA1 --repository-id ID --revision N --message TEXT --path FILE (up to 16)');
const git=(args:string[])=>execFileSync('git',['-c','core.fsmonitor=false','-C',root,...args],{
  maxBuffer:266240,env:{...process.env,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}});
if (realpathSync(git(['rev-parse','--show-toplevel']).toString().trim())!==root) throw new Error('Use the Git repository root');
if (git(['cat-file','-t',base]).toString().trim()!=='commit') throw new Error('The base must identify a commit');
const changes=values.path.flatMap(path=>{
  if (!safePath(path) || !path.endsWith('.md')) throw new Error('Select safe Markdown paths');
  const entry=git(['ls-tree','-z',base,'--',`:(literal)${path}`]).toString();
  const match=/^100644 blob ([0-9a-f]{40})\t([^\0]+)\0$/.exec(entry);
  if (entry && (!match || match[2]!==path)) throw new Error('The base file must be ordinary Markdown');
  const before=match?createHash('sha256').update(git(['cat-file','blob',match[1]])).digest('hex'):null;
  let text:string|null=null;
  try {
    let parent=root;
    for (const part of path.split('/')) {
      parent=join(parent,part);
      if (lstatSync(parent).isSymbolicLink()) throw new Error('Selected files must not traverse symlinks');
    }
    const file=join(root,path),info=lstatSync(file);
    if (!info.isFile() || info.size>65536) throw new Error('Selected files must be regular files up to 64 KiB');
    text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(readFileSync(file));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code==='ENOENT')) throw error;
  }
  if ((text===null?null:createHash('sha256').update(text).digest('hex'))===before) return [];
  return [{path,before,text}];
});
const draft=contentDraft({schema:1,repository:values['repository-id'],changes});
const payload=JSON.stringify({operationId:randomUUID(),revision,commit:base,message:values.message.trim(),repositoryId:draft.repository,changes:draft.changes},null,2)+'\n';
if (Buffer.byteLength(payload)>MAX_DRAFT_REQUEST) throw new Error('Encoded draft exceeds the request limit');
if (values.out) writeFileSync(resolve(values.out),payload,{mode:0o600,flag:'wx'});
else process.stdout.write(payload);
