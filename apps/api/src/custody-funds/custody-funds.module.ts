import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { CustodyFundsController } from './custody-funds.controller';
import { CustodyFundsService } from './custody-funds.service';

@Module({
  imports: [PrismaModule],
  controllers: [CustodyFundsController],
  providers: [CustodyFundsService],
})
export class CustodyFundsModule {}
