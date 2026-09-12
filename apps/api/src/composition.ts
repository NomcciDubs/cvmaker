import { resolve } from "node:path";

import {
  DeterministicFakeCvAi,
  FileSystemObjectStore,
  FixtureAuthGateway,
  InMemoryApplicationRepository,
  InMemoryCvInputRepository,
  InMemoryCvRepository,
  InMemoryUsageRepository,
  NodeClock,
  NodeIdGenerator,
  NodeSha256Hasher,
} from "@nomcci/cvmaker-adapters-node";
import { createCvRepository, type ClosableCvRepository } from "@nomcci/cvmaker-adapters-database";
import type { ApplicationServices, PdfGenerator } from "@nomcci/cvmaker-application";
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
    cvInputs: new InMemoryCvInputRepository(),
    applications: new InMemoryApplicationRepository(),
    usage: new InMemoryUsageRepository(),
    ai: new DeterministicFakeCvAi(),
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
    renderer: services.renderer,
    usage: services.usage,
    clock: services.clock,
    developmentLogin: { enabled: options.enableLogin ?? true, sessionToken: DEVELOPMENT_SESSION },
  });

  return { app, services, close: () => closeRepository(persistentCvs) };
}

async function closeRepository(repository: ClosableCvRepository | null): Promise<void> {
  await repository?.close();
}

class UnsupportedDevelopmentPdfGenerator implements PdfGenerator {
  async generate(_html: string): Promise<Uint8Array> {
    throw new Error("PDF generation is not configured in the development composition");
  }
}
