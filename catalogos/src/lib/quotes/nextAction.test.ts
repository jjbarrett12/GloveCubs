/**
 * Tests for buyer-facing next action logic (quote detail page).
 */

import { describe, it, expect } from "vitest";
import { getNextAction } from "./nextAction";
import { QUOTE_STATUS } from "./types";

describe("getNextAction", () => {
  it("returns a message for every quote status", () => {
    for (const status of QUOTE_STATUS) {
      const result = getNextAction(status, null);
      expect(result).toBeDefined();
      expect(result.message).toBeDefined();
      expect(typeof result.message).toBe("string");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("new: no action link", () => {
    const result = getNextAction("new", null);
    expect(result.action).toBeUndefined();
    expect(result.message).toMatch(/queue|respond|business days/i);
  });

  it("reviewing: no action link", () => {
    const result = getNextAction("reviewing", null);
    expect(result.action).toBeUndefined();
    expect(result.message).toMatch(/preparing|email/i);
  });

  it("quoted with future expiration: no action link", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const result = getNextAction("quoted", future);
    expect(result.action).toBeUndefined();
    expect(result.message).toMatch(/sent|review|accept/i);
  });

  it("quoted with past expiration: suggests new quote", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const result = getNextAction("quoted", past);
    expect(result.action).toBeDefined();
    expect(result.action?.label).toMatch(/new quote|request/i);
    expect(result.action?.href).toBe("/quote");
    expect(result.message).toMatch(/expired|new request/i);
  });

  it("lost: suggests request new quote", () => {
    const result = getNextAction("lost", null);
    expect(result.action).toBeDefined();
    expect(result.action?.label).toMatch(/new quote|request/i);
    expect(result.action?.href).toBe("/quote");
  });

  it("expired: suggests request new quote", () => {
    const result = getNextAction("expired", null);
    expect(result.action).toBeDefined();
    expect(result.action?.href).toBe("/quote");
  });

  it("closed: suggests start new request", () => {
    const result = getNextAction("closed", null);
    expect(result.action).toBeDefined();
    expect(result.action?.label).toMatch(/new request|start/i);
    expect(result.action?.href).toBe("/quote");
  });

  it("won: no action link, order processing message", () => {
    const result = getNextAction("won", null);
    expect(result.action).toBeUndefined();
    expect(result.message).toMatch(/order|processing|ships/i);
  });
});
