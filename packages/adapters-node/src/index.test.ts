import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileSystemObjectStore, InMemoryCvRepository } from "./index";

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
});
