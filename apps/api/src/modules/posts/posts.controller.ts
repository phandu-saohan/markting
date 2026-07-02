import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PostsService } from './posts.service';
import { CreatePostDto, UpdatePostDto, SchedulePostDto, PostQueryDto } from './dto/post.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Posts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  /** POST /posts — Tạo bài viết mới */
  @Post()
  @ApiOperation({ summary: 'Tạo bài viết mới (draft hoặc scheduled)' })
  create(@Request() req, @Body() dto: CreatePostDto) {
    return this.postsService.create(req.user.id, dto);
  }

  /** GET /posts — Danh sách bài viết */
  @Get()
  @ApiOperation({ summary: 'Danh sách bài viết, lọc theo status/platform/campaign' })
  findAll(@Request() req, @Query() query: PostQueryDto) {
    return this.postsService.findAll(req.user.id, query);
  }

  /** GET /posts/:id */
  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết bài viết' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.postsService.findOne(req.user.id, id);
  }

  /** PUT /posts/:id */
  @Put(':id')
  @ApiOperation({ summary: 'Cập nhật bài viết' })
  update(@Request() req, @Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.postsService.update(req.user.id, id, dto);
  }

  /** DELETE /posts/:id */
  @Delete(':id')
  @ApiOperation({ summary: 'Xóa bài viết' })
  remove(@Request() req, @Param('id') id: string) {
    return this.postsService.remove(req.user.id, id);
  }

  /**
   * POST /posts/schedule
   * Lên lịch đăng bài — đưa vào BullMQ queue theo platform
   */
  @Post('schedule')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Lên lịch đăng bài (đưa vào queue)' })
  schedule(@Request() req, @Body() dto: SchedulePostDto) {
    return this.postsService.schedule(req.user.id, dto);
  }

  /**
   * GET /posts/:id/jobs
   * Lịch sử job của một bài viết
   */
  @Get(':id/jobs')
  @ApiOperation({ summary: 'Lịch sử queue jobs của bài viết' })
  getJobHistory(@Request() req, @Param('id') id: string) {
    return this.postsService.getJobHistory(req.user.id, id);
  }
}
