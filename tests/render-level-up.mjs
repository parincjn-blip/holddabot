import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {createLevelUpCard} from '../dist/level-up-card.js';
const avatar=createCanvas(512,512),c=avatar.getContext('2d');
c.fillStyle='#ff3e77';c.fillRect(0,0,512,512); c.fillStyle='#fff';c.font='bold 220px sans-serif';c.fillText('N',160,335);
globalThis.fetch=async()=>new Response(avatar.toBuffer('image/png'));
const original=await loadImage(new URL('../assets/level-up-template.png',import.meta.url).pathname);
const background=createCanvas(1200,400);background.getContext('2d').drawImage(original,0,0);
for(const [source,oldLevel,newLevel] of [['message',99,100],['voice',14,15]]) {
  const png=await createLevelUpCard({displayName:'น้าเก่ง',displayAvatarURL:()=> 'https://example.com/avatar.png'},source,oldLevel,newLevel);
  const rendered=createCanvas(1200,400); rendered.getContext('2d').drawImage(await loadImage(png),0,0);
  assert.deepEqual(rendered.getContext('2d').getImageData(650,0,550,400).data,background.getContext('2d').getImageData(650,0,550,400).data,'original artwork must remain pixel-identical');
  assert.deepEqual(rendered.getContext('2d').getImageData(0,0,1,1).data,background.getContext('2d').getImageData(0,0,1,1).data,'corner transparency preserved');
  await writeFile(join(tmpdir(),`disbot-level-up-${source}.png`),png);
}
console.log('PASS: both cards 1200×400; original artwork and transparent corners preserved');
