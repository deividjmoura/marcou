import { describe, expect, it } from "vitest";
import {
  MANDATORY_IN_APP_EVENTS,
  getDefaultNotificationEnabled,
  isMandatoryNotification,
  listEventsForAudience,
  notificationPreferenceFieldName,
  parseNotificationPreferencesFormData,
  resolveNotificationPreferences,
} from "./preferences";

describe("notification preferences domain", () => {
  it("applies documented defaults: in_app enabled and email disabled", () => {
    const customerPrefs = resolveNotificationPreferences([], "customer");
    expect(customerPrefs.length).toBe(6);
    expect(customerPrefs.every((item) => item.inAppEnabled === true)).toBe(true);
    expect(customerPrefs.every((item) => item.emailEnabled === false)).toBe(true);
    expect(customerPrefs.some((item) => item.eventType === "booking.proof_received")).toBe(false);

    const providerPrefs = resolveNotificationPreferences([], "provider");
    expect(providerPrefs.length).toBe(7);
    expect(providerPrefs.some((item) => item.eventType === "booking.proof_received")).toBe(true);
    expect(providerPrefs.every((item) => item.inAppEnabled === true)).toBe(true);
    expect(providerPrefs.every((item) => item.emailEnabled === false)).toBe(true);
  });

  it("keeps mandatory events enabled even if stale rows report false", () => {
    const resolved = resolveNotificationPreferences(
      [
        { event_type: "booking.reminder", channel: "in_app", enabled: false },
        { event_type: "booking.cancelled", channel: "in_app", enabled: false },
        { event_type: "booking.changed", channel: "in_app", enabled: false },
      ],
      "customer",
    );

    const byEvent = new Map(resolved.map((item) => [item.eventType, item]));
    expect(byEvent.get("booking.reminder")?.inAppEnabled).toBe(false);
    expect(byEvent.get("booking.cancelled")?.inAppEnabled).toBe(true);
    expect(byEvent.get("booking.cancelled")?.mandatoryInApp).toBe(true);
    expect(byEvent.get("booking.cancelled")?.mandatoryReason).toBeTruthy();
    expect(byEvent.get("booking.changed")?.inAppEnabled).toBe(true);
    expect(byEvent.get("booking.changed")?.mandatoryInApp).toBe(true);
  });

  it("identifies mandatory events only on in_app channel", () => {
    for (const eventType of MANDATORY_IN_APP_EVENTS) {
      expect(isMandatoryNotification(eventType, "in_app")).toBe(true);
      expect(isMandatoryNotification(eventType, "email")).toBe(false);
      expect(getDefaultNotificationEnabled(eventType, "in_app")).toBe(true);
      expect(getDefaultNotificationEnabled(eventType, "email")).toBe(false);
    }
    expect(isMandatoryNotification("booking.reminder", "in_app")).toBe(false);
  });

  it("parses form data per audience and never allows silencing mandatory events", () => {
    const formData = new FormData();
    formData.set(notificationPreferenceFieldName("booking.created"), "on");
    formData.set(notificationPreferenceFieldName("booking.confirmed"), "false");
    formData.set(notificationPreferenceFieldName("booking.cancelled"), "false");
    formData.set(notificationPreferenceFieldName("booking.changed"), "false");
    // Tentativa de incluir evento exclusivo de prestador na audiência customer
    formData.set(notificationPreferenceFieldName("booking.proof_received"), "false");

    const parsed = parseNotificationPreferencesFormData(formData, "customer");
    const byEvent = new Map(parsed.map((item) => [item.eventType, item.enabled]));

    expect(parsed.length).toBe(listEventsForAudience("customer").length);
    expect(byEvent.has("booking.proof_received")).toBe(false);
    expect(byEvent.get("booking.created")).toBe(true);
    expect(byEvent.get("booking.confirmed")).toBe(false);
    expect(byEvent.get("booking.reminder")).toBe(false);
    expect(byEvent.get("booking.expired")).toBe(false);
    expect(byEvent.get("booking.cancelled")).toBe(true);
    expect(byEvent.get("booking.changed")).toBe(true);
  });
});
