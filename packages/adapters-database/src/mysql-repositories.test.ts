import { afterEach, describe, it } from "vitest";
import { createPool } from "mysql2/promise";

import { MysqlRepositoryBundle } from "./mysql-repositories";
import { databaseRepositoryContract } from "./repository-contract";

const databaseUrl = process.env.MYSQL_TEST_URL;
const bundles: MysqlRepositoryBundle[] = [];

afterEach(async () => {
  await Promise.all(bundles.splice(0).map((bundle) => bundle.close()));
});

if (databaseUrl) {
  databaseRepositoryContract("MySQL portable repository contract", async () => {
    await resetDatabase(databaseUrl);
    let id = 0;
    let timestamp = Date.parse("2026-01-02T00:00:00.000Z");
    const bundle = new MysqlRepositoryBundle(databaseUrl, {
      generateId: () => `generated-${++id}`,
      now: () => new Date(timestamp += 1_000),
    });
    bundles.push(bundle);
    return bundle;
  });
} else {
  describe.skip("MySQL portable repository contract", () => {
    it("requires MYSQL_TEST_URL", () => undefined);
  });
}

async function resetDatabase(url: string): Promise<void> {
  const pool = createPool(url);
  try {
    for (const table of [
      "applications",
      "daily_usage",
      "saved_cvs",
      "import_workflows",
      "user_photos",
      "cv_inputs",
      "pdf_archives",
      "pdf_export_usage",
      "pdf_quota_settings",
    ]) {
      await pool.query(`DELETE FROM ${table}`);
    }
    await pool.execute(
      `INSERT INTO pdf_quota_settings (
        id, default_daily, friend_daily, super_admin_daily, max_archived_pdfs, max_archived_pdf_bytes, updated_at
      ) VALUES (1, 3, 20, NULL, 20, 26214400, ?)`,
      [new Date("2026-01-01T00:00:00.000Z").toISOString()],
    );
  } finally {
    await pool.end();
  }
}
