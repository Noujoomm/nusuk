import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import type { AgentContext } from '../interfaces/agent-context.interface';
import type {
  AgentRole,
  ToolDefinition,
} from '../interfaces/tool-definition.interface';
import { buildCustodyTools } from '../tools/custody.tools';
import { buildInvoicesTools } from '../tools/invoices.tools';
import { buildDistributionTools } from '../tools/distribution.tools';

/**
 * Central registry — one place to list every tool the agent can invoke.
 * Tools are *built lazily* via ModuleRef so they can pull existing services
 * (SupportServices, Distribution, CustodyFunds) without a circular import.
 */
@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly config: ConfigService,
  ) {}

  /**
   * Build the full catalogue for the current request, then return only the
   * tools the user's role is allowed to invoke. Write operations are further
   * gated by the `AI_WRITE_OPERATIONS_ENABLED` flag (defaults to false in
   * Phase 1).
   */
  async getForContext(context: AgentContext): Promise<ToolDefinition[]> {
    const all = await this.buildAll();
    const writeEnabled =
      this.config.get('AI_WRITE_OPERATIONS_ENABLED', 'false') === 'true';
    return all.filter((t) => {
      if (t.isDestructive && !writeEnabled) return false;
      return t.requiredRoles.includes(context.userRole as AgentRole);
    });
  }

  /**
   * Look up a tool by name without role filtering — used by the agent service
   * to *re-check* permissions at execution time (defense in depth — Claude
   * might try to invoke a tool it wasn't told about).
   */
  async findByName(name: string): Promise<ToolDefinition | undefined> {
    const all = await this.buildAll();
    return all.find((t) => t.name === name);
  }

  private async buildAll(): Promise<ToolDefinition[]> {
    const [custody, invoices, distribution] = await Promise.all([
      buildCustodyTools(this.moduleRef),
      buildInvoicesTools(this.moduleRef),
      buildDistributionTools(this.moduleRef),
    ]);
    return [...custody, ...invoices, ...distribution];
  }
}
