import { Controller, Get, Query } from '@nestjs/common';
import { AdminOnly } from '../../common';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

/**
 * Audit-log viewer (script 15, FR-808). `@AdminOnly()`, read-only. Every admin
 * mutation across the system writes an AuditLog row via AuditService.record();
 * this is the surface to search/filter them.
 */
@AdminOnly()
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: AuditQueryDto) {
    return this.audit.query(query);
  }
}
