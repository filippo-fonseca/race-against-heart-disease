"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initial: LoginState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  return (
    <form action={action} className="mt-8 max-w-[22rem]" aria-describedby={state.error ? "login-error" : undefined}>
      <label htmlFor="password" className="label block">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoFocus
        autoComplete="current-password"
        className="num mt-2 block h-11 w-full rounded-none border-0 border-b border-ink bg-transparent px-0 text-[1rem] text-ink outline-none focus:border-red"
      />
      {state.error ? (
        <p id="login-error" role="alert" className="label mt-3 !text-red">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="pill pill-red mt-6 disabled:opacity-60">
        {pending ? "Checking" : "Sign in"}
      </button>
    </form>
  );
}
