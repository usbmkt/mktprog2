import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  throw new Error('A variável de ambiente DATABASE_URL não está definida.');
}

// Função para parsear a URL de conexão, evitando problemas com caracteres especiais
const parseConnectionString = (url: string) => {
    const match = url.match(/^(postgres|postgresql):\/\/([^:]+):(.+)@([^:]+):(\d+)\/(.+)$/);
    if (!match) {
        // Fallback para uma URL sem senha ou com formato diferente, se necessário
        const simpleMatch = url.match(/^(postgres|postgresql):\/\/([^@:]+)(?::(\d+))?\/(.+)$/);
        if(simpleMatch) {
            const [, , host, port, database] = simpleMatch;
            return { host, port: port ? parseInt(port, 10) : 5432, database, user: undefined, password: "" };
        }
        throw new Error("Formato inválido da DATABASE_URL. Não foi possível fazer o parse manual.");
    }
    const [, , user, password, host, port, database] = match;
    return { user, password, host, port: parseInt(port, 10), database };
};

const connectionConfig = parseConnectionString(process.env.DATABASE_URL);

export default defineConfig({
  schema: './shared/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: connectionConfig.host,
    user: connectionConfig.user,
    password: connectionConfig.password,
    database: connectionConfig.database,
    port: connectionConfig.port,
    ssl: true, // Essencial para conexões seguras com bancos de dados em nuvem
  },
  verbose: true,
  strict: true,
});
