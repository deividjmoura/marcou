interface ProviderAvatarProps {
  src?: string | null;
  name: string;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "✦";
  return parts.slice(0, 2).map((part) => Array.from(part)[0] ?? "").join("").toLocaleUpperCase("pt-BR");
}

export function ProviderAvatar({ src, name, className = "" }: ProviderAvatarProps) {
  const classes = ["provider-avatar", className].filter(Boolean).join(" ");
  if (src) {
    return (
      <img
        className={classes}
        src={src}
        alt={`${name} — foto do profissional`}
        loading="lazy"
      />
    );
  }

  return (
    <span
      className={classes}
      role="img"
      aria-label={`${name} — foto do profissional não cadastrada`}
    >
      {initials(name)}
    </span>
  );
}
