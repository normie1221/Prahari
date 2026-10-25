import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.GEOCODER_MIN_INTERVAL_MS = "200";
const get = vi.fn();
vi.mock("axios", () => ({ default: { create: () => ({ get }) } }));

const geo = await import("../geocoderClient.js");
const geoService = await import("../../services/geoService.js");

const photonFC = (feats) => ({ data: { type: "FeatureCollection", features: feats } });
const feat = (name, lon, lat, extra = {}) => ({
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: { name, osm_type: "N", osm_id: Math.floor(lat * 1e5), city: "Bengaluru", state: "Karnataka", osm_value: "hospital", ...extra },
});

beforeEach(() => { get.mockReset(); geo._resetForTests(); });

describe("normalisation", () => {
  it("turns a Photon feature into a place with name, secondary line and coords", () => {
    const p = geo.photonFeatureToPlace(feat("Sapthagiri Hospital", 77.5, 13.08, { district: "Chikkasandra" }));
    expect(p).toMatchObject({ name: "Sapthagiri Hospital", lat: 13.08, lon: 77.5, kind: "hospital" });
    expect(p.secondary).toBe("Chikkasandra, Bengaluru, Karnataka");
    expect(p.label).toBe("Sapthagiri Hospital, Chikkasandra, Bengaluru, Karnataka");
  });
  it("skips features without coordinates or a name", () => {
    expect(geo.photonFeatureToPlace({ properties: { name: "x" } })).toBeNull();
    expect(geo.photonFeatureToPlace({ geometry: { coordinates: [77, 13] }, properties: {} })).toBeNull();
  });
  it("turns a Nominatim item into the same shape", () => {
    const p = geo.nominatimItemToPlace({ lat: "12.99", lon: "77.57", display_name: "Mantri Square, Malleshwaram, Bengaluru, Karnataka, India", osm_type: "way", osm_id: 1 });
    expect(p).toMatchObject({ name: "Mantri Square", lat: 12.99, lon: 77.57 });
    expect(p.secondary).toBe("Malleshwaram, Bengaluru, Karnataka");
  });
});

describe("photonSearch", () => {
  it("limits to India, biases toward `near`, dedupes, and caches", async () => {
    get.mockResolvedValueOnce(photonFC([feat("Sapthagiri Hospital", 77.5, 13.08), feat("Sapthagiri Hospital", 77.5, 13.08)]));
    const near = { lat: 13.08, lon: 77.48 };
    const a = await geo.photonSearch("sapthagiri", { near });
    expect(a).toHaveLength(1);
    const [url, { params }] = get.mock.calls[0];
    expect(url).toBe("https://photon.komoot.io/api");
    expect(params).toMatchObject({ q: "sapthagiri", bbox: geo.INDIA_BBOX, lat: 13.08, lon: 77.48, lang: "en" });
    await geo.photonSearch("sapthagiri", { near });
    expect(get).toHaveBeenCalledTimes(1); // second call served from cache
  });

  it("spaces upstream calls by the minimum interval (fair use)", async () => {
    get.mockResolvedValue(photonFC([feat("A", 77.5, 13.0)]));
    const t0 = Date.now();
    await Promise.all([geo.photonSearch("aaa"), geo.photonSearch("bbb"), geo.photonSearch("ccc")]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(380); // 3 calls, 200ms apart
  });
});

describe("geoService", () => {
  it("suggest never falls back to Nominatim (its policy forbids autocomplete)", async () => {
    get.mockRejectedValueOnce(new Error("photon down"));
    const r = await geoService.suggest("mantri", undefined);
    expect(r).toEqual({ places: [], unavailable: true });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toContain("photon");
  });

  it("geocode falls back to Nominatim when Photon fails", async () => {
    get.mockRejectedValueOnce(new Error("photon down"));
    get.mockResolvedValueOnce({ data: [{ lat: "12.99", lon: "77.57", display_name: "Mantri Square, Bengaluru, Karnataka, India" }] });
    const p = await geoService.geocode("mantri square", { lat: 13.0, lon: 77.5 });
    expect(p).toMatchObject({ name: "Mantri Square", lat: 12.99 });
    const [url, { params }] = get.mock.calls[1];
    expect(url).toBe("https://nominatim.openstreetmap.org/search");
    expect(params.countrycodes).toBe("in");
    expect(params.viewbox).toBeTruthy();
  });

  it("geocode reports a clear 503 when both providers are down", async () => {
    get.mockRejectedValue(new Error("down"));
    await expect(geoService.geocode("x place", undefined)).rejects.toMatchObject({ status: 503 });
  });

  it("reverse uses Photon, then Nominatim, then gives null (never throws)", async () => {
    get.mockRejectedValueOnce(new Error("photon down"));
    get.mockResolvedValueOnce({ data: { lat: "13.08", lon: "77.49", display_name: "Chikka Banavara, Bengaluru North, Karnataka" } });
    expect((await geoService.reverse(13.08, 77.49)).name).toBe("Chikka Banavara");
    get.mockRejectedValue(new Error("down"));
    expect(await geoService.reverse(10.1, 76.1)).toBeNull();
  });
});
