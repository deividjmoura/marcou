import type { CalendarConnectionRow, CalendarStore } from "./store";

export type CalendarIntegrationState =
  | "not_connected"
  | "pending"
  | "connected"
  | "reconnect_required"
  | "disconnecting";

export function integrationStateOf(connection: CalendarConnectionRow | null): CalendarIntegrationState {
  if (!connection) return "not_connected";
  if (connection.disconnect_requested_at) return "disconnecting";
  if (connection.connection_status === "connected") return "connected";
  if (connection.connection_status === "suspended") return "reconnect_required";
  return "pending";
}

export async function getCalendarIntegrationView(store: CalendarStore, providerId: string) {
  const [connection, orphanedEvents] = await Promise.all([
    store.getConnection(providerId),
    store.countOrphanedMappings(providerId),
  ]);
  return { state: integrationStateOf(connection), orphanedEvents };
}
