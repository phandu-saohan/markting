import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import * as wdio from 'webdriverio';
import { QUEUE_NAMES } from '../../../api/src/queues/queues.module';
import { Post } from '../../../api/src/modules/posts/entities/post.entity';
import { JobQueue } from '../../../api/src/modules/posts/entities/job-queue.entity';

// ================================================================
// ZALO PERSONAL DIARY PROCESSOR
// Dùng Appium + WebdriverIO để tự động đăng nhật ký Zalo cá nhân
// trên Android Emulator chạy ngầm
//
// Yêu cầu:
//   1. Android Studio hoặc Genymotion emulator đang chạy
//   2. Appium Server: `appium --port 4723`
//   3. Zalo app đã đăng nhập trên emulator
//   4. ANDROID_DEVICE_NAME trong .env (vd: emulator-5554)
//
// Cài đặt Appium:
//   npm install -g appium
//   appium driver install uiautomator2
//   appium driver install espresso (optional)
// ================================================================

interface ZaloPersonalJobData {
  jobQueueId: string;
  postId: string;
  accountId: string;
  content: string;
  mediaUrls?: string[];
  scheduledAt: string;
}

// ── Selectors cho Zalo app (có thể thay đổi theo phiên bản Zalo) ──
const SELECTORS = {
  // Tab bar ở dưới cùng
  TIMELINE_TAB: '//android.widget.FrameLayout[@content-desc="Nhật ký"]',

  // Nút tạo bài viết mới (dấu + hoặc camera)
  CREATE_POST_BTN: '//android.widget.ImageButton[@content-desc="Tạo bài viết"]',

  // Nút "Viết gì đó" (text input area)
  POST_INPUT: '//android.widget.EditText[@hint="Viết gì đó..."]',

  // Nút đăng bài
  SHARE_BTN: '//android.widget.Button[@text="Chia sẻ"]',

  // Upload ảnh/video
  MEDIA_BTN: '//android.widget.ImageView[@content-desc="Hình ảnh"]',

  // Popup confirm nếu có
  CONFIRM_BTN: '//android.widget.Button[@text="OK"]',
};

@Processor(QUEUE_NAMES.ZALO_PERSONAL, {
  concurrency: 1, // Chỉ 1 job/lần vì chỉ có 1 emulator
})
export class ZaloPersonalProcessor extends WorkerHost {
  private readonly logger = new Logger(ZaloPersonalProcessor.name);

  constructor(
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,

    @InjectRepository(JobQueue)
    private readonly jobQueueRepo: Repository<JobQueue>,
  ) {
    super();
  }

