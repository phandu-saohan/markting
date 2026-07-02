import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Proxy } from '../../proxies/entities/proxy.entity';

export enum PlatformType {
  FACEBOOK = 'facebook', ZALO = 'zalo', TIKTOK = 'tiktok',
  YOUTUBE = 'youtube', EMAIL = 'email',
}
export enum AccountType {
  PERSONAL = 'personal', FANPAGE = 'fanpage', OA = 'oa', CHANNEL = 'channel',
}
export enum AccountStatus {
  ACTIVE = 'active', CHECKPOINT = 'checkpoint', BANNED = 'banned', EXPIRED = 'expired',
}

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (u) => u.accounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: PlatformType })
  platform: PlatformType;

  @Column({ name: 'account_type', type: 'enum', enum: AccountType, default: AccountType.PERSONAL })
  accountType: AccountType;

  @Column({ nullable: true })
  label: string;

  @Column({ nullable: true })
  username: string;

  @Column({ type: 'text', nullable: true })
  cookies: string;           // AES-256-GCM encrypted

  @Column({ name: 'access_token', type: 'text', nullable: true })
  accessToken: string;       // AES-256-GCM encrypted

  @Column({ name: 'refresh_token', type: 'text', nullable: true })
  refreshToken: string;

  @Column({ name: 'token_expires', nullable: true, type: 'timestamptz' })
  tokenExpires: Date;

  @Column({ name: 'proxy_id', nullable: true })
  proxyId: string;

  @ManyToOne(() => Proxy, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'proxy_id' })
  proxy: Proxy;

  @Column({ type: 'enum', enum: AccountStatus, default: AccountStatus.ACTIVE })
  status: AccountStatus;

  @Column({ type: 'jsonb', default: {} })
  meta: Record<string, any>;  // page_id, oa_id, channel_id...

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
