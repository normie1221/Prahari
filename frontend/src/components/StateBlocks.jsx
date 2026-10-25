export function Loading({ label = "Loading…" }) {
  return (
    <div className="state-block">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorBlock({ message = "Something went wrong.", onRetry }) {
  return (
    <div className="state-block state-block--error">
      <p>{message}</p>
      {onRetry && <button className="btn btn-secondary" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyBlock({ title, hint, action }) {
  return (
    <div className="state-block">
      <h3 style={{ color: "var(--paper)" }}>{title}</h3>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}
