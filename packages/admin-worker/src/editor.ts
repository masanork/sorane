import { extract } from '../../okf/src/extract.ts';
import { parseYaml, dumpYaml } from '../../okf/src/yaml.ts';
import { fail, escape, formCsrf } from '../vendor/mikaki/oidc.ts';
import { contentDraft, type ContentChange } from '../../ssg-worker/src/draft-input.ts';
import type { ContentWorkspace } from '../../ssg-worker/src/content-workspace.ts';
import { icon } from './ui.ts';
import type { Site } from './store.ts';

export async function workspace(env:SoraneAdminEnv,siteId:string,proposalId:string):Promise<ContentWorkspace> {
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(proposalId)) fail(404,'proposal_not_found');
  if(!env.CONTENT_SOURCE) fail(503,'source_unavailable');
  const response=await env.CONTENT_SOURCE.fetch(`https://content.internal/?${new URLSearchParams({site:siteId,proposal:proposalId})}`);
  if(response.status===404) fail(404,'proposal_not_found');
  if(!response.ok) fail(503,'source_unavailable');
  // The private producer independently enforces the source's 4 MiB bound.
  return await response.json() as ContentWorkspace;
}
export function article(text:string) {
  const parts=extract(text);
  let metadata:unknown;
  try{metadata=parts.frontmatter===null?{}:parseYaml(parts.frontmatter);}catch{fail(422,'invalid_editor_content');}
  if(!metadata || typeof metadata!=='object' || Array.isArray(metadata)) fail(422,'invalid_editor_content');
  const values=metadata as Record<string,unknown>;
  return {metadata:values,body:parts.body.replace(/^\r?\n/,''),title:typeof values.title==='string'?values.title:'無題の原稿',type:values.type==='index'?'トップページ':'記事'};
}
export async function editorDraft(source:ContentWorkspace,value:Record<string,unknown>) {
  if(typeof value.path!=='string' || typeof value.title!=='string' || !value.title.trim() || value.title.length>300 ||
    typeof value.body!=='string' || /[\x00-\x1f\x7f]/.test(value.title) ||
    typeof value.operationId!=='string') fail(400,'invalid_editor_content');
  if(value.timestamp!==undefined && (typeof value.timestamp!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.timestamp) || !Number.isFinite(Date.parse(value.timestamp)))) fail(400,'invalid_editor_content');
  const existing=source.articles.find(file=>file.path===value.path);
  if(value.path && !existing) fail(404,'article_not_found');
  const path=existing?.path??`${source.contentDir}/article-${value.operationId.slice(0,8)}.md`;
  const metadata=existing?article(existing.text).metadata:{type:'article',timestamp:value.timestamp??new Date(source.createdAt*1000).toISOString(),profile:'sorane-okf/0.1'};
  const title=value.title.trim();
  // Keep all existing OKF fields; only title and body are edited here.
  const text=`---\n${dumpYaml({...metadata,title}).trimEnd()}\n---\n\n${value.body}`;
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  const changes=new Map<string,ContentChange>(source.changes.map(change=>[change.path,change]));
  if(existing && article(existing.text).title===title && article(existing.text).body===value.body) fail(400,'no_content_changes');
  if(digest===existing?.before) changes.delete(path);
  else changes.set(path,{path,before:existing?.before??null,text});
  if(!changes.size) fail(400,'no_content_changes');
  try{return {draft:contentDraft({schema:1,repository:source.repositoryId,changes:[...changes.values()]}),message:`${title}を${existing?'更新':'作成'}`};}
  catch{fail(400,'invalid_editor_content');}
}
export function articleList(site:Site,source:ContentWorkspace|null,editable:boolean) {
  const route=`/sites/${site.id}`;
  const query=source?new URLSearchParams({proposal:source.proposalId}):null;
  return `<div class="heading-row"><div><p class="eyebrow">CONTENT</p><h1>記事</h1><p>言葉を整えて、サイトを育てましょう。</p></div>${editable&&source?`<a class="button" href="${route}/editor?${query}">${icon('plus')}新しい記事</a>`:''}</div>${source?.changes.length?`<div class="info-strip">${icon('articles')}<span>保存した原稿の変更を表示しています。</span><a href="${route}?view=review">確認・公開へ →</a></div>`:''}<div class="surface"><div class="surface-head"><h2>すべての原稿 <small>${source?.articles.length??0}</small></h2><label class="search-box"><span class="sr-only">記事を検索</span>${icon('search')}<input type="search" placeholder="記事を検索…" data-search></label></div>${source?.articles.length?`<table><thead><tr><th>タイトル</th><th class="type-label">種類</th><th>原稿の状態</th></tr></thead><tbody>${source.articles.map(file=>{const item=article(file.text),changed=source.changes.some(change=>change.path===file.path);const href=`${route}/editor?${new URLSearchParams({proposal:source.proposalId,path:file.path})}`;return `<tr class="article-row" data-article="${escape(item.title)}"><td><a class="article-title" href="${href}"><span class="article-icon">${icon('articles')}</span><span>${escape(item.title)}<span class="article-excerpt">${escape(item.body.replace(/[#*\[\]`]/g,'').replace(/\s+/g,' ').slice(0,110))}</span></span></a></td><td class="type-label">${item.type}</td><td><span class="pill ${changed?'pending':'neutral'}">${changed?'変更あり':'保存済み'}</span></td></tr>`;}).join('')}</tbody></table><div class="empty" data-no-results hidden>該当する原稿がありません。</div>`:`<div class="empty"><h2>原稿がまだありません</h2><p>${source?'最初の記事を書いてみましょう。':'原稿の取り込み後、ここから編集できます。'}</p></div>`}</div><p class="muted">${editable?'記事を選ぶと、タイトルと本文を編集できます。':'記事を選ぶと、保存された原稿を読めます。'}</p>`;
}
export function editorPage(site:Site,source:ContentWorkspace,path:string|null,token:string,operationId:string,editable:boolean) {
  const file=path?source.articles.find(file=>file.path===path):null;
  if(path&&!file) fail(404,'article_not_found');
  const item=file?article(file.text):{title:'',body:'',type:'記事'};
  if(!editable&&!file) fail(403,'permission_denied');
  const route=`/sites/${site.id}`;
  return `<a class="back-link" href="${route}">${icon('arrow')}記事一覧に戻る</a><div class="heading-row"><div><h1>${file?'原稿を編集':'新しい記事'}</h1><p>書いた内容は、プレビューで確認してから公開できます。</p></div><span class="pill neutral">${item.type}</span></div><div class="steps"><span><b>1</b>原稿を書く</span><i></i><span><b>2</b>プレビューで確認</span><i></i><span><b>3</b>公開する</span></div><form method="post" action="/api/sites/${site.id}/editor" data-editor data-review="${route}?view=review">${formCsrf(token)}<input type="hidden" name="timestamp" value="${new Date().toISOString()}"><input type="hidden" name="operationId" value="${operationId}"><input type="hidden" name="revision" value="${site.revision}"><input type="hidden" name="proposalId" value="${source.proposalId}"><input type="hidden" name="path" value="${escape(file?.path??'')}"><div class="editor-layout"><div class="editor-paper"><label class="editor-title-label">タイトル<input class="editor-title" name="title" aria-label="タイトル" placeholder="記事のタイトル" value="${escape(item.title)}" required maxlength="300"${editable?'':' readonly'}></label><div class="editor-toolbar" role="toolbar" aria-label="本文の書式">${editable?`<button type="button" data-insert="heading" title="見出しを挿入" aria-label="見出しを挿入">H2</button><button type="button" data-insert="bold" title="太字を挿入" aria-label="太字を挿入"><b>B</b></button><button type="button" data-insert="list" title="箇条書きを挿入" aria-label="箇条書きを挿入">☷</button><button type="button" data-insert="link" title="リンクを挿入" aria-label="リンクを挿入">↗</button>`:''}<small>Markdownで書けます</small></div><label class="editor-body-label" for="article-body">本文</label><textarea class="editor-body" id="article-body" name="body" aria-label="本文" placeholder="ここから、あなたの言葉で。" maxlength="65000"${editable?'':' readonly'}>${escape(item.body)}</textarea><div class="editor-bottom"><span data-save-state>${editable?'変更を保存するとプレビューを準備します':'閲覧のみ'}</span><span data-counter></span></div></div><aside class="editor-aside"><h2>公開までの流れ</h2><p>まずは原稿を保存。<br>できあがりをプレビューで確認したら、公開を選びます。</p><div class="rule"></div><div class="save-group">${editable?`<button class="editor-submit" type="submit">保存してプレビューを準備</button><p class="muted">保存した内容は「確認・公開」に追加されます。</p>`:'<p>編集には編集者の権限が必要です。</p>'}<p class="status-message" data-editor-status role="status" aria-live="polite"></p><noscript><p>原稿の保存にはJavaScriptを有効にしてください。</p></noscript></div></aside></div></form>`;
}
