import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import type { GuildMember } from 'discord.js';
GlobalFonts.registerFromPath(fileURLToPath(new URL('../assets/fonts/NotoSansThaiLooped.ttf', import.meta.url)), 'LevelUpCard');
const template = loadImage(fileURLToPath(new URL('../assets/level-up-template.png', import.meta.url)));
export function levelUpAccent(source: 'message' | 'voice', level: number): string {
  const colors = ['#4b4b52', '#a48145', '#ff8a2a', '#f34f9a', '#39bff2', '#42d99a'];
  const p = Math.max(0, Math.min(1, level / (source === 'message' ? 100 : 30))) * 5;
  const a = colors[Math.floor(p)], b = colors[Math.min(5, Math.floor(p) + 1)];
  return '#' + [1,3,5].map(i => Math.round(parseInt(a.slice(i,i+2),16)*(1-p%1)+parseInt(b.slice(i,i+2),16)*(p%1)).toString(16).padStart(2,'0')).join('');
}
export async function createLevelUpCard(member: GuildMember, source: 'message' | 'voice', oldLevel: number, newLevel: number): Promise<Buffer> {
  const canvas = createCanvas(1200,400), ctx = canvas.getContext('2d');
  ctx.drawImage(await template,0,0,1200,400);
  // Restore baked subtitle using the template's own flat navy background.
  ctx.drawImage(canvas,280,270,290,44,280,222,290,44);
  ctx.textBaseline = 'top'; ctx.fillStyle = '#ffffff'; ctx.font = '30px "LevelUpCard"';
  ctx.fillText(source === 'message' ? 'ระดับการพิมพ์' : 'ระดับพูดคุย',303,228);
  ctx.save(); ctx.beginPath(); ctx.arc(152,215,110,0,Math.PI*2); ctx.clip();
  ctx.fillStyle = '#27294e'; ctx.fillRect(42,105,220,220);
  try {
    const response = await fetch(member.displayAvatarURL({extension:'png',size:512}),{signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw Error('Avatar unavailable');
    const avatar = await loadImage(Buffer.from(await response.arrayBuffer()));
    const side = Math.min(avatar.width,avatar.height);
    ctx.drawImage(avatar,(avatar.width-side)/2,(avatar.height-side)/2,side,side,42,105,220,220);
  } catch {
    ctx.fillStyle = '#ffcd3c'; ctx.font = 'bold 72px "LevelUpCard"'; ctx.fillText(Array.from(member.displayName)[0] ?? '?',117,165);
  }
  ctx.restore();
  let size = 48, name = member.displayName.replace(/[\r\n]/g,' ');
  for (;size>26;size--) {ctx.font=`bold ${size}px "LevelUpCard"`; if(ctx.measureText(name).width<=350) break;}
  ctx.font=`bold ${size}px "LevelUpCard"`;
  while(ctx.measureText(name).width>350 && Array.from(name).length>1) name=Array.from(name).slice(0,-2).join('')+'…';
  ctx.fillStyle='#ffcd3c'; ctx.fillText(name,280,91);
  ctx.font='bold 66px "LevelUpCard"'; ctx.fillStyle='#bfc3d7'; ctx.fillText(String(oldLevel),303,276);
  const arrowX=303+ctx.measureText(String(oldLevel)).width+16;
  // Vector arrow avoids missing-glyph boxes in the Thai font on Linux.
  ctx.strokeStyle='#ffcd3c'; ctx.lineWidth=7; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.beginPath(); ctx.moveTo(arrowX,323); ctx.lineTo(arrowX+32,323);
  ctx.moveTo(arrowX+20,310); ctx.lineTo(arrowX+33,323); ctx.lineTo(arrowX+20,336); ctx.stroke();
  const nextX=arrowX+49;
  ctx.fillStyle=source==='message'?'#37dcff':'#ee4ed6'; ctx.fillText(String(newLevel),nextX,276);
  return canvas.toBuffer('image/png');
}
