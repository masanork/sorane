import { contactFixture, PUBLIC } from "../tests/helpers/contact-fixture.ts";
import { createServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Loopback-only Playwright bridge. This module is never bundled or deployed. */
export async function contactE2e(output, port) {
  const hooks = [];
  const adminPort=port+1;
  const adminOrigin=`https://localhost:${adminPort}`;
  const tls=mkdtempSync(join(tmpdir(),'sorane-e2e-tls-'));
  hooks.push(()=>rmSync(tls,{recursive:true,force:true}));
  // Ephemeral loopback TLS preserves __Host- cookie behavior and real browser
  // form redirects. No certificate or signing key is used outside this fixture.
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost',
    '-keyout',join(tls,'key.pem'),'-out',join(tls,'cert.pem')],{stdio:'ignore'});
  const f = await contactFixture({after:fn=>hooks.push(fn)},output,adminOrigin);
  const accounts = new Map();
  async function account(role) {
    if (!accounts.has(role)) accounts.set(role,await f.login(role));
    return accounts.get(role);
  }
  async function respond(res, response) {
    const headers = Object.fromEntries(response.headers);
    headers['set-cookie'] = response.headers.getSetCookie();
    res.writeHead(response.status,headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  }
  async function proxy(req,res,url,admin) {
    let size=0;const chunks=[];
    for await (const chunk of req) {
      size+=chunk.length;if(size>125000){res.writeHead(413);res.end();return;}chunks.push(chunk);
    }
    const headers={};
    for(const [key,value] of Object.entries(req.headers)) if(typeof value==='string' &&
      !['host','connection','content-length','accept-encoding'].includes(key)) headers[key]=value;
    if (!admin && headers.origin===`http://127.0.0.1:${port}`) headers.origin=PUBLIC;
    if (!admin) headers['cf-connecting-ip']='127.0.0.1';
    const method=req.method??'GET', init={method,headers,redirect:'manual',
      ...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})};
    const response=admin ? await f.request(url.pathname+url.search,init)
      : await f.publicWorker.fetch(PUBLIC+url.pathname+url.search,init);
    await respond(res,response);
  }
  const adminServer=createServer({key:readFileSync(join(tls,'key.pem')),cert:readFileSync(join(tls,'cert.pem'))},async(req,res)=>{
    try {await proxy(req,res,new URL(req.url??'/',adminOrigin),true);}
    catch {res.writeHead(500);res.end('test fixture failed');}
  });
  await new Promise((resolve,reject)=>{adminServer.once('error',reject);adminServer.listen(adminPort,'127.0.0.1',resolve);});
  return {
    async handle(req,res,url) {
      const auth = /^\/__contact-test\/login\/(owner|viewer)$/.exec(url.pathname);
      if (auth) {
        const session = await account(auth[1]);
        res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({cookie:session.cookie}));return true;
      }
      if (url.pathname==='/__contact-test/inbox') {
        return await respond(res,await (await account('owner')).get('/api/sites/native/inquiries')),true;
      }
      if (url.pathname==='/__contact-test/preview') {
        return await respond(res,await (await account('owner')).post(`/api/sites/native/proposals/${f.proposal}/preview`,{})),true;
      }
      if (!url.pathname.startsWith('/native/') && !url.pathname.startsWith('/preview/')) return false;
      await proxy(req,res,url,false);return true;
    },
    async close(){await new Promise(resolve=>adminServer.close(resolve));for(const hook of hooks.reverse()) await hook();},
  };
}
