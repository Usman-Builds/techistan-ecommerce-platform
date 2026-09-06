import { Body, Controller, Post } from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../../common';
import { TagService } from './tag.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { AttachTagDto } from './dto/attach-tag.dto';

@AdminOnly()
@Controller('admin/tags')
export class AdminTagController {
  constructor(private readonly tags: TagService) {}

  @Post()
  create(@Body() dto: CreateTagDto, @CurrentUser('userId') actorId: number) {
    return this.tags.create(dto, actorId);
  }

  @Post('attach')
  attach(@Body() dto: AttachTagDto, @CurrentUser('userId') actorId: number) {
    return this.tags.attach(dto, actorId);
  }

  @Post('detach')
  detach(@Body() dto: AttachTagDto, @CurrentUser('userId') actorId: number) {
    return this.tags.detach(dto, actorId);
  }
}
