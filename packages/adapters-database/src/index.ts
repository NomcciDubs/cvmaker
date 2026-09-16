export { MysqlCvRepository } from "./mysql";
export { MysqlRepositoryBundle } from "./mysql-repositories";
export { SqliteCvRepository } from "./sqlite";
export { SqliteRepositoryBundle } from "./sqlite-repositories";
export {
  CvIdCollisionError,
  type ClosableDatabaseRepositories,
  type ClosableCvRepository,
  type DatabaseDialect,
  type DatabaseEnvironment,
  type RepositoryDependencies,
  type SavedCvRecord,
} from "./types";

import { MysqlCvRepository } from "./mysql";
import { MysqlRepositoryBundle } from "./mysql-repositories";
import { SqliteCvRepository } from "./sqlite";
import { SqliteRepositoryBundle } from "./sqlite-repositories";
import type { ClosableDatabaseRepositories, ClosableCvRepository, DatabaseEnvironment, RepositoryDependencies } from "./types";

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

export function createDatabaseRepositories(
  environment: DatabaseEnvironment = process.env,
  dependencies: RepositoryDependencies = {},
): ClosableDatabaseRepositories {
  const dialect = environment.DATABASE_DIALECT?.trim().toLowerCase();
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  if (dialect === "sqlite") return new SqliteRepositoryBundle(databaseUrl, dependencies);
  if (dialect === "mysql") return new MysqlRepositoryBundle(databaseUrl, dependencies);
  throw new Error(`Unsupported DATABASE_DIALECT: ${environment.DATABASE_DIALECT ?? "(missing)"}`);
}
