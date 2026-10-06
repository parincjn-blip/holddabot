let csrf='',guilds=[],definitions={},rows=[],key='',guild='',focusField=null,busy=false,variableButtons=[],variablesByTemplate={},rankCards=[],previewName='น้าเก่ง';
const $=id=>document.getElementById(id), fields=['title','body','footer','color','imageUrl','buttonLabel'];
function notice(message){$('status').textContent=message;$('status').style.display='block';}
async function api(path,options={}){const res=await fetch(path,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers}});const data=await res.json();if(!res.ok)throw Error(data.error || 'เกิดข้อผิดพลาด');return data;}
function currentRow(){return rows.find(r=>r.template_key===key);}
function content(){return Object.fromEntries(fields.map(f=>[f,$(f).value]));}
function base(){return '/api/guilds/'+guild+'/templates';}
function textNode(text){return document.createTextNode(text);}
// Deliberately small Markdown subset. No HTML injection and no executable links.
function markdown(element,text){element.replaceChildren();for(const line of text.split('\n')){const node=document.createElement(line.startsWith('# ')?'h1':line.startsWith('## ')?'h2':line.startsWith('-# ')?'small':'div');const clean=line.replace(/^(?:##? |-# )/,'');for(const part of clean.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*)/g)){if(part.startsWith('**')&&part.endsWith('**')){const b=document.createElement('strong');if(part.startsWith('***')){const i=document.createElement('em');i.textContent=part.slice(3,-3);b.append(i);}else b.textContent=part.slice(2,-2);node.append(b);}else node.append(textNode(part));}if(!clean)node.append(document.createElement('br'));element.append(node);}}
function substitute(text){const vars={display_name:previewName,mention:'@'+previewName,channel_name:'ห้องดูไลฟ์',guild_name:guilds.find(g=>g.id===guild)?.name || 'HoldDaBET',time:'19:30',emoji:'🎉',old_level:14,new_level:15,chat_level:15,talk_level:8,role_name:rankCards.find(r=>String(r.tier)===$('rank-tier').value)?.name || 'Crew'};return text.replace(/\{([^{}]+)\}/g,(_,v)=>String(vars[v]??'{'+v+'}'));}
function preview(){
  const c=content(),kind=definitions[key].kind;
  markdown($('preview-title'),substitute(c.title));markdown($('preview-body'),substitute(c.body));markdown($('preview-footer'),substitute(c.footer));
  $('preview-card').style.borderLeftColor=c.color;$('preview-card').classList.toggle('no-container',['level','rank'].includes(kind));document.querySelector('.preview-user').hidden=['level','rank'].includes(kind);
  $('preview-card').hidden=kind==='text';if(kind==='text')markdown($('preview-title'),substitute(c.body));
  $('original-art').hidden=!!c.imageUrl || !['level','stream'].includes(kind);$('rank-controls').hidden=kind!=='rank';
  $('rank-preview-error').hidden=true;$('preview-image').hidden=kind!=='rank'&&!c.imageUrl;
  if(kind==='rank'){
    const src='/api/guilds/'+guild+'/rank-cards/preview?tier='+encodeURIComponent($('rank-tier').value || '1');
    if($('preview-image').getAttribute('src')!==src)$('preview-image').src=src;
  }else if(c.imageUrl){try{const u=new URL(c.imageUrl);if(u.protocol==='https:'&&['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname))$('preview-image').src=u.href;else $('preview-image').hidden=true;}catch{$('preview-image').hidden=true;}}
  else $('preview-image').removeAttribute('src');
  $('preview-button').hidden=kind!=='stream';$('preview-button').textContent=c.buttonLabel;
}
function selectTemplate(selected){
  key=selected;focusField=null;const d=definitions[key],row=currentRow(),c=row?.content || d;
  for(const f of fields)$(f).value=c[f];$('template-title').textContent=d.label;$('revision').textContent='v'+(row?.revision || 0)+(row?.content?' · กำหนดเอง':' · ค่าเริ่มต้น');
  for(const node of $('tabs').children)node.classList.toggle('selected',node.dataset.key===key);
  const kind=d.kind;$('rank-info').hidden=kind!=='rank';$('title-field').hidden=kind==='text';$('body-field').hidden=kind==='level';$('footer-field').hidden=kind==='text';$('color-field').hidden=['text','level','rank'].includes(kind);$('button-field').hidden=kind!=='stream';$('image-field').hidden=['text','rank'].includes(kind);
  $('body-caption').textContent=kind==='rank'?'ข้อความประกอบนอกภาพ (ไม่บังคับ)':'ข้อความ';
  const variables=kind==='rank'?['display_name','mention','guild_name','time','role_name']:(variablesByTemplate[key] || []);
  for(const b of variableButtons)b.hidden=!variables.includes(b.dataset.variable);
  $('history').replaceChildren();preview();loadHistory().catch(e=>notice(e.message));
}
async function loadHistory(){const requestedGuild=guild,requestedKey=key;const data=await api(base()+'/'+key+'/history');if(guild!==requestedGuild||key!==requestedKey)return;$('history').replaceChildren();for(const row of data.history){const div=document.createElement('div'),label=document.createElement('span'),button=document.createElement('button');label.textContent='v'+row.revision+' · '+new Date(row.created_at).toLocaleString('th-TH');button.textContent='ใช้เวอร์ชันนี้';button.onclick=()=>save('restore',{targetRevision:row.revision});div.append(label,button);$('history').append(div);}if(!data.history.length)$('history').textContent='ยังไม่มีการแก้ไข';}
async function loadGuild(){guild=$('guild').value;const data=await api(base());definitions=data.definitions;rows=data.templates;variablesByTemplate=data.variablesByTemplate;rankCards=data.rankCards || [];
  const selected=$('rank-tier').value;$('rank-tier').replaceChildren();for(const rank of rankCards){const option=document.createElement('option');option.value=rank.tier;option.textContent=rank.tier+'/9 · '+rank.name;$('rank-tier').append(option);}if(rankCards.some(r=>String(r.tier)===selected))$('rank-tier').value=selected;
  $('tabs').replaceChildren();for(const [k,d]of Object.entries(definitions)){const b=document.createElement('button');b.textContent=d.label;b.dataset.key=k;b.onclick=()=>{if(!busy)selectTemplate(k);};$('tabs').append(b);}$('variables').replaceChildren();variableButtons=[];for(const variable of data.variables){const b=document.createElement('button');b.type='button';b.textContent='{'+variable+'}';b.dataset.variable=variable;b.onclick=()=>{const field=focusField || $(definitions[key].kind==='level'?'title':'body');field.setRangeText(b.textContent,field.selectionStart,field.selectionEnd,'end');field.focus();preview();};variableButtons.push(b);$('variables').append(b);}selectTemplate(Object.hasOwn(definitions,key)?key:Object.keys(definitions)[0]);}
async function save(action,extra={}){if(busy)return;if(action==='reset'&&!confirm('คืนเทมเพลตนี้เป็นค่าเริ่มต้น? ประวัติเดิมยังคงอยู่'))return;busy=true;$('guild').disabled=true;for(const b of $('form').querySelectorAll('button'))b.disabled=true;try{const path=base()+'/'+key+(action?'/'+action:'');await api(path,{method:action?'POST':'PUT',body:JSON.stringify({revision:currentRow()?.revision || 0,...(action?extra:{content:content()})})});await loadGuild();notice('บันทึกแล้ว · มีผลกับประกาศครั้งถัดไป');}catch(e){notice(e.message);}finally{busy=false;$('guild').disabled=false;for(const b of $('form').querySelectorAll('button'))b.disabled=false;}}
$('form').onsubmit=e=>{e.preventDefault();save('');};$('reset').onclick=()=>save('reset');$('guild').onchange=()=>loadGuild().catch(e=>notice(e.message));for(const f of fields){$(f).oninput=()=>preview();if(['title','body','footer'].includes(f))$(f).onfocus=()=>focusField=$(f);}
$('rank-tier').onchange=()=>preview();$('preview-image').onerror=()=>{if(definitions[key]?.kind==='rank')$('rank-preview-error').hidden=false;};
async function init(){const status=await api('/api/status');if(!status.oauthReady){$('setup').hidden=false;$('login').hidden=true;return;}let me;try{me=await api('/api/me');}catch{return;}csrf=me.csrfToken;previewName=me.user.name;const name=document.createElement('span'),logout=document.createElement('button');name.textContent=me.user.name;logout.textContent='ออกจากระบบ';logout.onclick=async()=>{try{await api('/api/logout',{method:'POST',body:'{}'});location.reload();}catch(e){notice(e.message);}};$('account').append(name,logout);const data=await api('/api/guilds');guilds=data.guilds;$('landing').hidden=true;$('studio').hidden=false;for(const g of guilds){const option=document.createElement('option');option.value=g.id;option.textContent=g.name;$('guild').append(option);}if(!guilds.length){$('empty').hidden=false;$('workspace').hidden=true;return;}await loadGuild();}
init().catch(e=>notice(e.message));
