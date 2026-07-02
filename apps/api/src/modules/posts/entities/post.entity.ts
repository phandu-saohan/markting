import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Campaign } from '../../campaigns/entities/campaign.entity';

export enum PostStatus {
  DRAFT = 'draft', SCHEDULED = 'scheduled', QUEUED = 'queued',
  POSTED = 'posted', FAILED = 'failed',
}
export enum PostPlatform {
  FB_GROUP = 'facebook_group', FB_FANPAGE = 'facebook_fanpage',
  ZALO_OA = 'zalo_oa', ZALO_PERSONAL = 'zalo_personal',
  TIKTOK = 'tiktok', YOUTUBE = 'youtube', REELS = 'reels',
}
export enum MediaType { NONE = 'none', IMAGE = 'image', VIDEO = 'video' }

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (u) => u.posts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'campaign_id', nullable: true })
  campaignId: string;

  @ManyToOne(() => Campaign, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @Column({ nullable: true })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'media_urls', type: 'text', array: true, nullable: true })
  mediaUrls: string[];

  @Column({ name: 'media_type', type: 'enum', enum: MediaType, default: MediaType.NONE })
  mediaType: MediaType;

  @Column({ type: 'enum', enum: PostPlatform })
  platform: PostPlatform;

  @Column({ type: 'text', array: true, nullable: true })
  hashtags: string[];

  @Column({ type: 'enum', enum: PostStatus, default: PostStatus.DRAFT })
  status: PostStatus;

  @Column({ name: 'scheduled_at', nullable: true, type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ name: 'posted_at', nullable: true, type: 'timestamptz' })
  postedAt: Date;

  @Column({ name: 'error_log', type: 'text', nullable: true })
  errorLog: string;

  @Column({ name: 'external_post_id', nullable: true })
  externalPostId: string;

  @Column({ type: 'jsonb', default: {} })
  meta: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
