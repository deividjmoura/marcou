"use client";

export function CalendarDisconnectForm() {
  return (
    <form
      action="/api/calendar/disconnect"
      method="post"
      onSubmit={(event) => {
        if (!window.confirm("Desconectar o Google Calendar e remover os eventos sincronizados?")) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className="btn btn-ghost">
        Desconectar
      </button>
    </form>
  );
}
