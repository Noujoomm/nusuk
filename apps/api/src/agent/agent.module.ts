import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { OpenAIModule } from '../openai/openai.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [PrismaModule, OpenAIModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
