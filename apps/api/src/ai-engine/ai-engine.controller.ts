import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { AiEngineService } from './ai-engine.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('ai-engine')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'pm')
export class AiEngineController {
  constructor(private engine: AiEngineService) {}

  @Get('insights')
  getInsights() {
    return this.engine.generateInsights();
  }

  @Post('ask')
  askQuestion(@Body('question') question: string) {
    return this.engine.askQuestion(question || '');
  }

  @Post('simulate')
  simulate(@Body() params: { companies: number; employees: number; hours: number; cardsPerHour: number }) {
    return this.engine.simulate(params);
  }
}
