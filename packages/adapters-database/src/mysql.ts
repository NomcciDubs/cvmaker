import { randomUUID } from "node:crypto";

import type { SavedCvInput } from "@nomcci/cvmaker-domain";
import { createPool, type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

import { mapSavedCvRow, savedCvUpdateValues, savedCvValues, type SavedCvRow } from "./mapping";
import { CvIdCollisionError, type ClosableCvRepository, type RepositoryDependencies, type SavedCvRecord } from "./types";

const COLUMNS = `id, user_id, name, source_type, source_input, target_role, cv_json, cv_html,
  language, style, template, created_at, updated_at`;

interface MysqlSavedCvRow extends SavedCvRow, RowDataPacket {}
interface OwnerRow extends RowDataPacket { user_id: string }

export class MysqlCvRepository implements ClosableCvRepository {
  private readonly pool: Pool;
  private readonly generateId: () => string;
  private readonly now: () => Date;
  private closed = false;

  constructor(databaseUrl: string, dependencies: RepositoryDependencies = {}) {
    this.pool = createPool(databaseUrl);
    this.generateId = dependencies.generateId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date());
  }

  async list(userId: string): Promise<SavedCvRecord[]> {
    const [rows] = await this.pool.query<MysqlSavedCvRow[]>(
      `SELECT ${COLUMNS} FROM saved_cvs WHERE user_id = ? ORDER BY updated_at DESC, id ASC`,
      [userId],
    );
    return rows.map(mapSavedCvRow);
  }

  async save(userId: string, input: SavedCvInput): Promise<SavedCvRecord> {
    const generated = input.id === undefined;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const id = input.id ?? this.generateId();
      try {
        return await this.saveOnce(userId, id, input);
      } catch (error) {
        if (!(error instanceof CvIdCollisionError) || !generated) throw error;
      }
    }
    throw new Error("Unable to generate a unique CV id");
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>("DELETE FROM saved_cvs WHERE id = ? AND user_id = ?", [id, userId]);
    return result.affectedRows === 1;
  }

  async close(): Promise<void> {
    if (!this.closed) {
      await this.pool.end();
      this.closed = true;
    }
  }

  private async saveOnce(userId: string, id: string, input: SavedCvInput): Promise<SavedCvRecord> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const now = this.now().toISOString();
      const [updated] = await connection.execute<ResultSetHeader>(
        `UPDATE saved_cvs SET name = ?, source_type = ?, source_input = ?, target_role = ?,
          cv_json = ?, cv_html = ?, language = ?, style = ?, template = ?, updated_at = ?
          WHERE id = ? AND user_id = ?`,
        [...savedCvUpdateValues(input, now, id, userId)],
      );

      if (updated.affectedRows === 0) await this.insertOrResolveCollision(connection, userId, id, input, now);
      const record = await this.selectOwned(connection, userId, id);
      await connection.commit();
      return mapSavedCvRow(record);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private async insertOrResolveCollision(
    connection: PoolConnection,
    userId: string,
    id: string,
    input: SavedCvInput,
    now: string,
  ): Promise<void> {
    try {
      await connection.execute(
        `INSERT INTO saved_cvs (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...savedCvValues(id, userId, input, now)],
      );
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error;
      const [owners] = await connection.query<OwnerRow[]>("SELECT user_id FROM saved_cvs WHERE id = ? FOR UPDATE", [id]);
      const owner = owners[0];
      if (owner?.user_id !== userId) throw new CvIdCollisionError(id);
      await connection.execute(
        `UPDATE saved_cvs SET name = ?, source_type = ?, source_input = ?, target_role = ?,
          cv_json = ?, cv_html = ?, language = ?, style = ?, template = ?, updated_at = ?
          WHERE id = ? AND user_id = ?`,
        [...savedCvUpdateValues(input, now, id, userId)],
      );
    }
  }

  private async selectOwned(connection: PoolConnection, userId: string, id: string): Promise<MysqlSavedCvRow> {
    const [rows] = await connection.query<MysqlSavedCvRow[]>(
      `SELECT ${COLUMNS} FROM saved_cvs WHERE id = ? AND user_id = ?`,
      [id, userId],
    );
    const row = rows[0];
    if (row === undefined) throw new Error("Saved CV disappeared during transaction");
    return row;
  }
}

function isDuplicateEntry(error: unknown): boolean {
  return error !== null && typeof error === "object" && "errno" in error && error.errno === 1062;
}
