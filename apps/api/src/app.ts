import type { AuthGateway, Clock, CvAiService, CvRenderer, CvRepository, UsageRepository } from "@nomcci/cvmaker-application";
import {
  importCvRequestSchema,
  modifyCvRequestSchema,
  renderCvRequestSchema,
  rewriteCvRequestSchema,
  savedCvInputSchema,
  translateCvRequestSchema,
} from "@nomcci/cvmaker-contracts";
import { aiDailyLimitFor, type CvData, type Principal, type SavedCvInput } from "@nomcci/cvmaker-domain";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";

export interface ApiDependencies {
  auth: AuthGateway;
  cvs: CvRepository;
  renderer: CvRenderer;
  ai: CvAiService;
  usage: UsageRepository;
  clock: Clock;
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

  app.use("/api/*", async (context, next) => {
    const authorization = context.req.header("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : getCookie(context, "cvmaker_session") ?? null;
    const principal = await dependencies.auth.authenticate(token);
    if (!principal) return context.json({ error: "unauthorized" }, 401);
    context.set("principal", principal);
    await next();
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

  app.post("/api/cv/render", async (context) => {
    const parsed = renderCvRequestSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    return context.json({ html: dependencies.renderer.render(toDomainValue<CvData>(parsed.data.cv), parsed.data) });
  });

  app.post("/api/cv/import", async (context) => {
    const parsed = importCvRequestSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    if (!(await consumeAiUse(context.get("principal"), dependencies))) return context.json({ error: "ai_limit_reached" }, 429);
    const cv = await dependencies.ai.import(parsed.data.description, parsed.data.language);
    return context.json({ cv });
  });

  app.post("/api/cv/rewrite", async (context) => {
    const parsed = rewriteCvRequestSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    if (!(await consumeAiUse(context.get("principal"), dependencies))) return context.json({ error: "ai_limit_reached" }, 429);
    const cv = await dependencies.ai.rewrite(
      toDomainValue<CvData>(parsed.data.cv),
      parsed.data.targetRole,
      parsed.data.jobDescription,
      parsed.data.language,
    );
    return context.json({ cv });
  });

  app.post("/api/cv/modify", async (context) => {
    const parsed = modifyCvRequestSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    if (!(await consumeAiUse(context.get("principal"), dependencies))) return context.json({ error: "ai_limit_reached" }, 429);
    const cv = await dependencies.ai.modify(
      toDomainValue<CvData>(parsed.data.cv),
      parsed.data.instruction,
      parsed.data.jobDescription,
      parsed.data.language,
    );
    return context.json({ cv });
  });

  app.post("/api/cv/translate", async (context) => {
    const parsed = translateCvRequestSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) return context.json(validationError(parsed.error), 400);
    if (!(await consumeAiUse(context.get("principal"), dependencies))) return context.json({ error: "ai_limit_reached" }, 429);
    const cv = await dependencies.ai.translate(toDomainValue<CvData>(parsed.data.cv), parsed.data.language);
    return context.json({ cv });
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
