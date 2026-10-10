export interface PushSource {
  site:string; repository:string; repositoryId:string; ref:string;
  accountId:string; subscriptionId:string; enabledAt:number;
}
const record=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
const ID=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;
export function pushSources(value:string):PushSource[] {
  if(value.length>16384)throw new Error('invalid_push_configuration');
  const parsed:unknown=JSON.parse(value);
  if(!Array.isArray(parsed)||parsed.length>10)throw new Error('invalid_push_configuration');
  const seen=new Set<string>();
  const routes=new Set<string>();
  return parsed.map((item:unknown)=>{
    const v=record(item);
    if(!v || Object.keys(v).sort().join(',')!=='accountId,enabledAt,ref,repository,repositoryId,site,subscriptionId' ||
      typeof v.site!=='string'||!ID.test(v.site)||typeof v.repository!=='string'||!ID.test(v.repository)||
      typeof v.repositoryId!=='string'||!ID.test(v.repositoryId)||typeof v.accountId!=='string'||!/^[0-9a-f]{32}$/.test(v.accountId)||
      typeof v.subscriptionId!=='string'||!/^[0-9a-f]{32}$/.test(v.subscriptionId)||typeof v.ref!=='string'||
      !/^refs\/heads\/[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(v.ref)||v.ref.includes('..')||v.ref.includes('//')||v.ref.endsWith('/')||
      typeof v.enabledAt!=='number'||!Number.isSafeInteger(v.enabledAt)||v.enabledAt<1||seen.has(v.site))throw new Error('invalid_push_configuration');
    const route=JSON.stringify([v.repository,v.ref,v.accountId,v.subscriptionId]);
    if(routes.has(route))throw new Error('ambiguous_push_configuration');
    routes.add(route);seen.add(v.site);
    return {site:v.site,repository:v.repository,repositoryId:v.repositoryId,ref:v.ref,accountId:v.accountId,subscriptionId:v.subscriptionId,enabledAt:v.enabledAt};
  });
}
