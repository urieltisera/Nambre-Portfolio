"use client";

import {useState} from "react";
import {AdminPanel} from "@/components/AdminPanel";
import {BusinessPanel} from "@/components/BusinessPanel";
import {LoginForm} from "@/components/LoginForm";

export default function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);

  if (!token) return <LoginForm onToken={setToken} />;

  return (
    <>
      <div className="shell actions">
        <button className={!admin ? "active" : "secondary"} onClick={() => setAdmin(false)}>Negocio</button>
        <button className={admin ? "active" : "secondary"} onClick={() => setAdmin(true)}>Admin</button>
      </div>
      {admin ? <main className="shell"><AdminPanel token={token} /></main> : <BusinessPanel token={token} />}
    </>
  );
}

