# เตรียม Disbot ขึ้น Git

## สถานะวันที่ 6 ตุลาคม 2026

- สร้าง local Git repository ที่โปรเจกต์แล้ว ใช้ branch `main`
- เตรียมไฟล์ด้วย allowlist 58 ไฟล์ รวมสรุปงานใน `docs/PROJECT_SUMMARY.md`
- ตรวจ staged paths แล้ว `.env`, `Discord Token.txt`, dependencies และไฟล์ build ไม่รวมอยู่ใน index
- ตรวจรูปแบบ secrets ในไฟล์ข้อความที่ staged 53 ไฟล์ ไม่พบ Discord/GitHub/Cloud tokens, private keys หรือรหัสผ่านฐานข้อมูลจริงตามกฎที่ตรวจ (ไม่ใช่การรับรองตรวจพบ secrets ได้ทุกประเภท)
- TypeScript type-check/build, unit tests 19 รายการ และการตรวจการ์ด Chat/Talk ผ่านในเครื่อง local
- ผู้ใช้ยืนยันปลายทาง `https://github.com/parincjn-blip/holddabot` แล้ว ใช้บัญชี `parincjn-blip` และ branch `main` repository เป็น Public
- Commit ต้นฉบับในเครื่องใช้ชื่อ `PR-KNC` และอีเมล GitHub noreply ของบัญชีที่ยืนยันแล้ว
- Git CLI ในเครื่องยังไม่ได้ authenticate สำหรับ push จึงเผยแพร่ผ่าน GitHub connector; commits ฝั่ง GitHub ใช้ metadata ผู้เขียนตามบัญชีที่เชื่อม ไม่ได้ใช้การตั้งค่า noreply ของ Git ในเครื่อง
- สถานะการเผยแพร่และ commit ที่ยืนยันแล้วให้ตรวจจาก Git history และ repository ปลายทาง
- ไม่ deploy ใหม่ ไม่ติดต่อฐานข้อมูล production และไม่คัดลอก credentials
- ไฟล์ license ฟอนต์ต้นฉบับมี trailing space หนึ่งบรรทัด จงใจเก็บไฟล์ต้นฉบับไว้ ไม่แก้เนื้อหา license

## สิ่งที่ควรอยู่ใน repository

โค้ด TypeScript, SQL migrations, เทมเพลตภาพ/ฟอนต์พร้อม license, tests, operational scripts ที่ไม่มี secrets, เอกสาร, package/lockfile และ `.env.example`

## สิ่งที่ต้องอยู่บนเครื่องเดิมเท่านั้น

- `.env`, Bot Token, `Discord Token.txt`, credentials และ authentication state
- database dump, ข้อมูลสมาชิกจริง, exports และ production logs
- private keys, certificates และ service-account credentials

`.gitignore` ยกเว้นรายการข้างต้น รวม `node_modules/`, `dist/`, `.pnpm-store/` และ metadata จาก macOS ควรใช้ allowlist ตอนเพิ่มไฟล์ และตรวจรายการ staged กับ secret scan ก่อน commit/push ทุกครั้ง

## ข้อมูลที่ต้องยืนยันก่อนส่งขึ้นออนไลน์

1. Repository URL หรือ owner/name ที่ต้องการใช้
2. บัญชี GitHub ที่ได้รับอนุญาตสำหรับ repository นั้น
3. ถ้าสร้างใหม่ ต้องยืนยัน Private/Public; แนะนำ Private
4. ชื่อและอีเมลผู้เขียน commit หากยังไม่ได้ตั้งใน Git หรือใช้ GitHub noreply ของบัญชีที่ยืนยันแล้ว

ห้ามเดาปลายทาง สร้าง public repository เอง หรือใช้ credentials จาก `.env` เพื่อส่งขึ้น Git

## การตรวจโดยไม่แตะ production

```sh
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.json
node --test tests/unit.test.mjs
node tests/render-level-up.mjs
```

Integration tests ต้องมี PostgreSQL และใช้ schema ทดสอบแยก ห้ามนำ production credentials มาใส่ในเอกสารหรือ Git การจัดทำสรุปและเตรียม Git ไม่ใช่การอนุญาตให้ deploy ใหม่หรือแก้ข้อมูล production
