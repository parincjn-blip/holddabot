// Development-only synthetic UI fixture. No credentials, no DB, no Discord calls. Never run on production.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {templateDefinitions,variableNames,variablesByTemplate} from '../dist/message-templates.js';
import {rankCardCatalog,renderRankUpCard} from '../dist/rank-up-card.js';
import {createCanvas} from '@napi-rs/canvas';
let rows=[];
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;let data;
  if(path==='/api/status')data={oauthReady:true};
  else if(path==='/api/me')data={user:{name:'น้าเก่ง'},csrfToken:'synthetic'};
  else if(path==='/api/guilds')data={guilds:[{id:'123456789012345678',name:'HoldDaBET · Preview'}]};
  else if(path.endsWith('/history'))data={history:[]};
  else if(req.method==='GET'&&path.endsWith('/rank-cards/preview')){
    const tier=Number(new URL(req.url,'http://localhost').searchParams.get('tier'));if(!rankCardCatalog().some(rank=>rank.tier===tier)){res.writeHead(400);res.end();return;}
    const avatar=createCanvas(256,256),ctx=avatar.getContext('2d');ctx.fillStyle='#7053ce';ctx.fillRect(0,0,256,256);ctx.fillStyle='#ffffff';ctx.font='bold 96px sans-serif';ctx.textAlign='center';ctx.fillText('N',128,162);
    res.setHeader('Content-Type','image/png');res.end(await renderRankUpCard(tier,'น้าเก่ง',avatar.toBuffer('image/png')));return;
  }
  else if(req.method==='GET'&&path.endsWith('/templates'))data={definitions:templateDefinitions,variables:variableNames,variablesByTemplate,templates:rows,rankCards:rankCardCatalog()};
  else if(req.method==='PUT'){let text='';for await(const c of req)text+=c;const input=JSON.parse(text),key=path.split('/').at(-1);rows=rows.filter(r=>r.template_key!==key);rows.push({template_key:key,content:input.content,revision:input.revision+1});data={ok:true};}
  else if(path.endsWith('/reset')){const key=path.split('/').at(-2);rows=rows.filter(r=>r.template_key!==key);data={ok:true};}
  else {const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};if(!files[path]){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',files[path][1]+'; charset=utf-8');res.end(await readFile(new URL('../dashboard/'+files[path][0],import.meta.url)));return;}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));
});
server.listen(8791,'127.0.0.1',()=>console.log('Synthetic dashboard preview on http://127.0.0.1:8791'));
