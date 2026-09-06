import { Module } from '@nestjs/common';
import { TagService } from './tag.service';
import { TagController } from './tag.controller';
import { AdminTagController } from './admin-tag.controller';

/** Tag module (script 07). PrismaModule + AuditModule are @Global. */
@Module({
  controllers: [TagController, AdminTagController],
  providers: [TagService],
  exports: [TagService],
})
export class TagModule {}
