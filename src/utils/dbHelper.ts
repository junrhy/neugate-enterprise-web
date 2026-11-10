import Database from "@tauri-apps/plugin-sql";

let currentIsPg: boolean = false;

export function setGlobalIsPg(isPg: boolean) {
  currentIsPg = isPg;
}

export function isPostgresTarget(dbTarget: string): boolean {
  return dbTarget.startsWith("postgres://") || dbTarget.startsWith("postgresql://");
}

/**
 * Formats standard SQL queries so they execute seamlessly on both PostgreSQL
 * (with `neugate.` schema namespace and positional `$1, $2, $3` parameters) and
 * local SQLite (without schema prefixes, with `?` parameter markers).
 */
export function formatQuery(sql: string, isPg: boolean): string {
  if (isPg) return sql;

  // Replace $1, $2, $3... positional parameters with ? for SQLite
  let formatted = sql.replace(/\$\d+/g, "?");

  // Remove `neugate.` schema prefix for local SQLite
  formatted = formatted.replace(/\bneugate\./gi, "");

  // Replace Postgres ILIKE with SQLite LIKE
  formatted = formatted.replace(/\bILIKE\b/gi, "LIKE");

  // Replace TIMESTAMP WITH TIME ZONE with DATETIME
  formatted = formatted.replace(/TIMESTAMP WITH TIME ZONE/gi, "DATETIME");

  return formatted;
}

export async function executeQuery(
  db: Database,
  arg2: boolean | string,
  arg3?: string | any[],
  arg4?: any[]
): Promise<any> {
  let isPg = currentIsPg;
  let sql = "";
  let binds: any[] = [];

  if (typeof arg2 === "boolean") {
    isPg = arg2;
    sql = arg3 as string;
    binds = arg4 || [];
  } else {
    sql = arg2 as string;
    binds = (arg3 as any[]) || [];
  }

  const query = formatQuery(sql, isPg);
  return await db.execute(query, binds);
}

export async function selectQuery<T = any>(
  db: Database,
  arg2: boolean | string,
  arg3?: string | any[],
  arg4?: any[]
): Promise<T[]> {
  let isPg = currentIsPg;
  let sql = "";
  let binds: any[] = [];

  if (typeof arg2 === "boolean") {
    isPg = arg2;
    sql = arg3 as string;
    binds = arg4 || [];
  } else {
    sql = arg2 as string;
    binds = (arg3 as any[]) || [];
  }

  const query = formatQuery(sql, isPg);
  return await db.select<T[]>(query, binds);
}
