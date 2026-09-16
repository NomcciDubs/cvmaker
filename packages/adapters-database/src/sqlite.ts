import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import type { SavedCvInput } from "@nomcci/cvmaker-domain";

import { mapSavedCvRow, savedCvUpdateValues, savedCvValues, type SavedCvRow } from "./mapping";
import { CvIdCollisionError, type ClosableCvRepository, type RepositoryDependencies, type SavedCvRecord } from "./types";

const COLUMNS = `id, user_id, name, source_type, source_input, target_role, cv_json, cv_html,
  language, style, template, created_at, updated_at`;

export class SqliteCvRepository implements ClosableCvRepository {
  private readonly database: Database.Database;
  private readonly generateId: () => string;
  private readonly now: () => Date;
  private readonly saveTransaction: (userId: string, id: string, input: SavedCvInput) => SavedCvRecord;
  private closed = false;

  constructor(databaseUrl: string, dependencies: RepositoryDependencies = {}) {
    this.database = new Database(sqliteFilename(databaseUrl));
    this.database.pragma("foreign_keys = ON");
    this.generateId = dependencies.generateId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date());
    this.saveTransaction = this.transactionalSave();
  }

  async list(userId: string): Promise<SavedCvRecord[]> {
    const rows = this.database
      .prepare(`SELECT ${COLUMNS} FROM saved_cvs WHERE user_id = ? ORDER BY updated_at DESC, id ASC`)
      .all(userId) as SavedCvRow[];
    return rows.map(mapSavedCvRow);
  }

  async save(userId: string, input: SavedCvInput): Promise<SavedCvRecord> {
    const generated = input.id === undefined;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const id = input.id ?? this.generateId();
      try {
        return this.saveTransaction(userId, id, input);
      } catch (error) {
        if (!(error instanceof CvIdCollisionError) || !generated) throw error;
      }
    }
    throw new Error("Unable to generate a unique CV id");
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.database.prepare("DELETE FROM saved_cvs WHERE id = ? AND user_id = ?").run(id, userId).changes === 1;
  }

  async close(): Promise<void> {
    if (!this.closed) {
      this.database.close();
      this.closed = true;
    }
  }

  private transactionalSave(): (userId: string, id: string, input: SavedCvInput) => SavedCvRecord {
    return this.database.transaction((userId: string, id: string, input: SavedCvInput) => {
      const owner = this.database.prepare("SELECT user_id FROM saved_cvs WHERE id = ?").get(id) as
        | { user_id: string }
        | undefined;
      if (owner !== undefined && owner.user_id !== userId) throw new CvIdCollisionError(id);

      const now = this.now().toISOString();
      if (owner === undefined) {
        this.database
          .prepare(`INSERT INTO saved_cvs (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(...savedCvValues(id, userId, input, now));
      } else {
        this.database
          .prepare(`UPDATE saved_cvs SET name = ?, source_type = ?, source_input = ?, target_role = ?,
            cv_json = ?, cv_html = ?, language = ?, style = ?, template = ?, updated_at = ?
            WHERE id = ? AND user_id = ?`)
          .run(...savedCvUpdateValues(input, now, id, userId));
      }

      return mapSavedCvRow(
        this.database.prepare(`SELECT ${COLUMNS} FROM saved_cvs WHERE id = ? AND user_id = ?`).get(id, userId) as SavedCvRow,
      );
    }).immediate;
  }
}

export function sqliteFilename(databaseUrl: string): string {
  if (!databaseUrl.startsWith("sqlite:")) return databaseUrl;
  const filename = databaseUrl.slice("sqlite:".length);
  if (filename === ":memory:") return filename;
  if (!filename.startsWith("//")) return decodeURIComponent(filename);
  return fileURLToPath(new URL(`file:${filename}`));
}
