import { ModuleRef } from '@nestjs/core';
import { SupportServicesService } from '../../support-services/support-services.service';
import type { ToolDefinition } from '../interfaces/tool-definition.interface';

/** Phase 1: read-only tools wrapping SupportServicesService.listCustodies. */
export async function buildCustodyTools(
  moduleRef: ModuleRef,
): Promise<ToolDefinition[]> {
  const service = moduleRef.get(SupportServicesService, { strict: false });

  return [
    {
      name: 'list_custodies',
      description:
        'عرض قائمة العهد (Custody v1) في منصة رؤية، مع إمكانية التصفية حسب الحالة أو نص بحث جزئي.',
      requiredRoles: ['admin', 'system_manager', 'pm', 'track_lead'],
      isDestructive: false,
      requiresConfirmation: false,
      input_schema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'الحالة (ACTIVE/CLOSED/REOPENED مثلاً)',
          },
          search: {
            type: 'string',
            description: 'نص بحث جزئي',
          },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 10 },
        },
      },
      handler: async (input) => {
        const result = await service.listCustodies({
          status: input.status as string | undefined,
          search: input.search as string | undefined,
          page: input.page as number | undefined,
          pageSize: (input.pageSize as number | undefined) ?? 10,
        });
        return result;
      },
    },
  ];
}
