import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ProxyProtocol { HTTP = 'http', HTTPS = 'https', SOCKS5 = 'socks5' }

@Entity('proxies')
export class Proxy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  host: string;

  @Column()
  port: number;

  @Column({ nullable: true })
  username: string;

  @Column({ nullable: true })
  password: string;

  @Column({ type: 'enum', enum: ProxyProtocol, default: ProxyProtocol.HTTP })
  protocol: ProxyProtocol;

  @Column({ nullable: true, length: 10 })
  country: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_used', nullable: true, type: 'timestamptz' })
  lastUsed: Date;

  @Column({ name: 'fail_count', default: 0 })
  failCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
