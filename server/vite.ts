
// server/vite.ts
import { type ViteDevServer, createServer as createViteServer } from "vite";
import express, { Express, Request, Response, NextFunction } from "express";
import { type Server as HttpServer } from "http";
import path from 'path';
import { fileURLToPath } from 'node:url';
import fs from 'fs';

const __dirname_vite = path.dirname(fileURLToPath(import.meta.url)); // Renamed to avoid conflict

export function logVite(message: string, context?: string) { // Renamed log function
  const timestamp = new Date().toLocaleTimeString("pt-BR", { hour12: false });
  console.log(`${timestamp} [${context || 'server-vite'}] ${message}`);
}

export async function setupVite(app: Express, httpServer: HttpServer) {
  logVite('Configurando Vite Dev Server...', 'setupVite');
  const vite: ViteDevServer = await createViteServer({
    server: { 
      middlewareMode: true,
      hmr: { server: httpServer }
    },
    appType: "spa", 
    root: path.resolve(__dirname_vite, "..", "client"), 
  });

  app.use(vite.middlewares);
  logVite('Vite Dev Server configurado e middleware adicionado.', 'setupVite');
  
  app.use('*', async (req: Request, res: Response, next: NextFunction) => {
    if (req.originalUrl.startsWith('/api')) { 
      return next();
    }
    try {
      const url = req.originalUrl;
      const clientIndexHtmlPath = path.resolve(__dirname_vite, "..", "client", 'index.html');
      let template = fs.readFileSync(clientIndexHtmlPath, 'utf-8');
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      if (e instanceof Error) {
         vite.ssrFixStacktrace(e);
         logVite(`Erro no middleware SPA fallback do Vite: ${e.message}`, 'setupVite-error');
         next(e);
      } else {
         logVite(`Erro desconhecido no middleware SPA fallback do Vite`, 'setupVite-error');
         next(new Error('Erro desconhecido no processamento da requisição SPA.'));
      }
    }
  });
  logVite('Middleware SPA fallback do Vite configurado.', 'setupVite');
}


export function serveStatic(app: Express, clientDistPath: string) { 
  logVite(`[StaticServing] Servindo assets do frontend de: ${clientDistPath}`, 'serveStatic');
  
  app.use(express.static(clientDistPath));

  app.get("*", (req: Request, res: Response, next: NextFunction) => {
    if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith(`/${path.basename(UPLOADS_PATH)}`)) { // Corrected uploads path check
        return next(); 
    }
    if (path.extname(req.originalUrl)) { // Check if it looks like a file request
        return next();
    }
    logVite(`[SPA Fallback] Servindo index.html para ${req.originalUrl}`, 'serveStatic');
    res.sendFile(path.resolve(clientDistPath, "index.html"));
  });
}
