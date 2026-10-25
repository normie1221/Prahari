import { describe, it, expect, vi } from "vitest";
import { perUserLimiter } from "../perUserLimiter.js";

function mockReqRes(userId) {
  const req = { user: userId ? { id: userId } : null };
  const res = {};
  const next = vi.fn();
  return { req, res, next };
}

describe("perUserLimiter", () => {
  it("allows requests under the limit", () => {
    const limiter = perUserLimiter({ windowMs: 60_000, max: 3, action: "test-action" });
    const user = "user-a";
    for (let i = 0; i < 3; i += 1) {
      const { req, res, next } = mockReqRes(user);
      limiter(req, res, next);
      expect(next).toHaveBeenCalledWith(); // called with no error
    }
  });

  it("blocks the request once the limit is exceeded", () => {
    const limiter = perUserLimiter({ windowMs: 60_000, max: 2, action: "test-action-2" });
    const user = "user-b";
    for (let i = 0; i < 2; i += 1) {
      const { req, res, next } = mockReqRes(user);
      limiter(req, res, next);
    }
    const { req, res, next } = mockReqRes(user);
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const errArg = next.mock.calls[0][0];
    expect(errArg).toBeDefined();
    expect(errArg.status).toBe(429);
  });

  it("tracks separate users independently", () => {
    const limiter = perUserLimiter({ windowMs: 60_000, max: 1, action: "test-action-3" });
    const { req: reqA, res: resA, next: nextA } = mockReqRes("user-c");
    limiter(reqA, resA, nextA);
    expect(nextA.mock.calls[0][0]).toBeUndefined();

    const { req: reqD, res: resD, next: nextD } = mockReqRes("user-d");
    limiter(reqD, resD, nextD);
    expect(nextD.mock.calls[0][0]).toBeUndefined(); // different user, not blocked
  });

  it("does not block anonymous (unauthenticated) requests — falls back to IP limiter", () => {
    const limiter = perUserLimiter({ windowMs: 60_000, max: 1, action: "test-action-4" });
    const { req, res, next } = mockReqRes(null);
    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(3);
    next.mock.calls.forEach((call) => expect(call[0]).toBeUndefined());
  });
});
