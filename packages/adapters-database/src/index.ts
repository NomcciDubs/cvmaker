export { MysqlCvRepository } from "./mysql";
export { SqliteCvRepository } from "./sqlite";
export {
  CvIdCollisionError,
  type ClosableCvRepository,
  type DatabaseDialect,
  type DatabaseEnvironment,
  type RepositoryDependencies,
  type SavedCvRecord,
} from "./types";

import { MysqlCvRepository } from "./mysql";
import { SqliteCvRepository } from "./sqlite";
import type { ClosableCvRepository, DatabaseEnvironment, RepositoryDependencies } from "./types";

export function createCvRepository(
  environment: DatabaseEnvironment = process.env,
  dependencies: RepositoryDependencies = {},
): ClosableCvRepository {
  const dialect = environment.DATABASE_DIALECT?.trim().toLowerCase();
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  if (dialect === "sqlite") return new SqliteCvRepository(databaseUrl, dependencies);
  if (dialect === "mysql") return new MysqlCvRepository(databaseUrl, dependencies);
  throw new Error(`Unsupported DATABASE_DIALECT: ${environment.DATABASE_DIALECT ?? "(missing)"}`);
}
