import { Module } from '@nestjs/common';
import { AdminExportController } from './admin-export.controller';
import { ExportService } from './export.service';

/** Streamed CSV exports (script 15, FR-809). PrismaService is @Global. */
@Module({
  controllers: [AdminExportController],
  providers: [ExportService],
})
export class ExportModule {}
