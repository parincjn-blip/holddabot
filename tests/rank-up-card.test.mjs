import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { rankCardTier, renderRankUpCard, createRankUpCardMessage } from '../dist/rank-up-card.js';

const require = createRequire(import.meta.url);
const kit = require('../assets/rank-up-kit/rank-card.js');
const avatar = createCanvas(256,256);
avatar.getContext('2d').fillRect(0,0,256,256);
const png = avatar.toBuffer('image/png');

test('all copied kit files match their original SHA-256 manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/rank-up-kit/original-files.sha256.json',import.meta.url),'utf8'));
  for(const [file,expected] of Object.entries(manifest)) {
    const buffer = await readFile(new URL('../assets/rank-up-kit/'+file,import.meta.url));
    assert.equal(createHash('sha256').update(buffer).digest('hex'),expected,file);
  }
});
test('role name selects artwork only; unknown ranks never borrow a tier', () => {
  for(const rank of kit.config.ranks) assert.equal(rankCardTier(rank.th),rank.tier);
  assert.equal(rankCardTier('Custom Role'),undefined);
  assert.equal(rankCardTier('Chat Level 100'),undefined);
});
test('all nine promotion cards use the supplied renderer without extra level data', async () => {
  for(const rank of kit.config.ranks) {
    const actual = await renderRankUpCard(rank.tier,'น้าเก่ง',png);
    assert.deepEqual(actual,await kit.renderRankCard(rank.tier,'น้าเก่ง',png));
    const image=await loadImage(actual);
    assert.equal(image.width,1200); assert.equal(image.height,400);
  }
});
test('long Thai, emoji and styled display names render with the kit font logic', async () => {
  for(const name of ['ชื่อสมาชิกที่ยาวมาก'.repeat(5),'👾 HoldDaβΞT โอดิน 🎲','𝚃𝚁𝚅𝙿$𝚃𝙰𝚁✨']) {
    assert.equal((await loadImage(await renderRankUpCard(9,name,png))).width,1200);
  }
});
test('new promotion sends only the image, without XP or level embeds', async () => {
  const original=globalThis.fetch;
  const member={id:'test-member',displayName:'น้าเก่ง',displayAvatarURL:()=> 'https://cdn.discordapp.com/avatar.png'};
  globalThis.fetch=async()=>new Response(png);
  try {
    const message=await createRankUpCardMessage(member,'Crew');
    assert.equal(message.embeds,undefined); assert.equal(message.content,undefined);
    assert.equal(message.files.length,1);
    assert.equal(message.files[0].name,'rank-up-test-member-1.png');
    assert.equal(message.files[0].description,'น้าเก่ง ได้รับตำแหน่ง Crew');
    assert.deepEqual(message.allowedMentions,{parse:[]});
    assert.equal(await createRankUpCardMessage(member,'Custom Role'),null);
    globalThis.fetch=async()=>new Response('',{status:503});
    await assert.rejects(createRankUpCardMessage(member,'Crew'),/avatar unavailable/);
  } finally {globalThis.fetch=original;}
});
