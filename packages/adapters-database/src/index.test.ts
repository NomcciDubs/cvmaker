import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  createCvRepository,
  CvIdCollisionError,
  SqliteCvRepository,
  SqliteRepositoryBundle,
  type ClosableDatabaseRepositories,
  type ClosableCvRepository,
} from "./index";
import { databaseRepositoryContract } from "./repository-contract";

const temporaryDirectories: string[] = [];
const repositories: Array<ClosableCvRepository | ClosableDatabaseRepositories> = [];

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.close()));
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(dependencies: ConstructorParameters<typeof SqliteCvRepository>[1] = {}) {
  const directory = await mkdtemp(join(tmpdir(), "cvmaker-database-"));
  temporaryDirectories.push(directory);
  const filename = join(directory, "test.sqlite");
  const migration = await readFile(new URL("../../../database/sqlite/0001_initial.sql", import.meta.url), "utf8");
  const database = new Database(filename);
  database.exec(migration);
  database.close();

  const repository = new SqliteCvRepository(filename, dependencies);
  repositories.push(repository);
  return { filename, repository };
}

async function bundleFixture(): Promise<SqliteRepositoryBundle> {
  const directory = await mkdtemp(join(tmpdir(), "cvmaker-database-bundle-"));
  temporaryDirectories.push(directory);
  const filename = join(directory, "test.sqlite");
  const migration = await readFile(new URL("../../../database/sqlite/0001_initial.sql", import.meta.url), "utf8");
  const database = new Database(filename);
  database.exec(migration);
  database.close();

  let id = 0;
  let timestamp = Date.parse("2026-01-02T00:00:00.000Z");
  const repositoriesBundle = new SqliteRepositoryBundle(filename, {
    generateId: () => `generated-${++id}`,
    now: () => new Date(timestamp += 1_000),
  });
  repositories.push(repositoriesBundle);
  return repositoriesBundle;
}

const input = {
  name: "Ada CV",
  sourceType: "manual" as const,
  sourceInput: "Original notes",
  targetRole: "Engineer",
  cv: { personal_info: { full_name: "Ada Lovelace" }, skills: [{ name: "Computing", items: ["Algorithms"] }] },
  html: "<p>Ada</p>",
  language: "en" as const,
  style: "modern" as const,
  template: "cv_base" as const,
};

describe("SqliteCvRepository", () => {
  it("maps JSON and snake_case fields into an owner-scoped record", async () => {
    const { repository } = await fixture({
      generateId: () => "cv-1",
      now: () => new Date("2026-01-02T03:04:05.000Z"),
    });

    const saved = await repository.save("owner-a", input);

    expect(saved).toEqual({
      ...input,
      id: "cv-1",
      ownerId: "owner-a",
      createdAt: "2026-01-02T03:04:05.000Z",
      updatedAt: "2026-01-02T03:04:05.000Z",
    });
    expect(await repository.list("owner-a")).toEqual([saved]);
    expect(await repository.list("owner-b")).toEqual([]);
  });

  it("updates only its owner and preserves creation time", async () => {
    const times = [new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-02T00:00:00.000Z")];
    const { repository } = await fixture({ generateId: () => "cv-1", now: () => times.shift()! });
    const created = await repository.save("owner-a", input);
    const { sourceInput: _sourceInput, ...inputWithoutSource } = input;

    const updated = await repository.save("owner-a", { ...inputWithoutSource, id: created.id, name: "Updated" });

    expect(updated.name).toBe("Updated");
    expect(updated.sourceInput).toBeUndefined();
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    await expect(repository.save("owner-b", { ...input, id: created.id })).rejects.toBeInstanceOf(CvIdCollisionError);
    expect((await repository.list("owner-a"))[0]?.name).toBe("Updated");
  });

  it("does not let another owner delete a record", async () => {
    const { repository } = await fixture({ generateId: () => "cv-1" });
    await repository.save("owner-a", input);

    expect(await repository.delete("owner-b", "cv-1")).toBe(false);
    expect(await repository.delete("owner-a", "cv-1")).toBe(true);
    expect(await repository.delete("owner-a", "cv-1")).toBe(false);
  });

  it("retries generated id collisions without changing the existing record", async () => {
    const ids = ["taken", "available"];
    const { repository } = await fixture({ generateId: () => ids.shift()! });
    await repository.save("owner-a", { ...input, id: "taken" });

    const saved = await repository.save("owner-b", input);

    expect(saved.id).toBe("available");
    expect(await repository.list("owner-a")).toHaveLength(1);
  });
});

describe("createCvRepository", () => {
  it("selects SQLite from provider-neutral environment values and closes idempotently", async () => {
    const { filename } = await fixture();
    const databaseUrl = pathToFileURL(filename).href.replace(/^file:/, "sqlite:");
    const repository = createCvRepository({ DATABASE_DIALECT: "SQLITE", DATABASE_URL: databaseUrl });

    expect(repository).toBeInstanceOf(SqliteCvRepository);
    await repository.close();
    await repository.close();
  });

  it("rejects missing and unsupported configuration", () => {
    expect(() => createCvRepository({ DATABASE_DIALECT: "sqlite" })).toThrow("DATABASE_URL is required");
    expect(() => createCvRepository({ DATABASE_DIALECT: "postgres", DATABASE_URL: "ignored" })).toThrow(
      "Unsupported DATABASE_DIALECT",
    );
  });
});

databaseRepositoryContract("SQLite portable repository contract", bundleFixture);
