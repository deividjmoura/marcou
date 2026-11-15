"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  googleLoginAction,
  loginAction,
  signupAction,
  type AuthState,
} from "./actions";

const initialState: AuthState = {};

function GoogleButton({ next }: { next?: string }) {
  return (
    <form action={googleLoginAction} className="google-form">
      <input type="hidden" name="next" value={next ?? ""} />
      <button type="submit" className="btn btn-ghost">
        Continuar com Google
      </button>
    </form>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="auth-card">
      <h1>Entrar no Marcou</h1>
      <p className="muted">Acesse para agendar ou gerenciar sua agenda.</p>

      {state.error ? <p className="alert alert-error">{state.error}</p> : null}

      <form action={formAction} className="form-stack">
        <input type="hidden" name="next" value={next ?? ""} />
        <label className="field">
          <span>E-mail</span>
          <input type="email" name="email" required autoComplete="email" />
        </label>
        <label className="field">
          <span>Senha</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
          />
        </label>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <div className="divider">
        <span>ou</span>
      </div>

      <GoogleButton next={next} />

      <p className="auth-footnote">
        Ainda não tem conta?{" "}
        <Link href="/cadastro">Cadastre-se</Link>
      </p>
    </div>
  );
}

export function SignupForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signupAction, initialState);

  return (
    <div className="auth-card">
      <h1>Criar conta</h1>
      <p className="muted">Leva menos de um minuto.</p>

      {state.error ? <p className="alert alert-error">{state.error}</p> : null}
      {state.success ? (
        <p className="alert alert-success">{state.success}</p>
      ) : null}

      <form action={formAction} className="form-stack">
        <input type="hidden" name="next" value={next ?? ""} />
        <label className="field">
          <span>Nome</span>
          <input
            type="text"
            name="name"
            required
            autoComplete="name"
            maxLength={80}
          />
        </label>
        <label className="field">
          <span>E-mail</span>
          <input type="email" name="email" required autoComplete="email" />
        </label>
        <label className="field">
          <span>Senha</span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Criando..." : "Criar conta"}
        </button>
      </form>

      <div className="divider">
        <span>ou</span>
      </div>

      <GoogleButton next={next} />

      <p className="auth-footnote">
        Já tem conta? <Link href="/login">Entrar</Link>
      </p>
    </div>
  );
}
