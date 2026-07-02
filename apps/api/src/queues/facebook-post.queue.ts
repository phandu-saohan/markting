import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES } from '../queues/queues.module';

// ── DTOs ─────────────────────────────────────────────────────────
export interface ScrapeGroupsJobData {
  userId: string;
  keywords: string[];
  accountId: string;
  maxGroups?: number;
}

export interface PostToGroupJobData {
  jobQueueId: string;
  postId: string;
  campaignId: string;
  accountId: string;
  groupId: string;
  content: string;
  mediaUrls?: string[];
  scheduledAt: string; // ISO string
}

export interface PostToFanpageJobData {
  jobQueueId: string;
  postId: string;
  accountId: string;
  pageId: string;
  content: string;
  mediaUrls?: string[];
  scheduledAt: string;
}

@Injectable()
export class FacebookQueueProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.FB_SCRAPE)
    private readonly scrapeQueue: Queue,

    @InjectQueue(QUEUE_NAMES.FB_GROUP_POST)
    private readonly groupPostQueue: Queue,

    @InjectQueue(QUEUE_NAMES.FB_FANPAGE)
    private readonly fanpageQueue: Queue,
  ) {}

  /**
   * Thêm job quét Facebook Groups theo từ khóa
   */
  async enqueueScrapeGroups(data: ScrapeGroupsJobData) {
    return this.scrapeQueue.add(JOB_NAMES.SCRAPE_GROUPS, data, {
      jobId: `scrape-${data.userId}-${Date.now()}`,
      attempts: 2,
      backoff: { type: 'fixed', delay: 30_000 },
    });
  }

  /**
   * Lên lịch đăng bài vào nhóm với delay ngẫu nhiên
   * @param delayMin phút tối thiểu
   * @param delayMax phút tối đa
   */
  async enqueueGroupPost(
    data: PostToGroupJobData,
    delayMin = 5,
    delayMax = 15,
  ) {
    const scheduledAt = new Date(data.scheduledAt).getTime();
    const now = Date.now();

    // Tính delay từ thời điểm hiện tại đến scheduled_at
    let delay = Math.max(0, scheduledAt - now);

    // Thêm random jitter (5-15 phút) để tránh spam detection
    const jitterMs = this.randomDelayMs(delayMin, delayMax);
    delay += jitterMs;

    return this.groupPostQueue.add(JOB_NAMES.POST_TO_GROUP, data, {
      jobId: `grp-${data.postId}-${data.groupId}`,
      delay,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60_000, // 1 phút base backoff khi retry
      },
    });
  }

  /**
   * Lên lịch đăng bài lên Fanpage qua Graph API
   */
  async enqueueFanpagePost(data: PostToFanpageJobData) {
    const scheduledAt = new Date(data.scheduledAt).getTime();
    const delay = Math.max(0, scheduledAt - Date.now());

    return this.fanpageQueue.add(JOB_NAMES.POST_TO_FANPAGE, data, {
      jobId: `fanpage-${data.postId}-${data.pageId}`,
      delay,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
    });
  }

  /**
   * Tạo delay ngẫu nhiên (phút → milliseconds)
   */
  private randomDelayMs(minMinutes: number, maxMinutes: number): number {
    const minMs = minMinutes * 60 * 1000;
    const maxMs = maxMinutes * 60 * 1000;
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  }
}
