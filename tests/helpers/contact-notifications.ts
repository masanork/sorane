import { build } from 'esbuild';
import { Response as MFResponse, type Request as MFRequest } from 'miniflare';

// Run the actual Worker/processor in workerd, replacing only the external
// delivery boundary. No email or outbound network is used by these fixtures.
export async function notificationWorkerFixture() {
  const messages: {from:unknown;to:unknown;subject:string;text:string;html:string}[]=[];
  let failure: string|null=null, onSend: (()=>Promise<void>)|undefined;
  const script=await build({stdin:{contents:`
    import pages from './pages-contact.ts';
    import {drainContactNotifications} from './contact-notifications.ts';
    const bound = env => ({...env,NOTIFY:{async send(message) {
      const response=await env.MAIL_CAPTURE.fetch('https://email.test/send',{method:'POST',body:JSON.stringify(message)});
      const value=await response.json();
      if(!response.ok) throw Object.assign(new Error('private recipient/provider detail'),{code:value.code});
      return value;
    }}});
    export default {
      async fetch(request,env,ctx) {
        if(new URL(request.url).pathname==='/__notification-test/drain')
          return Response.json(await drainContactNotifications(bound(env),env.CONTACT_SITE_ID));
        return pages.fetch(request,bound(env),ctx);
      },
      async scheduled(event,env,ctx) {return pages.scheduled(event,bound(env),ctx);}
    };`,resolveDir:new URL('../../packages/public-worker/src/',import.meta.url).pathname,sourcefile:'notification-fixture.ts'},
    bundle:true,write:false,format:'esm',platform:'node',target:'es2023'});
  return {script:script.outputFiles[0].text,messages,
    capture:async(request:MFRequest) => {
      const value=await request.json() as typeof messages[number];
      messages.push(value);
      if(onSend) {const action=onSend;onSend=undefined;await action();}
      return failure ? MFResponse.json({code:failure},{status:503}) : MFResponse.json({messageId:`fixture-${messages.length}`});
    },fail:(code:string|null)=>{failure=code;},onSend:(fn:()=>Promise<void>)=>{onSend=fn;}};
}
