import { Pool } from "pg";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

let pool: Pool | null = null;

async function getPool() {
  if (pool) return pool;
  const secret = await getDbSecret();
  pool = new Pool({
    host: secret.host,
    port: secret.port,
    user: secret.username,
    password: secret.password,
    database: process.env.DB_NAME || secret.dbname,
    ...(process.env.SDK_DEV_SERVER === "1"
      ? {}
      : { ssl: { rejectUnauthorized: false } }),
  });
  return pool;
}

function mapNamedParams(sql: string, params: Record<string, any>) {
  const keys = Object.keys(params);
  let idx = 1;
  const keyMap: Record<string, number> = {};
  const values: any[] = [];
  const sqlOut = sql.replace(/:([a-zA-Z0-9_]+)/g, (_m, k) => {
    if (!(k in keyMap)) {
      keyMap[k] = idx++;
      values.push(params[k]);
    }
    return `$${keyMap[k]}`;
  });
  return { sql: sqlOut, values };
}

export async function insert<T extends Record<string, any>>(
  table: string,
  values: T
): Promise<void> {
  const keys = Object.keys(values);
  const params = Object.fromEntries(keys.map((k) => [k, values[k]]));
  const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys
    .map((k) => `:${k}`)
    .join(", ")})`;
  await exec(sql, params);
}

export async function selectOne<T>(
  sql: string,
  params: Record<string, any> = {}
): Promise<T | null> {
  const rows = await selectAll<T>(sql, params);
  return rows[0] ?? null;
}

export async function selectAll<T>(
  sql: string,
  params: Record<string, any> = {}
): Promise<T[]> {
  const { sql: mappedSql, values } = mapNamedParams(sql, params);
  const poolInstance = await getPool();
  const { rows } = await poolInstance.query(mappedSql, values);
  return rows as T[];
}

export async function exec(
  sql: string,
  params: Record<string, any> = {}
): Promise<void> {
  const { sql: mappedSql, values } = mapNamedParams(sql, params);
  const poolInstance = await getPool();
  await poolInstance.query(mappedSql, values);
}

let cachedSecret: any = null;

async function getDbSecret() {
  if (process.env.SDK_DEV_SERVER === "1") {
    return {
      host: "localhost",
      port: 5432,
      username: "postgres",
      password: "postgres",
      dbname: "dev",
    };
  }
  if (cachedSecret) return cachedSecret;
  const client = new SecretsManagerClient();
  const secretId = process.env.DB_SECRET_ARN;
  const res = await client.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );
  cachedSecret = JSON.parse(res.SecretString!);
  return cachedSecret;
}
