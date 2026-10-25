import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loading, ErrorBlock } from "../components/StateBlocks.jsx";
import { api, friendlyError } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";

export default function PostDetailPage() {
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [showReport, setShowReport] = useState(false);

  function load() {
    api.get(`/api/community/posts/${id}`).then(({ data }) => setPost(data.post)).catch((err) => setError(friendlyError(err)));
  }

  useEffect(() => {
    load();
    const socket = getSocket();
    const onReply = ({ postId, reply: r }) => {
      if (postId !== id) return;
      setPost((prev) => (prev ? { ...prev, replies: [...prev.replies, r] } : prev));
    };
    socket.on("reply:created", onReply);
    return () => socket.off("reply:created", onReply);
  }, [id]);

  async function handleReply(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    try {
      await api.post(`/api/community/posts/${id}/replies`, { content: reply });
      setReply("");
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function handleReport(e) {
    e.preventDefault();
    try {
      await api.post(`/api/community/posts/${id}/report`, { reason: reportReason });
      setShowReport(false);
      setReportReason("");
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  if (error) return <ErrorBlock message={error} />;
  if (!post) return <Loading />;

  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 20 }}>
      <Link to={`/community/${post.group.id}`} style={{ fontSize: 13, color: "var(--paper-faint)", textDecoration: "none" }}>
        ← {post.group.name}
      </Link>

      <div className="card">
        <span style={{ fontSize: 13, color: "var(--paper-faint)" }}>{post.user?.name || "Community member"}</span>
        <p style={{ marginTop: 10, color: "var(--paper)", fontSize: 15 }}>{post.content}</p>
        <button className="btn btn-secondary" style={{ marginTop: 12, fontSize: 12 }} onClick={() => setShowReport((s) => !s)}>
          Report post
        </button>
        {showReport && (
          <form onSubmit={handleReport} style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <input placeholder="Reason for reporting" value={reportReason} onChange={(e) => setReportReason(e.target.value)} required />
            <button className="btn btn-primary" type="submit">Submit</button>
          </form>
        )}
      </div>

      <div>
        <h3>Replies ({post.replies.length})</h3>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {post.replies.map((r) => (
            <div key={r.id} className="card card--tight">
              <span style={{ fontSize: 12, color: "var(--paper-faint)" }}>{r.user?.name || "Community member"}</span>
              <p style={{ marginTop: 6, fontSize: 14 }}>{r.content}</p>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleReply} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <textarea rows={2} placeholder="Write a reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
        <button className="btn btn-primary" type="submit" style={{ alignSelf: "flex-end" }}>Reply</button>
      </form>
    </div>
  );
}
