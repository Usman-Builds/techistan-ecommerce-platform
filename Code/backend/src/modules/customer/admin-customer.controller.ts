import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../../common';
import { CustomerService } from './customer.service';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';

/**
 * Admin customer management (script 15, FR-804). All `@AdminOnly()`. The list +
 * detail are reads (no audit); the status toggle is audited in the service.
 */
@AdminOnly()
@Controller('admin/customers')
export class AdminCustomerController {
  constructor(private readonly customers: CustomerService) {}

  @Get()
  list(@Query() query: CustomerQueryDto) {
    return this.customers.list(query);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.customers.getOne(id);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerStatusDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.customers.setStatus(id, dto.status, actorId);
  }
}
