import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../../common';
import { ProductService } from './product.service';
import { ListProductsDto } from './dto/list-products.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BulkUpdateDto } from './dto/bulk-update.dto';
import { SetImagesDto } from './dto/set-images.dto';
import { UpdateSeoDto } from './dto/update-seo.dto';

/**
 * Admin catalog writes (FR-206/208/802/808). `@AdminOnly()` layers JwtAuthGuard +
 * RolesGuard (ADMIN | SUPER_ADMIN). Every mutation writes an AuditLog in the
 * service. `actorId` comes from the JWT via `@CurrentUser`.
 *
 * Route note: the static `bulk` segment is declared before `:id/*` handlers so
 * `POST /admin/products/bulk` never resolves to the `:id/duplicate` matcher.
 */
@AdminOnly()
@Controller('admin/products')
export class AdminProductController {
  constructor(private readonly products: ProductService) {}

  /** Admin listing — all statuses (unlike the public endpoint). */
  @Get()
  list(@Query() dto: ListProductsDto) {
    return this.products.list(dto, true);
  }

  @Post()
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.products.create(dto, actorId);
  }

  @Post('bulk')
  bulk(@Body() dto: BulkUpdateDto, @CurrentUser('userId') actorId: number) {
    return this.products.bulk(dto, actorId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.products.getById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.products.update(id, dto, actorId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('userId') actorId: number) {
    return this.products.remove(id, actorId);
  }

  @Post(':id/duplicate')
  duplicate(
    @Param('id') id: string,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.products.duplicate(id, actorId);
  }

  @Patch(':id/seo')
  updateSeo(
    @Param('id') id: string,
    @Body() dto: UpdateSeoDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.products.updateSeo(id, dto, actorId);
  }

  @Put(':id/images')
  setImages(
    @Param('id') id: string,
    @Body() dto: SetImagesDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.products.setImages(id, dto, actorId);
  }
}
