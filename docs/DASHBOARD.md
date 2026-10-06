# HoldDaBoT Template Studio

เว็บจัดการข้อความแยกแต่ละเซิร์ฟเวอร์: ต้อนรับ/สมาชิกออก, เข้า/ออกห้องเสียง, Chat/Talk Level Up, เลื่อนตำแหน่ง และเริ่มสตรีม

## วิธีใช้

1. เข้าหน้าเว็บและเลือก **เข้าสู่ระบบด้วย Discord**
2. เลือกเซิร์ฟเวอร์ที่ติดตั้งบอทแล้ว และคุณเป็นเจ้าของหรือมี Administrator / Manage Server
3. เลือกประเภทประกาศ แก้หัวข้อ/ข้อความ/ท้ายข้อความ และใช้ตัวแปรจากปุ่มด้านล่าง
4. ดูพรีวิว (ประมาณรูปแบบ ไม่ใช่การแสดงผลจริงจาก Discord) แล้วกดบันทึก
5. มีผลกับประกาศครั้งถัดไป ไม่เปลี่ยนข้อความเก่าหรือส่งข้อความทดสอบ
6. ใช้ค่าเริ่มต้น หรือเลือกเวอร์ชันจากประวัติเพื่อคืนข้อความได้ การคืนค่าจะสร้างเวอร์ชันใหม่

ตัวแปร: `{display_name}`, `{mention}`, `{guild_name}`, `{channel_name}`, `{time}`, `{emoji}`, `{old_level}`, `{new_level}`, `{chat_level}`, `{talk_level}`, `{role_name}` หน้าเว็บแสดงเฉพาะตัวแปรที่เกี่ยวกับเหตุการณ์นั้น และ API ปฏิเสธตัวแปรที่ไม่รองรับ

รูปภาพรับเฉพาะ HTTPS จาก `cdn.discordapp.com` / `media.discordapp.net` บอทไม่ดาวน์โหลด URL เหล่านี้เอง ลิงก์ attachment ของ Discord อาจหมดอายุ จึงแนะนำคงภาพเดิมไว้ เว้นแต่มีลิงก์ที่ใช้ได้ต่อเนื่อง รูปสมาชิกยังใช้ avatar จาก Discord

ข้อความที่อยู่ในไฟล์ภาพการ์ดไม่แก้จากหน้านี้ เช่น ชื่อสมาชิก/ตัวเลขบน Level Up card ยังสร้างจากข้อมูลจริงโดยบอท ไม่ใช่เครื่องมือ drag-and-drop ออกแบบภาพ

### ได้รับยศ · การ์ดสมาชิก

- พรีวิวเลือกดูการ์ดต้นฉบับได้ทั้ง 9 ยศ การเลือกนี้ไม่เปลี่ยน Role หรือเงื่อนไขเลื่อนยศจริง
- ใช้ renderer เดียวกับบอท: background เดิม → รูปโปรไฟล์ → overlay เดิม → Display Name ตามพิกัดในชุด
- พรีวิวใช้ชื่อและรูปบัญชีที่ล็อกอิน ใช้งานจริงบอทใช้ Display Name ในเซิร์ฟเวอร์และรูปของสมาชิกที่ได้รับยศ
- ค่าเริ่มต้นส่งเฉพาะการ์ด เว้นหัวข้อ ข้อความและท้ายข้อความว่างได้ หากใส่ข้อความจะอยู่ภายนอกภาพ
- ไม่ใส่ Chat/Talk Level หรือ XP ลงในการ์ดยศ และไม่มีช่องเปลี่ยนภาพต้นฉบับหรือสีภายในภาพ
- API พรีวิวตรวจ session, สิทธิ์จัดการเซิร์ฟเวอร์และการติดตั้งบอทก่อนส่ง PNG ไม่เปิดไฟล์ภาพที่มีชื่อ/รูปบัญชีให้บุคคลที่ไม่ได้ล็อกอิน และไม่ส่งข้อความไป Discord

ดู [รายละเอียดและการตรวจต้นฉบับ](RANK_UP_CARDS.md)

ปุ่มดูไลฟ์ยังลิงก์ตรงห้องที่สตรีม Discord ไม่อนุญาตปุ่ม Link เป็นสีแดง จึงคง Link style ตามข้อจำกัดเดิม

## Deployment

- Source: `/Users/nnanatt/Documents/Disbot`
- Target: `hell-factory:/home/ai/services/disbot`
- DNS: A record `bot.hold-bet.com` → `165.245.178.197`
- URL: `https://bot.hold-bet.com`
- Discord OAuth redirect: `https://bot.hold-bet.com/auth/discord/callback`
- Services: existing `disbot.service` + separate `disbot-dashboard.service`
- Web listens only `127.0.0.1:8787`, HTTPS via a separate nginx virtual host. Existing hosts are not replaced.

Runtime secrets stay on the bot host: existing `.env` (bot/DB) and `.dashboard.env` (OAuth/session), mode 600. Never copy credentials from production to the Mac or commit them. Session encryption key must be 64 hexadecimal characters, generated on the server. Configure OAuth Client ID and Client Secret on the server; without them the public page stays in setup mode with API writes disabled. Register the exact redirect in Discord Developer Portal → OAuth2 → Redirects.

Build: `node node_modules/typescript/bin/tsc -p tsconfig.json`. Tests: `node --test tests/unit.test.mjs tests/dashboard.test.mjs tests/dashboard-http.test.mjs tests/rank-up-card.test.mjs`. Run isolated DB integration only on the bot host: `node tests/integration.mjs`. Back up code before staging/migrating. Migration 007 adds only template/history/session tables; it does not change XP, ranks or feature configuration. Apply with `node dist/migrate.js` before restarting.

Installing nginx configurations and service files requires privileged host access. HTTP challenge config is installed before obtaining the certificate; HTTPS config is enabled only after the certificate exists. Configuration must pass `nginx -t` before reload. No new firewall ports are required.

Verify after deployment: HTTP→HTTPS redirect, certificate hostname, landing assets/CSP, `/healthz`, loopback-only port, both systemd services active and no restart loop, configuration digest unchanged. Complete real OAuth acceptance when the application owner has configured the secret and redirect; test login, managed-guild filtering, save, next-event rendering, history/reset and logout without exposing credentials. OAuth tokens are AES-256-GCM encrypted in PostgreSQL, sessions expire within 12 hours, cookies are HttpOnly/Secure/SameSite=Lax. Each request checks Discord permissions and bot membership. Mutations require exact Origin + session CSRF token. Stale template revisions return 409.

Rollback: restore the exact pre-deploy code archive, restart the original bot, stop/disable the dashboard service and remove only its dedicated nginx symlinks/configs after validation. The additive migration can remain, preserving audit history. Never drop unrelated tables or reset XP. Restore session key only from protected host-local backup; rotating it requires revoking existing dashboard sessions.
