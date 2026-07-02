import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum GroupPrivacy { PUBLIC = 'public', PRIVATE = 'private', CLOSED = 'closed' }

@Entity('groups')
@Unique(['userId', 'platform', 'groupId'])
export class Group {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ default: 'facebook' })
  platform: string;

  @Column({ name: 'group_id' })
  groupId: string;           // Facebook/Zalo actual ID

  @Column({ name: 'group_name', nullable: true })
  groupName: string;

  @Column({ name: 'member_count', nullable: true })
  memberCount: number;

  @Column({ type: 'enum', enum: GroupPrivacy, nullable: true, default: GroupPrivacy.PUBLIC })
  privacy: GroupPrivacy;

  @Column({ type: 'text', array: true, nullable: true })
  keywords: string[];

  @Column({ name: 'cover_image', nullable: true })
  coverImage: string;

  @Column({ name: 'last_scraped', nullable: true, type: 'timestamptz' })
  lastScraped: Date;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
