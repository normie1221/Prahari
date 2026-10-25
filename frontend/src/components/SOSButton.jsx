
import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";

export default function SOSButton() {
  const { getToken, isSignedIn } = useAuth();
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  const triggerSOS = () => {
    if (!isSignedIn) {
      setStatus("Please sign in first.");
      return;
    }

    if (!navigator.geolocation) {
      setStatus("GPS is not supported by this browser.");
      return;
    }

    const confirmed = window.confirm(
      "Send an emergency alert with your current location?"
    );

    if (!confirmed) return;

    setSending(true);
    setStatus("Getting your location...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const token = await getToken();

          const response = await fetch(
            `${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api/emergency/sos`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                message: "Emergency assistance requested",
                isSilent: false,
              }),
            }
          );

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || data.error || "SOS failed");
          }

          const sent = data.notificationResults?.some(
            (item) => item.status === "sent"
          );

          setStatus(
            sent
              ? "SOS recorded. At least one notification was accepted by its provider. Check delivery status."
              : "SOS recorded, but notification delivery is not confirmed. Contact emergency services directly."
          );
        } catch (error) {
          setStatus(`SOS request failed: ${error.message}`);
        } finally {
          setSending(false);
        }
      },
      () => {
        setSending(false);
        setStatus(
          "Could not obtain GPS location. Enable location access and try again, or contact emergency services directly."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  return (
    <div>
      <button
        type="button"
        onClick={triggerSOS}
        disabled={sending}
        style={{
          background: "#ef4444",
          color: "white",
          border: "none",
          borderRadius: "12px",
          padding: "14px 28px",
          fontSize: "18px",
          fontWeight: "bold",
          cursor: sending ? "wait" : "pointer",
          opacity: sending ? 0.7 : 1,
        }}
      >
        {sending ? "SENDING SOS..." : "SOS — GET HELP"}
      </button>

      {status && <p role="status" aria-live="polite">{status}</p>}
    </div>
  );
}
