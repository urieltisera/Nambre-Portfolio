"use client";

import {LogIn} from "lucide-react";
import {useState} from "react";
import {login} from "@/lib/api";

export function LoginForm({onToken}: {onToken: (token: string) => void}) {
  const [email, setEmail] = useState("owner@example.com");
  const [password, setPassword] = useState("owner12345");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      onToken(await login(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    }
  }

  return (
    <main className="login">
      <form className="panel grid" onSubmit={submit}>
        <h1>MenuFlow</h1>
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
        {error ? <p className="error">{error}</p> : null}
        <button type="submit">
          <LogIn size={18} /> Entrar
        </button>
      </form>
    </main>
  );
}

