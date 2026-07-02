import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES } from '../queues/queues.module';

export interface EmailBatchJobData {
  jobQueueId: string;
  campaignId: string;
  postId: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  fromName: string;
  fromEmail: string;
  recipients: Array<{
    email: string;
    name?: string;
    customFields?: Record<string, string>;
  }>;
  batchIndex: number;
  totalBatches: number;
  scheduledAt: string;
}

export interface VideoPostJobData {
  jobQueueId: string;
  postId: string;
  accountId: string;
  videoUrl: string;       // S3 URL
  thumbnailUrl?: string;
  title: string;
  description: string;
  hashtags: string[];
  scheduledAt: string;
}

@Injectable()
export class EmailQueueProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL_BULK)
    private readonly emailQueue: Queue,
  ) {}

  /**
   * Chia danh sách email thành các batch và đưa vào queue
   * @param batchSize số email mỗi batch (mặc định 50)
   */
  async enqueueEmailCampaign(
    baseData: Omit<EmailBatchJobData, 'recipients' | 'batchIndex' | 'totalBatches'>,
    allRecipients: EmailBatchJobData['recipients'],
    batchSize = 50,
  ) {
    const batches: EmailBatchJobData['recipients'][] = [];
    for (let i = 0; i < allRecipients.length; i += batchSize) {
      batches.push(allRecipients.slice(i, i + batchSize));
    }

    const scheduledAt = new Date(baseData.scheduledAt).getTime();
    const now = Date.now();

    const jobs = batches.map((recipients, index) => ({
      name: JOB_NAMES.SEND_EMAIL_BATCH,
      data: {
        ...baseData,
        recipients,
        batchIndex: index,
        totalBatches: batches.length,
      } satisfies EmailBatchJobData,
      opts: {
        jobId: `email-${baseData.campaignId}-batch-${index}`,
        // Mỗi batch delay thêm 30 giây để tránh rate limit SES/SendGrid
        delay: Math.max(0, scheduledAt - now) + index * 30_000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      },
    }));

    return this.emailQueue.addBulk(jobs);
  }
}

@Injectable()
export class VideoQueueProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.TIKTOK)
    private readonly tiktokQueue: Queue,

    @InjectQueue(QUEUE_NAMES.YOUTUBE)
    private readonly youtubeQueue: Queue,

    @InjectQueue(QUEUE_NAMES.REELS)
    private readonly reelsQueue: Queue,
  ) {}

  async enqueueTikTok(data: VideoPostJobData) {
    const delay = Math.max(0, new Date(data.scheduledAt).getTime() - Date.now());
    return this.tiktokQueue.add(JOB_NAMES.UPLOAD_TIKTOK, data, {
      jobId: `tiktok-${data.postId}`,
      delay,
      attempts: 3,
    });
  }

  async enqueueYouTube(data: VideoPostJobData) {
    const delay = Math.max(0, new Date(data.scheduledAt).getTime() - Date.now());
    return this.youtubeQueue.add(JOB_NAMES.UPLOAD_YOUTUBE, data, {
      jobId: `youtube-${data.postId}`,
      delay,
      attempts: 3,
    });
  }

  async enqueueReels(data: VideoPostJobData) {
    const delay = Math.max(0, new Date(data.scheduledAt).getTime() - Date.now());
    return this.reelsQueue.add(JOB_NAMES.UPLOAD_REELS, data, {
      jobId: `reels-${data.postId}`,
      delay,
      attempts: 3,
    });
  }
}
