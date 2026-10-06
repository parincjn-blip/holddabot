import { createHash, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';
export const randomToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token:string) => createHash('sha256').update(token).digest('hex');
export function equalTokens(a:string,b:string):boolean {
  const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y);
}
export function encryptToken(value:string,secret:string):string {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(secret,'hex'),iv);
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
export function decryptToken(value:string,secret:string):string {
  const buffer=Buffer.from(value,'base64url'),cipher=createDecipheriv('aes-256-gcm',Buffer.from(secret,'hex'),buffer.subarray(0,12));
  cipher.setAuthTag(buffer.subarray(12,28)); return Buffer.concat([cipher.update(buffer.subarray(28)),cipher.final()]).toString('utf8');
}
export function canManageGuild(guild:{owner?:boolean;permissions?:string}):boolean {
  try {const p=BigInt(guild.permissions ?? '0');return guild.owner===true || (p & (PermissionFlagsBits.Administrator|PermissionFlagsBits.ManageGuild))!==0n;} catch {return false;}
}
export function allowedMutation(origin: string|undefined, expected: string, token: string|undefined, actual: string):boolean {
  return origin===expected && !!token && equalTokens(token,actual);
}
