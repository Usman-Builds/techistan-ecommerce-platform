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
import { AdminOnly, CurrentUser } from '../../common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';

@AdminOnly()
@Controller('admin/categories')
export class AdminCategoryController {
  constructor(private readonly categories: CategoryService) {}

  /** Flat list with child/product counts for the manager UI. */
  @Get()
  list() {
    return this.categories.listAdmin();
  }

  /**
   * Nested tree INCLUDING hidden categories — what the admin category picker
   * renders. Declared before `:id` so the literal path always wins.
   */
  @Get('tree')
  tree() {
    return this.categories.getTree({ includeHidden: true });
  }

  /** Single category for the editor. */
  @Get(':id')
  get(@Param('id') id: string) {
    return this.categories.getAdminById(id);
  }

  @Post()
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.categories.create(dto, actorId);
  }

  @Post('reorder')
  reorder(
    @Body() dto: ReorderCategoriesDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.categories.reorder(dto, actorId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.categories.update(id, dto, actorId);
  }

  /** Blocked unless empty or `?reassignTo=<id>` is supplied. */
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('userId') actorId: number,
    @Query('reassignTo') reassignTo?: string,
  ) {
    return this.categories.remove(id, reassignTo, actorId);
  }
}
