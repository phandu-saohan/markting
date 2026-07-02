import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { Group } from './entities/group.entity';
import { QUEUE_NAMES } from '../../queues/queues.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Group]),
    BullModule.registerQueue({ name: QUEUE_NAMES.FB_SCRAPE }),
  ],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
