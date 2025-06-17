import 'dotenv/config';
import express, { Response } from 'express'; // Import Response
import { RouterSetup } from './routes';
import { UPLOADS_PATH } from './config';
import path from 'path';
import { fileURLToPath } from 'url';
import { CronService } from './services/cron.service';

// Correção para __dirname em ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8000;

async function bootstrap() {
  try {
    const app = express();
    // CORREÇÃO: O caminho correto para os arquivos do cliente é dentro do próprio diretório 'dist'
    const clientDistPath = path.join(__dirname, 'public');

    // Middlewares
    app.use(express.json());
    app.use(express.urlencoded({ extended: true })); // Changed from false to true for complex objects
    
    // Middleware de logging (mantido como no seu arquivo)
    app.use((req, res, next) => {
      const start = Date.now();
      const reqPath = req.path; // Renomeado para evitar conflito com o módulo 'path'
      let capturedJsonResponse: any = undefined;
    
      const originalResJson = res.json;
      res.json = function(this: Response, body?: any) { // Corrigida assinatura e 'this'
        capturedJsonResponse = body;
        return originalResJson.call(this, body);
      };
    
      res.on("finish", () => {
        const duration = Date.now() - start;
        if (reqPath.startsWith("/api")) {
          let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
          if (capturedJsonResponse) {
            // Cuidado com logar objetos grandes
            const responseBodyString = JSON.stringify(capturedJsonResponse);
            if (responseBodyString.length > 200) { // Limita o tamanho do log do corpo
                 logLine += ` :: Response too large to log (Size: ${responseBodyString.length})`;
            } else {
                 logLine += ` :: ${responseBodyString}`;
            }
          }
          // Limitar o comprimento total da linha de log
          if (logLine.length > 300) { 
            logLine = logLine.slice(0, 297) + "...";
          }
          console.log(logLine); // Usando console.log padrão
        }
      });
      next();
    });


    // Servir arquivos de upload estaticamente
    app.use('/uploads', express.static(UPLOADS_PATH));

    // Registrar rotas da API
    const server = await RouterSetup.registerRoutes(app);

    // Servir arquivos estáticos da aplicação cliente (Vite build)
    app.use(express.static(clientDistPath));

    // Rota catch-all para servir o index.html para qualquer outra requisição (SPA behavior)
    app.get('*', (req, res, next) => { // Adicionado next para consistência, embora possa não ser usado
      if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/uploads')) {
        return next(); // Permite que outras rotas (como /uploads) funcionem
      }
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });

    server.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      
      // Inicializar tarefas agendadas
      const cronService = new CronService();
      cronService.startTasks();
      console.log('⏰ Serviço de Cron inicializado.');
    });

  } catch (error) {
    console.error('❌ Falha ao iniciar o servidor:', error);
    process.exit(1); // Ensure process.exit is available
  }
}

bootstrap();