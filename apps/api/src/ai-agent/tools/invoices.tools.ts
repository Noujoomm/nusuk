import { ModuleRef } from '@nestjs/core';
import { SupportServicesService } from '../../support-services/support-services.service';
import type { ToolDefinition } from '../interfaces/tool-definition.interface';

/** Phase 1: read-only — wraps SupportServicesService.listInvoices. */
export async function buildInvoicesTools(
  moduleRef: ModuleRef,
): Promise<ToolDefinition[]> {
  const service = moduleRef.get(SupportServicesService, { strict: false });

  return [
    {
      name: 'list_custody_invoices',
      description:
        'عرض فواتير العهد (إيصالات الصرف). يدعم التصفية حسب العهدة، الحالة، نص بحث، ونطاق تاريخي.',
      requiredRoles: ['admin', 'system_manager', 'pm', 'track_lead'],
      isDestructive: false,
      requiresConfirmation: false,
      input_schema: {
        type: 'object',
        properties: {
          custodyId: {
            type: 'string',
            description: 'معرّف عهدة محددة (اختياري)',
          },
          status: {
            type: 'string',
            description: 'حالة الفاتورة (PENDING/APPROVED/REJECTED مثلاً)',
          },
          search: { type: 'string', description: 'بحث نصي جزئي' },
          dateFrom: {
            type: 'string',
            description: 'من تاريخ (ISO 8601 أو YYYY-MM-DD)',
          },
          dateTo: {
            type: 'string',
            description: 'إلى تاريخ (ISO 8601 أو YYYY-MM-DD)',
          },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 10 },
        },
      },
      handler: async (input) => {
        return service.listInvoices({
          custodyId: input.custodyId as string | undefined,
          status: input.status as string | undefined,
          search: input.search as string | undefined,
          dateFrom: input.dateFrom as string | undefined,
          dateTo: input.dateTo as string | undefined,
          page: input.page as number | undefined,
          pageSize: (input.pageSize as number | undefined) ?? 10,
        });
      },
    },
  ];
}
