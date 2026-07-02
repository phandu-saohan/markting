import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import axios from 'axios';
import { QUEUE_NAMES } from '../../../api/src/queues/queues.module';

interface ZaloOAJobData {
  jobQueueId: string;
  postId: string;
  oaId: string;
  accessToken: string; // Zalo OA access token (encrypted)
  content: string;
  imageUrl?: string;
  actionUrl?: string;
  actionTitle?: string;
}

interface TikTokJobData {
  jobQueueId: string;
  postId: string;
  accountId: string;
  accessToken: string;
  videoUrl: string;    // URL video đã upload lên S3
  title: string;
  description: string;
  hashtags: string[];
  privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
}

interface YouTubeJobData {
  jobQueueId: string;
  postId: string;
  accountId: string;
  accessToken: string;
  videoUrl: string;
  title: string;
  description: string;
  hashtags: string[];
  categoryId?: string;
}

// ════════════════════════════════════════════════════════════════
// ZALO OA PROCESSOR
// ════════════════════════════════════════════════════════════════
@Processor(QUEUE_NAMES.ZALO_OA, { concurrency: 3 })
export class ZaloOAProcessor extends WorkerHost {
  private readonly logger = new Logger(ZaloOAProcessor.name);
  private readonly ZALO_API = 'https://openapi.zalo.me/v2.0';

  async process(job: Job<ZaloOAJobData>) {
    const { oaId, accessToken, content, imageUrl, actionUrl, actionTitle } = job.data;

    this.logger.log(`[Job ${job.id}] Posting to Zalo OA ${oaId}`);

    const headers = {
      'access_token': accessToken,
      'Content-Type': 'application/json',
    };

    let body: any;

    if (imageUrl) {
      // Đăng bài có ảnh (article type)
      body = {
        cover: imageUrl,
        title: content.substring(0, 100),
        description: content,
        author: '',
        ...(actionUrl && actionTitle
          ? {
              action: {
                type: 'oa.open.url',
                url: actionUrl,
              },
            }
          : {}),
      };

      await axios.post(
        `${this.ZALO_API}/article/create`,
        body,
        { headers },
      );
    } else {
      // Đăng bài text-only
      body = { description: content };
      await axios.post(
        `${this.ZALO_API}/article/create`,
        body,
        { headers },
      );
    }

    this.logger.log(`✅ [Job ${job.id}] Zalo OA post created`);
    return { success: true };
  }
}

// ════════════════════════════════════════════════════════════════
// TIKTOK PROCESSOR (Content Posting API)
// ════════════════════════════════════════════════════════════════
@Processor(QUEUE_NAMES.TIKTOK, { concurrency: 2 })
export class TikTokProcessor extends WorkerHost {
  private readonly logger = new Logger(TikTokProcessor.name);
  private readonly TIKTOK_API = 'https://open.tiktokapis.com/v2';

  async process(job: Job<TikTokJobData>) {
    const { accessToken, videoUrl, title, description, hashtags, privacyLevel } = job.data;

    this.logger.log(`[Job ${job.id}] Uploading to TikTok`);

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    };

    // ── Step 1: Initialize upload ────────────────────────────────
    const initRes = await axios.post(
      `${this.TIKTOK_API}/post/publish/video/init/`,
      {
        post_info: {
          title: `${title}\n${hashtags.map((h) => `#${h}`).join(' ')}`.substring(0, 2200),
          privacy_level: privacyLevel ?? 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: videoUrl,
        },
      },
      { headers },
    );

    const { publish_id } = initRes.data.data;
    this.logger.log(`TikTok publish_id: ${publish_id}`);

    // ── Step 2: Poll status ──────────────────────────────────────
    let attempts = 0;
    while (attempts < 10) {
      await new Promise((r) => setTimeout(r, 5_000));
      const statusRes = await axios.post(
        `${this.TIKTOK_API}/post/publish/status/fetch/`,
        { publish_id },
        { headers },
      );
      const status = statusRes.data.data.status;
      if (status === 'PUBLISH_COMPLETE') {
        this.logger.log(`✅ [Job ${job.id}] TikTok video published`);
        return { publishId: publish_id };
      }
      if (status === 'FAILED') {
        throw new Error(`TikTok publish failed: ${JSON.stringify(statusRes.data)}`);
      }
      attempts++;
    }
    throw new Error('TikTok publish timed out');
  }
}

// ════════════════════════════════════════════════════════════════
// YOUTUBE SHORTS PROCESSOR (YouTube Data API v3)
// ════════════════════════════════════════════════════════════════
@Processor(QUEUE_NAMES.YOUTUBE, { concurrency: 2 })
export class YouTubeProcessor extends WorkerHost {
  private readonly logger = new Logger(YouTubeProcessor.name);
  private readonly YT_UPLOAD_API = 'https://www.googleapis.com/upload/youtube/v3/videos';

  async process(job: Job<YouTubeJobData>) {
    const { accessToken, videoUrl, title, description, hashtags, categoryId } = job.data;

    this.logger.log(`[Job ${job.id}] Uploading YouTube Short`);

    // ── Tải video từ URL về buffer ──────────────────────────────
    const videoResponse = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
    });
    const videoBuffer = Buffer.from(videoResponse.data);

    // ── Upload qua resumable upload ─────────────────────────────
    const tagsWithShorts = [...new Set([...hashtags, 'Shorts'])];
    const fullDescription = `${description}\n\n${tagsWithShorts.map((t) => `#${t}`).join(' ')}`;

    const metadata = {
      snippet: {
        title: title.substring(0, 100),
        description: fullDescription.substring(0, 5000),
        tags: tagsWithShorts,
        categoryId: categoryId ?? '22', // 22 = People & Blogs
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false,
      },
    };

    // Step 1: Khởi tạo resumable upload session
    const initRes = await axios.post(
      `${this.YT_UPLOAD_API}?uploadType=resumable&part=snippet,status`,
      metadata,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/*',
          'X-Upload-Content-Length': videoBuffer.length,
        },
      },
    );

    const uploadUrl = initRes.headers['location'];
    if (!uploadUrl) throw new Error('No upload URL from YouTube');

    // Step 2: Upload video data
    const uploadRes = await axios.put(uploadUrl, videoBuffer, {
      headers: {
        'Content-Type': 'video/*',
        'Content-Length': videoBuffer.length,
      },
      maxBodyLength: Infinity,
    });

    const videoId = uploadRes.data?.id;
    this.logger.log(`✅ [Job ${job.id}] YouTube Short uploaded: https://youtu.be/${videoId}`);
    return { videoId, videoUrl: `https://youtu.be/${videoId}` };
  }
}
