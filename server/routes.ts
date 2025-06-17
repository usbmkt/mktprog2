
import express, { Router, NextFunction, ErrorRequestHandler, Request, Response } from "express";
import { createServer, type Server as HttpServer } from "http";
import { storage } from "./storage";
import jwt from 'jsonwebtoken';
import * as schemaShared from "../shared/schema";
import { ZodError } from "zod";
import { OAuth2Client } from 'google-auth-library';
import { JWT_SECRET, UPLOADS_PATH, APP_BASE_URL, GOOGLE_CLIENT_ID } from './config';
import { handleMCPConversation } from "./mcp_handler";
import { googleDriveService } from './services/google-drive.service';
import { geminiService } from './services/gemini.service';
import { setupMulter } from "./multer.config";
import { WhatsappConnectionService } from "./services/whatsapp-connection.service";
import path from "path";
import fs from "fs";
import axios from "axios";
import type { Express as ExpressApp } from 'express'; 
// import type { File as MulterFile } from 'multer'; // Not needed if using Express.Multer.File

export interface AuthenticatedRequest extends Request { 
  user?: schemaShared.User;
  file?: Express.Multer.File; 
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] }; 
}

async function doRegisterRoutes(app: ExpressApp): Promise<HttpServer> { 
    const { creativesUpload, lpAssetUpload, mcpAttachmentUpload } = setupMulter(UPLOADS_PATH);
    const UPLOADS_DIR_NAME = path.basename(UPLOADS_PATH);
    const LP_ASSETS_DIR = path.join(UPLOADS_PATH, 'lp-assets');
    const CREATIVES_ASSETS_DIR = path.join(UPLOADS_PATH, 'creatives-assets');

    const publicRouter = Router();
    const apiRouter = Router();
    const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
    
    const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (process.env.FORCE_AUTH_BYPASS === 'true') {
            const user = await storage.getUser(1); 
            if (!user) {
                 console.warn("Auth bypass: User ID 1 not found, attempting to create.");
                try {
                    const bypassUser = await storage.createUser({ username: 'admin_bypass', email: 'admin_bypass@example.com', password: 'password_bypass' });
                    req.user = bypassUser;
                    return next();
                } catch (createError) {
                    console.error("Auth bypass: Failed to create bypass user.", createError);
                    return res.status(500).json({ error: "Bypass user setup failed."});
                }
            }
            req.user = user;
            return next();
        }
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Token não fornecido.' });
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
            const user = await storage.getUser(decoded.userId);
            if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
            req.user = user;
            next();
        } catch (error) {
            return res.status(403).json({ error: 'Token inválido ou expirado.' });
        }
    };

    const handleZodError: ErrorRequestHandler = (err, req: Request, res: Response, next: NextFunction) => {
      if (err instanceof ZodError) return res.status(400).json({ error: "Erro de validação.", details: err.errors });
      next(err);
    };
    const handleError: ErrorRequestHandler = (err, req: Request, res: Response, next: NextFunction) => {
      console.error(`Error on ${req.path}`, err);
      const statusCode = (err as any).statusCode || 500;
      const message = err.message || "Erro interno do servidor.";
      res.status(statusCode).json({ error: message });
    };

    const whatsappServiceInstances = new Map<number, WhatsappConnectionService>();
    function getWhatsappServiceForUser(userId: number): WhatsappConnectionService {
        if (!whatsappServiceInstances.has(userId)) {
            whatsappServiceInstances.set(userId, new WhatsappConnectionService(userId));
        }
        return whatsappServiceInstances.get(userId)!;
    }


    // --- ROTAS PÚBLICAS E DE AUTENTICAÇÃO ---
    publicRouter.get('/health', (req: Request, res: Response) => res.status(200).json({ status: 'ok' }));
    publicRouter.post('/auth/register', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = schemaShared.ZodInsertUserSchema.parse(req.body); // Use Zod schema for validation
        if (await storage.getUserByEmail(data.email)) {
          return res.status(409).json({ error: 'Email já cadastrado.' });
        }
        const user = await storage.createUser({ ...data, password: data.password! }); // Password will be there due to schema
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ user: { id: user.id, username: user.username, email: user.email }, token });
      } catch (e) {
        next(e);
      }
    });
    publicRouter.post('/auth/login', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
        const user = await storage.getUserByEmail(email);
        if (!user || !user.password) return res.status(401).json({ error: 'Credenciais inválidas.' });
        if (!await storage.validatePassword(password, user.password)) return res.status(401).json({ error: 'Credenciais inválidas.' });
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ user: { id: user.id, username: user.username, email: user.email }, token });
      } catch (e) {
        next(e);
      }
    });
    publicRouter.post('/auth/google', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { credential } = req.body;
        if (!GOOGLE_CLIENT_ID) return res.status(500).json({ error: "Google Client ID não configurado." });
        const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        if (!payload?.email || !payload.name) return res.status(400).json({ error: 'Payload do Google inválido.' });
        let user = await storage.getUserByEmail(payload.email);
        if (!user) {
            // For Google users, password might not be directly set or could be a random strong string
            user = await storage.createUser({ email: payload.email, username: payload.name, password: `google_user_${Date.now()}` });
        }
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ user: { id: user.id, username: user.username, email: user.email }, token });
      } catch (error) {
        next(new Error("Falha na autenticação com Google."));
      }
    });
    publicRouter.get('/landingpages/slug/:slug', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const lp = await storage.getLandingPageBySlug(req.params.slug);
        if (!lp) return res.status(404).json({ error: 'Página não encontrada' });
        res.json(lp);
      } catch(e) {
        next(e);
      }
    });


    // --- ROTAS PROTEGIDAS ---
    apiRouter.use(authenticateToken);
    
    apiRouter.get('/users', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { res.json(await storage.getAllUsers()); } catch(e) { next(e); }});
    apiRouter.get('/dashboard', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const timeRange = req.query.timeRange as string | undefined; res.json(await storage.getDashboardData(req.user!.id, timeRange)); } catch (e) { next(e); }});
    
    apiRouter.get('/campaigns', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { res.json(await storage.getCampaigns(req.user!.id)); } catch (e) { next(e); }});
    apiRouter.post('/campaigns', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const data = schemaShared.ZodInsertCampaignSchema.parse(req.body); res.status(201).json(await storage.createCampaign({ ...data, userId: req.user!.id })); } catch (e) { next(e); }});
    apiRouter.get('/campaigns/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const campaign = await storage.getCampaignWithDetails(parseInt(req.params.id), req.user!.id); if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada.'}); res.json(campaign); } catch(e) { next(e); }});
    apiRouter.put('/campaigns/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const data = schemaShared.ZodInsertCampaignSchema.partial().parse(req.body); const updated = await storage.updateCampaign(parseInt(req.params.id), req.user!.id, data); if (!updated) return res.status(404).json({ error: "Campanha não encontrada."}); res.json(updated); } catch (e) { next(e); } });
    apiRouter.delete('/campaigns/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { await storage.deleteCampaign(parseInt(req.params.id), req.user!.id); res.status(204).send(); } catch (e) { next(e); } });
    apiRouter.post('/campaigns/from-template/:templateId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const templateId = parseInt(req.params.templateId, 10); const data = schemaShared.ZodInsertCampaignSchema.parse(req.body); const newCampaign = await storage.createCampaignFromTemplate({ ...data, userId: req.user!.id }, templateId); res.status(201).json(newCampaign); } catch (e) { next(e); } });
    
    apiRouter.post('/campaigns/:campaignId/tasks', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const data = schemaShared.ZodInsertCampaignTaskSchema.parse(req.body); const task = await storage.createTask(data); res.status(201).json(task); } catch (e) { next(e); } });
    apiRouter.put('/tasks/:taskId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const taskId = parseInt(req.params.taskId, 10); const data = schemaShared.ZodInsertCampaignTaskSchema.partial().parse(req.body); const task = await storage.updateTask(taskId, data); res.json(task); } catch(e) { next(e); } });
    apiRouter.delete('/tasks/:taskId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const taskId = parseInt(req.params.taskId, 10); await storage.deleteTask(taskId); res.status(204).send(); } catch (e) { next(e); } });

    apiRouter.get('/creatives', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const campaignIdQuery = req.query.campaignId as string; const campaignId = campaignIdQuery === 'null' ? null : (campaignIdQuery ? parseInt(campaignIdQuery) : undefined); res.json(await storage.getCreatives(req.user!.id, campaignId)); } catch (e) { next(e); }});
    apiRouter.post('/creatives', creativesUpload.single('file'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const parsedBody = schemaShared.ZodInsertCreativeSchema.parse(req.body); const data: schema.DbInsertCreative = { ...parsedBody, userId: req.user!.id, fileUrl: req.file ? `/${UPLOADS_DIR_NAME}/creatives-assets/${req.file.filename}` : parsedBody.fileUrl || null, thumbnailUrl: parsedBody.thumbnailUrl || null }; const creative = await storage.createCreative(data); res.status(201).json(creative); } catch (e) { next(e); } });
    apiRouter.put('/creatives/:id', creativesUpload.single('file'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const id = parseInt(req.params.id); const userId = req.user!.id; const existingCreative = await storage.getCreative(id, userId); if (!existingCreative) return res.status(404).json({ error: "Criativo não encontrado." }); let updateData = schemaShared.ZodInsertCreativeSchema.partial().parse(req.body); if (req.file) { updateData.fileUrl = `/${UPLOADS_DIR_NAME}/creatives-assets/${req.file.filename}`; updateData.thumbnailUrl = null; } const updated = await storage.updateCreative(id, updateData, userId); res.json(updated); } catch(e){ next(e); }});
    apiRouter.delete('/creatives/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { await storage.deleteCreative(parseInt(req.params.id), req.user!.id); res.status(204).send(); } catch (e) { next(e); } });
    apiRouter.get('/creatives/from-drive/:folderId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const files = await googleDriveService.listFilesFromFolder(req.params.folderId); res.json(files); } catch (error: any) { next(error); }});
    apiRouter.post('/creatives/import-from-drive', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const { campaignId, files } = req.body; if (!campaignId || !Array.isArray(files)) return res.status(400).json({ error: 'ID da campanha e lista de arquivos são obrigatórios.' }); const createdCreatives = []; for (const file of files) { if (!file.webContentLink) continue; const response = await axios({ method: 'get', url: file.webContentLink, responseType: 'stream' }); const newFilename = `gdrive-${Date.now()}${path.extname(file.name || '.jpg')}`; const localFilePath = path.join(CREATIVES_ASSETS_DIR, newFilename); const publicFileUrl = `/${UPLOADS_DIR_NAME}/creatives-assets/${newFilename}`; response.data.pipe(fs.createWriteStream(localFilePath)); await new Promise((resolve, reject) => response.data.on('end', resolve).on('error', reject)); const type = file.mimeType?.startsWith('video') ? 'video' : 'image'; const data = schemaShared.ZodInsertCreativeSchema.parse({ campaignId: Number(campaignId), name: file.name, type, fileUrl: publicFileUrl, thumbnailUrl: file.thumbnailLink, status: 'pending' }); createdCreatives.push(await storage.createCreative({ ...data, userId: req.user!.id })); } res.status(201).json({ message: `${createdCreatives.length} criativo(s) importado(s).`, data: createdCreatives }); } catch (error) { next(error); }});
    
    apiRouter.get('/copies', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const { campaignId, phase, purpose, search } = req.query; res.json(await storage.getCopies(req.user!.id, campaignId ? Number(campaignId) : undefined, phase as string, purpose as string, search as string)); } catch (e) { next(e); } });
    apiRouter.post('/copies', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const data = schemaShared.ZodInsertCopySchema.parse(req.body); res.status(201).json(await storage.createCopy({ ...data, userId: req.user!.id })); } catch (e) { next(e); } });
    apiRouter.delete('/copies/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { await storage.deleteCopy(parseInt(req.params.id), req.user!.id); res.status(204).send(); } catch (e) { next(e); }});

    apiRouter.get('/landingpages', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { res.json(await storage.getLandingPages(req.user!.id)); } catch (e) { next(e); }});
    apiRouter.post('/landingpages', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const { name } = req.body; const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); const finalSlug = await storage.generateUniqueSlug(slugBase); const lpData = schemaShared.ZodInsertLandingPageSchema.parse({ ...req.body, slug: finalSlug }); const newLp = await storage.createLandingPage({...lpData, userId: req.user!.id}); res.status(201).json(newLp); } catch(e){ next(e); }});
    apiRouter.post('/landingpages/preview-advanced', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const { prompt, reference, options } = req.body; if (!prompt) return res.status(400).json({ error: 'O prompt é obrigatório.' }); const generatedHtml = await geminiService.createAdvancedLandingPage(prompt, options || {}, reference); res.status(200).json({ htmlContent: generatedHtml }); } catch (e) { next(e); }});
    apiRouter.get('/landingpages/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const lp = await storage.getLandingPage(parseInt(req.params.id), req.user!.id); if (!lp) return res.status(404).json({ error: 'Página não encontrada.' }); res.json(lp); } catch (e) { next(e); } });
    apiRouter.put('/landingpages/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const lpData = schemaShared.ZodInsertLandingPageSchema.partial().parse(req.body); const updated = await storage.updateLandingPage(parseInt(req.params.id), lpData, req.user!.id); if (!updated) return res.status(404).json({ error: "Página não encontrada." }); res.json(updated); } catch(e){ next(e); }});
    apiRouter.delete('/landingpages/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { await storage.deleteLandingPage(parseInt(req.params.id), req.user!.id); res.status(204).send(); } catch(e){ next(e); }});
    apiRouter.post('/landingpages/generate-variations', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const { prompt, count, options, reference } = req.body; if (!prompt) return res.status(400).json({ error: 'O prompt é obrigatório para gerar variações.' }); const variations = await geminiService.generateVariations(prompt, count || 2, options || {}, reference); res.json({ variations }); } catch (e) { next(e); }});
    apiRouter.post('/landingpages/optimize', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const { html, goals } = req.body; if (!html) return res.status(400).json({ error: 'O conteúdo HTML é obrigatório para otimização.' }); const optimizedHtml = await geminiService.optimizeLandingPage(html, goals); res.json({ htmlContent: optimizedHtml }); } catch (e) { next(e); }});

    apiRouter.post('/assets/lp-upload', lpAssetUpload.array('files'), (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { if (!req.files || !Array.isArray(req.files) || req.files.length === 0) return res.status(400).json({ error: "Nenhum arquivo enviado." }); const filesToProcess = req.files as Express.Multer.File[]; const urls = filesToProcess.map(file => `${APP_BASE_URL}/${UPLOADS_DIR_NAME}/lp-assets/${file.filename}`); res.status(200).json(urls); } catch(e){ next(e); }});

    apiRouter.post('/mcp/converse', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const { message, sessionId, attachmentUrl } = req.body; const payload = await handleMCPConversation(req.user!.id, message, sessionId, attachmentUrl); res.json(payload); } catch(e) { next(e); }});
    apiRouter.post('/mcp/upload-attachment', mcpAttachmentUpload.single('attachment'), (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." }); const publicUrl = `${APP_BASE_URL}/${UPLOADS_DIR_NAME}/mcp-attachments/${req.file!.filename}`; res.status(200).json({ url: publicUrl }); } catch (e) { next(e); } });
    
    apiRouter.get('/chat/sessions', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { res.json(await storage.getChatSessions(req.user!.id)); } catch(e){ next(e); }});
    apiRouter.post('/chat/sessions', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const data = schemaShared.ZodInsertChatSessionSchema.parse(req.body); res.status(201).json(await storage.createChatSession(req.user!.id, data.title)); } catch(e){ next(e); }});
    apiRouter.get('/chat/sessions/:sessionId/messages', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { res.json(await storage.getChatMessages(parseInt(req.params.sessionId), req.user!.id)); } catch(e){ next(e); }});
    apiRouter.put('/chat/sessions/:sessionId/title', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const updated = await storage.updateChatSessionTitle(parseInt(req.params.sessionId), req.user!.id, req.body.title); res.json(updated); } catch(e){ next(e); }});
    apiRouter.delete('/chat/sessions/:sessionId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { await storage.deleteChatSession(parseInt(req.params.sessionId), req.user!.id); res.status(204).send(); } catch(e){ next(e); }});

    apiRouter.get('/whatsapp/status', (req: AuthenticatedRequest, res: Response) => res.json(WhatsappConnectionService.getStatus(req.user!.id)));
    apiRouter.post('/whatsapp/connect', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { getWhatsappServiceForUser(req.user!.id).connectToWhatsApp(); res.status(202).json({ message: "Iniciando conexão..." }); } catch (e) { next(e); } });
    apiRouter.post('/whatsapp/disconnect', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { await getWhatsappServiceForUser(req.user!.id).disconnectWhatsApp(); res.json({ message: "Desconexão solicitada." }); } catch (e) { next(e); }});

    apiRouter.get('/whatsapp/contacts', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const contacts = await storage.getContacts(req.user!.id); res.json(contacts); } catch (e) { next(e); }});
    apiRouter.get('/whatsapp/messages', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const { contactNumber } = req.query; if (typeof contactNumber !== 'string') return res.status(400).json({ error: 'Número de contato é obrigatório.' }); res.json(await storage.getMessages(req.user!.id, contactNumber)); } catch (e) { next(e); }});
    apiRouter.post('/whatsapp/messages', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const data = schemaShared.ZodInsertWhatsappMessageSchema.parse({ ...req.body, userId: req.user!.id, direction: 'outgoing' }); const newMessage = await storage.createWhatsappMessage({ ...data, userId: req.user!.id }); res.status(201).json(newMessage); } catch (e) { next(e); }});
    
    apiRouter.get('/flows', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const flowId = req.query.id ? parseInt(String(req.query.id)) : undefined; const campaignId = req.query.campaignId ? parseInt(String(req.query.campaignId)) : undefined; if(flowId) { const flow = await storage.getFlow(flowId, req.user!.id); if (!flow) return res.status(404).json({error: 'Fluxo não encontrado.'}); return res.json(flow); } res.json(await storage.getFlows(req.user!.id, campaignId)); } catch (e) { next(e); }});
    apiRouter.post('/flows', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {  try { const data = schemaShared.ZodInsertFlowSchema.parse(req.body); const newFlow = await storage.createFlow(data, req.user!.id); res.status(201).json(newFlow); } catch(e) { next(e); } });
    apiRouter.put('/flows', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const flowId = req.query.id ? parseInt(String(req.query.id)) : undefined; if (!flowId) return res.status(400).json({ error: 'ID do fluxo é obrigatório.' }); const data = schemaShared.ZodInsertFlowSchema.partial().parse(req.body); const updated = await storage.updateFlow(flowId, data, req.user!.id); if (!updated) return res.status(404).json({error: "Fluxo não encontrado."}); res.json(updated); } catch (e) { next(e); }});
    apiRouter.delete('/flows', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { try { const flowId = req.query.id ? parseInt(String(req.query.id)) : undefined; if (!flowId) return res.status(400).json({ error: 'ID do fluxo é obrigatório.' }); const success = await storage.deleteFlow(flowId, req.user!.id); if (!success) return res.status(404).json({error: "Fluxo não encontrado."}); res.status(204).send(); } catch (e) { next(e); }});

    app.use('/api', publicRouter); 
    app.use('/api', apiRouter);    

    app.use(handleZodError);
    app.use(handleError);

    return createServer(app);
}

export const RouterSetup = {
    registerRoutes: doRegisterRoutes
};
