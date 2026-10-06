# Disbot

Discord bot สำหรับรายงานสมาชิก ระบบ Chat Level, Talk Level และ Giveaway สองรูปแบบ โดยใช้ PostgreSQL เป็นแหล่งข้อมูลหลักและเปิดให้ n8n อ่านข้อมูลเพื่อทำรายงานตามเวลา

สรุปงานและขอบเขตระบบ: [PROJECT_SUMMARY.md](docs/PROJECT_SUMMARY.md) · แนวทางขึ้น Git: [GIT_HANDOFF.md](docs/GIT_HANDOFF.md)

## ฟีเจอร์ MVP

- รายงานสมาชิกเข้าและออก
- Chat Level: 5–10 XP ต่อข้อความที่ผ่านเงื่อนไข, cooldown 60 วินาที, สูงสุด 1,000 XP/วัน
- Talk Level: 1 XP/นาที, สูงสุด 240 XP/วัน, ไม่นับ AFK คนเดียว Bot หรือผู้ถูก server-deafen; self-deafen หยุดนับหลัง 10 นาที
- ผู้ที่แชร์จอ/Go Live รับ Talk XP ×3 (3 XP/นาที) เมื่อเปิด `stream_xp` ไม่เพิ่ม XP ให้ผู้ชม
- ประกาศเฉพาะตอนเริ่มสตรีมไปห้องที่เลือก ไม่ประกาศตอนหยุดสตรีม
- สูตร Chat Level `12 × Level²`; Level 100 ใช้ 120,000 XP หรืออย่างน้อย 120 วัน
- สูตร Talk Level `32 × Level²`; Level 30 ใช้ 28,800 XP หรืออย่างน้อย 120 วัน
- เปลี่ยน Role ตามเกณฑ์อัตโนมัติ
- การ์ดประกาศ Level Up ใช้เทมเพลต 1200×400 พร้อมรูปสมาชิก Display Name และเลขเลเวลเก่า → ใหม่ แยก Chat/Talk ไม่มี Container
- Role ชั่วคราวระหว่างสตรีม พร้อมระบบคืนสถานะหลังรีสตาร์ตและไม่ลบ Role ที่ให้เองอยู่ก่อน
- `/level`, `/member`, `/rank`, `/leaderboard`
- `/giveaway create`, `/giveaway status`, `/giveaway end`
- `/feature` ตั้งห้องประกาศ เกณฑ์ยศ ห้อง AFK และเปิด–ปิดฟีเจอร์แบบแยกเซิร์ฟเวอร์
- Giveaway แบบกดก่อนได้ก่อนและลงชื่อแล้วสุ่ม
- transaction และ unique constraint ป้องกันการกดซ้ำและผู้ชนะเกินจำนวน

## ตั้งค่า

1. ต้องใช้ Node.js 22+ หรือ Docker
2. คัดลอก `.env.example` เป็น `.env` แล้วกรอกค่า ห้าม commit `.env`
3. เปิด Discord Developer Portal intents: Server Members, Message Content และ Voice States
4. เชิญบอทด้วย scopes `bot` และ `applications.commands`
5. ให้สิทธิ์ View Channels, Send Messages, Embed Links, Attach Files, Read Message History และ Manage Roles
6. วาง Role ของบอทเหนือ Role ที่จะให้บอทจัดการ
7. กำหนดสิทธิ์คำสั่ง `/feature` ให้เฉพาะผู้ดูแลจาก Server Settings → Integrations

รันบอทเพียงชุดเดียวใช้ได้หลายเซิร์ฟเวอร์ ค่าห้อง Role สถานะฟีเจอร์ XP และ Giveaway แยกตามเซิร์ฟเวอร์ทั้งหมดใน PostgreSQL และคงอยู่หลังรีสตาร์ต

เซิร์ฟเวอร์ใหม่เริ่มปิดทุกฟีเจอร์ เซิร์ฟเวอร์เดิมที่ระบุใน `DISCORD_GUILD_ID` จะนำค่าห้อง/เกณฑ์ยศจาก `.env` เข้าฐานข้อมูลครั้งเดียว พร้อมรักษาสถานะฟีเจอร์เดิม หลังจากนั้นแก้จาก `/feature` เท่านั้น (การแก้ `.env` ไม่เขียนทับค่าที่บันทึกแล้ว)

