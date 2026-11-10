export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export default class Database {
  path: string;

  constructor(path: string) {
    this.path = path;
  }

  static async load(path: string): Promise<Database> {
    return new Database(path);
  }

  async select<T = any>(query: string, binds: any[] = []): Promise<T> {
    const res = await fetch("/api/db/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: query, binds }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Database query error (${res.status})`);
    }

    const data = await res.json();
    return (data.rows || []) as unknown as T;
  }

  async execute(query: string, binds: any[] = []): Promise<QueryResult> {
    const res = await fetch("/api/db/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: query, binds }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Database execution error (${res.status})`);
    }

    const data = await res.json();
    return {
      rowsAffected: data.rowsAffected ?? 0,
      lastInsertId: data.lastInsertId,
    };
  }
}
