// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  deleteExceptionAction: vi.fn(),
  deleteRuleAction: vi.fn(),
  deleteServiceAreaAction: vi.fn(),
  saveExceptionAction: vi.fn(),
  saveProviderAction: vi.fn(),
  saveProviderAvatarAction: vi.fn(),
  saveRuleAction: vi.fn(),
  saveServiceAction: vi.fn(),
  saveServiceAreaAction: vi.fn(),
  suggestServiceCategoryAction: vi.fn(),
  toggleServiceAction: vi.fn(),
}));

vi.mock("./actions", () => actionMocks);
vi.mock("../(auth)/actions", () => ({ logoutAction: vi.fn() }));
vi.mock("@/components/notification-preferences-form", () => ({
  NotificationPreferencesForm: () => null,
}));
vi.mock("@/components/provider-avatar", () => ({ ProviderAvatar: () => null }));

import { ServicesManager } from "./painel-client";
import type { Service } from "@/server/bookings";

const service: Service = {
  id: "service-1",
  provider_id: "provider-1",
  category_id: "10000000-0000-4000-8000-000000000001",
  delivery_modes: ["provider_location"],
  name: "Corte",
  description: "Corte tradicional",
  image_path: null,
  image_url: null,
  duration_minutes: 60,
  price_cents: 5000,
  deposit_cents: 0,
  buffer_minutes: 0,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

let container: HTMLDivElement;
let root: Root;

function render(services: Service[] = []) {
  act(() => {
    root.render(
      createElement(ServicesManager, {
        services,
        categories: [],
        discoveryEnabled: false,
        hasServiceAreas: false,
      }),
    );
  });
}

function buttonByText(scope: ParentNode, label: string): HTMLButtonElement {
  const button = Array.from(scope.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  return button;
}

function dialogElement(): HTMLDialogElement {
  const dialog = container.querySelector("dialog");
  if (!(dialog instanceof HTMLDialogElement)) throw new Error("Service dialog not found.");
  return dialog;
}

async function submit(dialog: HTMLDialogElement) {
  const form = dialog.querySelector("form");
  if (!(form instanceof HTMLFormElement)) throw new Error("Service form not found.");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  actionMocks.saveServiceAction.mockReset();
  actionMocks.saveServiceAction.mockResolvedValue({});
  actionMocks.toggleServiceAction.mockReset();
  actionMocks.toggleServiceAction.mockResolvedValue({});

});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("ServicesManager modal DOM behavior", () => {
  it("opens create mode, focuses the first field and restores focus on cancel", async () => {
    render();
    const trigger = buttonByText(container, "Novo serviço");

    await act(async () => trigger.click());

    const dialog = dialogElement();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("#service-modal-title")?.textContent).toBe("Novo serviço");
    expect(document.activeElement).toBe(dialog.querySelector('input[name="name"]'));

    await act(async () => buttonByText(dialog, "Cancelar").click());

    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape and on a backdrop click", async () => {
    render();
    const trigger = buttonByText(container, "Novo serviço");

    await act(async () => trigger.click());
    const dialog = dialogElement();
    const cancelEvent = new Event("cancel", { cancelable: true });

    await act(async () => dialog.dispatchEvent(cancelEvent));

    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);

    await act(async () => trigger.click());
    await act(async () => {
      dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("opens edit mode with the selected service values", async () => {
    render([service]);
    await act(async () => buttonByText(container, "Editar").click());

    const dialog = dialogElement();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("#service-modal-title")?.textContent).toBe("Editar serviço");
    expect((dialog.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("Corte");
    expect((dialog.querySelector('input[name="intent"]') as HTMLInputElement).value).toBe("update");
    expect((dialog.querySelector('input[name="serviceId"]') as HTMLInputElement).value).toBe("service-1");
  });

  it("keeps entered values and the selected file when the server returns an error", async () => {
    actionMocks.saveServiceAction.mockResolvedValueOnce({ error: "Falha ao validar o serviço." });
    render();
    await act(async () => buttonByText(container, "Novo serviço").click());

    const dialog = dialogElement();
    const name = dialog.querySelector('input[name="name"]') as HTMLInputElement;
    const price = dialog.querySelector('input[name="price"]') as HTMLInputElement;
    const image = dialog.querySelector('input[name="image"]') as HTMLInputElement;
    const file = new File(["image"], "service.png", { type: "image/png" });

    name.value = "Serviço preenchido";
    price.value = "invalido";
    Object.defineProperty(image, "files", { configurable: true, value: [file] });

    await submit(dialog);

    expect(dialog.open).toBe(true);
    expect(name.value).toBe("Serviço preenchido");
    expect(price.value).toBe("invalido");
    expect(image.files?.[0]).toBe(file);
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("Falha ao validar");
  });

  it("closes only after a successful server action", async () => {
    actionMocks.saveServiceAction.mockResolvedValueOnce({ success: "Serviço criado." });
    render();
    const trigger = buttonByText(container, "Novo serviço");
    await act(async () => trigger.click());

    const dialog = dialogElement();
    await submit(dialog);

    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("retries a partially saved create as an update without losing the draft", async () => {
    actionMocks.saveServiceAction.mockResolvedValueOnce({
      error: "A imagem não foi enviada.",
      savedServiceId: "created-service-id",
    });
    render();
    await act(async () => buttonByText(container, "Novo serviço").click());

    const dialog = dialogElement();
    const name = dialog.querySelector('input[name="name"]') as HTMLInputElement;
    name.value = "Serviço já persistido";
    await submit(dialog);

    expect(dialog.open).toBe(true);
    expect(name.value).toBe("Serviço já persistido");
    expect((dialog.querySelector('input[name="intent"]') as HTMLInputElement).value).toBe("update");
    expect((dialog.querySelector('input[name="serviceId"]') as HTMLInputElement).value).toBe("created-service-id");
  });
});