สวิตช์ Giveaway ที่เพิ่มใหม่จะเริ่มปิด หากเซิร์ฟเวอร์เดิมยังไม่มีห้อง Giveaway ต้องเลือกห้องก่อนเปิด

## ตั้งค่าจาก Discord

คำสั่งตอบกลับส่วนตัวเฉพาะผู้สั่ง ใช้ได้ทุกแชแนลตามสิทธิ์ที่กำหนดใน Discord Integration ไม่มีรายการผู้ดูแล hard-code ในบอท **ต้องจำกัด `/feature` และ `/giveaway` ให้ผู้ดูแลใน Server Settings → Integrations** ก่อนเชิญผู้ใช้งานทั่วไป

### ห้องประกาศและการเปิดฟีเจอร์

ตัวอย่างเลือกห้องก่อนเปิดประกาศ Level Up:

```text
/feature channel feature:level_up channel:#ข้อมูลสมาชิก
/feature on feature:level_up
/feature status
```

- `member_welcome`: ต้อนรับสมาชิกใหม่ ต้องระบุห้องข้อความ
- `member_leave`: สมาชิกออกจากเซิร์ฟเวอร์ ต้องระบุห้องข้อความ
- `level_up`: ประกาศทุกครั้งที่เลเวลเพิ่ม ต้องระบุห้องข้อความ
- `rank_roles`: มอบยศและประกาศ ต้องระบุห้องข้อความและเกณฑ์ยศอย่างน้อยหนึ่งรายการ
- `giveaway`: สร้าง/เข้าร่วมกิจกรรม ต้องระบุห้องข้อความ
- `stream_start`: ประกาศเริ่มแชร์จอ/Go Live แบบ Components V2 พร้อมภาพและปุ่มลิงก์ตรง ต้องระบุห้องข้อความ (ต้องมี Embed Links และ Attach Files)
- `stream_role`: Role ชั่วคราวของผู้สตรีม ตั้งด้วย `/feature stream-active-role role:@Role` ก่อนเปิด บอทต้องมี Manage Roles และอยู่เหนือ Role เป้าหมาย ห้ามใช้ Role เดียวกับยศเลเวล
- `stream_xp`: โบนัส Talk XP ×3 ของผู้สตรีม ไม่มีห้องที่ต้องกรอก แต่ต้องเปิด `talk_xp` จึงจะมีการเก็บ XP
- `voice_join`, `voice_leave`: ค่าเริ่มต้นส่งในแชทของห้องเสียงนั้น ไม่ต้องระบุห้องรวม แต่บอทต้องส่งข้อความได้ หากต้องการห้องรวมใช้ `/feature channel`
- `chat_xp`, `talk_xp`: เก็บ XP ไม่มีห้องประกาศที่ต้องกรอก

บอทตรวจสิทธิ์ส่งข้อความ Embed/ไฟล์ตามฟีเจอร์ และลำดับ Role ก่อนอนุญาตให้เปิด ถ้าข้อมูลขาดจะบอกสิ่งที่ต้องตั้ง ไม่เปิดให้เอง

`/feature off feature:...` ปิดได้ทันที หากต้องการล้างห้องให้ปิดก่อนแล้วใช้ `/feature clear-channel feature:...` ค่าที่ตั้งไว้ยังอยู่เมื่อปิดฟีเจอร์ การปิด Giveaway หยุดสร้างและลงชื่อใหม่ แต่กิจกรรมเดิมยังจบตามเวลา และยังใช้ status/end ได้

### เกณฑ์เลื่อนยศ

```text
/feature channel feature:rank_roles channel:#ข้อมูลสมาชิก
/feature rank-set role:@Crew chat_level:2 talk_level:5 priority:1 mode:AND
/feature rank-set role:@เด็กหัดเดิน chat_level:10 talk_level:10 priority:2 mode:AND
/feature ranks
/feature on feature:rank_roles
```

