export type CalendarEventInput = { id: string; serviceName: string; startsAt: string; endsAt: string; timezone: string };
export function buildCalendarEvent(input: CalendarEventInput) {
  return {
    id: input.id,
    summary: input.serviceName,
    start: { dateTime: input.startsAt, timeZone: input.timezone },
    end: { dateTime: input.endsAt, timeZone: input.timezone },
  };
}
