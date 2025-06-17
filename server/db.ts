// server/db.ts
import dotenv from 'dotenv';
dotenv.config();

import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from '../shared/schema';

// Validação da variável de ambiente principal
if (!process.env.DATABASE_URL) {
  throw new Error("A variável de ambiente DATABASE_URL não está definida.");
}

// Função para parsear a URL de conexão, evitando problemas com caracteres especiais
const parseConnectionString = (url: string) => {
    const match = url.match(/^(postgres|postgresql):\/\/([^:]+):(.+)@([^:]+):(\d+)\/(.+)$/);
    if (!match) {
        throw new Error("Formato inválido da DATABASE_URL. Não foi possível fazer o parse manual.");
    }
    const [, , user, password, host, port, database] = match;
    return { user, password, host, port: parseInt(port, 10), database };
};

const connectionConfig: PoolConfig = {
    ...parseConnectionString(process.env.DATABASE_URL),
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

const pool = new Pool(connectionConfig);

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });
