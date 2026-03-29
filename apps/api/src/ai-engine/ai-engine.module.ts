import { Module } from '@nestjs/common';
import { AiEngineController } from './ai-engine.controller';
import { AiEngineService } from './ai-engine.service';
import { PrismaModule } from '../common/prisma.module';
import { OpenAIModule } from '../openai/openai.module';

@Module({
  imports: [PrismaModule, OpenAIModule],
  controllers: [AiEngineController],
  providers: [AiEngineService],
})
export class AiEngineModule {}
