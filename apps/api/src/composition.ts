import { resolve } from "node:path";

import {
  DeterministicFakeCvAi,
  FileSystemObjectStore,
  FixtureAuthGateway,
  FixtureAdminMetricsRepository,
  InMemoryApplicationRepository,
  InMemoryCvInputRepository,
  InMemoryCvRepository,
  InMemoryPdfArchiveRepository,
  InMemoryPdfQuotaSettingsRepository,
  InMemoryPhotoRepository,
  InMemoryUsageRepository,
  NodeClock,
  NodeIdGenerator,
  NodeSha256Hasher,
} from "@nomcci/cvmaker-adapters-node";
import { OpenAiChatModel, OpenAiCompatibleChatModel, OpenRouterChatModel } from "@nomcci/cvmaker-adapters-ai";
import { createCvRepository, type ClosableCvRepository } from "@nomcci/cvmaker-adapters-database";
import { PortableCvAiService } from "@nomcci/cvmaker-ai";
import type { ApplicationServices, CvAiService, PdfGenerator } from "@nomcci/cvmaker-application";
import { renderCvHtml } from "@nomcci/cvmaker-rendering";

import { createApi } from "./app";

const DEVELOPMENT_SESSION = "local-dev";

export function createDevelopmentComposition(options: { objectRoot?: string; enableLogin?: boolean } = {}) {
  const clock = new NodeClock();
  const ids = new NodeIdGenerator();
  const persistentCvs = process.env.DATABASE_DIALECT && process.env.DATABASE_URL
    ? createCvRepository(process.env, { generateId: () => ids.generate(), now: () => clock.now() })
    : null;
  const services: ApplicationServices = {
    auth: new FixtureAuthGateway(DEVELOPMENT_SESSION),
    cvs: persistentCvs ?? new InMemoryCvRepository(ids, clock),
    cvInputs: new InMemoryCvInputRepository(clock),
    applications: new InMemoryApplicationRepository(ids, clock),
    usage: new InMemoryUsageRepository(),
    photos: new InMemoryPhotoRepository(ids, clock),
    pdfArchives: new InMemoryPdfArchiveRepository(),
    pdfQuotas: new InMemoryPdfQuotaSettingsRepository(),
    adminMetrics: new FixtureAdminMetricsRepository(),
    ai: createCvAiService(process.env),
    renderer: { render: renderCvHtml },
    pdf: new UnsupportedDevelopmentPdfGenerator(),
    objects: new FileSystemObjectStore(options.objectRoot ?? resolve(".local-data", "objects")),
    clock,
    ids,
    hasher: new NodeSha256Hasher(),
  };

  const app = createApi({
    auth: services.auth,
    cvs: services.cvs,
    cvInputs: services.cvInputs,
    applications: services.applications,
    photos: services.photos,
    pdfArchives: services.pdfArchives,
    pdfQuotas: services.pdfQuotas,
    adminMetrics: services.adminMetrics,
    renderer: services.renderer,
    pdf: services.pdf,
    objects: services.objects,
    ai: services.ai,
    usage: services.usage,
    clock: services.clock,
    ids: services.ids,
    hasher: services.hasher,
    developmentLogin: { enabled: options.enableLogin ?? true, sessionToken: DEVELOPMENT_SESSION },
  });

  return { app, services, close: () => closeRepository(persistentCvs) };
}

export function createCvAiService(environment: NodeJS.ProcessEnv, fetchImplementation?: typeof fetch): CvAiService {
  const provider = environment.AI_PROVIDER?.trim() || "fake";
  if (provider === "fake") return new DeterministicFakeCvAi();
  if (provider !== "openai" && provider !== "openrouter" && provider !== "openai-compatible" && provider !== "ollama") {
    throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
  }

  const model = environment.AI_MODEL?.trim();
  if (!model) throw new Error(`AI_MODEL is required for AI_PROVIDER=${provider}`);
  const apiKey = environment.AI_API_KEY?.trim();
  const timeoutMs = parseTimeout(environment.AI_TIMEOUT_MS);
  const supportsJsonMode = parseBoolean(environment.AI_JSON_MODE, "AI_JSON_MODE");
  const baseUrl = environment.AI_BASE_URL?.trim();

  if (provider === "openai" || provider === "openrouter") {
    if (!apiKey) throw new Error(`AI_API_KEY is required for AI_PROVIDER=${provider}`);
    return new PortableCvAiService(provider === "openai"
      ? new OpenAiChatModel({
          apiKey,
          model,
          ...(baseUrl ? { baseUrl } : {}),
          ...(timeoutMs === undefined ? {} : { timeoutMs }),
          ...(supportsJsonMode === undefined ? {} : { supportsJsonMode }),
          ...(fetchImplementation ? { fetch: fetchImplementation } : {}),
        })
      : new OpenRouterChatModel({
          apiKey,
          model,
          ...(baseUrl ? { baseUrl } : {}),
          ...(environment.AI_APP_URL?.trim() ? { refererUrl: environment.AI_APP_URL.trim() } : {}),
          ...(environment.AI_APP_NAME?.trim() ? { appTitle: environment.AI_APP_NAME.trim() } : {}),
          ...(timeoutMs === undefined ? {} : { timeoutMs }),
          ...(supportsJsonMode === undefined ? {} : { supportsJsonMode }),
          ...(fetchImplementation ? { fetch: fetchImplementation } : {}),
        }));
  }

  const compatibleBaseUrl = baseUrl || (provider === "ollama" ? "http://localhost:11434/v1" : "");
  if (!compatibleBaseUrl) throw new Error("AI_BASE_URL is required for AI_PROVIDER=openai-compatible");
  return new PortableCvAiService(new OpenAiCompatibleChatModel({
    baseUrl: compatibleBaseUrl,
    model,
    ...(apiKey ? { apiKey } : {}),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(supportsJsonMode === undefined ? {} : { supportsJsonMode }),
    ...(fetchImplementation ? { fetch: fetchImplementation } : {}),
  }));
}

function parseTimeout(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("AI_TIMEOUT_MS must be a positive number");
  return timeout;
}

function parseBoolean(value: string | undefined, name: string): boolean | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

async function closeRepository(repository: ClosableCvRepository | null): Promise<void> {
  await repository?.close();
}

class UnsupportedDevelopmentPdfGenerator implements PdfGenerator {
  async generate(_html: string): Promise<Uint8Array> {
    throw new Error("PDF generation is not configured in the development composition");
  }
}
