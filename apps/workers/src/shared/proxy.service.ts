import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Proxy } from '../../modules/proxies/entities/proxy.entity';

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);
  private proxyPool: Map<string, Proxy[]> = new Map();
  private rotationIndex: Map<string, number> = new Map();

  constructor(
    @InjectRepository(Proxy)
    private readonly proxyRepo: Repository<Proxy>,
  ) {}

  /**
   * Lấy proxy tiếp theo theo round-robin, ưu tiên proxy ít lỗi nhất
   */
  async getNextProxy(userId: string): Promise<string | null> {
    let proxies = this.proxyPool.get(userId);

    // Reload từ DB nếu pool trống hoặc cũ
    if (!proxies || proxies.length === 0) {
      proxies = await this.loadProxies(userId);
    }

    if (proxies.length === 0) {
      this.logger.warn(`No active proxies for user ${userId}`);
      return null;
    }

    // Sắp xếp: proxy ít lỗi nhất và chưa dùng lâu nhất lên đầu
    proxies.sort((a, b) => {
      if (a.failCount !== b.failCount) return a.failCount - b.failCount;
      const aTime = a.lastUsed?.getTime() ?? 0;
      const bTime = b.lastUsed?.getTime() ?? 0;
      return aTime - bTime;
    });

    // Round-robin
    const index = (this.rotationIndex.get(userId) ?? 0) % proxies.length;
    this.rotationIndex.set(userId, index + 1);
    const proxy = proxies[index];

    // Cập nhật last_used
    await this.proxyRepo.update(proxy.id, { lastUsed: new Date() });

    return this.buildProxyUrl(proxy);
  }

  /**
   * Đánh dấu proxy lỗi và disable nếu fail_count > ngưỡng
   */
  async markProxyFailed(proxyId: string): Promise<void> {
    const proxy = await this.proxyRepo.findOne({ where: { id: proxyId } });
    if (!proxy) return;

    const newFailCount = proxy.failCount + 1;
    const isActive = newFailCount < 5; // disable sau 5 lần lỗi liên tiếp

    await this.proxyRepo.update(proxyId, {
      failCount: newFailCount,
      isActive,
    });

    this.logger.warn(
      `Proxy ${proxy.host}:${proxy.port} fail #${newFailCount}. Active: ${isActive}`,
    );

    // Xóa khỏi pool cache
    for (const [userId, pool] of this.proxyPool.entries()) {
      const filtered = pool.filter((p) => p.id !== proxyId);
      this.proxyPool.set(userId, filtered);
    }
  }

  /**
   * Reset fail count sau khi proxy hoạt động trở lại
   */
  async markProxySuccess(proxyId: string): Promise<void> {
    await this.proxyRepo.update(proxyId, { failCount: 0, isActive: true });
  }

  private async loadProxies(userId: string): Promise<Proxy[]> {
    const proxies = await this.proxyRepo.find({
      where: [
        { userId, isActive: true },
        { userId: IsNull(), isActive: true }, // proxy global (không gắn user)
      ],
      order: { failCount: 'ASC', lastUsed: 'ASC' },
      take: 50,
    });
    this.proxyPool.set(userId, proxies);
    return proxies;
  }

  private buildProxyUrl(proxy: Proxy): string {
    const auth = proxy.username
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password ?? '')}@`
      : '';
    return `${proxy.protocol}://${auth}${proxy.host}:${proxy.port}`;
  }
}
