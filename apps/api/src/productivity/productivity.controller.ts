import { Controller, Get, Param, Post, Body, UseGuards } from '@nestjs/common';
import { ProductivityService } from './productivity.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { OpenAIService } from '../openai/openai.service';
import { PrismaService } from '../common/prisma.service';

@Controller('productivity')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'pm')
export class ProductivityController {
  constructor(
    private productivity: ProductivityService,
    private openai: OpenAIService,
    private prisma: PrismaService,
  ) {}

  @Get()
  getAll() { return this.productivity.getAllTracksProductivity(); }

  @Get(':trackId')
  getTrack(@Param('trackId') trackId: string) { return this.productivity.getTrackProductivity(trackId); }

  @Post('copilot')
  async copilot(@Body('question') question: string) {
    if (!this.openai.isAvailable) {
      return { answer: 'OPENAI_API_KEY غير مُعدّ — Copilot غير متاح' };
    }

    const data = await this.productivity.getAllTracksProductivity();
    const context = JSON.stringify({
      projectProductivity: data.projectProductivity,
      greenTracks: data.greenTracks,
      redTracks: data.redTracks,
      atRisk: data.totalAtRisk,
      tracks: data.tracks.map((t) => ({
        name: t.trackName, productivity: t.productivity, quadrant: t.quadrant,
        overdue: t.overdueCount, blocked: t.blockedCount, atRisk: t.atRiskTasks.length,
        onTime: t.onTimeRate, velocity: t.velocityTrend, burnWeeks: t.burnWeeks,
      })),
    });

    const answer = await this.openai.chat([
      {
        role: 'system',
        content: `أنت "مساعد رؤية للإنتاجية". محلل ذكي يعمل على نموذج إنتاجية مُعتمد.
القواعد:
- أجب بالعربية دائماً
- لا تذكر أي مبالغ مالية
- إعادة التقديم ≠ عقوبة
- كل رد يحتوي على تحليل ورقم وإجراء قابل للتنفيذ
- المصطلحات التقنية بالإنجليزية: Blocked, Backlog, Burn Rate, Velocity

البيانات الحية:
${context}`,
      },
      { role: 'user', content: question },
    ], { maxTokens: 800 });

    return { answer };
  }
}
