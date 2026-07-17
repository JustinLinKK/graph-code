import { afterEach, describe, expect, it, vi } from "vitest";
import { openWorkspace, pickWorkspaceFolder, seedSelfWorkspace } from "./api";

describe("API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not send a JSON content type for empty requests", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      json({ id: "graphcode-self" })
    );
    vi.stubGlobal("fetch", fetchMock);

    await seedSelfWorkspace();

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
    expect(headerValue(init?.headers, "Content-Type")).toBeNull();
  });

  it("keeps the JSON content type for requests with JSON bodies", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      json({ supported: false, selected: false, path: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    await pickWorkspaceFolder();

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe("{}");
    expect(headerValue(init?.headers, "Content-Type")).toBe("application/json");
  });

  it("surfaces JSON error messages as readable text", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      json(
        {
          error: "Request Error",
          message: "Body cannot be empty when content-type is set to 'application/json'"
        },
        400
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(openWorkspace("/tmp/repo")).rejects.toThrow(
      "Body cannot be empty when content-type is set to 'application/json'"
    );
  });
});

function headerValue(headers: HeadersInit | undefined, name: string): string | null {
  return new Headers(headers).get(name);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
