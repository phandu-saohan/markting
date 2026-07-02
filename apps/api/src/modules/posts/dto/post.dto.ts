import {
  IsString, IsOptional, IsArray, IsEnum, IsDateString,
  IsInt, Min, Max, IsUrl, ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PostPlatform, MediaType, PostStatus } from '../entities/post.entity';

export class CreatePostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ example: 'Nội dung bài viết của bạn...' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  mediaUrls?: string[];

  @ApiPropertyOptional({ enum: MediaType })
  @IsOptional()
  @IsEnum(MediaType)
  mediaType?: MediaType;

  @ApiProperty({ enum: PostPlatform })
  @IsEnum(PostPlatform)
  platform: PostPlatform;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @ApiPropertyOptional({ description: 'ISO 8601 datetime' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  campaignId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  meta?: Record<string, any>;
}

export class UpdatePostDto extends PartialType(CreatePostDto) {
  scheduledAt?: string;
}

export class SchedulePostDto {
  @ApiProperty({ description: 'ID bài viết cần lên lịch' })
  @IsString()
  postId: string;

  @ApiProperty({ description: 'ID tài khoản đăng bài' })
  @IsString()
  accountId: string;

  @ApiPropertyOptional({ description: 'ID nhóm đích (nếu đăng vào group)' })
  @IsOptional()
  @IsString()
  groupId?: string;

  @ApiPropertyOptional({ description: 'Facebook Group ID thực tế' })
  @IsOptional()
  @IsString()
  fbGroupId?: string;

  @ApiProperty({ description: 'Thời điểm đăng (ISO 8601)' })
  @IsDateString()
  scheduledAt: string;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  delayMin?: number;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  delayMax?: number;
}

export class PostQueryDto {
  @ApiPropertyOptional({ enum: PostStatus })
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  @ApiPropertyOptional({ enum: PostPlatform })
  @IsOptional()
  @IsEnum(PostPlatform)
  platform?: PostPlatform;

  @ApiPropertyOptional()
  @IsOptional()
  campaignId?: string;

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
