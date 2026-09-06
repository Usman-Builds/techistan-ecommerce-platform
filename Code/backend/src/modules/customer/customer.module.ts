import { Module } from '@nestjs/common';
import { AdminCustomerController } from './admin-customer.controller';
import { CustomerService } from './customer.service';

/**
 * Admin customer management (script 15, FR-804). PrismaService + AuditService are
 * @Global, so no imports are needed here.
 */
@Module({
  controllers: [AdminCustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
