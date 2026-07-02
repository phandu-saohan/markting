import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobQueue } from '../modules/posts/entities/job-queue.entity';

// ── Queue Names (constants) ──────────────────────────────────────
export const QUEUE_NAMES = {
  FB_SCRAPE:    'facebook-scrape',
  FB_GROUP_POST:'facebook-group-post',
  FB_FANPAGE:   'facebook-fanpage',
  ZALO_OA:      'zalo-oa',
  ZALO_PERSONAL:'zalo-personal',
  TIKTOK:       'tiktok-post',
  YOUTUBE:      'youtube-post',
  REELS:        'reels-post',
  EMAIL_BULK:   'email-bulk',
} as const;

// ── Job Names ────────────────────────────────────────────────────
export const JOB_NAMES = {
  SCRAPE_GROUPS:    'scrape-groups',
  POST_TO_GROUP:    'post-to-group',
  POST_TO_FANPAGE:  'post-to-fanpage',
  POST_ZALO_OA:     'post-zalo-oa',
  POST_ZALO_DIARY:  'post-zalo-diary',
  UPLOAD_TIKTOK:    'upload-tiktok',
  UPLOAD_YOUTUBE:   'upload-youtube',
  UPLOAD_REELS:     'upload-reels',
  SEND_EMAIL_BATCH: 'send-email-batch',
} as const;

const queueList = Object.values(QUEUE_NAMES);

@Module({
  imports: [
    TypeOrmModule.forFeature([JobQueue]),

    // ── Register all BullMQ queues ───────────────────────────────
    ...queueList.map((name) =>
      BullModule.registerQueue({ name }),
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
