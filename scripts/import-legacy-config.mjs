import { chmod, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

const source = new URL('../Discord Token.txt', import.meta.url);
const destination = new URL('../.env', import.meta.url);

try {
  await access(destination, constants.F_OK);
  throw new Error('.env already exists; refusing to overwrite it');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const text = await readFile(source, 'utf8');
const values = new Map();
const roleMap = new Map([
  ['Crew', 'ROLE_CREW_ID'],
  ['เด็กหัดเดิน', 'ROLE_WALKER_ID'],
  ['เด็กอนุบาล', 'ROLE_KINDERGARTEN_ID'],
  ['เด็กประถม', 'ROLE_PRIMARY_ID'],
  ['รุ่นพี่มัธยม', 'ROLE_HIGH_SCHOOL_ID'],
  ['อาจารย์ที่ปรึกษา', 'ROLE_ADVISOR_ID'],
  ['อาจารย์พิเศษ', 'ROLE_SPECIAL_TEACHER_ID'],
  ['รองผู้อำนวยการ', 'ROLE_DEPUTY_DIRECTOR_ID'],
  ['ผู้อำนวยการสถาบัน', 'ROLE_DIRECTOR_ID'],
]);

for (const rawLine of text.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line) continue;
  const labeled = line.match(/^(.+?)\s*:\s*(.+)$/);
  if (labeled) {
    const [, label, value] = labeled;
    if (/^bot token$/i.test(label.trim())) values.set('DISCORD_TOKEN', value.trim());
    else if (/^Server ID$/i.test(label.trim())) values.set('DISCORD_GUILD_ID', value.trim());
    else if (label.includes('สมาชิกเข้าใหม่-ออก')) values.set('MEMBER_LOG_CHANNEL_ID', value.trim());
    else if (label.includes('ได้รับ ยศ')) values.set('LEVEL_UP_CHANNEL_ID', value.trim());
    else if (label.includes('สถานะเลเวล')) values.set('LEVEL_STATUS_CHANNEL_ID', value.trim());
    continue;
  }
  const role = line.match(/^(.+?)\s*\|\s*(\d{17,20})$/);
  if (role) {
    const envName = roleMap.get(role[1].trim());
    if (envName) values.set(envName, role[2]);
  }
}

const required = ['DISCORD_TOKEN', 'DISCORD_GUILD_ID'];
for (const key of required) {
  if (!values.get(key)) throw new Error(`Missing ${key} in Discord Token.txt`);
}

const orderedKeys = [
  'DISCORD_TOKEN', 'DATABASE_URL', 'DISCORD_GUILD_ID',
  'MEMBER_LOG_CHANNEL_ID', 'LEVEL_UP_CHANNEL_ID', 'LEVEL_STATUS_CHANNEL_ID',
  'GIVEAWAY_CHANNEL_ID', 'AFK_CHANNEL_IDS',
  ...roleMap.values(), 'RANK_MODE', 'TZ',
];
values.set('DATABASE_URL', '');
values.set('GIVEAWAY_CHANNEL_ID', '');
values.set('AFK_CHANNEL_IDS', '');
values.set('RANK_MODE', 'OR');
values.set('TZ', 'Asia/Bangkok');

const output = orderedKeys.map((key) => `${key}=${values.get(key) ?? ''}`).join('\n') + '\n';
await writeFile(destination, output, { encoding: 'utf8', mode: 0o600 });
await chmod(destination, 0o600);
console.log(`Created .env with ${Array.from(values.values()).filter(Boolean).length} populated settings; secret values were not printed.`);
