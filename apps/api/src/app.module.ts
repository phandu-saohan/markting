import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { QueuesModule } from './queues/queues.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { ProxiesModule } from './modules/proxies/proxies.module';
import { GroupsModule } from './modules/groups/groups.module';
import { PostsModule } from './modules/posts/posts.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { EmailListsModule } from './modules/email-lists/email-lists.module';

import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    // ── Static Assets ────────────────────────────────────────────────
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api/(.*)', '/admin/(.*)'],
    }),
    // ── Config ──────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // ── Database ─────────────────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        database: config.get('DB_NAME', 'marketing_db'),
        username: config.get('DB_USER', 'postgres'),
        password: config.get('DB_PASS', 'postgres'),
        autoLoadEntities: true,
        synchronize: true,
        logging: false,
        ssl: config.get('DB_SSL') === 'true'
          ? { rejectUnauthorized: false }
          : false,
      }),
    }),

    // ── Redis / BullMQ ───────────────────────────────────────────────
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD') || undefined,
        },
        defaultJobOptions: {
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      }),
    }),

    // ── Feature Modules ──────────────────────────────────────────────
    QueuesModule,
    AuthModule,
    UsersModule,
    AccountsModule,
    ProxiesModule,
    GroupsModule,
    PostsModule,
    CampaignsModule,
    EmailListsModule,
  ],
})
export class AppModule {}
