import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { Page } from 'puppeteer';
import { QUEUE_NAMES, JOB_NAMES } from '../../../api/src/queues/queues.module';
import { BrowserService } from '../shared/browser.service';
import { ProxyService } from '../shared/proxy.service';
import { CookieService } from '../shared/cookie.service';
import { Account } from '../../../api/src/modules/accounts/entities/account.entity';
import { Group } from '../../../api/src/modules/groups/entities/group.entity';

interface ScrapeGroupsJobData {
  userId: string;
  keywords: string[];
  accountId: string;
  maxGroups?: number;
}

interface ScrapedGroup {
  groupId: string;
  groupName: string;
  memberCount?: number;
  privacy: 'public' | 'private' | 'closed';
  coverImage?: string;
}

@Processor(QUEUE_NAMES.FB_SCRAPE, {
  concurrency: 2, // Tối đa 2 browser cùng lúc để tránh tốn RAM
})
export class FbScraperProcessor extends WorkerHost {
  private readonly logger = new Logger(FbScraperProcessor.name);

  constructor(
    private readonly browserService: BrowserService,
    private readonly proxyService: ProxyService,
    private readonly cookieService: CookieService,

    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,

    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,
  ) {
    super();
  }

  async process(job: Job<ScrapeGroupsJobData>): Promise<ScrapedGroup[]> {
    const { userId, keywords, accountId, maxGroups = 50 } = job.data;
    const sessionId = `scrape-${job.id}`;

    this.logger.log(`[Job ${job.id}] Scraping FB groups for keywords: ${keywords.join(', ')}`);

    // ── 1. Lấy thông tin tài khoản FB ───────────────────────────
    const account = await this.accountRepo.findOne({
      where: { id: accountId, userId },
    });
    if (!account) throw new Error(`Account ${accountId} not found`);
    if (account.status === 'banned') throw new Error('Account is banned');

    // ── 2. Lấy proxy xoay vòng ──────────────────────────────────
    const proxyUrl = await this.proxyService.getNextProxy(userId);

    // ── 3. Giải mã cookies ──────────────────────────────────────
    const cookies = account.cookies
      ? this.cookieService.decryptCookies(account.cookies)
      : [];

    // ── 4. Khởi động browser ─────────────────────────────────────
    const browser = await this.browserService.createBrowser(sessionId, {
      proxyUrl: proxyUrl ?? undefined,
      cookies,
    });

    const allGroups: ScrapedGroup[] = [];

    try {
      for (const keyword of keywords) {
        if (allGroups.length >= maxGroups) break;

        await job.updateProgress(
          Math.round((keywords.indexOf(keyword) / keywords.length) * 100),
        );

        const groups = await this.scrapeGroupsByKeyword(
          browser,
          keyword,
          Math.min(maxGroups - allGroups.length, 20),
        );
        allGroups.push(...groups);

        // Nghỉ ngẫu nhiên 10-30 giây giữa mỗi từ khóa
        await BrowserService.randomDelay(10_000, 30_000);
      }

      // ── 5. Lưu vào Database ─────────────────────────────────────
      await this.saveGroups(userId, keywords, allGroups);

      this.logger.log(`[Job ${job.id}] Done. Found ${allGroups.length} groups.`);
      return allGroups;
    } catch (error) {
      this.logger.error(`[Job ${job.id}] Scrape failed: ${error}`);

      // Nếu lỗi do checkpoint/captcha, đánh dấu account
      if (this.isCheckpointError(error)) {
        await this.accountRepo.update(accountId, { status: 'checkpoint' });
        this.logger.warn(`Account ${accountId} hit checkpoint!`);
      }

      throw error;
    } finally {
      await this.browserService.closeBrowser(sessionId);
    }
  }

