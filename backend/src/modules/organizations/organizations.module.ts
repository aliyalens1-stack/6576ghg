import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { OrganizationSchema } from './organization.schema';
import { OrganizationMembershipSchema } from './organization-membership.schema';
import { AuditSchema } from '../audit/audit.schema';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { RankingService } from './ranking.service';
// 🔴 P2: Suspicious Detection & Dynamic Commission
import { SuspiciousDetectionService } from './suspicious-detection.service';
import { DynamicCommissionService } from './dynamic-commission.service';
import { ProviderStatsService } from './provider-stats.service';
import { BookingSchema } from '../bookings/booking.schema';
import { QuoteResponseSchema } from '../quotes/quote-response.schema';
import { QuoteSchema } from '../quotes/quote.schema';
import { BranchSchema } from '../branches/branch.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Organization', schema: OrganizationSchema },
      { name: 'OrganizationMembership', schema: OrganizationMembershipSchema },
      { name: 'Audit', schema: AuditSchema },
      { name: 'Booking', schema: BookingSchema },
      { name: 'QuoteResponse', schema: QuoteResponseSchema },
      { name: 'Quote', schema: QuoteSchema },
      { name: 'Branch', schema: BranchSchema },
    ]),
    JwtModule.register({}),
  ],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService, 
    RankingService,
    // 🔴 P2 Services
    SuspiciousDetectionService,
    DynamicCommissionService,
    ProviderStatsService,
  ],
  exports: [
    OrganizationsService, 
    RankingService,
    SuspiciousDetectionService,
    DynamicCommissionService,
    ProviderStatsService,
  ],
})
export class OrganizationsModule {}
