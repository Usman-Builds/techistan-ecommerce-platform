import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, JwtAuthGuard } from '../../common';
import { AddressService } from './address.service';
import { CreateAddressDto } from './dto/create-address.dto';

/**
 * Saved addresses (script 10, FR-402). JWT-guarded — every route is scoped to the
 * authenticated user's own address book.
 */
@UseGuards(JwtAuthGuard)
@Controller('addresses')
export class AddressController {
  constructor(private readonly addresses: AddressService) {}

  @Get()
  list(@CurrentUser('userId') userId: number) {
    return this.addresses.list(userId);
  }

  @Post()
  create(
    @CurrentUser('userId') userId: number,
    @Body() dto: CreateAddressDto,
  ) {
    return this.addresses.create(userId, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser('userId') userId: number,
    @Param('id') id: string,
  ) {
    return this.addresses.remove(userId, id);
  }
}
