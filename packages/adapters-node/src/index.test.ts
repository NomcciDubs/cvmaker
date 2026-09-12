import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FileSystemObjectStore,
  InMemoryApplicationRepository,
  InMemoryCvInputRepository,
  InMemoryCvRepository,
  InMemoryPdfArchiveRepository,
  InMemoryPdfQuotaSettingsRepository,
  InMemoryPhotoRepository,
  InMemoryUsageRepository,
} from "./index";

const fixedClock = { now: () => new Date("2026-01-02T03:04:05Z") };

function sequenceIds(prefix: string): { generate: () => string } {
  let counter = 0;
  return { generate: () => `${prefix}-${++counter}` };
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("node adapters", () => {
  it("keeps CV records isolated by owner", async () => {
    const repository = new InMemoryCvRepository({ generate: () => "cv-id" }, { now: () => new Date("2026-01-02T03:04:05Z") });
    const input = {
      name: "CV",
      sourceType: "manual" as const,
      style: "modern" as const,
      template: "cv_base" as const,
      language: "en" as const,
      cv: { personal_info: { full_name: "Ada" } },
      html: "<p>Ada</p>",
    };

    await repository.save("owner-a", input);

    expect(await repository.list("owner-b")).toEqual([]);
    expect(await repository.delete("owner-b", "cv-id")).toBe(false);
    expect(await repository.list("owner-a")).toHaveLength(1);
  });

  it("stores bytes under its root and rejects traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "cvmaker-store-"));
    temporaryDirectories.push(root);
    const store = new FileSystemObjectStore(root);

    await store.put("exports/cv.pdf", new Uint8Array([1, 2, 3]));

    expect(await store.get("exports/cv.pdf")).toEqual(new Uint8Array([1, 2, 3]));
    await expect(store.put("../outside", new Uint8Array())).rejects.toThrow("Invalid object key");
  });

  it("upserts CV inputs by id with ownership isolation", async () => {
    const repository = new InMemoryCvInputRepository(fixedClock);
    await repository.save("owner-a", { id: "input-1", name: "First", content: "one" });
    const updated = await repository.save("owner-a", { id: "input-1", name: "First edited", content: "two" });

    expect(updated.createdAt).toBe("2026-01-02T03:04:05.000Z");
    expect((await repository.list("owner-a"))[0]!.name).toBe("First edited");
    expect(await repository.list("owner-b")).toEqual([]);
    await expect(repository.save("owner-b", { id: "input-1", name: "Stolen", content: "no" })).resolves.toBeTruthy();
    expect((await repository.list("owner-a"))[0]!.name).toBe("First edited");
  });

  it("saves applications with server identity and lists them newest first", async () => {
    let now = new Date("2026-01-02T03:04:05Z");
    const tickingClock = { now: () => (now = new Date(now.getTime() + 1_000)) };
    const ids = sequenceIds("app");
    const repository = new InMemoryApplicationRepository(ids, tickingClock);
    const base = {
      company: "Nomcci",
      role: "Engineer",
      style: "modern" as const,
      template: "cv_base" as const,
      language: "en" as const,
      cv: { personal_info: { full_name: "Ada" } },
      html: "<p>Ada</p>",
    };

    const saved = await repository.save("owner-a", base);
    await repository.save("owner-a", { ...base, company: "Other", role: "Designer" });

    expect(saved.id).toBe("app-1");
    const records = await repository.list("owner-a");
    expect(records.map((record) => record.company)).toEqual(["Other", "Nomcci"]);
    expect(await repository.list("owner-b")).toEqual([]);
  });

  it("consumes AI and PDF usage atomically per daily limit", async () => {
    const repository = new InMemoryUsageRepository();

    expect(await repository.tryConsumeAiUse("user", "2026-01-02", 1)).toBe(true);
    expect(await repository.tryConsumeAiUse("user", "2026-01-02", 1)).toBe(false);
    expect(await repository.getAiUsage("user", "2026-01-02")).toBe(1);

    expect(await repository.tryConsumePdfUse("user", "2026-01-02", 2)).toBe(true);
    expect(await repository.tryConsumePdfUse("user", "2026-01-02", 2)).toBe(true);
    expect(await repository.tryConsumePdfUse("user", "2026-01-02", 2)).toBe(false);
    expect(await repository.getPdfUsage("user", "2026-01-02")).toBe(2);
  });

  it("validates import workflow ownership, hash, expiry, and single use", async () => {
    const repository = new InMemoryUsageRepository();
    const now = new Date("2026-01-02T03:04:05Z");
    await repository.createImportWorkflow("owner-a", "workflow-1", "cv-hash", new Date("2026-01-03T03:04:05Z"));

    expect(await repository.tryConsumeImportUse("workflow-1", "owner-a", "wrong-hash", now)).toBe(false);
    expect(await repository.tryConsumeImportUse("workflow-1", "owner-b", "cv-hash", now)).toBe(false);
    expect(await repository.tryConsumeImportUse("workflow-1", "owner-a", "cv-hash", new Date("2026-01-04T00:00:00Z"))).toBe(false);
    expect(await repository.tryConsumeImportUse("workflow-1", "owner-a", "cv-hash", now)).toBe(true);
    expect(await repository.tryConsumeImportUse("workflow-1", "owner-a", "cv-hash", now)).toBe(false);
  });

  it("rotates photos beyond the maximum with FIFO order", async () => {
    const ids = sequenceIds("photo");
    const repository = new InMemoryPhotoRepository(ids, fixedClock);

    const first = await repository.save("owner-a", "first", "data:image/png;base64,one", 2);
    await repository.save("owner-a", "second", "data:image/png;base64,two", 2);
    const third = await repository.save("owner-a", "third", "data:image/png;base64,three", 2);

    expect(first.deletedOldest).toBe(false);
    expect(third.deletedOldest).toBe(true);
    expect((await repository.list("owner-a")).map((photo) => photo.name)).toEqual(["third", "second"]);
    expect(await repository.delete("owner-b", third.photo.id)).toBe(false);
    expect(await repository.delete("owner-a", third.photo.id)).toBe(true);
  });

  it("finds PDF archives by hash and filename per owner", async () => {
    const repository = new InMemoryPdfArchiveRepository();
    const record = {
      id: "archive-1",
      filename: "00000000-0000-4000-8000-000000000000-ada.pdf",
      objectKey: "archives/owner-a/output/00000000-0000-4000-8000-000000000000-ada.pdf",
      sizeBytes: 1_024,
      contentHash: "hash-1",
      createdAt: "2026-01-02T03:04:05.000Z",
    };

    await repository.create("owner-a", record);
    await repository.create("owner-a", { ...record, id: "archive-2", contentHash: null, filename: "other.pdf" });

    expect(await repository.list("owner-a", 1)).toHaveLength(1);
    expect((await repository.findByHash("owner-a", "hash-1"))?.id).toBe("archive-1");
    expect(await repository.findByHash("owner-b", "hash-1")).toBeNull();
    expect((await repository.findByFilename("owner-a", "other.pdf"))?.id).toBe("archive-2");
    expect((await repository.find("owner-a", "archive-2"))?.sizeBytes).toBe(1_024);
    expect(await repository.delete("owner-a", "archive-2")).toBe(true);
    expect(await repository.delete("owner-a", "archive-2")).toBe(false);
  });

  it("reads and updates PDF quota settings", async () => {
    const repository = new InMemoryPdfQuotaSettingsRepository();

    expect(await repository.get()).toEqual({
      defaultDaily: 3,
      friendDaily: 20,
      superAdminDaily: null,
      maxArchivedPdfs: 20,
      maxArchivedPdfBytes: 26_214_400,
    });

    await repository.update({
      defaultDaily: 5,
      friendDaily: 25,
      superAdminDaily: 100,
      maxArchivedPdfs: 50,
      maxArchivedPdfBytes: 52_428_800,
    });
    expect((await repository.get()).defaultDaily).toBe(5);
  });
});
