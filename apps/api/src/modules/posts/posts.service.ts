import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Post, PostStatus, PostPlatform } from './entities/post.entity';
import { JobQueue, JobStatus } from './entities/job-queue.entity';
import { Group } from '../groups/entities/group.entity';
import { Account } from '../accounts/entities/account.entity';
import { CreatePostDto, UpdatePostDto, SchedulePostDto, PostQueryDto } from './dto/post.dto';
import { QUEUE_NAMES, JOB_NAMES } from '../../queues/queues.module';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,

    @InjectRepository(JobQueue)
    private readonly jobQueueRepo: Repository<JobQueue>,

    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,

    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,

    @InjectQueue(QUEUE_NAMES.FB_GROUP_POST)
    private readonly fbGroupQueue: Queue,

    @InjectQueue(QUEUE_NAMES.FB_FANPAGE)
    private readonly fbFanpageQueue: Queue,

    @InjectQueue(QUEUE_NAMES.TIKTOK)
    private readonly tiktokQueue: Queue,

    @InjectQueue(QUEUE_NAMES.YOUTUBE)
    private readonly youtubeQueue: Queue,

    @InjectQueue(QUEUE_NAMES.REELS)
    private readonly reelsQueue: Queue,

    @InjectQueue(QUEUE_NAMES.ZALO_OA)
    private readonly zaloOAQueue: Queue,

    @InjectQueue(QUEUE_NAMES.ZALO_PERSONAL)
    private readonly zaloPersonalQueue: Queue,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────

  async create(userId: string, dto: CreatePostDto): Promise<Post> {
    const post = this.postRepo.create({
      userId,
      ...dto,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      status: dto.scheduledAt ? PostStatus.SCHEDULED : PostStatus.DRAFT,
    });
    return this.postRepo.save(post);
  }

  async findAll(userId: string, query: PostQueryDto) {
    const { status, platform, campaignId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const qb = this.postRepo
      .createQueryBuilder('p')
      .where('p.user_id = :userId', { userId })
      .orderBy('p.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (status) qb.andWhere('p.status = :status', { status });
    if (platform) qb.andWhere('p.platform = :platform', { platform });
    if (campaignId) qb.andWhere('p.campaign_id = :campaignId', { campaignId });

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(userId: string, id: string): Promise<Post> {
    const post = await this.postRepo.findOne({ where: { id, userId } });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    return post;
  }

  async update(userId: string, id: string, dto: UpdatePostDto): Promise<Post> {
    await this.findOne(userId, id);
    await this.postRepo.update(id, {
      ...dto,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
    });
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.postRepo.delete(id);
    return { message: 'Post deleted' };
  }

  // ── SCHEDULING ───────────────────────────────────────────────

  /**
   * Lên lịch đăng một bài vào đúng queue theo platform
   */
  async schedule(userId: string, dto: SchedulePostDto) {
    const post = await this.findOne(userId, dto.postId);
    const account = await this.accountRepo.findOne({
      where: { id: dto.accountId, userId },
    });
    if (!account) throw new BadRequestException('Account not found');

    // Tạo JobQueue record trong DB
    const jobQueueRecord = await this.jobQueueRepo.save(
      this.jobQueueRepo.create({
        postId: post.id,
        campaignId: post.campaignId,
        accountId: account.id,
        groupId: dto.groupId,
        queueName: this.getQueueName(post.platform),
        status: JobStatus.WAITING,
        scheduledAt: new Date(dto.scheduledAt),
      }),
    );

    // Đưa vào BullMQ queue tương ứng
    const bullJob = await this.dispatchToQueue(post, account, dto, jobQueueRecord.id);

    // Cập nhật bull_job_id
    await this.jobQueueRepo.update(jobQueueRecord.id, { bullJobId: bullJob.id });

    // Cập nhật status bài viết
    await this.postRepo.update(post.id, { status: PostStatus.QUEUED });

    return {
      jobQueueId: jobQueueRecord.id,
      bullJobId: bullJob.id,
      scheduledAt: dto.scheduledAt,
      queue: this.getQueueName(post.platform),
    };
  }

  /** Lấy danh sách jobs của một bài viết */
  async getJobHistory(userId: string, postId: string) {
    await this.findOne(userId, postId);
    return this.jobQueueRepo.find({
      where: { postId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── PRIVATE HELPERS ──────────────────────────────────────────

  private async dispatchToQueue(
    post: Post,
    account: Account,
    dto: SchedulePostDto,
    jobQueueId: string,
  ) {
    const scheduledAt = dto.scheduledAt;
    const delayMs = this.calcDelay(scheduledAt, dto.delayMin ?? 5, dto.delayMax ?? 15);
    const baseOpts = { delay: delayMs, attempts: 3 };

    switch (post.platform) {
      case PostPlatform.FB_GROUP:
        return this.fbGroupQueue.add(
          JOB_NAMES.POST_TO_GROUP,
          {
            jobQueueId,
            postId: post.id,
            campaignId: post.campaignId,
            accountId: account.id,
            groupId: dto.groupId,
            fbGroupId: dto.fbGroupId,
            content: post.content,
            mediaUrls: post.mediaUrls,
            scheduledAt,
          },
          { ...baseOpts, jobId: `grp-${post.id}-${dto.groupId}` },
        );

      case PostPlatform.FB_FANPAGE:
        return this.fbFanpageQueue.add(
          JOB_NAMES.POST_TO_FANPAGE,
          {
            jobQueueId,
            postId: post.id,
            accountId: account.id,
            pageId: account.meta?.pageId,
            content: post.content,
            mediaUrls: post.mediaUrls,
            scheduledAt,
          },
          { ...baseOpts, jobId: `fanpage-${post.id}` },
        );

      case PostPlatform.TIKTOK:
        return this.tiktokQueue.add(
          JOB_NAMES.UPLOAD_TIKTOK,
          {
            jobQueueId, postId: post.id, accountId: account.id,
            accessToken: account.accessToken,
            videoUrl: post.mediaUrls?.[0],
            title: post.title ?? post.content.substring(0, 100),
            description: post.content,
            hashtags: post.hashtags ?? [],
            scheduledAt,
          },
          { ...baseOpts, jobId: `tiktok-${post.id}` },
        );

      case PostPlatform.YOUTUBE:
        return this.youtubeQueue.add(
          JOB_NAMES.UPLOAD_YOUTUBE,
          {
            jobQueueId, postId: post.id, accountId: account.id,
            accessToken: account.accessToken,
            videoUrl: post.mediaUrls?.[0],
            title: post.title ?? post.content.substring(0, 100),
            description: post.content,
            hashtags: post.hashtags ?? [],
            scheduledAt,
          },
          { ...baseOpts, jobId: `yt-${post.id}` },
        );

      case PostPlatform.REELS:
        return this.reelsQueue.add(
          JOB_NAMES.UPLOAD_REELS,
          {
            jobQueueId, postId: post.id, accountId: account.id,
            accessToken: account.accessToken,
            videoUrl: post.mediaUrls?.[0],
            title: post.title,
            description: post.content,
            hashtags: post.hashtags ?? [],
            scheduledAt,
          },
          { ...baseOpts, jobId: `reels-${post.id}` },
        );

      case PostPlatform.ZALO_OA:
        return this.zaloOAQueue.add(
          JOB_NAMES.POST_ZALO_OA,
          {
            jobQueueId, postId: post.id,
            oaId: account.meta?.oaId,
            accessToken: account.accessToken,
            content: post.content,
            imageUrl: post.mediaUrls?.[0],
            scheduledAt,
          },
          { ...baseOpts, jobId: `zalo-oa-${post.id}` },
        );

      case PostPlatform.ZALO_PERSONAL:
        return this.zaloPersonalQueue.add(
          JOB_NAMES.POST_ZALO_DIARY,
          {
            jobQueueId, postId: post.id,
            accountId: account.id,
            content: post.content,
            mediaUrls: post.mediaUrls,
            scheduledAt,
          },
          { ...baseOpts, jobId: `zalo-personal-${post.id}` },
        );

      default:
        throw new BadRequestException(`Unsupported platform: ${post.platform}`);
    }
  }

  private getQueueName(platform: PostPlatform): string {
    const map: Record<PostPlatform, string> = {
      [PostPlatform.FB_GROUP]:    QUEUE_NAMES.FB_GROUP_POST,
      [PostPlatform.FB_FANPAGE]:  QUEUE_NAMES.FB_FANPAGE,
      [PostPlatform.ZALO_OA]:     QUEUE_NAMES.ZALO_OA,
      [PostPlatform.ZALO_PERSONAL]: QUEUE_NAMES.ZALO_PERSONAL,
      [PostPlatform.TIKTOK]:      QUEUE_NAMES.TIKTOK,
      [PostPlatform.YOUTUBE]:     QUEUE_NAMES.YOUTUBE,
      [PostPlatform.REELS]:       QUEUE_NAMES.REELS,
    };
    return map[platform] ?? 'unknown';
  }

  private calcDelay(scheduledAt: string, delayMin: number, delayMax: number): number {
    const target = new Date(scheduledAt).getTime();
    const now = Date.now();
    const base = Math.max(0, target - now);
    const jitter = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 60_000;
    return base + jitter;
  }
}
