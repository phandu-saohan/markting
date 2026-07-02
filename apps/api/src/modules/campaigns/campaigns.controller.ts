import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import {
  CreateCampaignDto, UpdateCampaignDto, LaunchCampaignDto, CampaignQueryDto,
} from './dto/campaign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo campaign mới' })
  create(@Request() req, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách campaigns' })
  findAll(@Request() req, @Query() query: CampaignQueryDto) {
    return this.campaignsService.findAll(req.user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết campaign' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.campaignsService.findOne(req.user.id, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Cập nhật campaign' })
  update(@Request() req, @Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaignsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa campaign' })
  remove(@Request() req, @Param('id') id: string) {
    return this.campaignsService.remove(req.user.id, id);
  }

  /**
   * POST /campaigns/:id/launch
   * 🚀 Phóng campaign: tự động schedule đăng bài vào TẤT CẢ nhóm đích
   */
  @Post(':id/launch')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '🚀 Phóng campaign — tự động queue tất cả groups' })
  launch(@Request() req, @Param('id') id: string, @Body() dto: LaunchCampaignDto) {
    return this.campaignsService.launch(req.user.id, id, dto);
  }

  /** POST /campaigns/:id/pause */
  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tạm dừng campaign' })
  pause(@Request() req, @Param('id') id: string) {
    return this.campaignsService.pause(req.user.id, id);
  }

  /** POST /campaigns/:id/resume */
  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tiếp tục campaign đã tạm dừng' })
  resume(@Request() req, @Param('id') id: string) {
    return this.campaignsService.resume(req.user.id, id);
  }
}
