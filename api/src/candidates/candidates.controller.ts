import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  CreateCandidateDto,
  createCandidateSchema,
  ListCandidatesQuery,
  listCandidatesSchema,
  MoveStageDto,
  moveStageSchema,
} from './candidates.schemas';
import { CandidatesService } from './candidates.service';

@Controller()
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Post('jobs/:jobId/candidates')
  create(
    @Param('jobId', ParseIntPipe) jobId: number,
    @Body(new ZodValidationPipe(createCandidateSchema)) dto: CreateCandidateDto,
  ) {
    return this.candidates.create(jobId, dto);
  }

  @Get('jobs/:jobId/candidates')
  list(
    @Param('jobId', ParseIntPipe) jobId: number,
    @Query(new ZodValidationPipe(listCandidatesSchema)) q: ListCandidatesQuery,
  ) {
    return this.candidates.list(jobId, q);
  }

  @Get('candidates/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.candidates.get(id);
  }

  @Patch('candidates/:id/stage')
  moveStage(@Param('id', ParseIntPipe) id: number, @Body(new ZodValidationPipe(moveStageSchema)) dto: MoveStageDto) {
    return this.candidates.moveStage(id, dto);
  }

  @Post('candidates/:id/score')
  @HttpCode(200)
  score(@Param('id', ParseIntPipe) id: number) {
    return this.candidates.score(id);
  }

  @Get('candidates/:id/events')
  events(@Param('id', ParseIntPipe) id: number) {
    return this.candidates.events(id);
  }
}
