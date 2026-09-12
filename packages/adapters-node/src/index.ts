import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";

import type {
  ApplicationRepository,
  AuthGateway,
  Clock,
  ContentHasher,
  CvAiService,
  CvInputRepository,
  CvRepository,
  IdGenerator,
  ObjectStore,
  UsageRepository,
} from "@nomcci/cvmaker-application";
import type { ApplicationInput, CvData, Language, Principal, SavedCvInput } from "@nomcci/cvmaker-domain";

export class NodeClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class NodeIdGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}

export class NodeSha256Hasher implements ContentHasher {
  async hash(value: string | Uint8Array): Promise<string> {
    return createHash("sha256").update(value).digest("hex");
  }
}

export class FixtureAuthGateway implements AuthGateway {
  constructor(
    private readonly sessionToken = "local-dev",
    private readonly principal: Principal = {
      id: "00000000-0000-4000-8000-000000000001",
      email: "developer@example.test",
      name: "Local Developer",
      nickname: "developer",
      country: null,
      role: "USER",
      permissions: [],
    },
  ) {}

  async authenticate(sessionToken: string | null): Promise<Principal | null> {
    return sessionToken === this.sessionToken ? structuredClone(this.principal) : null;
  }
}

export class DeterministicFakeCvAi implements CvAiService {
  async import(description: string, language: Language): Promise<CvData> {
    return {
      personal_info: { full_name: language === "es" ? "Persona de Ejemplo" : "Example Person" },
      summary: description.trim(),
      experience: [],
      education: [],
      skills: [],
      languages: [],
    };
  }

  async rewrite(cv: CvData, targetRole: string, jobDescription: string | undefined, language: Language): Promise<CvData> {
    return this.withSummary(cv, `rewrite:${language}:${targetRole}:${jobDescription ?? ""}`);
  }

  async modify(cv: CvData, instruction: string, jobDescription: string | undefined, language: Language): Promise<CvData> {
    return this.withSummary(cv, `modify:${language}:${instruction}:${jobDescription ?? ""}`);
  }

  async translate(cv: CvData, language: Language): Promise<CvData> {
    return this.withSummary(cv, `translate:${language}`);
  }

  private withSummary(cv: CvData, operation: string): CvData {
    const copy = structuredClone(cv);
    copy.summary = `${operation}${copy.summary ? `\n${copy.summary}` : ""}`;
    return copy;
  }
}

export interface StoredCv extends SavedCvInput {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export class InMemoryCvRepository implements CvRepository {
  private readonly records = new Map<string, StoredCv>();

  constructor(private readonly ids: IdGenerator, private readonly clock: Clock) {}

  async list(userId: string): Promise<StoredCv[]> {
    return [...this.records.values()]
      .filter((record) => record.ownerId === userId)
      .map((record) => structuredClone(record));
  }

  async save(userId: string, input: SavedCvInput): Promise<StoredCv> {
    const key = this.key(userId, input.id ?? this.ids.generate());
    const previous = this.records.get(key);
    const now = this.clock.now().toISOString();
    const record: StoredCv = {
      ...structuredClone(input),
      id: input.id ?? key.slice(userId.length + 1),
      ownerId: userId,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    this.records.set(key, record);
    return structuredClone(record);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.records.delete(this.key(userId, id));
  }

  private key(userId: string, id: string): string {
    return `${userId}:${id}`;
  }
}

export class InMemoryCvInputRepository implements CvInputRepository {
  private readonly records = new Map<string, Array<{ name: string; content: string }>>();

  async list(userId: string): Promise<Array<{ name: string; content: string }>> {
    return structuredClone(this.records.get(userId) ?? []);
  }

  async save(userId: string, name: string, content: string): Promise<{ name: string; content: string }> {
    const record = { name, content };
    this.records.set(userId, [...(this.records.get(userId) ?? []), record]);
    return structuredClone(record);
  }
}

export class InMemoryApplicationRepository implements ApplicationRepository {
  private readonly records = new Map<string, ApplicationInput[]>();

  async list(userId: string): Promise<ApplicationInput[]> {
    return structuredClone(this.records.get(userId) ?? []);
  }

  async save(userId: string, input: ApplicationInput): Promise<ApplicationInput> {
    const record = structuredClone(input);
    this.records.set(userId, [...(this.records.get(userId) ?? []), record]);
    return structuredClone(record);
  }
}

export class InMemoryUsageRepository implements UsageRepository {
  private readonly aiUses = new Map<string, number>();
  private readonly importUses = new Set<string>();

  async getAiUsage(userId: string, date: string): Promise<number> {
    return this.aiUses.get(`${userId}:${date}`) ?? 0;
  }

  async tryConsumeAiUse(userId: string, date: string, limit: number | null): Promise<boolean> {
    const key = `${userId}:${date}`;
    const current = this.aiUses.get(key) ?? 0;
    if (limit !== null && current >= limit) return false;
    this.aiUses.set(key, current + 1);
    return true;
  }

  async tryConsumeImportUse(workflowId: string, userId: string, cvHash: string, _now: Date): Promise<boolean> {
    const key = `${workflowId}:${userId}:${cvHash}`;
    if (this.importUses.has(key)) return false;
    this.importUses.add(key);
    return true;
  }
}

export class FileSystemObjectStore implements ObjectStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.pathFor(key)));
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw error;
    }
  }

  async put(key: string, value: Uint8Array): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, value);
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  private pathFor(key: string): string {
    if (!key || isAbsolute(key) || key.includes("\\") || key.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("Invalid object key");
    }
    const path = resolve(this.root, key);
    if (!path.startsWith(`${this.root}${sep}`)) throw new Error("Invalid object key");
    return path;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
