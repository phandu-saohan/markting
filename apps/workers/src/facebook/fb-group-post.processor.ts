import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES } from '../../../api/src/queues/queues.module';
import { BrowserService } from '../shared/browser.service';
import { ProxyService } from '../shared/proxy.service';
import { CookieService } from '../shared/cookie.service';
import { Account } from '../../../api/src/modules/accounts/entities/account.entity';
import { Post } from '../../../api/src/modules/posts/entities/post.entity';
import { JobQueue } from '../../../api/src/modules/posts/entities/job-queue.entity';

interface PostToGroupJobData {
  jobQueueId: string;
  postId: string;
  campaignId: string;
  accountId: string;
  groupId: string;   // group_id từ bảng groups (UUID)
  fbGroupId: string; // Facebook's actual group ID number
  content: string;
  mediaUrls?: string[];
  scheduledAt: string;
}

@Processor(QUEUE_NAMES.FB_GROUP_POST, {
  concurrency: 3, // Tối đa 3 tài khoản đăng bài đồng thời
})
export class FbGroupPostProcessor extends WorkerHost {
  private readonly logger = new Logger(FbGroupPostProcessor.name);

  constructor(
    private readonly browserService: BrowserService,
    private readonly proxyService: ProxyService,
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

  async process(job: Job<PostToGroupJobData>): Promise<{ postUrl?: string }> {
    const {
      jobQueueId,
      postId,
      accountId,
      fbGroupId,
      content,
      mediaUrls,
    } = job.data;

    const sessionId = `grp-post-${job.id}`;
    this.logger.log(`[Job ${job.id}] Posting to FB group ${fbGroupId}`);

    // ── Cập nhật trạng thái job ──────────────────────────────────
    await this.jobQueueRepo.update(jobQueueId, {
      status: 'active' as any,
      startedAt: new Date(),
      attempts: job.attemptsMade + 1,
    });

    // ── Lấy tài khoản và proxy ──────────────────────────────────
    const account = await this.accountRepo.findOne({
      where: { id: accountId },
      relations: ['proxy'],
    });
    if (!account) throw new Error(`Account ${accountId} not found`);

    const proxyUrl = account.proxy
      ? this.buildProxyFromEntity(account.proxy)
      : await this.proxyService.getNextProxy(account.userId);

    const cookies = account.cookies
      ? this.cookieService.decryptCookies(account.cookies)
      : [];

    if (cookies.length === 0) {
      throw new Error('No cookies available for account. Please re-login.');
    }

    // ── Khởi động browser ────────────────────────────────────────
    const browser = await this.browserService.createBrowser(sessionId, {
      proxyUrl: proxyUrl ?? undefined,
      cookies,
    });

    try {
      // ── Điều hướng đến group ─────────────────────────────────
      const page = await this.browserService.createPage(browser, { cookies });
      const groupUrl = `https://www.facebook.com/groups/${fbGroupId}`;

      await page.goto(groupUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      // Kiểm tra có bị login redirect không
      if (page.url().includes('/login')) {
        await this.accountRepo.update(accountId, { status: 'checkpoint' as any });
        throw new Error('CHECKPOINT: Session expired');
      }

      // ── Tìm ô soạn thảo bài viết ────────────────────────────
      await page.waitForSelector(
        '[data-testid="group-create-post-dialog-trigger"], [aria-label*="Write something"]',
        { timeout: 15_000 },
      );

      // Click vào ô "Write something..."
      await page.click(
        '[data-testid="group-create-post-dialog-trigger"], [aria-label*="Write something"]',
      );

      await BrowserService.randomDelay(1_500, 3_000);

      // ── Upload media nếu có ──────────────────────────────────
      if (mediaUrls && mediaUrls.length > 0) {
        await this.uploadMedia(page, mediaUrls);
        await BrowserService.randomDelay(2_000, 4_000);
      }

      // ── Gõ nội dung bài viết ──────────────────────────────────
      const textareaSelector = '[contenteditable="true"][role="textbox"]';
      await page.waitForSelector(textareaSelector, { timeout: 10_000 });

      // Gõ từng ký tự để mô phỏng người thực
      await BrowserService.humanType(page, textareaSelector, content);

      await BrowserService.randomDelay(2_000, 5_000);

      // ── Click nút Post ────────────────────────────────────────
      const postButtonSelector =
        '[data-testid="react-composer-post-button"], [aria-label="Post"]';
      await page.waitForSelector(postButtonSelector, { timeout: 10_000 });
      await page.click(postButtonSelector);

      // ── Chờ xác nhận đăng thành công ─────────────────────────
      await BrowserService.randomDelay(3_000, 6_000);

      // Kiểm tra có popup checkpoint/captcha không
      const hasCheckpoint = await page.evaluate(() => {
        return (
          document.querySelector('[data-testid="checkpoint"]') !== null ||
          document.title.includes('Checkpoint') ||
          document.body.innerText.includes('confirm your identity')
        );
      });

      if (hasCheckpoint) {
        await this.accountRepo.update(accountId, { status: 'checkpoint' as any });
        throw new Error('CHECKPOINT: Identity verification required');
      }

      await page.close();

      // ── Cập nhật DB sau khi đăng thành công ──────────────────
      await this.postRepo.update(postId, {
        status: 'posted' as any,
        postedAt: new Date(),
      });

      await this.jobQueueRepo.update(jobQueueId, {
        status: 'completed' as any,
        finishedAt: new Date(),
        result: { groupId: fbGroupId, postedAt: new Date().toISOString() } as any,
      });

      this.logger.log(`✅ [Job ${job.id}] Posted to group ${fbGroupId}`);
      return {};
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      await this.jobQueueRepo.update(jobQueueId, {
        status: 'failed' as any,
        error: errMsg,
      });

      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 3)) {
        await this.postRepo.update(postId, { status: 'failed' as any, errorLog: errMsg });
      }

      throw error;
    } finally {
      await this.browserService.closeBrowser(sessionId);
    }
  }

  /**
   * Upload ảnh/video vào bài viết qua file input ẩn
   */
  private async uploadMedia(page: any, mediaUrls: string[]): Promise<void> {
    // FB dùng file input ẩn — tìm và trigger
    const photoButtonSel = '[data-testid="photo-video-add-button"], [aria-label*="Photo/video"]';
    const fileInputSel = 'input[type="file"][accept*="image"]';

    try {
      await page.click(photoButtonSel);
      await BrowserService.randomDelay(1_000, 2_000);

      const fileInput = await page.$(fileInputSel);
      if (fileInput) {
        // Chỉ hỗ trợ upload file local — URL cần download trước về /tmp
        // TODO: Download từ S3 về temp file rồi upload
        this.logger.debug('File input found, upload logic needed');
      }
    } catch (e) {
      this.logger.warn(`Media upload skipped: ${e}`);
    }
  }

  private buildProxyFromEntity(proxy: any): string {
    const auth = proxy.username
      ? `${proxy.username}:${proxy.password}@`
      : '';
    return `${proxy.protocol}://${auth}${proxy.host}:${proxy.port}`;
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`✅ Group post job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`❌ Group post job ${job.id} failed [attempt ${job.attemptsMade}]: ${err.message}`);
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`⚠️ Job ${jobId} stalled — browser may have crashed`);
  }
}
