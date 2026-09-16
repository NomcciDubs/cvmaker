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
  const cvInputs = {
    list: vi.fn(async () => []),
    save: vi.fn(async (_userId: string, input) => ({ ...input, createdAt: "2026-09-11T12:00:00.000Z", updatedAt: "2026-09-11T12:00:00.000Z" })),
  };
  const applications = {
    list: vi.fn(async () => []),
    save: vi.fn(async (_userId: string, input) => ({
      ...input,
      id: "00000000-0000-4000-8000-000000000004",
      status: input.status || "draft",
      createdAt: "2026-09-11T12:00:00.000Z",
      updatedAt: "2026-09-11T12:00:00.000Z",
    })),
  };
  const photos = {
    list: vi.fn(async () => []),
    save: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000003", deletedOldest: false })),
    delete: vi.fn(async () => false),
  };
  const pdfArchives = {
    tryCommitExport: vi.fn(async () => ({ status: "created" as const })),
    list: vi.fn(async () => []),
    findByHash: vi.fn(async () => null),
    findByFilename: vi.fn(async () => null),
    find: vi.fn(async () => null),
    delete: vi.fn(async () => false),
  };
  const pdfQuotas = {
    get: vi.fn(async () => ({ defaultDaily: 3, friendDaily: 20, superAdminDaily: null, maxArchivedPdfs: 20, maxArchivedPdfBytes: 26_214_400 })),
    update: vi.fn(async () => undefined),
  };
  const adminMetrics = {
    getMetrics: vi.fn(async () => ({
      totals: { applications: 0, users: 0, companies: 0 },
      savedCvs: { savedCvs: 0 },
      usage: { aiUses: 0, aiUsers: 0 },
      topCompanies: [],
      recentApplications: [],
    })),
  };
  const usage = {
    getAiUsage: vi.fn(async () => 0),
    tryConsumeAiUse: vi.fn(),
    createImportWorkflow: vi.fn(async () => undefined),
    tryConsumeImportUse: vi.fn(),
  };
  usage.tryConsumeAiUse.mockResolvedValue(true);
  const ai = {
    import: vi.fn(async () => validRenderRequest.cv),
    rewrite: vi.fn(async (cv) => cv),
    modify: vi.fn(async (cv) => cv),
    translate: vi.fn(async (cv) => cv),
  };
  const clock = { now: () => new Date("2026-09-11T12:00:00.000Z") };
  const ids = { generate: vi.fn(() => "00000000-0000-4000-8000-000000000002") };
  const hasher = { hash: vi.fn(async () => "cv-hash") };
  const pdf = { generate: vi.fn(async () => new Uint8Array([1, 2, 3])) };
  const objects = {
    get: vi.fn(async () => null),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  return {
    app: createApi({
      auth,
      cvs,
      cvInputs,
      applications,
      photos,
      pdfArchives,
      pdfQuotas,
      adminMetrics,
      renderer,
      pdf,
      objects,
      usage,
      clock,
      ids,
      hasher,
      ai,
    }),
    auth,
    cvs,
    cvInputs,
    applications,
    photos,
    pdfArchives,
    pdfQuotas,
    adminMetrics,
    renderer,
    pdf,
    objects,
    usage,
    ids,
    hasher,
    ai,
  };
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

  it("creates a single-use import workflow bound to the generated CV hash", async () => {
    const result = fixture();
    const response = await result.app.request("/api/cv/import", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({ description: "Resume text", language: "en" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      cv: validRenderRequest.cv,
      importWorkflowId: "00000000-0000-4000-8000-000000000002",
    });
    expect(result.hasher.hash).toHaveBeenCalledWith(JSON.stringify(validRenderRequest.cv));
    expect(result.usage.createImportWorkflow).toHaveBeenCalledWith(
      principal.id,
      "00000000-0000-4000-8000-000000000002",
      "cv-hash",
      new Date("2026-09-12T12:00:00.000Z"),
    );
  });

  it("uses the import allowance without daily quota and preserves the photo", async () => {
    const result = fixture();
    result.usage.tryConsumeImportUse.mockResolvedValueOnce(true);
    result.ai.rewrite.mockResolvedValueOnce({ personal_info: { full_name: "Ada Lovelace" } });
    const source = { personal_info: { full_name: "Ada Lovelace", photo_url: "data:image/png;base64,YQ==" } };
    const response = await result.app.request("/api/cv/import-improve", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({
        cv: source,
        originalCv: validRenderRequest.cv,
        importWorkflowId: "00000000-0000-4000-8000-000000000008",
        targetRole: "Engineer",
        language: "en",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      cv: { personal_info: { full_name: "Ada Lovelace", photo_url: "data:image/png;base64,YQ==" } },
      importWorkflowId: null,
    });
    expect(result.usage.tryConsumeImportUse).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000008",
      principal.id,
      "cv-hash",
      new Date("2026-09-11T12:00:00.000Z"),
    );
    expect(result.usage.tryConsumeAiUse).not.toHaveBeenCalled();
  });

  it("does not invoke AI when the import allowance is unavailable", async () => {
    const result = fixture();
    result.usage.tryConsumeImportUse.mockResolvedValueOnce(false);
    const response = await result.app.request("/api/cv/import-improve", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({
        cv: validRenderRequest.cv,
        originalCv: validRenderRequest.cv,
        importWorkflowId: "00000000-0000-4000-8000-000000000008",
        instruction: "Improve the summary",
        language: "en",
      }),
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "import_ai_allowance_unavailable" });
    expect(result.ai.modify).not.toHaveBeenCalled();
  });

  it("passes only the authenticated owner ID to CV persistence", async () => {
    const list = vi.fn(async () => []);
    const { app } = fixture({ cvs: { list, save: vi.fn(), delete: vi.fn() } });
    await app.request("/api/cvs", { headers: { authorization: "Bearer valid" } });
    expect(list).toHaveBeenCalledWith(principal.id);
  });

  it("lists and upserts CV inputs for the authenticated owner", async () => {
    const result = fixture();
    const createResponse = await result.app.request("/api/cv-inputs", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({ content: "  Resume text  " }),
    });

    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toEqual({ id: "00000000-0000-4000-8000-000000000002" });
    expect(result.cvInputs.save).toHaveBeenCalledWith(principal.id, {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Imported CV",
      content: "Resume text",
    });

    await result.app.request("/api/cv-inputs", { headers: { authorization: "Bearer valid" } });
    expect(result.cvInputs.list).toHaveBeenCalledWith(principal.id, 50);
  });

  it("rejects CV input ID collisions without exposing another owner", async () => {
    const result = fixture();
    result.cvInputs.save.mockResolvedValueOnce(null);
    const response = await result.app.request("/api/cv-inputs", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000009", content: "Resume" }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "id_conflict" });
  });

  it("validates and stores job applications for the authenticated owner", async () => {
    const result = fixture();
    const response = await result.app.request("/api/applications", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({ ...validRenderRequest, company: "Nomcci", role: "Engineer", html: "<p>Ada</p>" }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "00000000-0000-4000-8000-000000000004" });
    expect(result.applications.save).toHaveBeenCalledWith(principal.id, expect.objectContaining({ company: "Nomcci", role: "Engineer" }));

    await result.app.request("/api/applications", { headers: { authorization: "Bearer valid" } });
    expect(result.applications.list).toHaveBeenCalledWith(principal.id, 50);
  });

  it("stores and deletes validated photos for the authenticated owner", async () => {
    const result = fixture();
    const createResponse = await result.app.request("/api/photos", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({ dataUrl: "data:image/png;base64,YQ==" }),
    });

    expect(createResponse.status).toBe(201);
    expect(result.photos.save).toHaveBeenCalledWith(principal.id, "CV photo", "data:image/png;base64,YQ==", 10);

    const deleteResponse = await result.app.request("/api/photos/00000000-0000-4000-8000-000000000003", {
      method: "DELETE",
      headers: { authorization: "Bearer valid" },
    });
    expect(deleteResponse.status).toBe(200);
    expect(result.photos.delete).toHaveBeenCalledWith(principal.id, "00000000-0000-4000-8000-000000000003");
  });

  it("guards administration and updates validated PDF limits", async () => {
    const forbidden = fixture();
    const forbiddenResponse = await forbidden.app.request("/api/admin/metrics", { headers: { authorization: "Bearer valid" } });
    expect(forbiddenResponse.status).toBe(403);
    expect(forbidden.adminMetrics.getMetrics).not.toHaveBeenCalled();

    const admin = { ...principal, role: "SUPER_ADMIN" };
    const result = fixture({ auth: { authenticate: vi.fn(async () => admin) } });
    const metricsResponse = await result.app.request("/api/admin/metrics", { headers: { authorization: "Bearer valid" } });
    expect(metricsResponse.status).toBe(200);
    expect(result.adminMetrics.getMetrics).toHaveBeenCalledOnce();

    const limits = { defaultDaily: 3, friendDaily: 20, superAdminDaily: null, maxArchivedPdfs: 20, maxArchivedPdfBytes: 26_214_400 };
    const limitsResponse = await result.app.request("/api/admin/pdf-limits", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(limits),
    });
    expect(limitsResponse.status).toBe(200);
    expect(await limitsResponse.json()).toEqual({ limits });
    expect(result.pdfQuotas.update).toHaveBeenCalledWith(limits);
  });

  it("lists PDF archives without exposing internal object keys", async () => {
    const result = fixture();
    result.pdfArchives.list.mockResolvedValueOnce([{
      id: "00000000-0000-4000-8000-000000000005",
      filename: "00000000-0000-4000-8000-000000000006-ada.pdf",
      objectKey: "archives/private/object.pdf",
      sizeBytes: 1_024,
      contentHash: "private-hash",
      createdAt: "2026-09-11T12:00:00.000Z",
    }]);

    const response = await result.app.request("/api/archives", { headers: { authorization: "Bearer valid" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ archives: [{
      id: "00000000-0000-4000-8000-000000000005",
      filename: "00000000-0000-4000-8000-000000000006-ada.pdf",
      sizeBytes: 1_024,
      createdAt: "2026-09-11T12:00:00.000Z",
      downloadPath: `/archives/${principal.id}/output/00000000-0000-4000-8000-000000000006-ada.pdf`,
    }] });
    expect(result.pdfArchives.list).toHaveBeenCalledWith(principal.id, 20);
  });

  it("deletes the PDF object before its owned archive metadata", async () => {
    const result = fixture();
    const archiveId = "00000000-0000-4000-8000-000000000005";
    result.pdfArchives.find.mockResolvedValueOnce({
      id: archiveId,
      filename: "00000000-0000-4000-8000-000000000006-ada.pdf",
      objectKey: "archives/owner/output/ada.pdf",
      sizeBytes: 3,
      contentHash: "hash",
      createdAt: "2026-09-11T12:00:00.000Z",
    });

    const response = await result.app.request(`/api/archives/${archiveId}`, {
      method: "DELETE",
      headers: { authorization: "Bearer valid" },
    });
    expect(response.status).toBe(200);
    expect(result.objects.delete).toHaveBeenCalledWith("archives/owner/output/ada.pdf");
    expect(result.pdfArchives.delete).toHaveBeenCalledWith(principal.id, archiveId);
    expect(result.objects.delete.mock.invocationCallOrder[0]).toBeLessThan(result.pdfArchives.delete.mock.invocationCallOrder[0]!);
  });

  it("serves only the authenticated owner's validated PDF archive", async () => {
    const result = fixture();
    const filename = "00000000-0000-4000-8000-000000000006-ada.pdf";
    result.pdfArchives.findByFilename.mockResolvedValueOnce({
      id: "00000000-0000-4000-8000-000000000005",
      filename,
      objectKey: "archives/owner/output/ada.pdf",
      sizeBytes: 3,
      contentHash: "hash",
      createdAt: "2026-09-11T12:00:00.000Z",
    });
    result.objects.get.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));

    const response = await result.app.request(`/archives/${principal.id}/output/${filename}`, {
      headers: { authorization: "Bearer valid" },
    });
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    const wrongOwner = await result.app.request(`/archives/00000000-0000-4000-8000-000000000099/output/${filename}`, {
      headers: { authorization: "Bearer valid" },
    });
    expect(wrongOwner.status).toBe(404);
    expect(result.pdfArchives.findByFilename).toHaveBeenCalledTimes(1);
  });

  it("reuses an existing PDF archive before generation", async () => {
    const result = fixture();
    result.pdfArchives.findByHash.mockResolvedValueOnce({
      id: "00000000-0000-4000-8000-000000000005",
      filename: "00000000-0000-4000-8000-000000000006-ada.pdf",
      objectKey: "archives/owner/output/ada.pdf",
      sizeBytes: 3,
      contentHash: "cv-hash",
      createdAt: "2026-09-11T12:00:00.000Z",
    });

    const response = await result.app.request("/api/cv/pdf", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(validRenderRequest),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).reused).toBe(true);
    expect(result.pdf.generate).not.toHaveBeenCalled();
    expect(result.objects.put).not.toHaveBeenCalled();
  });

  it("stores a generated PDF and atomically commits quotas and metadata", async () => {
    const result = fixture();
    const response = await result.app.request("/api/cv/pdf", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({ ...validRenderRequest, name: "Ada CV" }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      downloadPath: `/archives/${principal.id}/output/00000000-0000-4000-8000-000000000002-ada-cv.pdf`,
    });
    expect(result.objects.put).toHaveBeenCalledWith(
      `archives/${principal.id}/output/00000000-0000-4000-8000-000000000002-ada-cv.pdf`,
      new Uint8Array([1, 2, 3]),
    );
    expect(result.pdfArchives.tryCommitExport).toHaveBeenCalledWith(
      principal.id,
      "2026-09-11",
      expect.objectContaining({
        filename: "00000000-0000-4000-8000-000000000002-ada-cv.pdf",
        sizeBytes: 3,
        contentHash: "cv-hash",
      }),
      { daily: 3, maxArchivedPdfs: 20, maxArchivedPdfBytes: 26_214_400 },
    );
  });

  it("returns 502 without storage when PDF generation fails", async () => {
    const result = fixture();
    result.pdf.generate.mockRejectedValueOnce(new Error("browser unavailable"));
    const response = await result.app.request("/api/cv/pdf", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(validRenderRequest),
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "pdf_generation_failed" });
    expect(result.objects.put).not.toHaveBeenCalled();
    expect(result.pdfArchives.tryCommitExport).not.toHaveBeenCalled();
  });

  it("rejects a single PDF larger than the total archive byte limit", async () => {
    const result = fixture();
    result.pdfQuotas.get.mockResolvedValueOnce({
      defaultDaily: 3,
      friendDaily: 20,
      superAdminDaily: null,
      maxArchivedPdfs: 20,
      maxArchivedPdfBytes: 2,
    });
    const response = await result.app.request("/api/cv/pdf", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(validRenderRequest),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "pdf_too_large" });
    expect(result.objects.put).not.toHaveBeenCalled();
  });

  it("removes the race-losing object and reuses the committed duplicate", async () => {
    const result = fixture();
    const duplicate = {
      id: "00000000-0000-4000-8000-000000000005",
      filename: "00000000-0000-4000-8000-000000000006-existing.pdf",
      objectKey: "archives/owner/output/existing.pdf",
      sizeBytes: 3,
      contentHash: "cv-hash",
      createdAt: "2026-09-11T12:00:00.000Z",
    };
    result.pdfArchives.tryCommitExport.mockResolvedValueOnce({ status: "duplicate", archive: duplicate });
    const response = await result.app.request("/api/cv/pdf", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(validRenderRequest),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      downloadPath: `/archives/${principal.id}/output/${duplicate.filename}`,
      reused: true,
    });
    expect(result.objects.delete).toHaveBeenCalledOnce();
  });

  it.each([
    ["daily_limit_reached", "pdf_daily_limit_reached"],
    ["archive_count_limit_reached", "pdf_archive_limit_reached"],
    ["archive_size_limit_reached", "pdf_storage_limit_reached"],
  ] as const)("removes the PDF object when commit returns %s", async (status, error) => {
    const result = fixture();
    result.pdfArchives.tryCommitExport.mockResolvedValueOnce({ status });
    const response = await result.app.request("/api/cv/pdf", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(validRenderRequest),
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error });
    expect(result.objects.delete).toHaveBeenCalledOnce();
  });

  it("compensates the stored object when PDF metadata persistence fails", async () => {
    const result = fixture();
    result.pdfArchives.tryCommitExport.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await result.app.request("/api/cv/pdf", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(validRenderRequest),
    });

    expect(response.status).toBe(500);
    expect(result.objects.delete).toHaveBeenCalledOnce();
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

  it("creates portable services for configured OpenAI and OpenRouter providers", () => {
    expect(createCvAiService({
      AI_PROVIDER: "openai",
      AI_MODEL: "gpt-4.1-mini",
      AI_API_KEY: "secret",
    })).toBeInstanceOf(PortableCvAiService);
    expect(createCvAiService({
      AI_PROVIDER: "openrouter",
      AI_MODEL: "vendor/model",
      AI_API_KEY: "secret",
      AI_APP_URL: "https://nomcci.com",
      AI_APP_NAME: "CVMaker",
      AI_JSON_MODE: "true",
    })).toBeInstanceOf(PortableCvAiService);
  });

  it("validates provider configuration", () => {
    expect(() => createCvAiService({ AI_PROVIDER: "openai-compatible", AI_MODEL: "m" })).toThrow("AI_BASE_URL");
    expect(() => createCvAiService({ AI_PROVIDER: "ollama" })).toThrow("AI_MODEL");
    expect(() => createCvAiService({ AI_PROVIDER: "other" })).toThrow("Unsupported AI_PROVIDER");
    expect(() => createCvAiService({ AI_PROVIDER: "ollama", AI_MODEL: "m", AI_TIMEOUT_MS: "zero" })).toThrow("AI_TIMEOUT_MS");
    expect(() => createCvAiService({ AI_PROVIDER: "ollama", AI_MODEL: "m", AI_JSON_MODE: "yes" })).toThrow("AI_JSON_MODE");
    expect(() => createCvAiService({ AI_PROVIDER: "openai", AI_MODEL: "m" })).toThrow("AI_API_KEY");
    expect(() => createCvAiService({ AI_PROVIDER: "openrouter", AI_MODEL: "m" })).toThrow("AI_API_KEY");
  });
});
