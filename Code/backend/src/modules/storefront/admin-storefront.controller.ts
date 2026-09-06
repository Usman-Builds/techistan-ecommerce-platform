import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { NavLocation } from '@prisma/client';
import { AdminOnly, CurrentUser } from '../../common';
import { HomepageService } from './homepage.service';
import { NavigationService } from './navigation.service';
import {
  CreateHeroSlideDto,
  CreateHomepageSectionDto,
  ReorderDto,
  UpdateHeroSlideDto,
  UpdateHomepageSectionDto,
} from './dto/homepage.dto';
import {
  CreateNavItemDto,
  ReorderNavDto,
  UpdateNavItemDto,
} from './dto/navigation.dto';

/**
 * Homepage builder (script 18). `@AdminOnly()` layers JwtAuthGuard + RolesGuard;
 * every mutation is audited in the service.
 *
 * Literal segments (`sections/reorder`, `slides/reorder`) are declared before
 * their `:id` siblings so Nest never matches "reorder" as an id.
 */
@AdminOnly()
@Controller('admin/homepage')
export class AdminHomepageController {
  constructor(private readonly homepage: HomepageService) {}

  @Get()
  get() {
    return this.homepage.getAdminHomepage();
  }

  /**
   * Populate the default layout. `?replace=true` clears first — that is the
   * "reset to default" action, and without it a second press is a no-op rather
   * than a duplicated page.
   */
  @Post('seed')
  seed(
    @CurrentUser('userId') actorId: number,
    @Query('replace') replace?: string,
  ) {
    return this.homepage.seedDefaults(replace === 'true', actorId);
  }

  // ── Sections ───────────────────────────────────────────────────────────
  @Post('sections')
  createSection(
    @Body() dto: CreateHomepageSectionDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.homepage.createSection(dto, actorId);
  }

  @Post('sections/reorder')
  reorderSections(
    @Body() dto: ReorderDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.homepage.reorderSections(dto, actorId);
  }

  @Patch('sections/:id')
  updateSection(
    @Param('id') id: string,
    @Body() dto: UpdateHomepageSectionDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.homepage.updateSection(id, dto, actorId);
  }

  @Delete('sections/:id')
  deleteSection(
    @Param('id') id: string,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.homepage.deleteSection(id, actorId);
  }

  // ── Hero slides ────────────────────────────────────────────────────────
  @Post('slides')
  createSlide(
    @Body() dto: CreateHeroSlideDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.homepage.createSlide(dto, actorId);
  }

  @Post('slides/reorder')
  reorderSlides(
    @Body() dto: ReorderDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.homepage.reorderSlides(dto, actorId);
  }

  @Patch('slides/:id')
  updateSlide(
    @Param('id') id: string,
    @Body() dto: UpdateHeroSlideDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.homepage.updateSlide(id, dto, actorId);
  }

  @Delete('slides/:id')
  deleteSlide(@Param('id') id: string, @CurrentUser('userId') actorId: number) {
    return this.homepage.deleteSlide(id, actorId);
  }
}

/** Header + footer navigation management (script 18). */
@AdminOnly()
@Controller('admin/navigation')
export class AdminNavigationController {
  constructor(private readonly navigation: NavigationService) {}

  @Get()
  list(@Query('location') location?: NavLocation) {
    return this.navigation.listAdmin(location);
  }

  /** Build a starting menu from the store's own categories. */
  @Post('seed')
  seed(
    @CurrentUser('userId') actorId: number,
    @Query('location') location?: NavLocation,
    @Query('replace') replace?: string,
  ) {
    return this.navigation.seedFromCategories(
      location,
      replace === 'true',
      actorId,
    );
  }

  @Post('reorder')
  reorder(@Body() dto: ReorderNavDto, @CurrentUser('userId') actorId: number) {
    return this.navigation.reorder(dto, actorId);
  }

  @Post()
  create(
    @Body() dto: CreateNavItemDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.navigation.create(dto, actorId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNavItemDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.navigation.update(id, dto, actorId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('userId') actorId: number) {
    return this.navigation.remove(id, actorId);
  }
}
