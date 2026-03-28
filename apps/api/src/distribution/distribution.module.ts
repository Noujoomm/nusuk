import { Module } from '@nestjs/common';
import { DistributionController } from './distribution.controller';
import { DistributionService } from './distribution.service';
import { PrismaModule } from '../common/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DistributionController],
  providers: [DistributionService],
})
export class DistributionModule {}
