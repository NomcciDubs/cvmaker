import { describe, expect, it } from "vitest";

import type { ClosableDatabaseRepositories } from "./types";

type CreateRepositories = () => Promise<ClosableDatabaseRepositories>;

const cv = { personal_info: { full_name: "Ada Lovelace" } };
const application = {
  company: "Nomcci",
  role: "Engineer",
  cv,
  html: "<p>Ada</p>",
  language: "en" as const,
  style: "modern" as const,
  template: "cv_base" as const,
};

export function databaseRepositoryContract(name: string, createRepositories: CreateRepositories): void {
  describe(name, () => {
    it("upserts CV inputs without crossing global ID ownership", async () => {
      const repositories = await createRepositories();
      const created = await repositories.cvInputs.save("owner-a", { id: "input-1", name: "First", content: "one" });
      const updated = await repositories.cvInputs.save("owner-a", { id: "input-1", name: "Updated", content: "two" });

      expect(updated?.createdAt).toBe(created?.createdAt);
      expect((await repositories.cvInputs.list("owner-a", 50))[0]?.name).toBe("Updated");
      expect(await repositories.cvInputs.save("owner-b", { id: "input-1", name: "Stolen", content: "no" })).toBeNull();
      expect(await repositories.cvInputs.list("owner-b", 50)).toEqual([]);
    });

    it("stores owner-scoped applications with the draft default", async () => {
      const repositories = await createRepositories();
      const saved = await repositories.applications.save("owner-a", application);

      expect(saved.status).toBe("draft");
      expect((await repositories.applications.list("owner-a", 50))[0]).toEqual(saved);
      expect(await repositories.applications.list("owner-b", 50)).toEqual([]);
    });

    it("stores applications and CVs with extended document languages", async () => {
      const repositories = await createRepositories();
      const tracked = await repositories.applications.save("owner-a", { ...application, language: "pt" });
      const saved = (await repositories.cvs.save("owner-a", {
        name: "Ada PT",
        sourceType: "manual",
        cv,
        html: "<p>Ada</p>",
        language: "ro",
        style: "modern",
        template: "cv_base",
      })) as { language: string };
      const listed = (await repositories.cvs.list("owner-a")) as Array<{ language: string }>;

      expect(tracked.language).toBe("pt");
      expect(saved.language).toBe("ro");
      expect((await repositories.applications.list("owner-a", 50))[0]?.language).toBe("pt");
      expect(listed[0]?.language).toBe("ro");
    });

    it("consumes AI usage and import workflows atomically", async () => {
      const repositories = await createRepositories();
      expect(await repositories.usage.tryConsumeAiUse("owner-a", "2026-01-02", 1)).toBe(true);
      expect(await repositories.usage.tryConsumeAiUse("owner-a", "2026-01-02", 1)).toBe(false);
      expect(await repositories.usage.getAiUsage("owner-a", "2026-01-02")).toBe(1);

      await repositories.usage.createImportWorkflow("owner-a", "workflow-1", "hash", new Date("2026-01-03T00:00:00Z"));
      expect(await repositories.usage.tryConsumeImportUse("workflow-1", "owner-b", "hash", new Date("2026-01-02T00:00:00Z"))).toBe(false);
      expect(await repositories.usage.tryConsumeImportUse("workflow-1", "owner-a", "wrong", new Date("2026-01-02T00:00:00Z"))).toBe(false);
      expect(await repositories.usage.tryConsumeImportUse("workflow-1", "owner-a", "hash", new Date("2026-01-04T00:00:00Z"))).toBe(false);
      expect(await repositories.usage.tryConsumeImportUse("workflow-1", "owner-a", "hash", new Date("2026-01-02T00:00:00Z"))).toBe(true);
      expect(await repositories.usage.tryConsumeImportUse("workflow-1", "owner-a", "hash", new Date("2026-01-02T00:00:00Z"))).toBe(false);
    });

    it("rotates photos FIFO within each owner", async () => {
      const repositories = await createRepositories();
      await repositories.photos.save("owner-a", "first", "data:image/png;base64,YQ==", 2);
      await repositories.photos.save("owner-a", "second", "data:image/png;base64,Yg==", 2);
      const third = await repositories.photos.save("owner-a", "third", "data:image/png;base64,Yw==", 2);

      expect(third.deletedOldest).toBe(true);
      expect((await repositories.photos.list("owner-a")).map((photo) => photo.name)).toEqual(["third", "second"]);
      expect(await repositories.photos.delete("owner-b", third.id)).toBe(false);
      expect(await repositories.photos.delete("owner-a", third.id)).toBe(true);
    });

    it("commits PDF metadata and quotas atomically", async () => {
      const repositories = await createRepositories();
      const record = {
        id: "archive-1",
        filename: "00000000-0000-4000-8000-000000000001-ada.pdf",
        objectKey: "archives/owner-a/output/ada.pdf",
        sizeBytes: 1_024,
        contentHash: "hash-1",
        createdAt: "2026-01-02T00:00:00.000Z",
      };
      const limits = { daily: 1, maxArchivedPdfs: 2, maxArchivedPdfBytes: 2_048 };

      expect(await repositories.pdfArchives.tryCommitExport("owner-a", "2026-01-02", record, limits)).toEqual({ status: "created" });
      expect(await repositories.pdfArchives.tryCommitExport("owner-a", "2026-01-02", { ...record, id: "duplicate", objectKey: "duplicate" }, limits)).toEqual({
        status: "duplicate",
        archive: record,
      });
      expect(await repositories.pdfArchives.tryCommitExport("owner-a", "2026-01-02", {
        ...record,
        id: "archive-2",
        filename: "second.pdf",
        objectKey: "second",
        contentHash: "hash-2",
      }, limits)).toEqual({ status: "daily_limit_reached" });
      expect(await repositories.pdfArchives.findByHash("owner-b", "hash-1")).toBeNull();
      expect(await repositories.pdfArchives.delete("owner-b", record.id)).toBe(false);
    });

    it("rolls back PDF usage if metadata violates a unique constraint", async () => {
      const repositories = await createRepositories();
      const limits = { daily: 1, maxArchivedPdfs: 5, maxArchivedPdfBytes: 10_000 };
      const first = {
        id: "archive-1",
        filename: "first.pdf",
        objectKey: "shared-object",
        sizeBytes: 100,
        contentHash: "hash-1",
        createdAt: "2026-01-02T00:00:00.000Z",
      };
      await repositories.pdfArchives.tryCommitExport("owner-a", "2026-01-02", first, limits);
      await expect(repositories.pdfArchives.tryCommitExport("owner-b", "2026-01-02", {
        ...first,
        id: "archive-2",
        contentHash: "hash-2",
      }, limits)).rejects.toBeTruthy();
      expect(await repositories.pdfArchives.tryCommitExport("owner-b", "2026-01-02", {
        ...first,
        id: "archive-3",
        objectKey: "owner-b-object",
        contentHash: "hash-3",
      }, limits)).toEqual({ status: "created" });
    });

    it("reads and updates the PDF quota singleton", async () => {
      const repositories = await createRepositories();
      expect(await repositories.pdfQuotas.get()).toEqual({
        defaultDaily: 3,
        friendDaily: 20,
        superAdminDaily: null,
        maxArchivedPdfs: 20,
        maxArchivedPdfBytes: 26_214_400,
      });
      const updated = { defaultDaily: 5, friendDaily: 30, superAdminDaily: 50, maxArchivedPdfs: 40, maxArchivedPdfBytes: 50_000_000 };
      await repositories.pdfQuotas.update(updated);
      expect(await repositories.pdfQuotas.get()).toEqual(updated);
    });

    it("aggregates administration metrics with the legacy response shape", async () => {
      const repositories = await createRepositories();
      await repositories.applications.save("owner-a", application);
      await repositories.cvs.save("owner-a", {
        name: "Ada CV",
        sourceType: "manual",
        cv,
        html: "<p>Ada</p>",
        language: "en",
        style: "modern",
        template: "cv_base",
      });
      await repositories.usage.tryConsumeAiUse("owner-a", "2026-01-02", 10);

      expect(await repositories.adminMetrics.getMetrics()).toEqual({
        totals: { applications: 1, users: 1, companies: 1 },
        savedCvs: { savedCvs: 1 },
        usage: { aiUses: 1, aiUsers: 1 },
        topCompanies: [{ company: "Nomcci", applications: 1 }],
        recentApplications: [{
          company: "Nomcci",
          role: "Engineer",
          status: "draft",
          language: "en",
          style: "modern",
          createdAt: expect.any(String),
        }],
      });
    });
  });
}