- `role`: เลือก Role ของเซิร์ฟเวอร์นี้ ต้องอยู่ต่ำกว่า Role บอทและไม่ใช่ Role ระบบ
- `chat_level`: 0–100, `talk_level`: 0–30; **0 = ไม่ใช้เงื่อนไขนั้น** ห้าม 0 ทั้งคู่
- `mode:AND` (ค่าเริ่มต้น): ต้องผ่านทุกเงื่อนไขที่มากกว่า 0; `OR`: ผ่านอย่างใดอย่างหนึ่ง
- `priority`: 1–1000 ไม่ซ้ำกัน เลขมากคือยศสูงกว่า เลือกยศสูงสุดที่ผ่านเพียงหนึ่งยศ
- ตั้งได้ 25 ยศต่อเซิร์ฟเวอร์ เลือก Role เดิมเพื่อแก้เกณฑ์ ไม่จำเป็นต้องเรียงเลขติดกัน
- จะตรวจยศเมื่อได้รับ XP ครั้งถัดไป ไม่ไล่แก้ยศสมาชิกทั้งหมดทันที ต้องเปิด `chat_xp` หรือ `talk_xp` เพื่อให้เกิดการตรวจ
- เพิ่มยศใหม่สำเร็จก่อนลบยศเก่าที่อยู่ในชุดเกณฑ์นี้ ไม่แตะ Role อื่น หากเปลี่ยนเกณฑ์ให้สูงขึ้นอาจลด/ถอนยศที่จัดการเมื่อรับ XP ถัดไป
- `/feature rank-remove role:@...` ยกเลิกเกณฑ์ ไม่ลบ Role จาก Discord หรือถอนจากสมาชิก และหยุดจัดการ Role นั้น ถ้าเป็นเกณฑ์สุดท้ายต้องปิด `rank_roles` ก่อน
- เกณฑ์เดิมนำเข้าโดยใช้ `RANK_MODE` เดิม ไม่เปลี่ยนเป็น AND อัตโนมัติ

### ห้อง AFK

```text
/feature afk-add channel:ห้องพัก
/feature afk-remove channel:ห้องพัก
```

ห้อง AFK ที่ตั้งในเซิร์ฟเวอร์ Discord เองถูกยกเว้นอยู่แล้ว ห้องที่เพิ่มในรายการจะไม่รับ Talk XP และไม่ประกาศเข้า/ออกห้องเสียง

### โบนัสสตรีมและประกาศ

```text
/feature on feature:talk_xp
/feature on feature:stream_xp
/feature channel feature:stream_start channel:#ประกาศสตรีม
/feature on feature:stream_start
/feature stream-role role:@แจ้งเตือนสตรีม
```

