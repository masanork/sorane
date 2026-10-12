import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

async function moduleAt(name:string) {
  const result=await build({entryPoints:[new URL(`../packages/admin-worker/src/${name}.ts`,import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'browser',target:'es2023'});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const [{SCRIPT},{articleBody}]=await Promise.all([moduleAt('ui'),moduleAt('editor')]) as [{SCRIPT:string},{articleBody:(body:string,title:string)=>{body:string;heading:{prefix:string;suffix:string}|null}}];

test('the editor detaches only an exact leading title and retains the original separators',()=>{
  for(const body of ['# 記事のタイトル\n\n本文です。\n','\n#  記事のタイトル  \r\n\r\n本文です。\r\n','# 記事のタイトル']) {
    const content=articleBody(body,'記事のタイトル');
    assert.ok(content.heading);
    assert.equal(content.heading.prefix+'記事のタイトル'+content.heading.suffix+content.body,body);
    assert.doesNotMatch(content.body,/記事のタイトル/);
  }
  for(const body of ['# 別の見出し\n\n本文です。','本文です。\n\n# 記事のタイトル','```md\n# 記事のタイトル\n```','## 記事のタイトル','記事のタイトル\n===']) {
    const content=articleBody(body,'記事のタイトル');
    assert.equal(content.heading,null);
    assert.equal(content.body,body);
  }
});

type Event = {preventDefault:()=>void;returnValue?:string;metaKey?:boolean;ctrlKey?:boolean;key?:string};
type Listener = (event:Event)=>unknown;
class Target {
  listeners=new Map<string,Listener[]>();
  addEventListener(type:string,listener:Listener){this.listeners.set(type,[...(this.listeners.get(type)??[]),listener]);}
  async dispatch(type:string,event:Event={preventDefault(){}}){for(const listener of this.listeners.get(type)??[])await listener(event);}
}
class Field extends Target {
  value:string;readOnly=false;disabled=false;dataset:Record<string,string>={};selectionStart=0;selectionEnd=0;
  constructor(value=''){super();this.value=value;}
  focus(){}
  setRangeText(value:string,start:number,end:number){this.value=this.value.slice(0,start)+value+this.value.slice(end);this.selectionStart=start;this.selectionEnd=start+value.length;}
}
function editorFixture(options:{title?:string;body?:string;heading?:{prefix:string;suffix:string}|null;viewer?:boolean}={}) {
  const title=new Field(options.title??'記事のタイトル'),body=new Field(options.body??'本文です。\n');
  if(options.heading)body.dataset.titleHeading=JSON.stringify(options.heading);
  const state={textContent:options.viewer?'閲覧のみ':'保存済み'},status={textContent:''},counter={textContent:''};
  const button=options.viewer?null:new Field();
  const tool=new Field();tool.dataset.insert='bold';
  const attributes=new Map<string,string>(),editor=new Target(),document=new Target(),window=new Target();
  const elements:Record<string,Field>={title,body,revision:new Field('6'),csrf:new Field('csrf-token'),operationId:new Field('operation'),proposalId:new Field('source-proposal'),path:new Field('content/article.md')};
  const queries:Record<string,unknown>={'[data-editor-status]':status,'[data-save-state]':state,'[data-counter]':counter,'[type=submit]':button};
  const form=Object.assign(editor,{elements,action:'https://admin.example/api/sites/demo/editor',dataset:{review:'/sites/demo?view=review'},
    querySelector:(selector:string)=>queries[selector]??null,querySelectorAll:()=>options.viewer?[]:[tool],
    reportValidity:()=>!!title.value,setAttribute:(name:string,value:string)=>attributes.set(name,value),
    requestSubmit:()=>editor.dispatch('submit')});
  const page=Object.assign(document,{querySelector:(selector:string)=>selector==='[data-editor]'?form:null,querySelectorAll:()=>[]});
  const requests:{url:string;headers:Record<string,string>;value:Record<string,unknown>}[]=[],destinations:string[]=[];
  let resolve!:(response:unknown)=>void;
  runInNewContext(SCRIPT,{document:page,window,location:{assign:(url:string)=>destinations.push(url)},
    FormData:class { form:{elements:Record<string,Field>};constructor(form:{elements:Record<string,Field>}){this.form=form;} *[Symbol.iterator](){for(const [key,field] of Object.entries(this.form.elements))yield [key,field.value];} },
    fetch:(url:string,options:{headers:Record<string,string>;body:string})=>{requests.push({url,headers:options.headers,value:JSON.parse(options.body)});return new Promise(done=>{resolve=done;});}});
  return {form,document,window,title,body,button,tool,state,status,counter,attributes,requests,destinations,
    reply:(status:number,value:unknown)=>resolve({ok:status>=200&&status<300,status,json:async()=>value})};
}

test('save state follows the actual text, including reverting edits and no-op keyboard saves',async()=>{
  const f=editorFixture();
  assert.equal(f.button!.disabled,true);
  assert.equal(f.state.textContent,'保存済み');
  f.body.value+='追記';await f.form.dispatch('input');
  assert.equal(f.button!.disabled,false);
  assert.equal(f.state.textContent,'未保存の変更');
  let warned=false;await f.window.dispatch('beforeunload',{preventDefault(){warned=true;}});assert.equal(warned,true);
  f.body.value='本文です。\n';await f.form.dispatch('input');
  assert.equal(f.button!.disabled,true);
  warned=false;await f.window.dispatch('beforeunload',{preventDefault(){warned=true;}});assert.equal(warned,false);
  await f.document.dispatch('keydown',{metaKey:true,key:'s',preventDefault(){}});
  assert.equal(f.requests.length,0);
  assert.equal(f.status.textContent,'変更はありません。');
});

test('changing a title updates the retained Markdown heading and locks the form until saving finishes',async()=>{
  const f=editorFixture({heading:{prefix:'\n#  ',suffix:'  \r\n\r\n'}});
  f.title.value='新しいタイトル';await f.form.dispatch('input');
  const saving=f.form.dispatch('submit');
  assert.equal(f.state.textContent,'保存しています…');
  assert.equal(f.title.readOnly,true);assert.equal(f.body.readOnly,true);assert.equal(f.tool.disabled,true);
  assert.equal(f.requests[0].value.body,'\n#  新しいタイトル  \r\n\r\n本文です。\n');
  assert.equal(f.requests[0].value.title,'新しいタイトル');
  assert.equal(f.requests[0].value.revision,6);assert.equal('csrf' in f.requests[0].value,false);
  assert.equal(f.requests[0].headers['X-CSRF-Token'],'csrf-token');
  await f.form.dispatch('submit');assert.equal(f.requests.length,1,'a second click or shortcut cannot submit again while saving');
  f.reply(201,{proposal_id:'saved-proposal'});await saving;
  assert.deepEqual(f.destinations,['/sites/demo?view=review#proposal-saved-proposal']);
  let warned=false;await f.window.dispatch('beforeunload',{preventDefault(){warned=true;}});assert.equal(warned,false);
});

test('a title-only manuscript gets a paragraph separator when a body is added',async()=>{
  const f=editorFixture({body:'',heading:{prefix:'# ',suffix:''}});
  f.body.value='最初の段落';await f.form.dispatch('input');
  const saving=f.form.dispatch('submit');
  assert.equal(f.requests[0].value.body,'# 記事のタイトル\n\n最初の段落');
  f.reply(201,{proposal_id:'saved'});await saving;
});

test('a save conflict retains the text, explains recovery and restores editing',async()=>{
  const f=editorFixture();
  f.body.value='消えてはいけない原稿';await f.form.dispatch('input');
  const saving=f.form.dispatch('submit');f.reply(409,{error:'site_or_authority_changed'});await saving;
  assert.equal(f.body.value,'消えてはいけない原稿');
  assert.match(f.status.textContent,/入力をコピーしてから画面を更新/);
  assert.equal(f.title.readOnly,false);assert.equal(f.body.readOnly,false);assert.equal(f.tool.disabled,false);assert.equal(f.button!.disabled,false);
  assert.equal(f.state.textContent,'保存できませんでした');assert.equal(f.destinations.length,0);
  let warned=false;await f.window.dispatch('beforeunload',{preventDefault(){warned=true;}});assert.equal(warned,true);
});

test('read-only viewers receive no save shortcut or submit handler',async()=>{
  const f=editorFixture({viewer:true});
  assert.equal(f.state.textContent,'閲覧のみ');
  assert.equal(f.counter.textContent,'6 文字');
  assert.equal(f.document.listeners.has('keydown'),false);
  assert.equal(f.form.listeners.has('submit'),false);
  assert.equal(f.window.listeners.has('beforeunload'),false);
});
