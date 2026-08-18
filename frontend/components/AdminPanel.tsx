"use client";

import {Plus} from "lucide-react";
import {useCallback, useEffect, useState} from "react";
import {Business, request} from "@/lib/api";

export function AdminPanel({token}: {token: string}) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [owner, setOwner] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Business["status"]>("active");

  const load = useCallback(async () => {
    setBusinesses(await request<Business[]>("/admin/businesses", token));
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    const business = await request<Business>("/admin/businesses", token, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({name, slug, status}),
    });
    if (owner && password) {
      await request(`/admin/businesses/${business.id}/owner`, token, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email: owner, password, role: "owner"}),
      });
    }
    setName("");
    setSlug("");
    setOwner("");
    setPassword("");
    await load();
  }

  return (
    <section className="panel grid">
      <h2>NEGOCIOS</h2>
      {businesses.map((item) => <div className="card" key={item.id}>{item.name} · {item.status.toUpperCase()}</div>)}
      <input placeholder="Nombre" value={name} onChange={(event) => setName(event.target.value)} />
      <input placeholder="Slug" value={slug} onChange={(event) => setSlug(event.target.value)} />
      <input placeholder="Owner email" value={owner} onChange={(event) => setOwner(event.target.value)} />
      <input placeholder="Password owner" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      <select value={status} onChange={(event) => setStatus(event.target.value as Business["status"])}>
        <option value="active">ACTIVE</option>
        <option value="demo">DEMO</option>
        <option value="suspended">SUSPENDED</option>
      </select>
      <button onClick={create}><Plus size={18} /> Crear negocio</button>
    </section>
  );
}
