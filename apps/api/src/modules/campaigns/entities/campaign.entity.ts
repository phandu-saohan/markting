import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum CampaignPlatform {
  FACEBOOK = 'facebook', ZALO = 'zalo', TIKTOK = 'tiktok',
  YOUTUBE = 'youtube', EMAIL = 'email', MULTI = 'multi',
}
export enum CampaignStatus {
  DRAFT = 'draft', ACTIVE = 'active', PAUSED = 'paused', COMPLETED = 'completed',
}

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (u) => u.campaigns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: CampaignPlatform })
  platform: CampaignPlatform;

  @Column({ name: 'target_group_ids', type: 'uuid', array: true, default: [] })
  targetGroupIds: string[];

  @Column({ name: 'account_ids', type: 'uuid', array: true, default: [] })
  accountIds: string[];

  @Column({ name: 'schedule_config', type: 'jsonb', default: {} })
  scheduleConfig: Record<string, any>;

  @Column({ name: 'delay_min', default: 5 })
  delayMin: number;          // phút

  @Column({ name: 'delay_max', default: 15 })
  delayMax: number;          // phút

  @Column({ name: 'rotate_proxy', default: true })
  rotateProxy: boolean;

  @Column({ type: 'enum', enum: CampaignStatus, default: CampaignStatus.DRAFT })
  status: CampaignStatus;

  @Column({ name: 'start_at', nullable: true, type: 'timestamptz' })
  startAt: Date;

  @Column({ name: 'end_at', nullable: true, type: 'timestamptz' })
  endAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
