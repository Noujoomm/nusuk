import { Module } from '@nestjs/common';
import { ProductivityController } from './productivity.controller';
import { ProductivityService } from './productivity.service';
import { PrismaModule } from '../common/prisma.module';
import { OpenAIModule } from '../openai/openai.module';

@Module({
  imports: [PrismaModule, OpenAIModule],
  controllers: [ProductivityController],
  providers: [ProductivityService],
})
export class ProductivityModule {}
