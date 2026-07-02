import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailList, EmailContact } from './entities/email-list.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EmailList, EmailContact])],
  exports: [TypeOrmModule],
})
export class EmailListsModule {}
