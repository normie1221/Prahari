import { useEffect, useRef, useState } from "react";
import { suggestPlaces } from "../lib/geo.js";

const MIN_CHARS = 3;
const DEBOUNCE_MS = 350;

/**
 * Text field with live place suggestions (accessible combobox).
 * - searches only after the user pauses typing (debounce) and types >= 3 chars
 * - cancels outdated requests so results never arrive out of order
 * - arrow keys / Enter / Escape, mouse and touch selection
 * - `near` biases suggestions toward a point (e.g. the start location)
 */
export default function PlaceInput({ id, label, value, onTextChange, onSelect, near, placeholder, required }) {
  const listId = `${id}-listbox`;
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState(null);
  const typedRef = useRef(false);     // only search when the change came from typing
  const abortRef = useRef(null);
  const blurTimer = useRef(null);
  const nearKey = near ? `${Number(near.lat).toFixed(2)},${Number(near.lon).toFixed(2)}` : "";

  useEffect(() => {
    if (!typedRef.current) return undefined;
    const q = (value || "").trim();
    if (q.length < MIN_CHARS) {
      abortRef.current?.abort();
      setItems([]); setOpen(false); setLoading(false); setNote(null);
      return undefined;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true); setOpen(true); setNote(null);
      try {
        const { places, unavailable } = await suggestPlaces(q, near, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setItems(places);
        setActive(places.length ? 0 : -1);
        setNote(places.length ? null
          : unavailable ? "Suggestions are unavailable right now. You can still type the full place name."
          : "No matching places. Try a different spelling or add the area name.");
      } catch (err) {
        if (ctrl.signal.aborted || err?.name === "CanceledError" || err?.name === "AbortError") return;
        setItems([]);
        setNote("Suggestions are unavailable right now. You can still type the full place name.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, nearKey]);

  useEffect(() => () => { abortRef.current?.abort(); clearTimeout(blurTimer.current); }, []);

  function choose(place) {
    typedRef.current = false;
    abortRef.current?.abort();
    setOpen(false); setItems([]); setActive(-1); setNote(null); setLoading(false);
    onSelect(place);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") { if (open) { e.preventDefault(); setOpen(false); } return; }
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(items[active]); }
  }

  return (
    <div style={{ position: "relative" }}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        required={required}
        onChange={(e) => { typedRef.current = true; onTextChange(e.target.value); }}
        onKeyDown={onKeyDown}
        onFocus={() => { if (items.length) setOpen(true); }}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
      />
      {open && (
        <div
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 1100,
            background: "var(--ink-surface-raised)", border: "1px solid var(--ink-line)",
            borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-card)", overflow: "hidden",
          }}
        >
          {loading && items.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 13, color: "var(--paper-muted)" }}>Searching…</div>
          )}
          <ul id={listId} role="listbox" aria-label={`${label} suggestions`} style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 280, overflowY: "auto" }}>
            {items.map((p, i) => (
              <li
                key={p.id + i}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
                onMouseEnter={() => setActive(i)}
                style={{
                  padding: "9px 12px", cursor: "pointer",
                  background: i === active ? "rgba(242,183,71,0.14)" : "transparent",
                  borderBottom: "1px solid var(--ink-line)",
                }}
              >
                <div style={{ fontSize: 14, color: "var(--paper)" }}>{p.name}</div>
                {p.secondary && <div style={{ fontSize: 12, color: "var(--paper-faint)", marginTop: 2 }}>{p.secondary}</div>}
              </li>
            ))}
          </ul>
          {!loading && note && <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--paper-muted)" }}>{note}</div>}
          <div style={{ padding: "6px 12px", fontSize: 10, color: "var(--paper-faint)", textAlign: "right" }}>
            Place data © OpenStreetMap contributors
          </div>
        </div>
      )}
    </div>
  );
}
