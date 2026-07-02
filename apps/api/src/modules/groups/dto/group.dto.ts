import { IsString, IsOptional, IsArray, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ScrapeGroupsDto {
  @ApiProperty({ example: ['bất động sản hà nội', 'mua bán nhà đất'] })
  @IsArray()
  @IsString({ each: true })
  keywords: string[];

  @ApiProperty({ description: 'ID tài khoản Facebook dùng để scrape' })
  @IsString()
  accountId: string;

  @ApiPropertyOptional({ example: 50, description: 'Số nhóm tối đa cần lấy' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  maxGroups?: number;
}

export class GroupQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: ['public', 'private', 'closed'] })
  @IsOptional()
  @IsEnum(['public', 'private', 'closed'])
  privacy?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
