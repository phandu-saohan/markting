import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Browser, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin = require('puppeteer-extra-plugin-stealth');
import AnonymizeUAPlugin from 'puppeteer-extra-plugin-anonymize-ua';
import { ConfigService } from '@nestjs/config';

// Áp dụng stealth plugin để qua mặt bot detection
puppeteer.use(StealthPlugin());
puppeteer.use(AnonymizeUAPlugin());

export interface BrowserOptions {
  proxyUrl?: string;       // format: http://user:pass@host:port
  cookies?: CookieEntry[]; // cookies từ DB
  headless?: boolean;
  userAgent?: string;
}

export interface CookieEntry {
  name: string;
  value: string;
  domain: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserService.name);
  private browsers: Map<string, Browser> = new Map();

  constructor(private readonly config: ConfigService) {}

  /**
   * Tạo browser instance mới với proxy và cookies
   * Mỗi tài khoản dùng một browser riêng biệt (fingerprint isolation)
   */
  async createBrowser(sessionId: string, opts: BrowserOptions = {}): Promise<Browser> {
    // Đóng browser cũ nếu tồn tại
    await this.closeBrowser(sessionId);

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1920,1080',
      '--disable-web-security',
      '--allow-running-insecure-content',
    ];

    if (opts.proxyUrl) {
      const proxyHost = new URL(opts.proxyUrl);
      args.push(`--proxy-server=${proxyHost.protocol}//${proxyHost.hostname}:${proxyHost.port}`);
    }

    const executablePath = this.config.get('CHROME_EXECUTABLE_PATH');
    const isHeadless = opts.headless ?? this.config.get('HEADLESS', 'true') === 'true';

    const browser = await puppeteer.launch({
      headless: isHeadless,
      executablePath: executablePath || undefined,
      args,
      ignoreDefaultArgs: ['--enable-automation'],
    });

    this.browsers.set(sessionId, browser);
    this.logger.log(`Browser created for session: ${sessionId}`);
    return browser;
  }

  /**
   * Tạo Page với đầy đủ cookies, user agent, và anti-detection
   */
  async createPage(browser: Browser, opts: BrowserOptions = {}): Promise<Page> {
    const page = await browser.newPage();

    // Set viewport ngẫu nhiên để mô phỏng người dùng thực
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
    ];
    const vp = viewports[Math.floor(Math.random() * viewports.length)];
    await page.setViewport(vp);

    // Set User-Agent (stealth plugin đã xử lý nhưng override thêm nếu cần)
    if (opts.userAgent) {
      await page.setUserAgent(opts.userAgent);
    }

    // Inject proxy auth nếu có username/password
    if (opts.proxyUrl) {
      const proxyUrl = new URL(opts.proxyUrl);
      if (proxyUrl.username && proxyUrl.password) {
        await page.authenticate({
          username: decodeURIComponent(proxyUrl.username),
          password: decodeURIComponent(proxyUrl.password),
        });
      }
    }

    // Set cookies từ tài khoản FB
    if (opts.cookies && opts.cookies.length > 0) {
      await page.setCookie(...opts.cookies);
    }

    // Che giấu webdriver flag
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      // Fake chrome object
      (window as any).chrome = { runtime: {} };
    });

    // Chặn tải ảnh/font để tăng tốc (tùy chỉnh)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    return page;
  }

  async closeBrowser(sessionId: string): Promise<void> {
    const browser = this.browsers.get(sessionId);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        this.logger.warn(`Error closing browser ${sessionId}: ${e}`);
      }
      this.browsers.delete(sessionId);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing all browser instances...');
    for (const [id] of this.browsers) {
      await this.closeBrowser(id);
    }
  }

  /**
   * Helper: Delay ngẫu nhiên để mô phỏng hành vi người dùng
   */
  static async randomDelay(minMs = 1000, maxMs = 3000): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise((r) => setTimeout(r, delay));
  }

  /**
   * Helper: Gõ chữ từng ký tự (mô phỏng typing thực)
   */
  static async humanType(page: Page, selector: string, text: string): Promise<void> {
    await page.focus(selector);
    for (const char of text) {
      await page.keyboard.type(char);
      await BrowserService.randomDelay(50, 200);
    }
  }
}
