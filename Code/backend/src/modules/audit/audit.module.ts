import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AdminAuditController } from './admin-audit.controller';

/**
 * Global so any feature module can inject `AuditService` without importing this
 * module (mirrors PrismaModule). PrismaModule is @Global, so no imports needed.
 * Also hosts the admin-only audit-log viewer (script 15, FR-808).
 */
@Global()
@Module({
  controllers: [AdminAuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
