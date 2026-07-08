import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SERVER_PORT, resolveDbPath, resolveServerPort } from "./config";

describe("local server config", () => {
  it("prefers the explicit GraphCode server port and rejects invalid values", () => {
    expect(resolveServerPort("4123")).toBe(4123);
    expect(resolveServerPort("not-a-port")).toBe(DEFAULT_SERVER_PORT);
    expect(resolveServerPort("-1")).toBe(DEFAULT_SERVER_PORT);
  });

  it("resolves relative database overrides from the current working directory", () => {
    expect(resolveDbPath(path.join(".graphcode", "custom.sqlite"))).toBe(path.resolve(".graphcode", "custom.sqlite"));
  });
});