  private async scrapeGroupsByKeyword(
    browser: any,
    keyword: string,
    limit: number,
  ): Promise<ScrapedGroup[]> {
    const page: Page = await this.browserService.createPage(browser, {});
    const groups: ScrapedGroup[] = [];

    try {
      // ── Điều hướng đến trang tìm kiếm groups ─────────────────
      const searchUrl = `https://www.facebook.com/groups/search/?q=${encodeURIComponent(keyword)}`;
      await page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 30_000,
      });

      // Kiểm tra có bị redirect sang login không (mất cookie)
      if (page.url().includes('/login')) {
        throw new Error('CHECKPOINT: Redirected to login page. Cookies expired.');
      }

      // ── Cuộn để tải thêm kết quả ─────────────────────────────
      let previousHeight = 0;
      let scrollAttempts = 0;

      while (groups.length < limit && scrollAttempts < 10) {
        // Thu thập dữ liệu hiện tại
        const found = await page.evaluate(() => {
          const results: ScrapedGroup[] = [];

          // Tìm các card group trong kết quả tìm kiếm
          // Selector có thể thay đổi theo phiên bản FB
          const groupLinks = document.querySelectorAll(
            'a[href*="/groups/"][role="link"]',
          );

          groupLinks.forEach((link) => {
            const href = (link as HTMLAnchorElement).href;
            // Extract group ID từ URL
            const match = href.match(/\/groups\/(\d+)/);
            if (!match) return;

            const groupId = match[1];
            const nameEl = link.querySelector('span[dir="auto"]');
            const groupName = nameEl?.textContent?.trim() ?? '';

            // Tìm thông tin thành viên trong context gần nhất
            const card = link.closest('[data-testid]') ?? link.parentElement;
            const memberText = card?.querySelector(
              'span[aria-label*="member"], span[aria-label*="thành viên"]',
            )?.textContent ?? '';
            const memberMatch = memberText.match(/[\d,\.]+/);
            const memberCount = memberMatch
              ? parseInt(memberMatch[0].replace(/[,\.]/g, ''), 10)
              : undefined;

            if (groupId && groupName) {
              results.push({
                groupId,
                groupName,
                memberCount,
                privacy: 'public', // Tìm thêm privacy badge nếu cần
              });
            }
          });

          return results;
        });

        // Thêm các group chưa có vào danh sách
        for (const g of found) {
          if (!groups.find((x) => x.groupId === g.groupId)) {
            groups.push(g);
          }
        }

        // Cuộn xuống để tải thêm
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
        if (currentHeight === previousHeight) break; // Không còn nội dung mới
        previousHeight = currentHeight;

        await page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );

        // Chờ tải nội dung mới (2-4 giây)
        await BrowserService.randomDelay(2_000, 4_000);
        scrollAttempts++;
      }

      this.logger.debug(`Keyword "${keyword}": found ${groups.length} groups`);
      return groups.slice(0, limit);
    } finally {
      await page.close();
    }
  }

  private async saveGroups(
    userId: string,
    keywords: string[],
    groups: ScrapedGroup[],
  ): Promise<void> {
    for (const g of groups) {
      await this.groupRepo
        .createQueryBuilder()
        .insert()
        .into(Group)
        .values({
          userId,
          platform: 'facebook',
          groupId: g.groupId,
          groupName: g.groupName,
          memberCount: g.memberCount,
          privacy: g.privacy,
          keywords,
          lastScraped: new Date(),
        })
        .orUpdate(
          ['group_name', 'member_count', 'privacy', 'last_scraped', 'keywords'],
          ['user_id', 'platform', 'group_id'],
        )
        .execute();
    }
  }

  private isCheckpointError(error: any): boolean {
    const msg = error?.message?.toLowerCase() ?? '';
    return (
      msg.includes('checkpoint') ||
      msg.includes('captcha') ||
      msg.includes('login') ||
      msg.includes('confirm your identity')
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`✅ Scrape job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`❌ Scrape job ${job.id} failed: ${err.message}`);
  }
}
