/**
 * @fileoverview Database Client - Drizzle ORM with PostgreSQL
 * 
 * This module provides the database client for the ORA Events platform.
 * It uses Drizzle ORM with node-postgres (pg) for type-safe database operations.
 * 
 * @module db
 * @requires drizzle-orm
 * @requires pg - Node.js PostgreSQL driver
 */

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
import * as relations from './relations';

type CombinedSchema = typeof schema & typeof relations;
type DbType = NodePgDatabase<CombinedSchema>;

let _db: DbType | null = null;

function getDb(): DbType {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    _db = drizzle(pool, { 
      schema: { ...schema, ...relations } 
    });
  }
  return _db;
}

export const db: DbType = new Proxy({} as DbType, {
  get(_, prop) {
    return (getDb() as any)[prop];
  },
});

export type Database = DbType;

// Re-export schema and relations for convenience
export * from './schema';
export * from './relations';
