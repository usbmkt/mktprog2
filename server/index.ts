
import 'dotenv/config';
import express, { Express, Request, Response, NextFunction, ErrorRequestHandler } from 'express'; // Use Express types directly
import { RouterSetup } from './routes';
import { UPLOADS_PATH } from './config';
import path from 'path';
import { fileURLToPath } from 'url';
import { CronService } from './services/cron.service';
import { setupVite, serveStatic, log } from './vite'; 

// Augment NodeJS.Process interface if needed
declare const process: NodeJS.Process & {
    exit(code?: number): never;
};

// Correção para __dirname em ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // This will be PROJECT_ROOT/server

const PORT_NUMBER = process.env.PORT || 8000; // Renamed to avoid conflict

async function bootstrap() {
  try {
    const app: Express = express(); 
    
    const clientDistPath = path.join(__dirname, '..', 'dist', 'public'); 

    // Middlewares
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      const reqPath = req.path; // Renamed to avoid conflict
      let capturedJsonResponse: any = undefined;
    
      const originalResJson = res.json;
      res.json = function(this: Response, bodyJson?: any, ...args: any[]): Response { // Explicitly type 'this'
        capturedJsonResponse = bodyJson;
        return originalResJson.apply(this, [bodyJson, ...args as []]);
      };
    
      res.on("finish", () => {
        const duration = Date.now() - start;
        if (reqPath.startsWith("/api")) { 
          let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
          if (capturedJsonResponse) {
            try {
              const jsonResponseString = JSON.stringify(capturedJsonResponse);
              if (jsonResponseString.length > 200) { // Limit log size
                 logLine += ` :: ${jsonResponseString.substring(0, 197)}...`;
              } else {
                logLine += ` :: ${jsonResponseString}`;
              }
            } catch (e) {
              logLine += ` :: [Unserializable JSON response]`;
            }
          }
          log(logLine, 'API_ACCESS');
        }
      });
      next();
    });
    
    // Servir arquivos de upload estaticamente
    app.use(`/${path.basename(UPLOADS_PATH)}`, express.static(UPLOADS_PATH)); // Use path.basename for consistency

    // Registrar rotas da API
    const httpServer = await RouterSetup.registerRoutes(app); 

    if (process.env.NODE_ENV === 'development') {
      log('[SERVER_INDEX] Development mode: Setting up Vite middleware.', 'SERVER_INDEX');
      await setupVite(app, httpServer); 
    } else {
      log('[SERVER_INDEX] Production mode: Serving static files from: ' + clientDistPath, 'SERVER_INDEX');
      serveStatic(app, clientDistPath); 
    }
    
    // Error handlers are registered within RouterSetup.registerRoutes

    httpServer.listen(PORT_NUMBER, () => { 
      log(`🚀 Servidor rodando na porta ${PORT_NUMBER} em modo ${process.env.NODE_ENV || 'development'}`, 'SERVER_INDEX');
      
      const cronService = new CronService();
      cronService.startTasks();
      log('⏰ Serviço de Cron inicializado.', 'SERVER_INDEX');
    });

  } catch (error) {
    console.error('❌ Falha ao iniciar o servidor:', error);
    process.exit(1);
  }
}

bootstrap();
