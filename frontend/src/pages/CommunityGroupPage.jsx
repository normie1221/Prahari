import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlocks.jsx";
import { api, friendlyError } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";
import { useAuthUser } from "../hooks/useAuthUser.js";

export default function CommunityGroupPage() {
  const { groupId } = useParams();
  const { displayName } = useAuthUser();
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);
  const [content, setContent] = useState("");
  const [typingUser, setTypingUser] = useState(null);
  const typingTimeoutRef = useRef(null);

  function load() {
    api.get(`/api/community/groups/${groupId}/posts`)
      .then(({ data }) => setPosts(data.items))
      .catch((err) => setError(friendlyError(err)));
  }

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.emit("group:join", groupId);

    const onCreated = (post) => setPosts((prev) => (prev ? [post, ...prev] : [post]));
    const onUpvoted = ({ postId, upvoteCount }) =>
      setPosts((prev) => prev?.map((p) => (p.id === postId ? { ...p, upvoteCount } : p)));
    const onTyping = ({ userName }) => {
      setTypingUser(userName);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 2500);
    };

    socket.on("post:created", onCreated);
    socket.on("post:upvoted", onUpvoted);
    socket.on("group:typing", onTyping);

    return () => {
      socket.emit("group:leave", groupId);
      socket.off("post:created", onCreated);
      socket.off("post:upvoted", onUpvoted);
      socket.off("group:typing", onTyping);
    };
  }, [groupId]);

  function handleTyping() {
    getSocket().emit("group:typing", { groupId, userName: displayName });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      await api.post(`/api/community/groups/${groupId}/posts`, { content });
      setContent("");
      // The post also arrives via the socket event above (real-time for
      // everyone including us) — no need to prepend it locally too.
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function handleUpvote(postId) {
    try {
      await api.post(`/api/community/posts/${postId}/upvote`);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Link to="/community" style={{ fontSize: 13, color: "var(--paper-faint)", textDecoration: "none" }}>← All groups</Link>
        <h2 style={{ marginTop: 10 }}>Discussion</h2>
        <div style={{ height: 18, fontSize: 12, color: "var(--paper-faint)", fontStyle: "italic" }}>
          {typingUser ? `${typingUser} is typing…` : "\u00A0"}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <textarea
          rows={3}
          placeholder="Share a safety experience, tip, or question with this group…"
          value={content}
          onChange={(e) => { setContent(e.target.value); handleTyping(); }}
        />
        <button className="btn btn-primary" type="submit" style={{ alignSelf: "flex-end" }}>Post</button>
      </form>

      {error && <ErrorBlock message={error} />}
      {posts === null ? (
        <Loading />
      ) : posts.length === 0 ? (
        <EmptyBlock title="No posts yet" hint="Be the first to share something useful with this group." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {posts.map((p) => (
            <div key={p.id} className="card card--tight">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "var(--paper-faint)" }}>{p.user?.name || "Community member"}</span>
                {p.isFlagged && <span className="pill" style={{ color: "var(--coral-signal)" }}>Under review</span>}
              </div>
              <Link to={`/community/post/${p.id}`} style={{ textDecoration: "none", color: "var(--paper)" }}>
                <p style={{ marginTop: 8, color: "var(--paper)" }}>{p.content}</p>
              </Link>
              <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, color: "var(--paper-faint)" }}>
                <button onClick={() => handleUpvote(p.id)} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }}>
                  ▲ {p.upvoteCount}
                </button>
                <Link to={`/community/post/${p.id}`} style={{ color: "var(--paper-faint)", alignSelf: "center" }}>
                  {p._count?.replies ?? 0} replies
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
