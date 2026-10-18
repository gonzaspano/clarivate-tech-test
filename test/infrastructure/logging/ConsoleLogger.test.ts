import { afterEach, describe, expect, it, vi } from "vitest";
import { makeConsoleLogger } from "../../../src/infrastructure/logging/ConsoleLogger.js";

afterEach(() => vi.restoreAllMocks());

describe("ConsoleLogger", () => {
  it("writes one JSON line with level, message, data and a timestamp", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    makeConsoleLogger().info("search.filter_extracted", { matched: 3 });
    const line = JSON.parse(log.mock.calls[0]![0] as string);
    expect(line).toMatchObject({
      level: "info",
      message: "search.filter_extracted",
      matched: 3,
    });
    expect(typeof line.time).toBe("string");
  });

  it("works without data", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    makeConsoleLogger().info("hello");
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
      level: "info",
      message: "hello",
    });
  });

  it("writes errors to stderr as a JSON line with level error", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    makeConsoleLogger().error("http.error", { status: 502 });
    expect(JSON.parse(err.mock.calls[0]![0] as string)).toMatchObject({
      level: "error",
      message: "http.error",
      status: 502,
    });
    expect(out).not.toHaveBeenCalled();
  });
});
