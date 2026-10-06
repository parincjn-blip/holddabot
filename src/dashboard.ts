import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { config } from './config.js';
import { templateDefinitions, variableNames, variablesByTemplate, isTemplateKey, validateTemplate } from './message-templates.js';
import { saveMessageTemplate } from './template-store.js';
import { randomToken, hashToken, encryptToken, decryptToken, equalTokens, canManageGuild, allowedMutation } from './dashboard-security.js';
import { rankCardCatalog, createRankUpCardMessage } from './rank-up-card.js';
import { AttachmentBuilder } from 'discord.js';

type Guild = {id:string;name:string;icon:string|null;owner?:boolean;permissions?:string};
class HttpError extends Error { constructor(public status:number,message:string) {super(message);} }
const publicUrl=process.env.DASHBOARD_PUBLIC_URL ?? 'https://bot.hold-bet.com';
const origin=new URL(publicUrl).origin;
if (origin!==publicUrl || !publicUrl.startsWith('https://')) throw new Error('DASHBOARD_PUBLIC_URL must be an HTTPS origin without trailing slash');
const clientId=process.env.DISCORD_CLIENT_ID ?? '';
const clientSecret=process.env.DISCORD_CLIENT_SECRET ?? '';
const sessionSecret=process.env.DASHBOARD_SESSION_SECRET ?? '';
const ready=!!clientId && !!clientSecret && /^[a-f0-9]{64}$/i.test(sessionSecret);
const redirectUri=origin+'/auth/discord/callback';
function cookie(req:IncomingMessage,key:string) { return (req.headers.cookie ?? '').split(';').map(c=>c.trim()).find(c=>c.startsWith(key+'='))?.slice(key.length+1) ?? ''; }
function setCookie(res:ServerResponse,key:string,value:string,seconds:number) {res.setHeader('Set-Cookie',`${key}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`);}
function json(res:ServerResponse,status:number,value:unknown) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
async function body(req:IncomingMessage):Promise<Record<string,unknown>> {
  let size=0;const chunks:Buffer[]=[];
  for await(const chunk of req) {size+=chunk.length;if(size>16_384) throw new HttpError(413,'ข้อมูลยาวเกินไป');chunks.push(chunk);}
  try {const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value || typeof value!=='object' || Array.isArray(value)) throw Error();return value;} catch {throw new HttpError(400,'JSON ไม่ถูกต้อง');}
}
async function discord<T>(path:string,authorization:string):Promise<T> {
  const response=await fetch('https://discord.com/api/v10'+path,{headers:{Authorization:authorization},signal:AbortSignal.timeout(10_000)});
  if(response.status===401 || response.status===403) throw new HttpError(401,'กรุณาเข้าสู่ระบบใหม่ หรือตรวจสอบสิทธิ์ Discord');
  if(!response.ok) throw new HttpError(503,'Discord ยังไม่พร้อมให้บริการ กรุณาลองใหม่');
  return await response.json() as T;
}
async function managedGuilds(accessToken:string):Promise<Guild[]> {
  const all:Guild[]=[];let after='0';
  // Discord returns at most 200 guilds per page.
  for(let page=0;page<20;page++) {
    const list=await discord<Guild[]>(`/users/@me/guilds?limit=200&after=${after}`,'Bearer '+accessToken);all.push(...list);
    if(list.length<200) break;after=list[list.length-1].id;
  }
  return all.filter(canManageGuild);
}
async function botPresent(guildId:string):Promise<boolean> {
  const response=await fetch('https://discord.com/api/v10/guilds/'+guildId,{headers:{Authorization:'Bot '+config.token},signal:AbortSignal.timeout(10_000)});
  if(response.status===403 || response.status===404) return false;
  if(!response.ok) throw new HttpError(503,'ตรวจสอบสถานะบอทไม่ได้ กรุณาลองใหม่');return true;
}
const limits=new Map<string,{count:number;until:number}>();
function rateLimit(req:IncomingMessage) {
  const key=String(req.headers['x-real-ip'] ?? req.socket.remoteAddress ?? 'local');const now=Date.now();
  for(const [k,v] of limits) if(v.until<now) limits.delete(k);
  const entry=limits.get(key) ?? {count:0,until:now+60_000};entry.count++;limits.set(key,entry);
  if(entry.count>120 || limits.size>10_000) throw new HttpError(429,'ส่งคำขอถี่เกินไป กรุณารอสักครู่');
}
async function session(req:IncomingMessage) {
  const id=cookie(req,'__Host-disbot');if(!/^[\w-]{43}$/.test(id)) throw new HttpError(401,'กรุณาเข้าสู่ระบบ');
  const result=await pool.query('SELECT * FROM dashboard_sessions WHERE id_hash=$1 AND expires_at>now()',[hashToken(id)]);
  if(!result.rows[0]) throw new HttpError(401,'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  return {...result.rows[0],accessToken:decryptToken(result.rows[0].access_token_cipher,sessionSecret)};
}
export function createDashboardServer() {
  return createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cdn.discordapp.com https://media.discordapp.net; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url=new URL(req.url ?? '/',origin),path=url.pathname;
      if(req.method==='GET' && path==='/healthz') {await pool.query('SELECT 1');return json(res,200,{ok:true,oauthReady:ready});}
      const staticFiles:Record<string,[string,string]>={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
      if(req.method==='GET' && staticFiles[path]) {const [file,type]=staticFiles[path];res.setHeader('Content-Type',type+'; charset=utf-8');res.end(await readFile(new URL('../dashboard/'+file,import.meta.url)));return;}
      if(req.method==='GET' && path==='/api/status') return json(res,200,{oauthReady:ready});
      rateLimit(req);
      if(req.method==='GET' && path==='/auth/discord') {
        if(!ready) throw new HttpError(503,'กำลังรอการตั้งค่า Discord OAuth บนเซิร์ฟเวอร์');
        const state=randomToken();setCookie(res,'__Host-disbot-state',encryptToken(JSON.stringify({state,expires:Date.now()+600_000}),sessionSecret),600);
        const query=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:'identify guilds',state});
        res.writeHead(302,{Location:'https://discord.com/oauth2/authorize?'+query});res.end();return;
      }
      if(req.method==='GET' && path==='/auth/discord/callback') {
        if(!ready) throw new HttpError(503,'OAuth ยังไม่พร้อม');
        let state:{state:string;expires:number};try {state=JSON.parse(decryptToken(cookie(req,'__Host-disbot-state'),sessionSecret));} catch {throw new HttpError(400,'OAuth state ไม่ถูกต้อง');}
        setCookie(res,'__Host-disbot-state','',0);
        if(state.expires<Date.now() || !equalTokens(state.state,url.searchParams.get('state') ?? '') || !url.searchParams.get('code')) throw new HttpError(400,'การเข้าสู่ระบบหมดอายุหรือไม่ถูกต้อง กรุณาเริ่มใหม่');
        const response=await fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'authorization_code',code:url.searchParams.get('code')!,redirect_uri:redirectUri}),signal:AbortSignal.timeout(10_000)});
        if(!response.ok) throw new HttpError(401,'Discord ปฏิเสธการเข้าสู่ระบบ กรุณาลองใหม่');
        const token=await response.json() as {access_token:string;expires_in:number;scope:string};
        if(!token.access_token || !token.scope.split(' ').includes('guilds') || !token.scope.split(' ').includes('identify')) throw new HttpError(401,'สิทธิ์ OAuth ไม่ครบ');
        const user=await discord<{id:string;username:string;global_name:string|null;avatar:string|null}>('/users/@me','Bearer '+token.access_token);
        const seconds=Math.min(43_200,Math.max(1,Number(token.expires_in)||1));const id=randomToken();
        await pool.query('DELETE FROM dashboard_sessions WHERE expires_at<now()');
        await pool.query('INSERT INTO dashboard_sessions(id_hash,user_info,access_token_cipher,csrf_token,expires_at) VALUES($1,$2,$3,$4,$5)',[hashToken(id),{id:user.id,name:user.global_name || user.username,avatar:user.avatar},encryptToken(token.access_token,sessionSecret),randomToken(),new Date(Date.now()+seconds*1000)]);
        setCookie(res,'__Host-disbot',id,seconds);res.writeHead(302,{Location:'/'});res.end();return;
      }
      if(!path.startsWith('/api/')) throw new HttpError(404,'ไม่พบหน้า');
      if(!ready) throw new HttpError(503,'กำลังรอ Discord OAuth');
      const current=await session(req);
      if(req.method!=='GET' && !allowedMutation(req.headers.origin,origin,typeof req.headers['x-csrf-token']==='string'?req.headers['x-csrf-token']:undefined,current.csrf_token)) throw new HttpError(403,'คำขอไม่ผ่านการตรวจสอบความปลอดภัย');
      if(req.method==='GET' && path==='/api/me') return json(res,200,{user:current.user_info,csrfToken:current.csrf_token});
      if(req.method==='POST' && path==='/api/logout') {await pool.query('DELETE FROM dashboard_sessions WHERE id_hash=$1',[current.id_hash]);setCookie(res,'__Host-disbot','',0);return json(res,200,{ok:true});}
      const guilds=await managedGuilds(current.accessToken);
      if(req.method==='GET' && path==='/api/guilds') {
        const stored=await pool.query('SELECT guild_id FROM guild_bot_settings');const ids=new Set(stored.rows.map(r=>r.guild_id));
        const candidates=guilds.filter(g=>ids.has(g.id));const live:Guild[]=[];
        for(const g of candidates) if(await botPresent(g.id)) live.push(g);
        return json(res,200,{guilds:live.map(g=>({id:g.id,name:g.name,icon:g.icon}))});
      }
      const cardPreview=path.match(/^\/api\/guilds\/(\d{17,20})\/rank-cards\/preview$/);
      if(cardPreview && req.method==='GET') {
        const guildId=cardPreview[1];
        if(!guilds.some(g=>g.id===guildId) || !await botPresent(guildId)) throw new HttpError(403,'ไม่มีสิทธิ์จัดการเซิร์ฟเวอร์นี้');
        const tier=url.searchParams.get('tier') ?? '';
        const rank=rankCardCatalog().find(rank=>String(rank.tier)===tier);
        if(!rank) throw new HttpError(400,'เลือกยศ 1–9');
        const user=current.user_info as {id:string;name:string;avatar:string|null};
        const avatar=user.avatar && /^(?:a_)?[a-f0-9]{32}$/i.test(user.avatar) && /^\d{17,20}$/.test(user.id)
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
          : 'https://cdn.discordapp.com/embed/avatars/0.png';
        let message;
        try {message=await createRankUpCardMessage({id:user.id,displayName:user.name,displayAvatarURL:()=>avatar},rank.name);} catch {throw new HttpError(503,'โหลดรูปตัวอย่างไม่ได้ กรุณาลองใหม่');}
        const file=message?.files?.[0];
        if(!(file instanceof AttachmentBuilder) || !Buffer.isBuffer(file.attachment)) throw new HttpError(503,'สร้างตัวอย่างไม่ได้');
        res.setHeader('Content-Type','image/png');res.end(file.attachment);return;
      }
      const match=path.match(/^\/api\/guilds\/(\d{17,20})\/templates(?:\/([a-z_]+)(?:\/(history|reset|restore))?)?$/);
      if(!match) throw new HttpError(404,'ไม่พบคำสั่ง');
      const [,guildId,key,action]=match;
      if(!guilds.some(g=>g.id===guildId) || !await botPresent(guildId)) throw new HttpError(403,'ไม่มีสิทธิ์จัดการเซิร์ฟเวอร์นี้');
      if(!key && req.method==='GET') {
        const rows=await pool.query('SELECT template_key,content,revision,updated_at FROM guild_message_templates WHERE guild_id=$1',[guildId]);
        return json(res,200,{definitions:templateDefinitions,variables:variableNames,variablesByTemplate,templates:rows.rows,rankCards:rankCardCatalog()});
      }
      if(!isTemplateKey(key ?? '')) throw new HttpError(404,'ไม่พบเทมเพลต');
      const templateKey=key as keyof typeof templateDefinitions;
      if(action==='history' && req.method==='GET') {
        const history=await pool.query('SELECT revision,content,created_at FROM guild_message_template_history WHERE guild_id=$1 AND template_key=$2 ORDER BY revision DESC LIMIT 30',[guildId,key]);return json(res,200,{history:history.rows});
      }
      if((req.method==='PUT' && !action) || (req.method==='POST' && (action==='reset'||action==='restore'))) {
        const input=await body(req);if(!Number.isSafeInteger(input.revision) || Number(input.revision)<0) throw new HttpError(400,'กรุณาส่งเวอร์ชันปัจจุบัน');
        let content=null;
        if(action==='restore') {
          if(!Number.isSafeInteger(input.targetRevision)) throw new HttpError(400,'เวอร์ชันไม่ถูกต้อง');
          const old=await pool.query('SELECT content FROM guild_message_template_history WHERE guild_id=$1 AND template_key=$2 AND revision=$3',[guildId,key,input.targetRevision]);
          if(!old.rows[0]) throw new HttpError(404,'ไม่พบเวอร์ชัน');content=old.rows[0].content ? validateTemplate(templateKey,old.rows[0].content):null;
        } else if(action!=='reset') {try {content=validateTemplate(templateKey,input.content);} catch {throw new HttpError(400,'เทมเพลตไม่ถูกต้อง ตรวจตัวแปร ความยาว และลิงก์ภาพ');}}
        const revision=await saveMessageTemplate(guildId,templateKey,content,current.user_info.id,Number(input.revision));
        if(revision===null) throw new HttpError(409,'มีผู้อื่นแก้ไขแล้ว กรุณาโหลดเวอร์ชันล่าสุด');
        return json(res,200,{ok:true,revision});
      }
      throw new HttpError(405,'ไม่รองรับคำขอนี้');
    } catch(error) {
      if(error instanceof HttpError) return json(res,error.status,{error:error.message});
      // Never log OAuth codes, request URLs, tokens, cookies or credential-bearing DB errors.
      console.error('Dashboard request failed');json(res,500,{error:'เกิดข้อผิดพลาดภายใน กรุณาลองใหม่'});
    }
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.DASHBOARD_PORT ?? '8787');
  if(!Number.isInteger(port) || port<1024 || port>65535) throw new Error('Invalid DASHBOARD_PORT');
  createDashboardServer().listen(port,'127.0.0.1',()=>console.log(`Dashboard listening on loopback:${port}; OAuth ready: ${ready}`));
}
