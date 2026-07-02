import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Account } from '../../accounts/entities/account.entity';
import { Campaign } from '../../campaigns/entities/campaign.entity';
import { Post } from '../../posts/entities/post.entity';

export enum UserRole { ADMIN = 'admin', USER = 'user' }
export enum UserPlan { FREE = 'free', PRO = 'pro', ENTERPRISE = 'enterprise' }

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  @Exclude()
  password: string;

  @Column({ name: 'full_name', nullable: true })
  fullName: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ type: 'enum', enum: UserPlan, default: UserPlan.FREE })
  plan: UserPlan;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => Account, (a) => a.user)
  accounts: Account[];

  @OneToMany(() => Campaign, (c) => c.user)
  campaigns: Campaign[];

  @OneToMany(() => Post, (p) => p.user)
  posts: Post[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
