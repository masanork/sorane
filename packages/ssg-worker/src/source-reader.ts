import { WorkerEntrypoint } from 'cloudflare:workers';
import { readSource, sha256 } from './artifacts.ts';
import { configuration } from './build.ts';
import { applyDraft } from './draft.ts';
import { contentDraft, draftDigest } from './draft-input.ts';
import type { ContentWorkspace } from './content-workspace.ts';

/** A read-only, private service capability; the default public fetch remains 404. */
export class ContentSource extends WorkerEntrypoint<SoraneBuildEnv> {
  async fetch(request:Request):Promise<Response> {
    if(request.method!=='GET') return new Response(null,{status:405});
    const url=new URL(request.url), siteId=url.searchParams.get('site'), proposalId=url.searchParams.get('proposal');
    if(!siteId || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(siteId) || !proposalId ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(proposalId)) return new Response(null,{status:400});
    const row=await this.env.DB.withSession('first-primary').prepare(`SELECT p.created_at,p.commit_id,p.expected_repository_id,p.draft_digest,
      s.artifact_namespace,s.artifact_repository,d.payload,d.digest FROM proposal p JOIN site s ON s.id=p.site_id
      LEFT JOIN proposal_draft d ON d.proposal_id=p.id WHERE p.id=? AND p.site_id=?`).bind(proposalId,siteId)
      .first<{created_at:number;commit_id:string;expected_repository_id:string|null;draft_digest:string|null;artifact_namespace:string;artifact_repository:string;payload:string|null;digest:string|null}>();
    if(!row) return new Response(null,{status:404});
    if(row.artifact_namespace!==this.env.ARTIFACTS_NAMESPACE) return new Response(null,{status:503});
    try {
      const base=await readSource(this.env.ARTIFACTS,row.artifact_repository,row.commit_id,row.expected_repository_id);
      const contentDir=configuration(base,`${this.env.PUBLIC_ORIGIN}/${siteId}/`).build.content_dir;
      if(row.draft_digest!==row.digest) throw new Error('draft_digest_mismatch');
      const draft=row.payload===null?undefined:contentDraft(JSON.parse(row.payload));
      if(draft && await draftDigest(draft)!==row.digest) throw new Error('draft_digest_mismatch');
      const source=draft?applyDraft(base,draft,contentDir):base;
      const originals=new Map(base.files.map(file=>[file.path,file.bytes]));
      const value:ContentWorkspace={proposalId,createdAt:row.created_at,commit:row.commit_id,repositoryId:source.repositoryId,contentDir,
        changes:draft?.changes??[],articles:source.files.filter(file=>file.path.startsWith(contentDir+'/') && file.path.endsWith('.md'))
          .map(file=>({path:file.path,before:originals.has(file.path)?sha256(originals.get(file.path)!):null,
            text:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(file.bytes)}))};
      return Response.json(value,{headers:{'Cache-Control':'no-store'}});
    } catch { return Response.json({error:'content_source_unavailable'},{status:503}); }
  }
}
