# HoldDaBET — Rank Up Card Kit

สร้างภาพประกาศเลื่อนยศอัตโนมัติ: เอาพื้นหลังของยศนั้นมาใส่รูปโปรไฟล์กับชื่อสมาชิก แล้วได้เป็นไฟล์ PNG

## ไฟล์ในชุด
| โฟลเดอร์ / ไฟล์ | ใช้ทำอะไร |
|---|---|
| `backgrounds/` | พื้นหลังของยศ 1–9 (PNG 1200×400) ที่วงรูปกับช่องชื่อยังว่างอยู่ |
| `overlays/` | ป้าย TIER แบบพื้นใส วาดทับหลังใส่รูปโปรไฟล์ เพื่อไม่ให้รูปบังป้าย |
| `previews/` | ภาพตัวอย่างที่มี placeholder ไว้ดูตำแหน่ง ไม่ได้ใช้ในสคริปต์ |
| `ranks.json` | ตำแหน่งรูปและชื่อ ฟอนต์ สี และไฟล์ของแต่ละยศ |
| `rank-card.js` | สคริปต์ Node.js ที่สร้างภาพ |
| `fonts/` | Kanit Bold สำหรับชื่อ / Noto Math กับ Noto Color Emoji สำหรับชื่อที่มีอีโมจิหรือตัวอักษรแฟนซี (ไม่ใช้ก็ลบได้ ไฟล์อีโมจิใหญ่ 25MB) |

## ตำแหน่ง (px บนภาพ 1200×400)
- รูปโปรไฟล์: วงกลม จุดศูนย์กลาง (184, 200) เส้นผ่านศูนย์กลาง 208
- ชื่อ: กล่อง x 352, y 111, กว้าง 520, สูง 60 — Kanit Bold 42px สีขาว ชิดซ้าย ถ้าชื่อยาวเกินกล่อง ตัวอักษรจะเล็กลงเองจนเหลือ 24px แล้วจึงตัดเป็น …
- ลำดับการวาด: background → avatar → overlay → name

## วิธีใช้
```bash
npm install
node rank-card.js 9 "ชื่อสมาชิก" https://cdn.discordapp.com/avatars/.../xxx.png out.png
```

ใช้ในบอท discord.js:
```js
const { renderRankCard } = require('./rank-card');
const png = await renderRankCard(newTier, member.displayName,
  member.displayAvatarURL({ extension: 'png', size: 256 }));
await channel.send({ files: [{ attachment: png, name: 'rank-up.png' }] });
```

ใช้ภาษาอื่น (Python Pillow ฯลฯ) ก็ได้ ให้อ่านค่าตำแหน่งจาก `ranks.json` แล้ววาดตามลำดับเดียวกัน
แต่ Pillow ต้องติดตั้ง libraqm ด้วย ไม่อย่างนั้นสระและวรรณยุกต์ภาษาไทยจะซ้อนกันผิดตำแหน่ง
