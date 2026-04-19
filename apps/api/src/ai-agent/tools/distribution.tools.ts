import { ModuleRef } from '@nestjs/core';
import { DistributionService } from '../../distribution/distribution.service';
import type { ToolDefinition } from '../interfaces/tool-definition.interface';

/**
 * Phase 1: two read-only probes against the distribution track — the
 * achievements dashboard and the deviations dashboard. Both already return
 * aggregated summaries suitable for an agent response.
 */
export async function buildDistributionTools(
  moduleRef: ModuleRef,
): Promise<ToolDefinition[]> {
  const service = moduleRef.get(DistributionService, { strict: false });

  return [
    {
      name: 'distribution_achievement_dashboard',
      description:
        'ملخّص مسار التوزيع من حيث الإنجازات التراكمية، الأرقام الرئيسية، والتوزيع حسب الفترة.',
      requiredRoles: ['admin', 'system_manager', 'pm', 'track_lead'],
      isDestructive: false,
      requiresConfirmation: false,
      input_schema: { type: 'object', properties: {} },
      handler: async () => service.achievementDashboard(),
    },
    {
      name: 'distribution_deviation_dashboard',
      description:
        'ملخّص مسار التوزيع من حيث الانحرافات، عددها، وأشد أنواعها.',
      requiredRoles: ['admin', 'system_manager', 'pm', 'track_lead'],
      isDestructive: false,
      requiresConfirmation: false,
      input_schema: { type: 'object', properties: {} },
      handler: async () => service.deviationDashboard(),
    },
  ];
}