- ค่าเริ่มต้นสองฟีเจอร์นี้ปิดสำหรับเซิร์ฟเวอร์ที่ยังไม่เคยตั้ง ไม่เปิดให้ทุกเซิร์ฟเวอร์โดยอัตโนมัติ
- ตรวจสถานะแชร์จอ/Go Live ของสมาชิกแต่ละคนตอนรอบเก็บ XP ทุก 1 นาที เริ่มสตรีมได้ ×3 หยุดสตรีมกลับเป็นอัตราปกติ โดยไม่ต้องเรียกคำสั่งเอง
- ผู้ชมไม่ได้โบนัส แม้จะอยู่ห้องเดียวกันหรือเปิดกล้อง ผู้สตรีมยังต้องผ่านเงื่อนไข Talk XP เดิม เช่น ไม่อยู่ AFK และมีคนจริงอย่างน้อย 2 คนในห้อง
- ยังสูงสุดรวม 240 Talk XP/วัน ไม่ใช่ 720 XP และไม่คูณเวลาที่บันทึก: 1 นาทีอยู่ห้องเสียงยังนับเป็น 1 นาที จึงได้ XP เต็มวันเร็วขึ้นแต่เลเวลสูงสุดยังต้องเก็บอย่างน้อย 120 วันตามเพดานเดิม
- ปิดโบนัสด้วย `/feature off feature:stream_xp` และปิดประกาศด้วย `/feature off feature:stream_start` แยกกันได้
- ประกาศเมื่อเปลี่ยนจากไม่สตรีมเป็นสตรีมเท่านั้น ไม่ประกาศเมื่อหยุด ปิด/เปิดไมค์ ย้ายห้องขณะยังสตรีม หรือรีสตาร์ตบอทแล้วพบคนที่สตรีมอยู่แล้ว
- `/feature stream-role role:@...` เลือก Role ที่จะถูกแท็กเหนือการ์ดประกาศ เฉพาะเซิร์ฟเวอร์นี้ ถ้าไม่ระบุ `role` จะยกเลิกแท็ก ไม่เปลี่ยนสถานะประกาศหรือโบนัส XP
- โพสเริ่มด้วย Display Name และชื่อห้องแบบไม่แท็ก พร้อมแท็ก Role บรรทัดเดียวกัน คอนเทนเนอร์สีชมพูมีรูปสมาชิก ภาพประกาศ และปุ่ม “ดูไลฟ์” ลิงก์ตรงไปห้องเสียง ปุ่มเป็น Link มาตรฐาน Discord (ไม่ใช่ปุ่มแดงที่ต้องโต้ตอบก่อน)
- `/feature stream-active-role role:@...` ตั้ง Role ชั่วคราว แล้ว `/feature on feature:stream_role` เพื่อเปิด เมื่อหยุดสตรีม/ออกห้อง/ปิดฟีเจอร์ บอทถอนเฉพาะ Role ที่บอทมอบให้ โดยบันทึกความเป็นเจ้าของในฐานข้อมูลเพื่อคืนสถานะหลังรีสตาร์ต ไม่ถอน Role ที่มีอยู่ก่อนด้วยการมอบเอง ฟีเจอร์นี้แยกจาก Role ที่แท็กในประกาศ
- Level Up ใช้ข้อความหัวข้อ → ภาพ 1200×400 → footer ไม่มี Container ภาพใช้เทมเพลตต้นฉบับ พร้อม Display Name รูปสมาชิก และเลขเก่า → ใหม่ แยก Chat/Talk ไม่เปลี่ยนการ์ด Rank หรือ Welcome
- Role ต้องมี Allow anyone to mention this role หรือบอทมีสิทธิ์ Mention Everyone ในห้องประกาศ บอทอนุญาตให้แจ้งเตือนเฉพาะ Role ที่เลือก ไม่แท็ก @everyone, @here, Role อื่น หรือผู้สตรีม
- บอทไม่ทราบว่าใครกดดูสตรีม ไม่ได้ดึงภาพหรือเนื้อหาสตรีม มีเพียงชื่อสมาชิก รูปโปรไฟล์ และห้องเสียงในประกาศ

หากย้ายโปรเจกต์ไปไว้ข้างไฟล์ `Discord Token.txt` เดิม สามารถนำค่าเดิมเข้ามาโดยไม่พิมพ์ secret บนหน้าจอ:

```sh
pnpm config:import
```

สคริปต์จะสร้าง `.env` สิทธิ์ `600` และจะไม่เขียนทับ `.env` ที่มีอยู่

ติดตั้งและตรวจ:

```sh
pnpm install
pnpm check
pnpm build
pnpm test
pnpm db:migrate
pnpm dev
```

รันด้วย Docker:

```sh
docker compose up -d --build
docker compose logs -f bot
```

## n8n

n8n เชื่อม PostgreSQL ด้วยผู้ใช้แบบอ่านอย่างเดียว แล้วอ่าน view `member_leaderboard` เพื่อทำรายงาน ไม่ควรนำ Bot Token เข้า n8n

ตัวอย่างข้อมูลอันดับรายวัน:

```sql
SELECT display_name, message_level, voice_level, message_count, voice_minutes
FROM member_leaderboard
WHERE guild_id = $1
ORDER BY message_level DESC, message_xp DESC
LIMIT 10;
```

## ข้อมูลสำหรับเครื่องรัน

- `DISCORD_TOKEN` และ `DATABASE_URL` จำเป็นสำหรับรันบอท
- `TZ` กำหนดการนับโควตา XP ต่อวัน
- ตัวแปรห้อง/Role ใน `.env` เป็นข้อมูลนำเข้าของเซิร์ฟเวอร์เดิมเท่านั้น เซิร์ฟเวอร์อื่นตั้งจาก `/feature`

เก็บ Bot Token และรหัสฐานข้อมูลใน `.env` บนเครื่องรันเท่านั้น
