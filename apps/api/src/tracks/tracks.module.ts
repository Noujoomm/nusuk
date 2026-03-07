import { Module } from '@nestjs/common';
import { TracksService } from './tracks.service';
import { TracksController } from './tracks.controller';
import { AuditModule } from '../audit/audit.module';
import { OpenAIModule } from '../openai/openai.module';
import { PptxParserService } from './pptx-parser.service';
import { PptxImportService } from './pptx-import.service';

@Module({
  imports: [AuditModule, OpenAIModule],
  providers: [TracksService, PptxParserService, PptxImportService],
  controllers: [TracksController],
  exports: [TracksService],
})
export class TracksModule {}