  async process(job: Job<ZaloPersonalJobData>): Promise<{ success: boolean }> {
    const { jobQueueId, postId, content, mediaUrls } = job.data;

    this.logger.log(`[Job ${job.id}] Starting Zalo personal diary post via Appium`);

    await this.jobQueueRepo.update(jobQueueId, {
      status: 'active' as any,
      startedAt: new Date(),
    });

    // ── Kết nối Appium Server ────────────────────────────────────
    const driver = await this.createAppiumDriver();

    try {
      // ── Mở Zalo app ─────────────────────────────────────────────
      await this.openZaloApp(driver);
      await this.sleep(3000);

      // ── Chuyển đến tab Nhật ký ──────────────────────────────────
      await this.navigateToTimeline(driver);
      await this.sleep(2000);

      // ── Upload media nếu có ──────────────────────────────────────
      if (mediaUrls && mediaUrls.length > 0) {
        await this.uploadMedia(driver, mediaUrls);
        await this.sleep(2000);
      }

      // ── Nhấn "Tạo bài viết" ──────────────────────────────────────
      await this.clickCreatePost(driver);
      await this.sleep(1500);

      // ── Gõ nội dung ──────────────────────────────────────────────
      await this.typeContent(driver, content);
      await this.sleep(1000);

      // ── Đăng bài ─────────────────────────────────────────────────
      await this.submitPost(driver);
      await this.sleep(3000);

      // ── Xác nhận thành công ──────────────────────────────────────
      await this.postRepo.update(postId, {
        status: 'posted' as any as any,
        postedAt: new Date(),
      });

      await this.jobQueueRepo.update(jobQueueId, {
        status: 'completed' as any,
        finishedAt: new Date(),
        result: { postedAt: new Date().toISOString() } as any,
      });

      this.logger.log(`✅ [Job ${job.id}] Zalo personal post published`);
      return { success: true };

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ [Job ${job.id}] Zalo Appium error: ${errMsg}`);

      await this.jobQueueRepo.update(jobQueueId, {
        status: 'failed' as any,
        error: errMsg,
      });

      // Screenshot để debug
      try {
        const screenshot = await driver.takeScreenshot();
        this.logger.debug(`Screenshot captured (base64, ${screenshot.length} chars)`);
      } catch {}

      throw error;
    } finally {
      await driver.deleteSession();
    }
  }

  // ── Appium Driver Setup ───────────────────────────────────────

  private async createAppiumDriver() {
    const capabilities = {
      platformName: 'Android',
      'appium:deviceName': process.env.ANDROID_DEVICE_NAME ?? 'emulator-5554',
      'appium:platformVersion': process.env.ANDROID_PLATFORM_VERSION ?? '13',
      'appium:appPackage': process.env.ZALO_PACKAGE_NAME ?? 'com.zing.zalo',
      'appium:appActivity': 'com.zing.zalo.ui.SplashActivity',
      'appium:automationName': 'UiAutomator2',
      'appium:noReset': true,        // Không reset app (giữ session đăng nhập)
      'appium:fullReset': false,
      'appium:newCommandTimeout': 120,
      'appium:autoGrantPermissions': true,
    };

    const driver = await wdio.remote({
      protocol: 'http',
      hostname: process.env.APPIUM_HOST ?? 'localhost',
      port: parseInt(process.env.APPIUM_PORT ?? '4723'),
      path: '/',
      capabilities,
      logLevel: 'warn',
    });

    this.logger.log('Appium driver connected');
    return driver;
  }

  // ── Navigation Helpers ───────────────────────────────────────

  private async openZaloApp(driver: wdio.Browser) {
    // App đã khởi động qua appPackage/appActivity trong capabilities
    // Nếu app đang ở background, activate lại
    await driver.activateApp(process.env.ZALO_PACKAGE_NAME ?? 'com.zing.zalo');
    await this.sleep(2000);
  }

  private async navigateToTimeline(driver: wdio.Browser) {
    try {
      const timelineTab = await driver.$(SELECTORS.TIMELINE_TAB);
      await timelineTab.waitForDisplayed({ timeout: 10_000 });
      await timelineTab.click();
      this.logger.debug('Navigated to Timeline tab');
    } catch {
      // Fallback: dùng ADB để mở activity nhật ký trực tiếp
      this.logger.warn('Timeline tab not found via selector, trying ADB fallback');
      await driver.execute('mobile: shell', {
        command: 'am start -n com.zing.zalo/.ui.timeline.TimelineActivity',
      });
      await this.sleep(2000);
    }
  }

  private async clickCreatePost(driver: wdio.Browser) {
    const btn = await driver.$(SELECTORS.CREATE_POST_BTN);
    await btn.waitForDisplayed({ timeout: 10_000 });
    await btn.click();
  }

  private async typeContent(driver: wdio.Browser, content: string) {
    const input = await driver.$(SELECTORS.POST_INPUT);
    await input.waitForDisplayed({ timeout: 10_000 });
    await input.click();
    await this.sleep(500);

    // Gõ từng phần để tránh timeout trên nội dung dài
    const chunks = content.match(/.{1,100}/g) ?? [content];
    for (const chunk of chunks) {
      await input.addValue(chunk);
      await this.sleep(200);
    }
  }

  private async uploadMedia(driver: wdio.Browser, mediaUrls: string[]) {
    // Chỉ upload ảnh đầu tiên (Zalo personal giới hạn số lượng)
    const mediaUrl = mediaUrls[0];

    // Push file lên emulator trước
    // Trong production: download từ S3 về local rồi push lên
    this.logger.debug(`Media upload for ${mediaUrl} — requires local file push via ADB`);

    try {
      const mediaBtn = await driver.$(SELECTORS.MEDIA_BTN);
      if (await mediaBtn.isDisplayed()) {
        await mediaBtn.click();
        await this.sleep(1500);
        // TODO: Select file từ gallery sau khi push lên emulator
      }
    } catch {
      this.logger.warn('Media button not found, posting text-only');
    }
  }

  private async submitPost(driver: wdio.Browser) {
    const shareBtn = await driver.$(SELECTORS.SHARE_BTN);
    await shareBtn.waitForDisplayed({ timeout: 10_000 });
    await shareBtn.click();
    await this.sleep(2000);

    // Xử lý popup xác nhận nếu có
    try {
      const confirmBtn = await driver.$(SELECTORS.CONFIRM_BTN);
      if (await confirmBtn.isDisplayed()) {
        await confirmBtn.click();
      }
    } catch {}
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`✅ Zalo personal job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`❌ Zalo personal job ${job.id} failed: ${err.message}`);
  }
}
