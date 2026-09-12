import { describe, expect, it, vi } from "vitest";

import type { AuthGateway, CvRenderer, CvRepository } from "@nomcci/cvmaker-application";
import type { Principal, SavedCvInput } from "@nomcci/cvmaker-domain";

import { createApi } from "./app";
import { createDevelopmentComposition } from "./composition";

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
  const clock = { now: () => new Date("2026-09-11T12:00:00.000Z") };
  return { app: createApi({ auth, cvs, renderer, usage, clock }), auth, cvs, renderer };
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
