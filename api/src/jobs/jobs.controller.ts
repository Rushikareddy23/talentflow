import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreateJobDto, createJobSchema } from './jobs.schemas';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createJobSchema)) dto: CreateJobDto) {
    return this.jobs.create(dto);
  }

  @Get()
  list() {
    return this.jobs.list();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.jobs.get(id);
  }

  @Get(':id/stage-counts')
  stageCounts(@Param('id', ParseIntPipe) id: number) {
    return this.jobs.stageCounts(id);
  }
}
