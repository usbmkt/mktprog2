// ./migrate-deploy.ts
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './shared/schema';
import 'dotenv/config';

// Função para parsear a URL de conexão, evitando problemas com caracteres especiais
const parseConnectionString = (url: string) => {
    const match = url.match(/^(postgres|postgresql):\/\/([^:]+):(.+)@([^:]+):(\d+)\/(.+)$/);
    if (!match) {
        throw new Error("Formato inválido da DATABASE_URL. Não foi possível fazer o parse manual.");
    }
    const [, , user, password, host, port, database] = match;
    return { user, password, host, port: parseInt(port, 10), database };
};


async function runMigrations() {
  console.log("Iniciando script de migração no deploy...");

  if (!process.env.DATABASE_URL) {
    console.error("Erro: A variável de ambiente DATABASE_URL não está definida.");
    process.exit(1);
  }

  const connectionConfig: PoolConfig = {
    ...parseConnectionString(process.env.DATABASE_URL),
    ssl: {
      rejectUnauthorized: false,
    },
  };

  const pool = new Pool(connectionConfig);

  const db = drizzle(pool, { schema });

  console.log("Conectado ao banco de dados. Aplicando migrações...");

  try {
    await migrate(db, { migrationsFolder: './migrations' });
    console.log("Migrações concluídas com sucesso.");
  } catch (error) {
    console.error("Erro durante a execução das migrações:", error);
    await pool.end();
    process.exit(1);
  } finally {
    await pool.end();
    console.log("Conexão com o banco de dados fechada.");
  }
}

runMigrations().catch((err) => {
  console.error("Erro não tratado no script de migração:", err);
  process.exit(1);
});
