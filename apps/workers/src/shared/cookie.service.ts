import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

@Injectable()
export class CookieService {
  private readonly logger = new Logger(CookieService.name);
  private readonly encryptionKey: Buffer;

  constructor() {
    const key = process.env.ENCRYPTION_KEY ?? '';
    if (key.length < KEY_LENGTH) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters');
    }
    // Derive a fixed-length key
    this.encryptionKey = crypto.scryptSync(key, 'marketing-salt', KEY_LENGTH);
  }

  /**
   * Mã hóa cookies trước khi lưu vào DB
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    // Format: iv:tag:ciphertext (base64)
    return [
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  /**
   * Giải mã cookies khi đọc từ DB
   */
  decrypt(encryptedText: string): string {
    const [ivB64, tagB64, encB64] = encryptedText.split(':');
    if (!ivB64 || !tagB64 || !encB64) {
      throw new Error('Invalid encrypted cookie format');
    }
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(encB64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  /**
   * Parse JSON cookies từ chuỗi đã mã hóa
   */
  decryptCookies(encryptedCookies: string): any[] {
    try {
      const json = this.decrypt(encryptedCookies);
      return JSON.parse(json);
    } catch (e) {
      this.logger.error(`Failed to decrypt cookies: ${e}`);
      return [];
    }
  }

  /**
   * Mã hóa mảng cookies thành chuỗi để lưu DB
   */
  encryptCookies(cookies: any[]): string {
    return this.encrypt(JSON.stringify(cookies));
  }
}
