// HoldDaBET — Rank-up card generator
// npm i @napi-rs/canvas
// Usage (CLI):  node rank-card.js <tier 1-9> "<display name>" <avatar url or path> [out.png]
// Usage (bot):  const { renderRankCard } = require('./rank-card'); const png = await renderRankCard(9, member.displayName, member.displayAvatarURL({ extension: 'png', size: 256 }));
//               channel.send({ files: [{ attachment: png, name: 'rank-up.png' }] });
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const DIR = __dirname;
const CFG = JSON.parse(fs.readFileSync(path.join(DIR, 'ranks.json'), 'utf8'));
GlobalFonts.registerFromPath(path.join(DIR, CFG.name.font), CFG.name.fontFamily);
// Optional fallbacks for emoji and fancy Unicode letters in names (delete the files if you don't need them)
const FALLBACKS = [];
for (const [file, family] of [['fonts/NotoSansMath-Regular.ttf', 'Noto Sans Math'], ['fonts/NotoColorEmoji.ttf', 'Noto Color Emoji']]) {
  if (fs.existsSync(path.join(DIR, file))) { GlobalFonts.registerFromPath(path.join(DIR, file), family); FALLBACKS.push(`"${family}"`); }
}
const FAMILY = [CFG.name.fontFamily, ...FALLBACKS].join(', ');

async function loadAny(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error('avatar download failed: ' + res.status);
    return loadImage(Buffer.from(await res.arrayBuffer()));
  }
  return loadImage(src);
}

async function renderRankCard(tier, displayName, avatarSrc) {
  const rank = CFG.ranks.find(r => r.tier === Number(tier));
  if (!rank) throw new Error('tier must be 1-9');
  const { width, height } = CFG.canvas;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1) background
  ctx.drawImage(await loadImage(path.join(DIR, rank.background)), 0, 0, width, height);

  // 2) avatar — circle crop, cover-fit
  if (avatarSrc) {
    const a = CFG.avatar, r = a.diameter / 2;
    const img = await loadAny(avatarSrc);
    const s = Math.max(a.diameter / img.width, a.diameter / img.height);
    const w = img.width * s, h = img.height * s;
    ctx.save();
    ctx.beginPath();
    ctx.arc(a.centerX, a.centerY, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, a.centerX - w / 2, a.centerY - h / 2, w, h);
    ctx.restore();
  }

  // 3) TIER pill drawn back on top of the avatar
  ctx.drawImage(await loadImage(path.join(DIR, rank.overlay)), 0, 0, width, height);

  // 4) name — shrink to fit the box
  const n = CFG.name;
  let size = n.fontSize;
  const font = () => `${n.fontWeight} ${size}px ${FAMILY}`;
  ctx.font = font();
  while (ctx.measureText(displayName).width > n.width && size > n.minFontSize) { size -= 2; ctx.font = font(); }
  let text = displayName;
  if (ctx.measureText(text).width > n.width) {
    while (text.length > 1 && ctx.measureText(text + '…').width > n.width) text = Array.from(text).slice(0, -1).join('');
    text += '…';
  }
  ctx.fillStyle = n.color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, n.x, n.y + n.height / 2 + 2);

  return canvas.toBuffer('image/png');
}

module.exports = { renderRankCard, config: CFG };

if (require.main === module) {
  const [tier, name, avatar, out = `rank-up-${tier}.png`] = process.argv.slice(2);
  if (!tier || !name) { console.log('node rank-card.js <tier> "<name>" <avatar> [out.png]'); process.exit(1); }
  renderRankCard(tier, name, avatar).then(buf => { fs.writeFileSync(out, buf); console.log('saved', out); });
}
