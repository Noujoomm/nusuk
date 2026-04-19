/**
 * Runtime context for every agent invocation. Built server-side from the
 * authenticated user record — never trust any of these values from a client
 * body. Flows into the system prompt, the tool filter, and the audit log.
 */
export interface AgentContext {
  userId: string;
  userName: string;
  userRole: string;
  allowedTrackIds: string[]; // only populated for track_lead
  sessionId: string;         // server-generated per request
  ipAddress?: string;
  userAgent?: string;
}
