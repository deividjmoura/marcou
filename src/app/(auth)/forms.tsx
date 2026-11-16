"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  googleLoginAction,
  loginAction,
  requestPasswordResetAction,
  saveProfileAction,
  signupAction,
  updatePasswordAction,
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

export function LoginForm({
  next,
  errorMessage,
  successMessage,
}: {
  next?: string;
  errorMessage?: string;
  successMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="auth-card">
      <h1>Entrar no Marcou</h1>
      <p className="muted">Acesse para agendar ou gerenciar sua agenda.</p>
      {errorMessage ? <p className="alert alert-error">{errorMessage}</p> : null}
      {successMessage ? <p className="alert alert-success">{successMessage}</p> : null}
      {state.error ? <p className="alert alert-error">{state.error}</p> : null}

      <form action={formAction} className="form-stack">
        <input type="hidden" name="next" value={next ?? ""} />
        <label className="field">
          <span>E-mail</span>
          <input type="email" name="email" required autoComplete="email" />
        </label>
        <label className="field">
          <span>Senha</span>
          <input type="password" name="password" required autoComplete="current-password" />
        </label>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <p className="auth-footnote"><Link href="/esqueci-senha">Esqueci minha senha</Link></p>
      <div className="divider"><span>ou</span></div>
      <GoogleButton next={next} />
      <p className="auth-footnote">
        Ainda não tem conta? <Link href="/cadastro">Cadastre-se</Link>
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
      {state.success ? <p className="alert alert-success">{state.success}</p> : null}

      <form action={formAction} className="form-stack">
        <input type="hidden" name="next" value={next ?? ""} />
        <label className="field">
          <span>Nome</span>
          <input type="text" name="name" required autoComplete="name" maxLength={80} />
        </label>
        <label className="field">
          <span>E-mail</span>
          <input type="email" name="email" required autoComplete="email" />
        </label>
        <label className="field">
          <span>Senha</span>
          <input type="password" name="password" required minLength={8} autoComplete="new-password" />
        </label>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Criando..." : "Criar conta"}
        </button>
      </form>

      <div className="divider"><span>ou</span></div>
      <GoogleButton next={next} />
      <p className="auth-footnote">Já tem conta? <Link href="/login">Entrar</Link></p>
    </div>
  );
}

export function ProfileForm({
  name,
  phone,
  next,
}: {
  name: string;
  phone: string;
  next: string;
}) {
  const [state, formAction, pending] = useActionState(saveProfileAction, initialState);

  return (
    <div className="auth-card">
      <h1>Complete seu perfil</h1>
      <p className="muted">Precisamos do seu nome e telefone para concluir seu cadastro no Marcou.</p>
      {state.error ? <p className="alert alert-error">{state.error}</p> : null}
      <form action={formAction} className="form-stack">
        <input type="hidden" name="next" value={next} />
        <label className="field">
          <span>Nome</span>
          <input name="name" required maxLength={80} autoComplete="name" defaultValue={name} />
        </label>
        <label className="field">
          <span>Telefone com DDD</span>
          <input
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            placeholder="(47) 99999-9999"
            defaultValue={phone}
          />
        </label>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar perfil"}
        </button>
      </form>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);
  return (
    <div className="auth-card">
      <h1>Recuperar senha</h1>
      <p className="muted">Informe seu e-mail para receber um link de redefinição.</p>
      {state.error ? <p className="alert alert-error">{state.error}</p> : null}
      {state.success ? <p className="alert alert-success">{state.success}</p> : null}
      <form action={formAction} className="form-stack">
        <label className="field">
          <span>E-mail</span>
          <input type="email" name="email" required autoComplete="email" />
        </label>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Enviando..." : "Enviar link"}
        </button>
      </form>
      <p className="auth-footnote"><Link href="/login">Voltar para entrar</Link></p>
    </div>
  );
}

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, initialState);
  return (
    <div className="auth-card">
      <h1>Definir nova senha</h1>
      <p className="muted">Escolha uma senha com pelo menos 8 caracteres.</p>
      {state.error ? <p className="alert alert-error">{state.error}</p> : null}
      <form action={formAction} className="form-stack">
        <label className="field">
          <span>Nova senha</span>
          <input type="password" name="password" required minLength={8} maxLength={100} autoComplete="new-password" />
        </label>
        <label className="field">
          <span>Confirmar nova senha</span>
          <input type="password" name="confirmPassword" required minLength={8} maxLength={100} autoComplete="new-password" />
        </label>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Atualizar senha"}
        </button>
      </form>
    </div>
  );
}
