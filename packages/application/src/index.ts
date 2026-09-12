import type {
  ApplicationInput,
  CvData,
  Language,
  Principal,
  RenderOptions,
  SavedCvInput,
} from "@nomcci/cvmaker-domain";

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  generate(): string;
}

export interface ContentHasher {
  hash(value: string | Uint8Array): Promise<string>;
}

export interface AuthGateway {
  authenticate(sessionToken: string | null): Promise<Principal | null>;
}

export interface CvRepository {
  list(userId: string): Promise<unknown[]>;
  save(userId: string, input: SavedCvInput): Promise<unknown>;
  delete(userId: string, id: string): Promise<boolean>;
}

export interface CvInputRepository {
  list(userId: string): Promise<unknown[]>;
  save(userId: string, name: string, content: string): Promise<unknown>;
}

export interface ApplicationRepository {
  list(userId: string): Promise<unknown[]>;
  save(userId: string, input: ApplicationInput): Promise<unknown>;
}

export interface UsageRepository {
  getAiUsage(userId: string, date: string): Promise<number>;
  tryConsumeAiUse(userId: string, date: string, limit: number | null): Promise<boolean>;
  tryConsumeImportUse(workflowId: string, userId: string, cvHash: string, now: Date): Promise<boolean>;
}

export interface CvAiService {
  import(description: string, language: Language): Promise<CvData>;
  rewrite(cv: CvData, targetRole: string, jobDescription: string | undefined, language: Language): Promise<CvData>;
  modify(cv: CvData, instruction: string, jobDescription: string | undefined, language: Language): Promise<CvData>;
  translate(cv: CvData, language: Language): Promise<CvData>;
}

export type ChatMessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
}

export interface ChatModelRequest {
  messages: readonly ChatMessage[];
  temperature?: number;
  responseFormat?: "json";
}

export interface ChatModel {
  complete(request: ChatModelRequest): Promise<string>;
}

export interface CvRenderer {
  render(cv: CvData, options: RenderOptions): string;
}

export interface PdfGenerator {
  generate(html: string): Promise<Uint8Array>;
}

export interface ObjectStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ApplicationServices {
  auth: AuthGateway;
  cvs: CvRepository;
  cvInputs: CvInputRepository;
  applications: ApplicationRepository;
  usage: UsageRepository;
  ai: CvAiService;
  renderer: CvRenderer;
  pdf: PdfGenerator;
  objects: ObjectStore;
  clock: Clock;
  ids: IdGenerator;
  hasher: ContentHasher;
}
