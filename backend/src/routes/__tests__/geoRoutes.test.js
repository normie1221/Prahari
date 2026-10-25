import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";

const get = vi.fn();
vi.mock("axios", () => ({ default: { create: () => ({ get }) } }));
const { default: geoRoutes } = await import("../geoRoutes.js");
const { errorHandler } = await import("../../middleware/errorHandler.js");

let server, base;
beforeAll(async () => {
  const app = express();
  app.use("/api/geo", geoRoutes);
  app.use(errorHandler);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api/geo`;
});
afterAll(() => server.close());

describe("/api/geo routes", () => {
  it("GET /suggest returns places", async () => {
    get.mockResolvedValueOnce({ data: { features: [{ geometry: { coordinates: [77.57, 12.99] }, properties: { name: "Mantri Square", city: "Bengaluru" } }] } });
    const r = await fetch(`${base}/suggest?q=mantri&lat=13.08&lon=77.48`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.places[0]).toMatchObject({ name: "Mantri Square", lat: 12.99, lon: 77.57 });
  });
  it("rejects a 1-character query with 400", async () => {
    const r = await fetch(`${base}/suggest?q=m`);
    expect(r.status).toBe(400);
  });
  it("GET /geocode returns 404 with a helpful message when nothing matches", async () => {
    get.mockResolvedValueOnce({ data: { features: [] } });   // photon: no match
    get.mockResolvedValueOnce({ data: [] });                 // nominatim: no match
    const r = await fetch(`${base}/geocode?q=zzzz%20nowhere`);
    expect(r.status).toBe(404);
    expect((await r.json()).message).toMatch(/pick a suggestion/);
  });
  it("GET /reverse validates coordinates", async () => {
    const r = await fetch(`${base}/reverse?lat=999&lon=77`);
    expect(r.status).toBe(400);
  });
});
