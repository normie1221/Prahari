import { useEffect, useState } from "react";
import { api, friendlyError } from "../lib/api.js";
import { Loading, ErrorBlock } from "../components/StateBlocks.jsx";
import { useAuthUser } from "../hooks/useAuthUser.js";

export default function ProfilePage() {
  const { displayName } = useAuthUser();
  const [routes, setRoutes] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", relationship: "" });

  function load() {
    Promise.all([api.get("/api/navigation/my-routes"), api.get("/api/emergency/contacts")])
      .then(([r, c]) => { setRoutes(r.data.items); setContacts(c.data.contacts); })
      .catch((err) => setError(friendlyError(err)));
  }
  useEffect(load, []);

  async function handleAddContact(e) {
    e.preventDefault();
    try {
      await api.post("/api/emergency/contacts", { ...form, email: form.email || undefined });
      setForm({ name: "", phone: "", email: "", relationship: "" });
      load();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function handleRemove(id) {
    await api.delete(`/api/emergency/contacts/${id}`);
    load();
  }

  return (
    <div style={{ maxWidth: 800, display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div className="eyebrow">Profile</div>
        <h2 style={{ marginTop: 6 }}>{displayName}</h2>
      </div>

      {error && <ErrorBlock message={error} />}

      <div className="card">
        <h3>Emergency contacts</h3>
        <p style={{ marginTop: 6, fontSize: 13 }}>Notified automatically when you trigger SOS.</p>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {contacts === null ? <Loading /> : contacts.length === 0 ? (
            <p style={{ fontSize: 13 }}>No emergency contacts added yet.</p>
          ) : contacts.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--ink-line)" }}>
              <div>
                <div style={{ color: "var(--paper)" }}>{c.name} {c.relationship && <span style={{ color: "var(--paper-faint)", fontSize: 12 }}>({c.relationship})</span>}</div>
                <div style={{ fontSize: 12, color: "var(--paper-faint)", fontFamily: "var(--font-mono)" }}>
                  {c.phone}{c.email ? ` · ${c.email}` : ""}
                </div>
              </div>
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => handleRemove(c.id)}>Remove</button>
            </div>
          ))}
        </div>
        <form onSubmit={handleAddContact} style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 10 }}>
          <input placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Phone" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input placeholder="Email (optional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Relationship" value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />
          <button className="btn btn-primary" type="submit">Add</button>
        </form>
      </div>

      <div className="card">
        <h3>Saved routes</h3>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {routes === null ? <Loading /> : routes.length === 0 ? (
            <p style={{ fontSize: 13 }}>No saved routes yet.</p>
          ) : routes.map((r) => (
            <div key={r.id} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--ink-line)" }}>
              {r.originLabel || "Start"} → {r.destLabel || "Destination"} · {r.distanceKm} km · {r.routeType}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
