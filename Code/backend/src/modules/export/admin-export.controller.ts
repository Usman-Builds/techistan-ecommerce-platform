import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AdminOnly } from '../../common';
import { ExportService } from './export.service';
import { ExportOrdersQueryDto } from './dto/export-orders-query.dto';

/**
 * Streamed CSV exports (script 15, FR-809). All `@AdminOnly()`. Downloads are
 * top-level GETs, so the browser's `<a href>` carries the httpOnly auth cookie
 * (same mechanism as the order-invoice PDF). `.csv` is part of the path so the
 * browser saves a sensibly-named file.
 */
@AdminOnly()
@Controller('admin/exports')
export class AdminExportController {
  constructor(private readonly exports: ExportService) {}

  @Get('orders.csv')
  orders(@Query() query: ExportOrdersQueryDto, @Res() res: Response) {
    return this.exports.streamOrders(res, query);
  }

  @Get('customers.csv')
  customers(@Res() res: Response) {
    return this.exports.streamCustomers(res);
  }

  @Get('products.csv')
  products(@Res() res: Response) {
    return this.exports.streamProducts(res);
  }
}
