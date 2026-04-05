import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { SupportServicesController } from './support-services.controller';
import { SupportServicesService } from './support-services.service';

@Module({
  imports: [PrismaModule],
  controllers: [SupportServicesController],
  providers: [SupportServicesService],
  exports: [SupportServicesService],
})
export class SupportServicesModule {}
