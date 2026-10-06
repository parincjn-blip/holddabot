import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import type { GuildMember } from 'discord.js';

const templatePath = new URL('../assets/welcome-card.png', import.meta.url);
const bundledFontPath = fileURLToPath(new URL('../assets/fonts/NotoSansThaiLooped.ttf', import.meta.url));
const registeredFont = existsSync(bundledFontPath)
  && GlobalFonts.registerFromPath(bundledFontPath, 'WelcomeCard');
const fontFamily = registeredFont ? 'WelcomeCard' : 'sans-serif';

export async function createWelcomeCard(member: GuildMember): Promise<Buffer> {
  const [template, avatarResponse] = await Promise.all([
    loadImage(templatePath),
    fetch(member.displayAvatarURL({ extension: 'png', size: 512 })),
  ]);
  if (!avatarResponse.ok) throw new Error(`Avatar request failed with status ${avatarResponse.status}`);
  const avatar = await loadImage(Buffer.from(await avatarResponse.arrayBuffer()));

  const canvas = createCanvas(template.width, template.height);
  const context = canvas.getContext('2d');
  context.drawImage(template, 0, 0, canvas.width, canvas.height);

  const avatarX = 454;
  const avatarY = 348;
  const avatarRadius = 164;
  context.save();
  context.beginPath();
  context.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
  context.closePath();
  context.clip();
  context.drawImage(avatar, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
  context.restore();
  context.beginPath();
  context.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
  context.lineWidth = 12;
  context.strokeStyle = '#ffffff';
  context.stroke();

  context.fillStyle = '#ffffff';
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.shadowColor = 'rgba(54, 0, 96, 0.45)';
  context.shadowBlur = 8;
  context.shadowOffsetY = 3;

  let displayNameSize = 70;
  do {
    context.font = `700 ${displayNameSize}px "${fontFamily}"`;
    if (context.measureText(member.displayName).width <= 690 || displayNameSize <= 42) break;
    displayNameSize -= 2;
  } while (displayNameSize > 42);
  context.fillText(member.displayName, 680, 386);

  context.font = `700 50px "${fontFamily}"`;
  context.fillText(member.guild.memberCount.toLocaleString('en-US'), 946, 470);

  return canvas.toBuffer('image/png');
}
