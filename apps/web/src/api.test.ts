import { afterEach, describe, expect, it, vi } from "vitest";
import { getDeepgramVoiceToken, openWorkspace, pickWorkspaceFolder, seedSelfWorkspace } from "./api";

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

  it("maps a 501 token response to configured=false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "deepgram-not-configured" }, 501)));
    const result = await getDeepgramVoiceToken();
    expect(result).toEqual({ configured: false });
  });

  it("returns the token payload on 200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ configured: true, accessToken: "dg-token", expiresIn: 58 })));
    const result = await getDeepgramVoiceToken();
    expect(result).toEqual({ configured: true, accessToken: "dg-token", expiresIn: 58 });
  });

  it("throws for other errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "forbidden" }, 403)));
    await expect(getDeepgramVoiceToken()).rejects.toThrow("forbidden");
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
