import {
  IsString, IsOptional, IsArray, IsEnum, IsDateString,
  IsInt, IsBoolean, Min, Max, IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CampaignPlatform } from '../entities/campaign.entity';

export class CreateCampaignDto {
  @ApiProperty({ example: 'Campaign BĐS Hà Nội tháng 7' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: CampaignPlatform })
  @IsEnum(CampaignPlatform)
  platform: CampaignPlatform;

  @ApiPropertyOptional({ type: [String], description: 'UUID[] các nhóm đích' })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  targetGroupIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'UUID[] các tài khoản đăng bài' })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  accountIds?: string[];

  @ApiPropertyOptional({ description: 'Cấu hình lịch (cron/interval)' })
  @IsOptional()
  scheduleConfig?: Record<string, any>;

  @ApiPropertyOptional({ default: 5, description: 'Delay tối thiểu (phút)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  delayMin?: number;

  @ApiPropertyOptional({ default: 15, description: 'Delay tối đa (phút)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  delayMax?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  rotateProxy?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endAt?: string;
}

export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}

export class LaunchCampaignDto {
  @ApiProperty({ description: 'ID post template để đăng' })
  @IsUUID()
  postId: string;
}

export class CampaignQueryDto {
  @ApiPropertyOptional({ enum: ['draft', 'active', 'paused', 'completed'] })
  @IsOptional()
  @IsEnum(['draft', 'active', 'paused', 'completed'])
  status?: string;

  @ApiPropertyOptional({ enum: CampaignPlatform })
  @IsOptional()
  @IsEnum(CampaignPlatform)
  platform?: CampaignPlatform;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
