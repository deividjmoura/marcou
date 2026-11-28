import { buildWhatsAppLink } from "@/lib/whatsapp";

export function WhatsAppAction({
  phone,
  message,
  label = "Conversar no WhatsApp",
}: {
  phone: string | null | undefined;
  message?: string;
  label?: string;
}) {
  const href = buildWhatsAppLink(phone, message);
  if (!href) return null;

  return (
    <a
      className="btn btn-ghost reservation-whatsapp-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
    >
      {label}
    </a>
  );
}
