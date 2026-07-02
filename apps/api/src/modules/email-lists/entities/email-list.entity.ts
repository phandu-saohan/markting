import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, OneToMany, JoinColumn, Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('email_lists')
export class EmailList {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @OneToMany(() => EmailContact, (c) => c.list)
  contacts: EmailContact[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('email_contacts')
@Unique(['listId', 'email'])
export class EmailContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'list_id' })
  listId: string;

  @ManyToOne(() => EmailList, (l) => l.contacts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'list_id' })
  list: EmailList;

  @Column()
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ type: 'text', array: true, nullable: true })
  tags: string[];

  @Column({ name: 'custom_fields', type: 'jsonb', default: {} })
  customFields: Record<string, string>;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ default: false })
  unsubscribed: boolean;

  @Column({ default: false })
  bounced: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
