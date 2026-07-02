import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import axios from 'axios';
import { QUEUE_NAMES, JOB_NAMES } from '../../../api/src/queues/queues.module';
import { CookieService } from '../shared/cookie.service';
import { Account } from '../../../api/src/modules/accounts/entities/account.entity';
import { Post } from '../../../api/src/modules/posts/entities/post.entity';
import { JobQueue } from '../../../api/src/modules/posts/entities/job-queue.entity';

interface PostToFanpageJobData {
  jobQueueId: string;
  postId: string;
  accountId: string;
  pageId: string;
  content: string;
  mediaUrls?: string[];
  scheduledAt: string;
}

const GRAPH_API_BASE = 'https://graph.facebook.com';
const GRAPH_VERSION = process.env.FB_GRAPH_API_VERSION ?? 'v19.0';

@Processor(QUEUE_NAMES.FB_FANPAGE, { concurrency: 5 })
export class FbFanpageProcessor extends WorkerHost {
  private readonly logger = new Logger(FbFanpageProcessor.name);

  constructor(
    private readonly cookieService: CookieService,

    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,

    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,

    @InjectRepository(JobQueue)
    private readonly jobQueueRepo: Repository<JobQueue>,
  ) {
    super();
  }

  async process(job: Job<PostToFanpageJobData>): Promise<{ postId?: string }> {
    const { jobQueueId, postId, accountId, pageId, content, mediaUrls } = job.data;

    await this.jobQueueRepo.update(jobQueueId, {
      status: 'active',
      startedAt: new Date(),
    });

    // ── Lấy Page Access Token ────────────────────────────────────
    const account = await this.accountRepo.findOne({ where: { id: accountId } });
    if (!account?.accessToken) throw new Error('No access token for account');

    const pageToken = await this.getPageAccessToken(
      account.accessToken,
      pageId,
    );

    let fbPostId: string;

    // ── Upload media nếu có ──────────────────────────────────────
    if (mediaUrls && mediaUrls.length > 0) {
      const firstMedia = mediaUrls[0];
      const isVideo = /\.(mp4|mov|avi|mkv)$/i.test(firstMedia);

      if (isVideo) {
        fbPostId = await this.postVideo(pageId, pageToken, firstMedia, content);
      } else {
        fbPostId = await this.postPhotoWithCaption(pageId, pageToken, firstMedia, content);
      }
    } else {
      // Đăng text-only
      fbPostId = await this.postText(pageId, pageToken, content);
    }

    // ── Cập nhật DB ──────────────────────────────────────────────
    await this.postRepo.update(postId, {
      status: 'posted',
      postedAt: new Date(),
      externalPostId: fbPostId,
    });

    await this.jobQueueRepo.update(jobQueueId, {
      status: 'completed',
      finishedAt: new Date(),
      result: { fbPostId },
    });

    this.logger.log(`✅ [Job ${job.id}] Posted to fanpage ${pageId}: ${fbPostId}`);
    return { postId: fbPostId };
  }

  private async getPageAccessToken(userToken: string, pageId: string): Promise<string> {
    const decrypted = this.cookieService.decrypt(userToken);
    const res = await axios.get(
      `${GRAPH_API_BASE}/${GRAPH_VERSION}/${pageId}`,
      {
        params: {
          fields: 'access_token',
          access_token: decrypted,
        },
      },
    );
    if (!res.data.access_token) {
      throw new Error(`Cannot get page token for page ${pageId}`);
    }
    return res.data.access_token;
  }

  private async postText(pageId: string, token: string, message: string): Promise<string> {
    const res = await axios.post(
      `${GRAPH_API_BASE}/${GRAPH_VERSION}/${pageId}/feed`,
      null,
      {
        params: { message, access_token: token },
      },
    );
    return res.data.id;
  }

  private async postPhotoWithCaption(
    pageId: string,
    token: string,
    photoUrl: string,
    caption: string,
  ): Promise<string> {
    const res = await axios.post(
      `${GRAPH_API_BASE}/${GRAPH_VERSION}/${pageId}/photos`,
      null,
      {
        params: {
          url: photoUrl,
          caption,
          access_token: token,
        },
      },
    );
    return res.data.post_id ?? res.data.id;
  }

  private async postVideo(
    pageId: string,
    token: string,
    videoUrl: string,
    description: string,
  ): Promise<string> {
    // Step 1: Initialize upload session
    const initRes = await axios.post(
      `https://graph-video.facebook.com/${GRAPH_VERSION}/${pageId}/videos`,
      null,
      {
        params: {
          upload_phase: 'start',
          file_size: 0, // Cần filesize thực — fetch header từ S3
          access_token: token,
        },
      },
    );

    // Simplified: dùng file_url nếu video đã public
    const finalRes = await axios.post(
      `${GRAPH_API_BASE}/${GRAPH_VERSION}/${pageId}/videos`,
      null,
      {
        params: {
          file_url: videoUrl,
          description,
          access_token: token,
        },
      },
    );
    return finalRes.data.id;
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<PostToFanpageJobData>, err: Error) {
    this.logger.error(`❌ Fanpage post job ${job.id} failed: ${err.message}`);
    await this.jobQueueRepo.update(job.data.jobQueueId, {
      status: 'failed',
      error: err.message,
    });
  }
}
