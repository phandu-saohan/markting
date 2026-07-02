import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Proxy } from './entities/proxy.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Proxy])],
  exports: [TypeOrmModule],
})
export class ProxiesModule {}
