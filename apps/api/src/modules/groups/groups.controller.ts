import {
  Controller, Get, Post, Delete, Body, Param, Query,
  UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import { ScrapeGroupsDto, GroupQueryDto } from './dto/group.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  /**
   * POST /groups/scrape
   * Kích hoạt job quét nhóm Facebook theo từ khóa
   */
  @Post('scrape')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Kích hoạt scrape nhóm Facebook theo từ khóa' })
  @ApiResponse({ status: 202, description: 'Scrape job queued' })
  scrape(@Request() req, @Body() dto: ScrapeGroupsDto) {
    return this.groupsService.scrape(req.user.id, dto);
  }

  /**
   * GET /groups
   * Danh sách nhóm đã quét, hỗ trợ filter và phân trang
   */
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách nhóm đã quét' })
  findAll(@Request() req, @Query() query: GroupQueryDto) {
    return this.groupsService.findAll(req.user.id, query);
  }

  /**
   * GET /groups/stats
   * Thống kê nhóm theo platform
   */
  @Get('stats')
  @ApiOperation({ summary: 'Thống kê nhóm theo platform' })
  stats(@Request() req) {
    return this.groupsService.stats(req.user.id);
  }

  /**
   * GET /groups/:id
   */
  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một nhóm' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.groupsService.findOne(req.user.id, id);
  }

  /**
   * DELETE /groups/:id
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Xóa (deactivate) nhóm' })
  remove(@Request() req, @Param('id') id: string) {
    return this.groupsService.remove(req.user.id, id);
  }
}
