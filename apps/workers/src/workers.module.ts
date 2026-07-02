import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

// ── Processors ────────────────────────────────────────────────────
import { FbScraperProcessor } from './facebook/fb-scraper.processor';
import { FbGroupPostProcessor } from './facebook/fb-group-post.processor';
import { FbFanpageProcessor } from './facebook/fb-fanpage.processor';
import { ZaloOAProcessor, TikTokProcessor, YouTubeProcessor } from './video/video-zalo.processor';
import { EmailBulkProcessor } from './email/email-bulk.processor';

// ── Shared Services ──────────────────────────────────────────────
import { BrowserService } from './shared/browser.service';
import { ProxyService } from './shared/proxy.service';
import { CookieService } from './shared/cookie.service';

// ── Queue Names ──────────────────────────────────────────────────
const QUEUE_NAMES = {
  FB_SCRAPE:     'facebook-scrape',
  FB_GROUP_POST: 'facebook-group-post',
  FB_FANPAGE:    'facebook-fanpage',
  ZALO_OA:       'zalo-oa',
  TIKTOK:        'tiktok-post',
  YOUTUBE:       'youtube-post',
  REELS:         'reels-post',
  EMAIL_BULK:    'email-bulk',
};

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432'),
      database: process.env.DB_NAME ?? 'marketing_db',
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASS ?? 'postgres',
      autoLoadEntities: true,
      synchronize: false,
    }),

    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379'),
      },
    }),

    // Register all queues this worker process handles
    ...Object.values(QUEUE_NAMES).map((name) =>
      BullModule.registerQueue({ name }),
    ),
  ],
  providers: [
    // Shared services
    BrowserService,
    ProxyService,
    CookieService,

    // Facebook workers
    FbScraperProcessor,
    FbGroupPostProcessor,
    FbFanpageProcessor,

    // Social video workers
    ZaloOAProcessor,
    TikTokProcessor,
    YouTubeProcessor,

    // Email worker
    EmailBulkProcessor,
  ],
})
export class WorkersModule {}
