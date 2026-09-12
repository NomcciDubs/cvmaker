import { describe, expect, it, vi } from "vitest";

import type { AuthGateway, CvRenderer, CvRepository } from "@nomcci/cvmaker-application";
import type { Principal, SavedCvInput } from "@nomcci/cvmaker-domain";

import { createApi } from "./app";
import { createCvAiService, createDevelopmentComposition } from "./composition";
import { DeterministicFakeCvAi } from "@nomcci/cvmaker-adapters-node";
import { PortableCvAiService } from "@nomcci/cvmaker-ai";

const principal: Principal = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "owner@example.test",
  name: null,
  nickname: null,
  country: null,
  role: "USER",
  permissions: [],
};

const validRenderRequest = {
  style: "modern",
  template: "cv_base",
  language: "en",
  cv: { personal_info: { full_name: "Ada Lovelace" } },
};

function fixture(overrides: { auth?: AuthGateway; cvs?: CvRepository; renderer?: CvRenderer } = {}) {
  const auth = overrides.auth ?? { authenticate: vi.fn(async (token: string | null) => token === "valid" ? principal : null) };
  const cvs = overrides.cvs ?? {
    list: vi.fn(async () => []),
    save: vi.fn(async (_userId: string, input: SavedCvInput) => input),
    delete: vi.fn(async () => false),
  };
  const renderer = overrides.renderer ?? { render: vi.fn(() => "<html>injected</html>") };
  const usage = { getAiUsage: vi.fn(async () => 0), tryConsumeAiUse: vi.fn(), tryConsumeImportUse: vi.fn() };
  usage.tryConsumeAiUse.mockResolvedValue(true);
  const ai = {
    import: vi.fn(async () => validRenderRequest.cv),
    rewrite: vi.fn(async (cv) => cv),
    modify: vi.fn(async (cv) => cv),
    translate: vi.fn(async (cv) => cv),
  };
  const clock = { now: () => new Date("2026-09-11T12:00:00.000Z") };
  return { app: createApi({ auth, cvs, renderer, usage, clock, ai }), auth, cvs, renderer, usage, ai };
}

describe("API boundaries", () => {
  it("rejects unauthenticated API requests", async () => {
    const { app } = fixture();
    const response = await app.request("/api/me");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("returns the principal supplied by the injected auth gateway", async () => {
    const authenticate = vi.fn(async () => principal);
    const { app } = fixture({ auth: { authenticate } });
    const response = await app.request("/api/me", { headers: { authorization: "Bearer custom-session" } });
    expect(response.status).toBe(200);
    expect(authenticate).toHaveBeenCalledWith("custom-session");
    const body = await response.json();
    expect(body.user.id).toBe(principal.id);
    expect(body.currentPage.role).toBe("USER");
    expect(body.usage).toEqual({ used: 0, limit: 1 });
  });

  it("validates render input before invoking the injected renderer", async () => {
    const render = vi.fn(() => "unused");
    const { app } = fixture({ renderer: { render } });
    const response = await app.request("/api/cv/render", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({ ...validRenderRequest, language: "fr" }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("validation_error");
    expect(render).not.toHaveBeenCalled();
  });

  it("renders through the injected renderer", async () => {
    const render = vi.fn(() => "<html>portable</html>");
    const { app } = fixture({ renderer: { render } });
    const response = await app.request("/api/cv/render", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(validRenderRequest),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ html: "<html>portable</html>" });
    expect(render).toHaveBeenCalledWith(validRenderRequest.cv, validRenderRequest);
  });

  it("consumes quota before invoking the configured AI service", async () => {
    const result = fixture();
    const response = await result.app.request("/api/cv/translate", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({ cv: validRenderRequest.cv, language: "es" }),
    });

    expect(response.status).toBe(200);
    expect(result.usage.tryConsumeAiUse).toHaveBeenCalledWith(principal.id, "2026-09-11", 1);
    expect(result.ai.translate).toHaveBeenCalledWith(validRenderRequest.cv, "es");
  });

  it("does not invoke AI after the daily quota is exhausted", async () => {
    const result = fixture();
    result.usage.tryConsumeAiUse.mockResolvedValue(false);
    const response = await result.app.request("/api/cv/import", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({ description: "Resume text", language: "en" }),
    });

    expect(response.status).toBe(429);
    expect(result.ai.import).not.toHaveBeenCalled();
  });

  it("passes only the authenticated owner ID to CV persistence", async () => {
    const list = vi.fn(async () => []);
    const { app } = fixture({ cvs: { list, save: vi.fn(), delete: vi.fn() } });
    await app.request("/api/cvs", { headers: { authorization: "Bearer valid" } });
    expect(list).toHaveBeenCalledWith(principal.id);
  });
});

describe("development composition", () => {
  it("authenticates with its local cookie and uses the shared renderer", async () => {
    const { app } = createDevelopmentComposition();
    const loginResponse = await app.request("/api/dev/login", { method: "POST" });
    const cookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0];

    expect(loginResponse.status).toBe(200);
    expect(cookie).toBe("cvmaker_session=local-dev");

    const renderResponse = await app.request("/api/cv/render", {
      method: "POST",
      headers: { cookie: cookie!, "content-type": "application/json" },
      body: JSON.stringify(validRenderRequest),
    });
    const body = await renderResponse.json();

    expect(renderResponse.status).toBe(200);
    expect(body.html).toContain("Ada Lovelace");
    expect(body.html).toContain('<html lang="en">');
  });
});

describe("AI environment selection", () => {
  it("uses the deterministic fake by default and when explicitly selected", () => {
    expect(createCvAiService({})).toBeInstanceOf(DeterministicFakeCvAi);
    expect(createCvAiService({ AI_PROVIDER: "fake" })).toBeInstanceOf(DeterministicFakeCvAi);
  });

  it("creates portable services for configured compatible and Ollama providers", () => {
    expect(createCvAiService({
      AI_PROVIDER: "openai-compatible",
      AI_BASE_URL: "http://model.example/v1",
      AI_MODEL: "model",
      AI_TIMEOUT_MS: "2500",
      AI_JSON_MODE: "true",
    })).toBeInstanceOf(PortableCvAiService);
    expect(createCvAiService({ AI_PROVIDER: "ollama", AI_MODEL: "local-model" })).toBeInstanceOf(PortableCvAiService);
  });

  it("validates provider configuration", () => {
    expect(() => createCvAiService({ AI_PROVIDER: "openai-compatible", AI_MODEL: "m" })).toThrow("AI_BASE_URL");
    expect(() => createCvAiService({ AI_PROVIDER: "ollama" })).toThrow("AI_MODEL");
    expect(() => createCvAiService({ AI_PROVIDER: "other" })).toThrow("Unsupported AI_PROVIDER");
    expect(() => createCvAiService({ AI_PROVIDER: "ollama", AI_MODEL: "m", AI_TIMEOUT_MS: "zero" })).toThrow("AI_TIMEOUT_MS");
    expect(() => createCvAiService({ AI_PROVIDER: "ollama", AI_MODEL: "m", AI_JSON_MODE: "yes" })).toThrow("AI_JSON_MODE");
  });
});
