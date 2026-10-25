
import { useEffect, useRef, useState } from "react";
import { api, friendlyError } from "../lib/api.js";
import { ErrorBlock } from "../components/StateBlocks.jsx";

const LONG_PRESS_MS = 1200;

function ChannelResultRow({ result }) {
  const label =
    result.channel === "sms"
      ? "SMS"
      : result.channel === "email"
      ? "Email"
      : result.channel;

  const statusText = {
    sent: "Accepted by provider",
    simulated: "Simulated (channel not configured)",
    queued_for_retry: "Retrying in background",
    failed: "Failed",
  }[result.status] || result.status;

  const color =
    result.status === "sent"
      ? "var(--green-banyan)"
      : result.status === "failed"
      ? "var(--coral-signal)"
      : "var(--amber-streetlamp)";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 13,
        padding: "4px 0",
        overflowWrap: "anywhere",
      }}
    >
      <span>
        {label} → {result.to}
      </span>
      <span style={{ color, textAlign: "right" }}>
        {statusText}
      </span>
    </div>
  );
}

export default function EmergencyPage() {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [wasSilent, setWasSilent] = useState(false);

  const pressTimerRef = useRef(null);
  const pressFiredRef = useRef(false);
  const requestActiveRef = useRef(false);

  useEffect(() => {
    return () => {
      clearTimeout(pressTimerRef.current);
    };
  }, []);

  async function fireSos({ isSilent }) {
    if (requestActiveRef.current) return;

    if (!navigator.geolocation) {
      if (!isSilent) {
        setError("Geolocation is not supported by this browser.");
        setStatus("error");
      }
      return;
    }

    requestActiveRef.current = true;
    setStatus("locating");
    setError(null);
    setResult(null);
    setWasSilent(isSilent);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setStatus("sending");

        try {
          const { data } = await api.post("/api/emergency/sos", {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            isSilent,
          });

          setResult(data);
          setStatus(isSilent ? "idle" : "sent");
        } catch (err) {
          if (!isSilent) {
            setError(friendlyError(err));
            setStatus("error");
          } else {
            setStatus("idle");
          }
        } finally {
          requestActiveRef.current = false;
        }
      },
      (geoError) => {
        if (!isSilent) {
          const message =
            geoError.code === 1
              ? "Location permission was denied. Enable location access and try again."
              : geoError.code === 3
              ? "Getting your location took too long. Please try again."
              : "Could not obtain your location. Check your GPS and try again.";

          setError(message);
          setStatus("error");
        } else {
          setStatus("idle");
        }

        requestActiveRef.current = false;
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  function handlePressStart(event) {
    if (requestActiveRef.current) return;

    if (event.button !== undefined && event.button !== 0) return;

    clearTimeout(pressTimerRef.current);
    pressFiredRef.current = false;

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may be unavailable in some environments.
    }

    pressTimerRef.current = setTimeout(() => {
      pressFiredRef.current = true;
      fireSos({ isSilent: true });
    }, LONG_PRESS_MS);
  }

  function handlePressEnd() {
    clearTimeout(pressTimerRef.current);

    if (pressFiredRef.current) return;

    if (!requestActiveRef.current) {
      fireSos({ isSilent: false });
    }
  }

  function handlePressCancel() {
    clearTimeout(pressTimerRef.current);
  }

  return (
    <div
      style={{
        maxWidth: 560,
        margin: "40px auto",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <div>
        <div className="eyebrow">Emergency</div>

        <h2 style={{ marginTop: 6 }}>SOS</h2>

        <p style={{ marginTop: 10 }}>
          This shares your current location with your saved emergency
          contacts. It does not contact police or ambulance services
          directly. If you are in immediate danger, contact local
          emergency services directly.
        </p>
      </div>

      <button
        type="button"
        onPointerDown={handlePressStart}
        onPointerUp={handlePressEnd}
        onPointerCancel={handlePressCancel}
        onContextMenu={(event) => event.preventDefault()}
        disabled={status === "locating" || status === "sending"}
        aria-label="SOS. Tap for a normal emergency alert or hold for a silent alert."
        className="btn btn-danger"
        style={{
          height: 160,
          width: 160,
          borderRadius: "50%",
          margin: "0 auto",
          fontSize: 22,
          fontWeight: 700,
          userSelect: "none",
          touchAction: "none",
          opacity:
            status === "locating" || status === "sending" ? 0.7 : 1,
        }}
      >
        {status === "locating"
          ? "Locating…"
          : status === "sending"
          ? "Sending…"
          : "SOS"}
      </button>

      <p
        style={{
          fontSize: 12,
          color: "var(--paper-faint)",
        }}
      >
        Tap for a normal SOS. Press and hold for{" "}
        {(LONG_PRESS_MS / 1000).toFixed(1)} seconds for a silent alert.
        Silent mode suppresses the on-screen success or error message.
      </p>

      {status === "sent" && result && !wasSilent && (
        <div className="card">
          <p
            style={{
              color:
                result.contactsNotified > 0
                  ? "var(--green-banyan)"
                  : "var(--amber-streetlamp)",
            }}
          >
            {result.contactsNotified > 0
              ? `${result.contactsNotified} emergency contact(s) processed for notification.`
              : "No emergency contacts were notified. Add contacts to your profile."}
          </p>

          {result.notificationResults?.length > 0 && (
            <div
              style={{
                marginTop: 10,
                borderTop: "1px solid var(--ink-line)",
                paddingTop: 10,
              }}
            >
              {result.notificationResults.map((item, index) => (
                <ChannelResultRow key={index} result={item} />
              ))}
            </div>
          )}

          {result.devNotice && (
            <p
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "var(--amber-streetlamp)",
              }}
            >
              {result.devNotice}
            </p>
          )}

          {result.disclaimer && (
            <p style={{ marginTop: 10, fontSize: 12 }}>
              {result.disclaimer}
            </p>
          )}
        </div>
      )}

      {status === "error" && (
        <ErrorBlock
          message={error}
          onRetry={() => {
            setError(null);
            setStatus("idle");
          }}
        />
      )}
    </div>
  );
}
