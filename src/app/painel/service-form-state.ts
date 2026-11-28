/** Pure helpers for the service create/edit modal (issue #56). */

export type ServiceModalActionState = {
  error?: string;
  success?: string;
};

/** Modal closes only after a successful save; validation/save errors keep it open. */
export function shouldCloseServiceModal(state: ServiceModalActionState): boolean {
  return Boolean(state.success) && !state.error;
}
