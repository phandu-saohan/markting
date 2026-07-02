import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign, CampaignStatus } from './entities/campaign.entity';
import { Group } from '../groups/entities/group.entity';
import { Post } from '../posts/entities/post.entity';
import { PostsService } from '../posts/posts.service';
import { CreateCampaignDto, UpdateCampaignDto, LaunchCampaignDto, CampaignQueryDto } from './dto/campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,

    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,

    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,

    private readonly postsService: PostsService,
  ) {}

  async create(userId: string, dto: CreateCampaignDto): Promise<Campaign> {
    const campaign = this.campaignRepo.create({
      userId,
      ...dto,
      startAt: dto.startAt ? new Date(dto.startAt) : undefined,
      endAt: dto.endAt ? new Date(dto.endAt) : undefined,
    });
    return this.campaignRepo.save(campaign);
  }

  async findAll(userId: string, query: CampaignQueryDto) {
    const { status, platform, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const qb = this.campaignRepo
      .createQueryBuilder('c')
      .where('c.user_id = :userId', { userId })
      .orderBy('c.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (status) qb.andWhere('c.status = :status', { status });
    if (platform) qb.andWhere('c.platform = :platform', { platform });

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(userId: string, id: string): Promise<Campaign> {
    const c = await this.campaignRepo.findOne({ where: { id, userId } });
    if (!c) throw new NotFoundException(`Campaign ${id} not found`);
    return c;
  }

  async update(userId: string, id: string, dto: UpdateCampaignDto): Promise<Campaign> {
    await this.findOne(userId, id);
    await this.campaignRepo.update(id, {
      ...dto,
      startAt: dto.startAt ? new Date(dto.startAt) : undefined,
      endAt: dto.endAt ? new Date(dto.endAt) : undefined,
    });
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.campaignRepo.delete(id);
    return { message: 'Campaign deleted' };
  }

  async pause(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.campaignRepo.update(id, { status: CampaignStatus.PAUSED });
    return { message: 'Campaign paused' };
  }

  async resume(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.campaignRepo.update(id, { status: CampaignStatus.ACTIVE });
    return { message: 'Campaign resumed' };
  }

  /**
   * Launch: Đăng post template vào tất cả nhóm đích của campaign
   * Tự động tạo schedule jobs với delay ngẫu nhiên giữa mỗi nhóm
   */
  async launch(userId: string, id: string, dto: LaunchCampaignDto) {
    const campaign = await this.findOne(userId, id);
    const post = await this.postRepo.findOne({
      where: { id: dto.postId, userId },
    });
    if (!post) throw new BadRequestException('Post not found');

    if (!campaign.targetGroupIds?.length) {
      throw new BadRequestException('Campaign has no target groups');
    }
    if (!campaign.accountIds?.length) {
      throw new BadRequestException('Campaign has no accounts configured');
    }

    const groups = await this.groupRepo.findByIds(campaign.targetGroupIds);
    const jobs: any[] = [];

    // Phân bổ tài khoản round-robin qua các nhóm
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const accountId = campaign.accountIds[i % campaign.accountIds.length];

      // Tính thời gian đăng: startAt + (i * interval ngẫu nhiên)
      const baseTime = campaign.startAt ?? new Date();
      const intervalMinutes = this.randomBetween(
        campaign.delayMin ?? 5,
        campaign.delayMax ?? 15,
      );
      const scheduledAt = new Date(
        baseTime.getTime() + i * intervalMinutes * 60_000,
      ).toISOString();

      const result = await this.postsService.schedule(userId, {
        postId: post.id,
        accountId,
        groupId: group.id,
        fbGroupId: group.groupId,
        scheduledAt,
        delayMin: campaign.delayMin,
        delayMax: campaign.delayMax,
      });

      jobs.push({ group: group.groupName, scheduledAt, ...result });
    }

    await this.campaignRepo.update(id, { status: CampaignStatus.ACTIVE });

    return {
      message: `Launched ${jobs.length} jobs for campaign "${campaign.name}"`,
      jobs,
    };
  }

  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
