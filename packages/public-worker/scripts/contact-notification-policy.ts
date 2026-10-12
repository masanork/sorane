import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

interface PolicyInput {site:string;from:string;to:string;adminOrigin:string;enabled?:boolean;ownerSub?:string}
const quote = (value:string) => `'${value.replaceAll("'","''")}'`;
/** Operator-only SQL; destination and owner identity must not enter Git/CI. */
export function notificationPolicySql(value: PolicyInput): string {
  const origin = new URL(value.adminOrigin);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(value.site) || origin.protocol!=='https:' || origin.origin!==value.adminOrigin ||
    [value.from,value.to].some(email=>typeof email!=='string' || email.length>254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) ||
    (value.enabled!==undefined && typeof value.enabled!=='boolean') ||
    (value.ownerSub!==undefined && (typeof value.ownerSub!=='string' || !value.ownerSub || value.ownerSub.length>512))) throw new Error('invalid_notification_policy');
  const site=quote(value.site), policy=quote(randomUUID());
  const owner=value.ownerSub ? ` AND sub=${quote(value.ownerSub)}` : '';
  return `INSERT INTO contact_notification_policy(site_id,policy_id,owner_sub,from_email,to_email,admin_origin,enabled,updated_at)
VALUES(${site},${policy},(SELECT sub FROM site_member WHERE site_id=${site} AND role='owner'${owner}
AND (SELECT COUNT(*) FROM site_member WHERE site_id=${site} AND role='owner'${owner})=1),
${quote(value.from)},${quote(value.to)},${quote(value.adminOrigin)},${value.enabled===false?0:1},${Math.floor(Date.now()/1000)})
ON CONFLICT(site_id) DO UPDATE SET policy_id=excluded.policy_id,owner_sub=excluded.owner_sub,
from_email=excluded.from_email,to_email=excluded.to_email,admin_origin=excluded.admin_origin,
enabled=excluded.enabled,updated_at=excluded.updated_at;\n`;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  try {
    const chunks:Buffer[]=[];let size=0;
    for await(const chunk of process.stdin) {size+=chunk.length;if(size>8192)throw new Error();chunks.push(chunk);}
    process.stdout.write(notificationPolicySql(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
  } catch {process.stderr.write('Unable to generate notification policy; check the private input.\n');process.exitCode=1;}
}
