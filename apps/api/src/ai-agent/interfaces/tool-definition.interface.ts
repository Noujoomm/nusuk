import type { AgentContext } from './agent-context.interface';

/**
 * Role names recognised by the tool-registry role filter. Uses the same
 * values as the Prisma Role enum so the filter can match `user.role` exactly.
 */
export type AgentRole =
  | 'admin'
  | 'system_manager'
  | 'pm'
  | 'track_lead'
  | 'employee'
  | 'hr';

/**
 * JSON Schema subset we accept for Anthropic tool input schemas. Keeping it
 * narrow avoids `any` leaking in at the call site.
 */
export interface ToolInputSchema {
  type: 'object';
  required?: string[];
  properties: Record<
    string,
    {
      type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
      description?: string;
      enum?: string[];
      items?: unknown;
      default?: unknown;
      minLength?: number;
    }
  >;
}

/**
 * Single tool the agent can invoke. Handlers must be pure functions of
 * (input, context) — never read `this`/request-scoped state outside context.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  requiredRoles: AgentRole[];
  isDestructive: boolean;
  requiresConfirmation: boolean;
  input_schema: ToolInputSchema;
  handler: (input: Record<string, unknown>, context: AgentContext) => Promise<unknown>;
}
