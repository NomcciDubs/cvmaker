import type {
  AdminMetricsRepository,
  ApplicationRepository,
  AuthGateway,
  Clock,
  ContentHasher,
  CvAiService,
  CvInputRepository,
  CvRenderer,
  CvRepository,
  IdGenerator,
  ObjectStore,
  PdfArchiveRepository,
  PdfGenerator,
  PdfQuotaSettingsRepository,
  PhotoRepository,
  UsageRepository,
} from "@nomcci/cvmaker-application";
import {
  applicationInputSchema,
  cvInputRequestSchema,
  importCvRequestSchema,
  importImproveRequestSchema,
  modifyCvRequestSchema,
  pdfArchiveFilenameSchema,
  pdfQuotaSettingsSchema,
  pdfRequestSchema,
  photoRequestSchema,
  renderCvRequestSchema,
  rewriteCvRequestSchema,
  savedCvInputSchema,
  translateCvRequestSchema,
} from "@nomcci/cvmaker-contracts";
import { aiDailyLimitFor, pdfDailyLimitFor, type ApplicationInput, type CvData, type PdfQuotaSettings, type Principal, type SavedCvInput } from "@nomcci/cvmaker-domain";
import { Hono, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";

export interface ApiDependencies {
  auth: AuthGateway;
  cvs: CvRepository;
  cvInputs: CvInputRepository;
  applications: ApplicationRepository;
  photos: PhotoRepository;
  pdfArchives: PdfArchiveRepository;
  pdfQuotas: PdfQuotaSettingsRepository;
  adminMetrics: AdminMetricsRepository;
  renderer: CvRenderer;
  pdf: PdfGenerator;
  objects: ObjectStore;
  ai: CvAiService;
  usage: UsageRepository;
  clock: Clock;
  ids: IdGenerator;
  hasher: ContentHasher;
  developmentLogin?: {
    enabled: boolean;
    sessionToken: string;
  };
}

type Variables = { principal: Principal };
const idSchema = z.uuid();

export function createApi(dependencies: ApiDependencies): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();

  app.get("/health", (context) => context.json({ status: "ok" }));

  app.post("/api/dev/login", (context) => {
    if (!dependencies.developmentLogin?.enabled) return context.json({ error: "not_found" }, 404);
    setCookie(context, "cvmaker_session", dependencies.developmentLogin.sessionToken, {
      httpOnly: true,
      sameSite: "Strict",
      secure: false,
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    return context.json({ authenticated: true });
  });

  app.post("/api/dev/logout", (context) => {
    if (!dependencies.developmentLogin?.enabled) return context.json({ error: "not_found" }, 404);
    deleteCookie(context, "cvmaker_session", { path: "/" });
    return context.json({ authenticated: false });
  });

  const authenticate: MiddlewareHandler<{ Variables: Variables }> = async (context, next) => {
    const authorization = context.req.header("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : getCookie(context, "cvmaker_session") ?? null;
    const principal = await dependencies.auth.authenticate(token);
    if (!principal) return context.json({ error: "unauthorized" }, 401);
    context.set("principal", principal);
    await next();
  };
  app.use("/api/*", authenticate);
  app.use("/archives/*", authenticate);

  app.get("/archives/:userId/output/:filename", async (context) => {
    const principal = context.get("principal");
    const filename = context.req.param("filename");
    if (context.req.param("userId") !== principal.id || !pdfArchiveFilenameSchema.safeParse(filename).success) {
      return context.json({ error: "not_found" }, 404);
    }
    const archive = await dependencies.pdfArchives.findByFilename(principal.id, filename);
    if (!archive) return context.json({ error: "not_found" }, 404);
    const bytes = await dependencies.objects.get(archive.objectKey);
    if (!bytes) return context.json({ error: "not_found" }, 404);
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    return new Response(body.buffer, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });

  app.get("/api/me", async (context) => {
    const principal = context.get("principal");
    const now = dependencies.clock.now();
    const date = now.toISOString().slice(0, 10);
    const used = await dependencies.usage.getAiUsage(principal.id, date);
    return context.json({
      user: {
        id: principal.id,
        email: principal.email,
        name: principal.name,
        nickname: principal.nickname,
        country: principal.country,
      },
      currentPage: {
        id: "cvmaker",
        name: "Nomcci CVMaker",
        slug: "cvmaker",
        role: principal.role,
        permissions: principal.permissions,
      },
      session: { expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1_000).toISOString() },
      usage: { used, limit: aiDailyLimitFor(principal.role) },
    });
  });

  app.get("/api/cv-inputs", async (context) => {
    const inputs = await dependencies.cvInputs.list(context.get("principal").id, 50);
    return context.json({ inputs });
  });

  app.post("/api/cv-inputs", async (context) => {
    const parsed = cvInputRequestSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    const record = await dependencies.cvInputs.save(context.get("principal").id, {
      id: parsed.data.id ?? dependencies.ids.generate(),
      name: parsed.data.name,
      content: parsed.data.content,
    });
    if (!record) return context.json({ error: "id_conflict" }, 409);
    return context.json({ id: record.id }, 201);
  });

  app.get("/api/applications", async (context) => {
    const applications = await dependencies.applications.list(context.get("principal").id, 50);
    return context.json({ applications });
  });

  app.post("/api/applications", async (context) => {
    const parsed = applicationInputSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    const record = await dependencies.applications.save(
      context.get("principal").id,
      toDomainValue<ApplicationInput>(parsed.data),
    );
    return context.json({ id: record.id }, 201);
  });

  app.get("/api/photos", async (context) => {
    const photos = await dependencies.photos.list(context.get("principal").id);
    return context.json({ photos });
  });

  app.post("/api/photos", async (context) => {
    const parsed = photoRequestSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    const saved = await dependencies.photos.save(
      context.get("principal").id,
      parsed.data.name,
      parsed.data.dataUrl,
      10,
    );
    return context.json(saved, 201);
  });

  app.delete("/api/photos/:id", async (context) => {
    const parsedId = idSchema.safeParse(context.req.param("id"));
    if (!parsedId.success) return context.json(validationError(parsedId.error), 400);
    await dependencies.photos.delete(context.get("principal").id, parsedId.data);
    return context.json({ ok: true });
  });

  app.get("/api/admin/metrics", async (context) => {
    if (context.get("principal").role !== "SUPER_ADMIN") return context.json({ error: "forbidden" }, 403);
    return context.json({ metrics: await dependencies.adminMetrics.getMetrics() });
  });

  app.get("/api/admin/pdf-limits", async (context) => {
    if (context.get("principal").role !== "SUPER_ADMIN") return context.json({ error: "forbidden" }, 403);
    return context.json({ limits: await dependencies.pdfQuotas.get() });
  });

  app.post("/api/admin/pdf-limits", async (context) => {
    if (context.get("principal").role !== "SUPER_ADMIN") return context.json({ error: "forbidden" }, 403);
    const parsed = pdfQuotaSettingsSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    const limits = toDomainValue<PdfQuotaSettings>(parsed.data);
    await dependencies.pdfQuotas.update(limits);
    return context.json({ limits });
  });

  app.get("/api/archives", async (context) => {
    const principal = context.get("principal");
    const archives = (await dependencies.pdfArchives.list(principal.id, 20)).map((archive) => ({
      id: archive.id,
      filename: archive.filename,
      sizeBytes: archive.sizeBytes,
      createdAt: archive.createdAt,
      downloadPath: archiveDownloadPath(principal.id, archive.filename),
    }));
    return context.json({ archives });
  });

  app.delete("/api/archives/:id", async (context) => {
    const parsedId = idSchema.safeParse(context.req.param("id"));
    if (!parsedId.success) return context.json(validationError(parsedId.error), 400);
    const principal = context.get("principal");
    const archive = await dependencies.pdfArchives.find(principal.id, parsedId.data);
    if (!archive) return context.json({ error: "not_found" }, 404);
    await dependencies.objects.delete(archive.objectKey);
    await dependencies.pdfArchives.delete(principal.id, parsedId.data);
    return context.json({ ok: true });
  });

  app.post("/api/cv/render", async (context) => {
    const parsed = renderCvRequestSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    return context.json({ html: dependencies.renderer.render(toDomainValue<CvData>(parsed.data.cv), parsed.data) });
  });

  app.post("/api/cv/pdf", async (context) => {
    const parsed = pdfRequestSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    const principal = context.get("principal");
    const cv = toDomainValue<CvData>(parsed.data.cv);
    const html = dependencies.renderer.render(cv, parsed.data);
    const contentHash = await dependencies.hasher.hash(html);
    const existing = await dependencies.pdfArchives.findByHash(principal.id, contentHash);
    if (existing) {
      return context.json({ downloadPath: archiveDownloadPath(principal.id, existing.filename), reused: true });
    }

    const quotas = await dependencies.pdfQuotas.get();
    let bytes: Uint8Array;
    try {
      bytes = await dependencies.pdf.generate(html);
    } catch {
      return context.json({ error: "pdf_generation_failed" }, 502);
    }
    if (bytes.byteLength === 0) return context.json({ error: "pdf_generation_failed" }, 502);
    if (bytes.byteLength > quotas.maxArchivedPdfBytes) return context.json({ error: "pdf_too_large" }, 413);

    const now = dependencies.clock.now();
    const filename = createArchiveFilename(parsed.data.name || cv.personal_info.full_name, dependencies.ids.generate());
    const objectKey = `archives/${principal.id}/output/${filename}`;
    const archive = {
      id: dependencies.ids.generate(),
      filename,
      objectKey,
      sizeBytes: bytes.byteLength,
      contentHash,
      createdAt: now.toISOString(),
    };
    await dependencies.objects.put(objectKey, bytes);

    try {
      const committed = await dependencies.pdfArchives.tryCommitExport(
        principal.id,
        now.toISOString().slice(0, 10),
        archive,
        {
          daily: pdfDailyLimitFor(principal.role, quotas),
          maxArchivedPdfs: quotas.maxArchivedPdfs,
          maxArchivedPdfBytes: quotas.maxArchivedPdfBytes,
        },
      );
      if (committed.status === "created") {
        return context.json({ downloadPath: archiveDownloadPath(principal.id, filename) }, 201);
      }

      await dependencies.objects.delete(objectKey);
      if (committed.status === "duplicate") {
        return context.json({ downloadPath: archiveDownloadPath(principal.id, committed.archive.filename), reused: true });
      }
      if (committed.status === "daily_limit_reached") return context.json({ error: "pdf_daily_limit_reached" }, 429);
      if (committed.status === "archive_count_limit_reached") return context.json({ error: "pdf_archive_limit_reached" }, 429);
      return context.json({ error: "pdf_storage_limit_reached" }, 429);
    } catch (error) {
      await dependencies.objects.delete(objectKey);
      throw error;
    }
  });

  app.post("/api/cv/import", async (context) => {
    const parsed = importCvRequestSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    if (!(await consumeAiUse(context.get("principal"), dependencies))) return context.json({ error: "ai_limit_reached" }, 429);
    const cv = await dependencies.ai.import(parsed.data.description, parsed.data.language);
    const principal = context.get("principal");
    const workflowId = dependencies.ids.generate();
    const expiresAt = new Date(dependencies.clock.now().getTime() + 24 * 60 * 60 * 1_000);
    await dependencies.usage.createImportWorkflow(
      principal.id,
      workflowId,
      await dependencies.hasher.hash(JSON.stringify(cv)),
      expiresAt,
    );
    return context.json({ cv, importWorkflowId: workflowId });
  });

  app.post("/api/cv/import-improve", async (context) => {
    const parsed = importImproveRequestSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    const principal = context.get("principal");
    const originalHash = await dependencies.hasher.hash(JSON.stringify(parsed.data.originalCv));
    if (!(await dependencies.usage.tryConsumeImportUse(
      parsed.data.importWorkflowId,
      principal.id,
      originalHash,
      dependencies.clock.now(),
    ))) {
      return context.json({ error: "import_ai_allowance_unavailable" }, 429);
    }

    const cv = toDomainValue<CvData>(parsed.data.cv);
    const improved = parsed.data.targetRole
      ? await dependencies.ai.rewrite(cv, parsed.data.targetRole, parsed.data.jobDescription, parsed.data.language)
      : await dependencies.ai.modify(cv, parsed.data.instruction!, parsed.data.jobDescription, parsed.data.language);
    return context.json({ cv: preservePhoto(cv, improved), importWorkflowId: null });
  });

  app.post("/api/cv/rewrite", async (context) => {
    const parsed = rewriteCvRequestSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    if (!(await consumeAiUse(context.get("principal"), dependencies))) return context.json({ error: "ai_limit_reached" }, 429);
    const source = toDomainValue<CvData>(parsed.data.cv);
    const cv = await dependencies.ai.rewrite(
      source,
      parsed.data.targetRole,
      parsed.data.jobDescription,
      parsed.data.language,
    );
    return context.json({ cv: preservePhoto(source, cv) });
  });

  app.post("/api/cv/modify", async (context) => {
    const parsed = modifyCvRequestSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    if (!(await consumeAiUse(context.get("principal"), dependencies))) return context.json({ error: "ai_limit_reached" }, 429);
    const source = toDomainValue<CvData>(parsed.data.cv);
    const cv = await dependencies.ai.modify(
      source,
      parsed.data.instruction,
      parsed.data.jobDescription,
      parsed.data.language,
    );
    return context.json({ cv: preservePhoto(source, cv) });
  });

  app.post("/api/cv/translate", async (context) => {
    const parsed = translateCvRequestSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    if (!(await consumeAiUse(context.get("principal"), dependencies))) return context.json({ error: "ai_limit_reached" }, 429);
    const source = toDomainValue<CvData>(parsed.data.cv);
    const cv = await dependencies.ai.translate(source, parsed.data.language);
    return context.json({ cv: preservePhoto(source, cv) });
  });

  app.get("/api/cvs", async (context) => {
    const records = await dependencies.cvs.list(context.get("principal").id);
    return context.json({ cvs: records });
  });

  app.post("/api/cvs", async (context) => {
    const parsed = savedCvInputSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    const record = await dependencies.cvs.save(context.get("principal").id, toDomainValue<SavedCvInput>(parsed.data));
    return context.json({ cv: record }, 201);
  });

  app.delete("/api/cvs/:id", async (context) => {
    const parsedId = idSchema.safeParse(context.req.param("id"));
    if (!parsedId.success) return context.json(validationError(parsedId.error), 400);
    const deleted = await dependencies.cvs.delete(context.get("principal").id, parsedId.data);
    return deleted ? context.body(null, 204) : context.json({ error: "not_found" }, 404);
  });

  app.notFound((context) => context.json({ error: "not_found" }, 404));
  app.onError((_error, context) => context.json({ error: "internal_error" }, 500));

  return app;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function validationError(error: z.ZodError): { error: "validation_error"; issues: z.core.$ZodIssue[] } {
  return { error: "validation_error", issues: error.issues };
}

function toDomainValue<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function consumeAiUse(principal: Principal, dependencies: ApiDependencies): Promise<boolean> {
  const date = dependencies.clock.now().toISOString().slice(0, 10);
  return dependencies.usage.tryConsumeAiUse(principal.id, date, aiDailyLimitFor(principal.role));
}

function preservePhoto(source: CvData, output: CvData): CvData {
  const photoUrl = source.personal_info.photo_url;
  if (!photoUrl || output.personal_info.photo_url) return output;
  return {
    ...output,
    personal_info: { ...output.personal_info, photo_url: photoUrl },
  };
}

function createArchiveFilename(name: string, id: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "cv";
  return `${id}-${slug}.pdf`;
}

function archiveDownloadPath(userId: string, filename: string): string {
  return `/archives/${encodeURIComponent(userId)}/output/${encodeURIComponent(filename)}`;
}
