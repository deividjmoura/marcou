/** Pure state rules for the provider service create/edit dialog (issue #56). */

export type ServiceModalActionState = {
  error?: string;
  success?: string;
};

/** A submit closes the dialog only after a successful save with no error. */
export function shouldCloseServiceModal(state: ServiceModalActionState): boolean {
  return Boolean(state.success?.trim()) && !state.error;
}
