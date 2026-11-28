/** Pure state rules for the provider service create/edit dialog (issue #56). */

export type ServiceModalActionState = {
  error?: string;
  success?: string;
  savedServiceId?: string;
};

/** Retry a failed image upload as an update, not a second service creation. */
export function serviceFormTarget(
  editingServiceId?: string | null,
  partiallySavedServiceId?: string | null,
): { intent: "create" | "update"; serviceId: string | null } {
  const serviceId = editingServiceId || partiallySavedServiceId || null;
  return { intent: serviceId ? "update" : "create", serviceId };
}

/** A submit closes the dialog only after a successful save with no error. */
export function shouldCloseServiceModal(state: ServiceModalActionState): boolean {
  return Boolean(state.success?.trim()) && !state.error;
}
