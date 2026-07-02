import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { Post } from './entities/post.entity';
import { JobQueue } from './entities/job-queue.entity';
import { Group } from '../groups/entities/group.entity';
import { Account } from '../accounts/entities/account.entity';
import { QUEUE_NAMES } from '../../queues/queues.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, JobQueue, Group, Account]),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.FB_GROUP_POST },
      { name: QUEUE_NAMES.FB_FANPAGE },
      { name: QUEUE_NAMES.TIKTOK },
      { name: QUEUE_NAMES.YOUTUBE },
      { name: QUEUE_NAMES.REELS },
      { name: QUEUE_NAMES.ZALO_OA },
      { name: QUEUE_NAMES.ZALO_PERSONAL },
    ),
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
