import { describe, it, expect } from "vitest";
import { classifyText, findDuplicates } from "../moderation.js";

describe("classifyText", () => {
  it("flags nothing for an ordinary safety post", () => {
    const result = classifyText("The road near XYZ junction has been poorly lit for weeks.");
    expect(result.flags).toEqual([]);
    expect(result.needsModeratorReview).toBe(false);
  });

  it("suggests a category based on keywords without inventing new ones", () => {
    const result = classifyText("I was followed by someone near the bus stop, very scary.");
    expect(result.suggestedCategories).toContain("HARASSMENT");
  });

  it("flags spam patterns (repeated links)", () => {
    const result = classifyText("Check this out http://a.com and also http://b.com now!!");
    expect(result.flags).toContain("POTENTIALLY_SPAM");
    expect(result.needsModeratorReview).toBe(true);
  });

  it("flags spam patterns (excessive character repetition)", () => {
    const result = classifyText("BUY NOW!!!!!!!!! click here for free money");
    expect(result.flags).toContain("POTENTIALLY_SPAM");
  });

  it("flags potentially toxic content for moderator review, never auto-acts", () => {
    const result = classifyText("I will kill you if you do that again");
    expect(result.flags).toContain("POTENTIALLY_TOXIC");
    expect(result.needsModeratorReview).toBe(true);
    // Critically: classifyText only flags for review, it has no side effect
    // (no ban, no delete) — that's enforced by callers only ever setting
    // isFlagged, never taking destructive action directly from this result.
  });

  it("extracts location/category-relevant keywords for lighting reports", () => {
    const result = classifyText("This street is really dark and has no streetlight at all");
    expect(result.suggestedCategories).toContain("LIGHTING");
  });
});

describe("findDuplicates", () => {
  const recent = [
    { id: "p1", content: "The road near XYZ junction has poor lighting after 9pm" },
    { id: "p2", content: "Looking for a good biryani place near Koramangala" },
  ];

  it("finds a near-duplicate post by content similarity", () => {
    const dupes = findDuplicates("The road near XYZ junction has poor lighting after 9pm today", recent);
    expect(dupes.length).toBeGreaterThan(0);
    expect(dupes[0].id).toBe("p1");
  });

  it("does not flag unrelated content as duplicate", () => {
    const dupes = findDuplicates("Anyone know a good cab service for late night rides?", recent);
    expect(dupes.length).toBe(0);
  });

  it("respects a custom similarity threshold", () => {
    const dupes = findDuplicates("junction lighting road", recent, 0.99);
    expect(dupes.length).toBe(0); // too strict a threshold to match anything
  });
});
