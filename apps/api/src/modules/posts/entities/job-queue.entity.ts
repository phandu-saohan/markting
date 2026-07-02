import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Post } from './post.entity';
import { Campaign } from '../../campaigns/entities/campaign.entity';
import { Account } from '../../accounts/entities/account.entity';
import { Group } from '../../groups/entities/group.entity';

export enum JobStatus {
  WAITING = 'waiting', ACTIVE = 'active', COMPLETED = 'completed',
  FAILED = 'failed', DELAYED = 'delayed', PAUSED = 'paused',
}

@Entity('job_queues')
export class JobQueue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', nullable: true })
  postId: string;

  @ManyToOne(() => Post, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Column({ name: 'campaign_id', nullable: true })
  campaignId: string;

  @ManyToOne(() => Campaign, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @Column({ name: 'account_id', nullable: true })
  accountId: string;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ name: 'group_id', nullable: true })
  groupId: string;

  @ManyToOne(() => Group, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ name: 'queue_name' })
  queueName: string;

  @Column({ name: 'bull_job_id', nullable: true })
  bullJobId: string;

  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.WAITING })
  status: JobStatus;

  @Column({ default: 0 })
  attempts: number;

  @Column({ name: 'max_attempts', default: 3 })
  maxAttempts: number;

  @Column({ name: 'scheduled_at', nullable: true, type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ name: 'started_at', nullable: true, type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'finished_at', nullable: true, type: 'timestamptz' })
  finishedAt: Date;

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
