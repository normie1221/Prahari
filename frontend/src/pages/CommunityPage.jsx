import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlocks.jsx";
import { api, friendlyError } from "../lib/api.js";

export default function CommunityPage() {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  function load() {
    api.get("/api/community/groups").then(({ data }) => setGroups(data.groups)).catch((err) => setError(friendlyError(err)));
  }
  useEffect(load, []);

  async function handleSearch(e) {
    e.preventDefault();
    if (!q.trim()) return setResults(null);
    const { data } = await api.get("/api/community/search", { params: { q } });
    setResults(data.results);
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.post("/api/community/groups", form);
      setShowCreate(false);
      setForm({ name: "", description: "" });
      load();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <div style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="eyebrow">PRAHARI Community</div>
          <h2 style={{ marginTop: 6 }}>Groups &amp; discussions</h2>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>{showCreate ? "Cancel" : "New group"}</button>
      </div>

      <form onSubmit={handleSearch} style={{ display: "flex", gap: 10 }}>
        <input placeholder="Search discussions by location, topic, or keyword…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-secondary" type="submit">Search</button>
      </form>

      {results && (
        <div className="card">
          <h3>Search results</h3>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {results.length === 0 ? <p>No discussions matched.</p> : results.map((r) => (
              <Link key={r.id} to={`/community/post/${r.id}`} style={{ textDecoration: "none", color: "var(--paper)" }}>
                <div style={{ fontSize: 13, color: "var(--paper-faint)" }}>{r.group.name}</div>
                <div>{r.content.slice(0, 140)}{r.content.length > 140 ? "…" : ""}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label>Group name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label>Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <button className="btn btn-primary" type="submit">Create group</button>
        </form>
      )}

      {error && <ErrorBlock message={error} />}
      {groups === null ? (
        <Loading />
      ) : groups.length === 0 ? (
        <EmptyBlock title="No groups yet" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {groups.map((g) => (
            <Link key={g.id} to={`/community/${g.id}`} className="card" style={{ textDecoration: "none" }}>
              <h3>{g.name}</h3>
              <p style={{ marginTop: 8, fontSize: 13 }}>{g.description}</p>
              <div style={{ marginTop: 12, display: "flex", gap: 12, fontSize: 12, color: "var(--paper-faint)", fontFamily: "var(--font-mono)" }}>
                <span>{g._count.members} members</span>
                <span>{g._count.posts} posts</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
