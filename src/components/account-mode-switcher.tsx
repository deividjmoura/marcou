import { setPreferredModeAction } from "@/app/inicio/actions";
import type { AccountMode } from "@/server/identity";

export function AccountModeSwitcher({
  activeMode,
  hasProvider,
}: {
  activeMode: AccountMode;
  hasProvider: boolean;
}) {
  return (
    <section className="account-mode-switcher" aria-label="Área da conta">
      <div className="account-mode-copy">
        <span className="eyebrow">SUA CONTA, DOIS ESPAÇOS</span>
        <p>
          {hasProvider
            ? "Escolha como quer usar o Marcou agora."
            : "Você continua como cliente; crie um negócio para ativar o espaço profissional."}
        </p>
      </div>
      <div className="account-mode-options" role="group" aria-label="Escolher área">
        <form action={setPreferredModeAction}>
          <input type="hidden" name="mode" value="customer" />
          <button
            type="submit"
            className={activeMode === "customer" ? "is-active" : ""}
            aria-pressed={activeMode === "customer"}
          >
            Cliente
          </button>
        </form>
        <form action={setPreferredModeAction}>
          <input type="hidden" name="mode" value="provider" />
          <button
            type="submit"
            className={activeMode === "provider" ? "is-active" : ""}
            aria-pressed={activeMode === "provider"}
          >
            Profissional
          </button>
        </form>
      </div>
    </section>
  );
}
