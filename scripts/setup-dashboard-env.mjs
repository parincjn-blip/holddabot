// Run only on the approved bot host. Secrets never leave this host or appear in output.
import {readFile,writeFile,chmod} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {config} from '../dist/config.js';
const path=new URL('../.dashboard.env',import.meta.url);
let text='';try{text=await readFile(path,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
const has=key=>new RegExp('^'+key+'=','m').test(text);
const lines=[];
if(!has('DASHBOARD_PUBLIC_URL'))lines.push('DASHBOARD_PUBLIC_URL=https://bot.hold-bet.com');
if(!has('DASHBOARD_PORT'))lines.push('DASHBOARD_PORT=8787');
if(!has('DASHBOARD_SESSION_SECRET'))lines.push('DASHBOARD_SESSION_SECRET='+randomBytes(32).toString('hex'));
if(!has('DISCORD_CLIENT_ID')){
  const response=await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bot '+config.token},signal:AbortSignal.timeout(10_000)});
  if(!response.ok)throw new Error('Cannot verify application ID');
  const user=await response.json();if(!/^\d{17,20}$/.test(user.id))throw new Error('Invalid application ID');
  lines.push('DISCORD_CLIENT_ID='+user.id);
}
if(!has('DISCORD_CLIENT_SECRET'))lines.push('DISCORD_CLIENT_SECRET=');
if(lines.length)await writeFile(path,text+(text&&!text.endsWith('\n')?'\n':'')+lines.join('\n')+'\n',{mode:0o600});
await chmod(path,0o600);
console.log('Dashboard environment prepared on host; existing values preserved; OAuth secret must be configured by application owner.');
