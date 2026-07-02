import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindManyOptions } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Group } from './entities/group.entity';
import { ScrapeGroupsDto, GroupQueryDto } from './dto/group.dto';
import { QUEUE_NAMES, JOB_NAMES } from '../../queues/queues.module';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,

    @InjectQueue(QUEUE_NAMES.FB_SCRAPE)
    private readonly scrapeQueue: Queue,
  ) {}

  /** Kích hoạt job quét nhóm Facebook */
  async scrape(userId: string, dto: ScrapeGroupsDto) {
    const job = await this.scrapeQueue.add(
      JOB_NAMES.SCRAPE_GROUPS,
      {
        userId,
        keywords: dto.keywords,
        accountId: dto.accountId,
        maxGroups: dto.maxGroups ?? 50,
      },
      {
        jobId: `scrape-${userId}-${Date.now()}`,
        attempts: 2,
      },
    );
    return { jobId: job.id, message: 'Scraping started' };
  }

  /** Lấy danh sách nhóm với phân trang */
  async findAll(userId: string, query: GroupQueryDto) {
    const { keyword, privacy, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: FindManyOptions<Group>['where'] = { userId, isActive: true };
    if (privacy) (where as any).privacy = privacy;

    const [data, total] = await this.groupRepo.findAndCount({
      where,
      order: { memberCount: 'DESC', createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Client-side keyword filter (hoặc dùng GIN index trên keywords column)
    const filtered = keyword
      ? data.filter(
          (g) =>
            g.groupName?.toLowerCase().includes(keyword.toLowerCase()) ||
            g.keywords?.some((k) => k.toLowerCase().includes(keyword.toLowerCase())),
        )
      : data;

    return {
      data: filtered,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(userId: string, id: string) {
    const group = await this.groupRepo.findOne({ where: { id, userId } });
    if (!group) throw new NotFoundException(`Group ${id} not found`);
    return group;
  }

  async remove(userId: string, id: string) {
    const group = await this.findOne(userId, id);
    await this.groupRepo.update(id, { isActive: false });
    return { message: 'Group deactivated' };
  }

  /** Thống kê số nhóm theo platform */
  async stats(userId: string) {
    const result = await this.groupRepo
      .createQueryBuilder('g')
      .select('g.platform', 'platform')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(g.member_count)', 'totalMembers')
      .where('g.user_id = :userId AND g.is_active = true', { userId })
      .groupBy('g.platform')
      .getRawMany();
    return result;
  }
}
