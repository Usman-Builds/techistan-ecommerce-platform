import { Controller, Get } from '@nestjs/common';
import { TagService } from './tag.service';

/** Public tag list — no guard. */
@Controller('tags')
export class TagController {
  constructor(private readonly tags: TagService) {}

  @Get()
  list() {
    return this.tags.list();
  }
}
