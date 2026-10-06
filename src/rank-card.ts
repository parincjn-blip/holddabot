import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import type { GuildMember } from 'discord.js';
import { messageXpForLevel, voiceXpForLevel } from './constants.js';
import type { MemberStats } from './xp.js';

const width = 2172;
const height = 724;
const fontPath = fileURLToPath(new URL('../assets/fonts/NotoSansThaiLooped.ttf', import.meta.url));
const templatePath = new URL('../assets/rank-card-template.png', import.meta.url);
const registeredFont = existsSync(fontPath) && GlobalFonts.registerFromPath(fontPath, 'RankCard');
const fontFamily = registeredFont ? 'RankCard' : 'sans-serif';
type CanvasContext = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

function roundedRect(context: CanvasContext, x: number, y: number, boxWidth: number, boxHeight: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, boxWidth, boxHeight, radius);
}

function drawSpeechIcon(context: CanvasContext, x: number, y: number) {
  context.save();
  context.strokeStyle = '#9dffff';
  context.fillStyle = '#9dffff';
  context.lineWidth = 9;
  context.beginPath();
  context.roundRect(x + 24, y + 26, 72, 58, 22);
  context.stroke();
  context.beginPath();
  context.moveTo(x + 45, y + 83);
  context.lineTo(x + 38, y + 103);
  context.lineTo(x + 62, y + 84);
  context.stroke();
  for (const offset of [45, 61, 77]) {
    context.beginPath();
    context.arc(x + offset, y + 55, 5, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawMicrophoneIcon(context: CanvasContext, x: number, y: number) {
  context.save();
  context.strokeStyle = '#ffd5ff';
  context.lineWidth = 9;
  context.lineCap = 'round';
  context.beginPath();
  context.roundRect(x + 44, y + 20, 36, 66, 18);
  context.stroke();
  context.beginPath();
  context.arc(x + 62, y + 64, 39, 0, Math.PI, false);
  context.stroke();
  context.beginPath();
  context.moveTo(x + 62, y + 103);
  context.lineTo(x + 62, y + 119);
  context.moveTo(x + 43, y + 119);
  context.lineTo(x + 81, y + 119);
  context.stroke();
  context.restore();
}

function formatXp(value: number): string {
  return value.toLocaleString('en-US');
}

export async function createRankCard(member: GuildMember, stats: MemberStats | null): Promise<Buffer> {
  const avatarRequest = fetch(member.displayAvatarURL({ extension: 'png', size: 512 }));
  const [template, avatarResponse] = await Promise.all([loadImage(templatePath), avatarRequest]);
  if (!avatarResponse.ok) throw new Error(`Avatar request failed with status ${avatarResponse.status}`);
  const avatar = await loadImage(Buffer.from(await avatarResponse.arrayBuffer()));

  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.drawImage(template, 0, 0, width, height);

  // The layout was authored against the 2048 x 683 preview of the supplied
  // 2172 x 724 artwork. Scale every overlay back to the original pixel size.
  context.save();
  context.scale(width / 2048, height / 683);

  const avatarX = 345;
  const avatarY = 312;
  // The supplied reference contains a sample avatar. Cover the complete sample
  // area before drawing the member avatar so none of it can bleed around the edge.
  context.beginPath();
  context.arc(avatarX, avatarY, 200, 0, Math.PI * 2);
  context.fillStyle = '#ffffff';
  context.fill();

  const avatarRadius = 184;
  context.save();
  context.beginPath();
  context.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
  context.clip();
  context.drawImage(avatar, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
  context.restore();
  context.beginPath();
  context.arc(avatarX, avatarY, avatarRadius + 7, 0, Math.PI * 2);
  context.lineWidth = 14;
  context.strokeStyle = '#ffffff';
  context.stroke();

  const namePanel = { x: 548, y: 101, width: 1298, height: 112 };
  // Redraw the whole panel, not only its inset, to remove the sample name.
  roundedRect(context, namePanel.x, namePanel.y, namePanel.width, namePanel.height, 34);
  const nameGradient = context.createLinearGradient(namePanel.x, namePanel.y, namePanel.x + namePanel.width, namePanel.y);
  nameGradient.addColorStop(0, '#4a173d');
  nameGradient.addColorStop(1, '#3a193f');
  context.fillStyle = nameGradient;
  context.fill();
  context.strokeStyle = '#ff9dbc';
  context.lineWidth = 4;
  context.stroke();
  context.strokeStyle = 'rgba(255, 100, 105, 0.38)';
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(1360, 198);
  context.lineTo(1740, 110);
  context.stroke();

  context.fillStyle = '#ffffff';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.shadowColor = 'rgba(24, 0, 28, 0.6)';
  context.shadowBlur = 8;
  context.shadowOffsetY = 4;
  let nameSize = 78;
  do {
    context.font = `700 ${nameSize}px "${fontFamily}"`;
    if (context.measureText(member.displayName).width <= namePanel.width - 105 || nameSize <= 42) break;
    nameSize -= 2;
  } while (nameSize > 42);
  context.fillText(member.displayName, namePanel.x + 53, namePanel.y + 57);
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;

  const messageXp = Number(stats?.message_xp ?? 0);
  const talkXp = Number(stats?.voice_xp ?? 0);
  const rows = [
    {
      y: 230,
      label: 'Chat Level',
      level: stats?.message_level ?? 0,
      rank: stats?.message_rank ?? '-',
      xp: messageXp,
      maximumLevel: 100,
      xpForLevel: messageXpForLevel,
      accent: '#24e9f2',
      darkAccent: '#073e69',
      icon: drawSpeechIcon,
    },
    {
      y: 415,
      label: 'Talk Level',
      level: stats?.voice_level ?? 0,
      rank: stats?.voice_rank ?? '-',
      xp: talkXp,
      maximumLevel: 30,
      xpForLevel: voiceXpForLevel,
      accent: '#ef4cff',
      darkAccent: '#67177a',
      icon: drawMicrophoneIcon,
    },
  ] as const;

  for (const row of rows) {
    const rowX = 562;
    const rowWidth = 1325;
    const rowHeight = 162;
    // Opaque full-size panel masks every piece of the reference's sample data.
    roundedRect(context, rowX, row.y, rowWidth, rowHeight, 30);
    const rowGradient = context.createLinearGradient(rowX, row.y, rowX + rowWidth, row.y);
    rowGradient.addColorStop(0, '#26103e');
    rowGradient.addColorStop(1, '#38133e');
    context.fillStyle = rowGradient;
    context.fill();
    context.strokeStyle = '#ff9dbc';
    context.lineWidth = 4;
    context.stroke();

    const iconX = 593;
    const iconY = row.y + 18;
    roundedRect(context, iconX, iconY, 128, 128, 24);
    const iconGradient = context.createLinearGradient(0, iconY, 0, iconY + 128);
    iconGradient.addColorStop(0, row.darkAccent);
    iconGradient.addColorStop(1, '#25113c');
    context.fillStyle = iconGradient;
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = row.accent;
    context.stroke();
    row.icon(context, iconX, iconY);

    context.strokeStyle = row.accent;
    context.globalAlpha = 0.72;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(747, row.y + 19);
    context.lineTo(747, row.y + 142);
    context.moveTo(1260, row.y + 19);
    context.lineTo(1260, row.y + 90);
    context.stroke();
    context.globalAlpha = 1;

    context.fillStyle = '#ffffff';
    context.font = `700 46px "${fontFamily}"`;
    context.fillText(row.label, 781, row.y + 47);
    const labelWidth = context.measureText(row.label).width;
    context.fillStyle = row.accent;
    context.fillText(String(row.level), 795 + labelWidth, row.y + 47);
    context.fillStyle = '#ffffff';
    context.font = `700 32px "${fontFamily}"`;
    context.fillText(`Rank #${row.rank}`, 781, row.y + 94);
    context.font = `700 36px "${fontFamily}"`;
    context.fillText(`Total ${formatXp(row.xp)} XP`, 1310, row.y + 44);

    const levelStart = row.xpForLevel(row.level);
    const atMaximum = row.level >= row.maximumLevel;
    const levelEnd = atMaximum ? levelStart : row.xpForLevel(row.level + 1);
    const earnedThisLevel = Math.max(0, row.xp - levelStart);
    const requiredThisLevel = Math.max(0, levelEnd - levelStart);
    const progress = atMaximum || requiredThisLevel <= 0
      ? 1
      : Math.max(0, Math.min(1, earnedThisLevel / requiredThisLevel));
    context.fillStyle = '#d8d0e4';
    context.font = `400 30px "${fontFamily}"`;
    context.fillText(
      atMaximum
        ? 'MAX LEVEL'
        : `${formatXp(earnedThisLevel)} / ${formatXp(requiredThisLevel)} XP`,
      1310,
      row.y + 88,
    );

    const barX = 781;
    const barY = row.y + 112;
    const barWidth = 1032;
    const barHeight = 33;
    roundedRect(context, barX, barY, barWidth, barHeight, 17);
    context.fillStyle = '#2a2044';
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = '#a378b4';
    context.stroke();
    if (progress > 0) {
      roundedRect(context, barX + 3, barY + 3, Math.max(28, (barWidth - 6) * progress), barHeight - 6, 14);
      const progressGradient = context.createLinearGradient(barX, 0, barX + barWidth, 0);
      progressGradient.addColorStop(0, '#ffffff');
      progressGradient.addColorStop(0.08, row.accent);
      progressGradient.addColorStop(1, row.accent);
      context.fillStyle = progressGradient;
      context.fill();
    }
  }

  context.restore();
  return canvas.toBuffer('image/png');
}
