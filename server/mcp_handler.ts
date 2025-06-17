
// server/mcp_handler.ts
import { storage } from "./storage";
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, Part, GenerateContentParameters, SendMessageParameters } from "@google/genai"; // Corrected import
import { GEMINI_API_KEY, UPLOADS_PATH, UPLOADS_DIR_NAME } from './config';
import * as schema from "../shared/schema"; // Import all from schema
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

let genAI: GoogleGenAI | null = null; // Corrected type
if (GEMINI_API_KEY) {
	try {
		genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); // Corrected initialization
		console.log("[MCP_HANDLER_GEMINI] SDK do Gemini inicializado com sucesso.");
	} catch (error) {
		console.error("[MCP_HANDLER_GEMINI] Falha ao inicializar o SDK do Gemini:", error);
		genAI = null;
	}
}

interface MCPResponsePayload {
	reply: string;
	sessionId: number;
	action?: string;
	payload?: any;
}

interface FileProcessResult {
	type: 'text' | 'image' | 'json';
	content: string;
	mimeType?: string;
}

async function processFile(attachmentUrl: string): Promise<FileProcessResult | null> {
	if (!attachmentUrl) return null;
	try {
		const url = new URL(attachmentUrl);
		const relativePath = url.pathname.replace(`/${UPLOADS_DIR_NAME}/`, '');
		const filePath = path.join(UPLOADS_PATH, relativePath);

		if (!fs.existsSync(filePath)) {
			console.error(`[MCP_HANDLER] Arquivo não encontrado: ${filePath}`);
			return null;
		}

		const fileExtension = path.extname(filePath).toLowerCase();

		if (['.png', '.jpeg', '.jpg', '.webp'].includes(fileExtension)) {
			const mimeType = `image/${fileExtension.substring(1)}`;
			const imageBuffer = fs.readFileSync(filePath);
			return { type: 'image', content: imageBuffer.toString('base64'), mimeType: mimeType };
		}

		let textContent: string | null = null;
		if (fileExtension === '.pdf') {
			const pdf = (await import('pdf-parse')).default;
			const dataBuffer = fs.readFileSync(filePath);
			const data = await pdf(dataBuffer);
			textContent = data.text;
		} else if (fileExtension === '.docx') {
			const { value } = await mammoth.extractRawText({ path: filePath });
			textContent = value;
		} else if (fileExtension === '.txt' || fileExtension === '.md') {
			textContent = fs.readFileSync(filePath, 'utf-8');
		}

		if (textContent !== null) {
			return { type: 'text', content: textContent };
		}

		let jsonData: any = null;
		if (fileExtension === '.csv') {
			const fileString = fs.readFileSync(filePath, 'utf-8');
			jsonData = Papa.parse(fileString, { header: true, skipEmptyLines: true }).data;
		} else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
			const workbook = XLSX.readFile(filePath);
			const sheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[sheetName];
			jsonData = XLSX.utils.sheet_to_json(worksheet);
		}

		if (jsonData !== null) {
			return { type: 'json', content: JSON.stringify(jsonData, null, 2) };
		}

		console.log(`[MCP_HANDLER] Tipo de arquivo não suportado: ${fileExtension}`);
		return null;

	} catch (error) {
		console.error("[MCP_HANDLER] Erro ao processar o anexo:", error);
		return null;
	}
}

async function getCampaignDetailsFromContext(message: string, fileInfo: FileProcessResult | null): Promise<Partial<schema.DbInsertCampaign> | null> {
    if (!genAI) return null;
	try {
        const model = 'gemini-2.5-flash-preview-04-17'; 
		let fileContextPrompt = "Nenhum arquivo anexado.";
		if (fileInfo) {
			if (fileInfo.type === 'text') {
				fileContextPrompt = `Conteúdo do documento de texto:\n${fileInfo.content.substring(0, 4000)}`;
			} else if (fileInfo.type === 'json') {
				fileContextPrompt = `Conteúdo da planilha (em JSON):\n${fileInfo.content.substring(0, 4000)}`;
			} else if (fileInfo.type === 'image') {
				fileContextPrompt = "Uma imagem foi anexada. Analise-a para extrair o tema e o público-alvo.";
			}
		}
		
		const promptForDetails = `
			Com base na conversa e no arquivo anexado, extraia detalhes para criar uma campanha de marketing.
			Mensagem do usuário: "${message}"
			Contexto do Arquivo: ${fileContextPrompt}
			
			Extraia as seguintes informações: "name", "description", "objectives", "targetAudience".
			Responda APENAS com um objeto JSON. Se uma informação não for encontrada, deixe o campo como nulo.
		`;

		const parts: Part[] = [{ text: promptForDetails }];
		if (fileInfo?.type === 'image' && fileInfo.mimeType) { 
			parts.push({ inlineData: { mimeType: fileInfo.mimeType, data: fileInfo.content } });
		}
		
		const result = await genAI.models.generateContent({ model, contents: [{ role: 'user', parts }] }); 
		const text = result.text.trim(); 
		let jsonStr = text;
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
          jsonStr = match[2].trim();
        }
		try {
            const parsedData = JSON.parse(jsonStr);
            // Ensure budget fields are correctly typed if present, or handle in storage layer
            const campaignDetails: Partial<schema.DbInsertCampaign> = { ...parsedData };
            if (parsedData.budget) campaignDetails.budget = String(parsedData.budget);
            if (parsedData.dailyBudget) campaignDetails.dailyBudget = String(parsedData.dailyBudget);
            if (parsedData.avgTicket) campaignDetails.avgTicket = String(parsedData.avgTicket);

            return campaignDetails;
        } catch (e) {
            console.error("[MCP_HANDLER_GEMINI] Erro ao parsear JSON de detalhes da campanha:", e, "String original:", text);
            return null;
        }
	} catch (error) {
		console.error("[MCP_HANDLER_GEMINI] Erro ao extrair detalhes da campanha:", error);
		return null;
	}
}

async function getTaskDetailsFromContext(message: string, history: schema.ChatMessage[]): Promise<Partial<schema.DbInsertCampaignTask> & { campaignName?: string, phaseName?: string } | null> {
	if (!genAI) return null;
	try {
        const model = 'gemini-2.5-flash-preview-04-17'; 
		const historyText = history.map(h => `${h.sender}: ${h.text}`).join('\n');
		
		const prompt = `
			Baseado na última mensagem do usuário e no histórico da conversa, extraia os detalhes para CRIAR UMA TAREFA.
			Histórico:
			${historyText}
			
			Mensagem do usuário: "${message}"

			Extraia as seguintes informações:
			- "name": O nome da tarefa.
			- "campaignName": O nome da campanha onde a tarefa deve ser criada. Use o contexto do histórico se o usuário disser "nesta campanha" ou algo similar.
			- "phaseName": O nome da fase (ex: 'Planejamento', 'Aquisição'). Se não for mencionado, deixe como nulo.
			- "description": Uma descrição opcional para a tarefa.

			Responda APENAS com um objeto JSON. Se uma informação não for encontrada, deixe o campo como nulo.
		`;
		const result = await genAI.models.generateContent({model, contents: prompt}); 
		const text = result.text.trim(); 
		let jsonStr = text;
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
          jsonStr = match[2].trim();
        }
        try {
             return JSON.parse(jsonStr);
        } catch (e) {
            console.error("[MCP_HANDLER_GEMINI] Erro ao parsear JSON de detalhes da tarefa:", e, "String original:", text);
            return null;
        }
	} catch (error) {
		console.error("[MCP_HANDLER_GEMINI] Erro ao extrair detalhes da tarefa:", error);
		return null;
	}
}

export async function handleMCPConversation(
	userId: number,
	message: string,
	currentSessionId: number | null | undefined,
	attachmentUrl?: string | null
): Promise<MCPResponsePayload> {
	console.log(`[MCP_HANDLER] User ${userId} disse: "${message || '[Anexo]'}" (Session: ${currentSessionId || 'Nova'})`);

	const fileInfo = attachmentUrl ? await processFile(attachmentUrl) : null;

	let activeSession: schema.ChatSession;
	if (currentSessionId) {
		activeSession = await storage.getChatSession(currentSessionId, userId) ?? await storage.createChatSession(userId, 'Nova Conversa');
	} else {
		activeSession = await storage.createChatSession(userId, 'Nova Conversa');
	}

	const history = await storage.getChatMessages(activeSession.id, userId);

	await storage.addChatMessage({
		sessionId: activeSession.id,
		sender: 'user',
		text: message || (attachmentUrl ? `Anexo: ${path.basename(attachmentUrl)}` : 'Mensagem vazia.'),
		attachmentUrl: attachmentUrl || null,
	});

	let agentReplyText: string;
	const responsePayload: Partial<MCPResponsePayload> = { sessionId: activeSession.id };

	if (genAI && (message || fileInfo)) {
        const geminiModelName = 'gemini-2.5-flash-preview-04-17'; 

		let fileContextForIntent = "";
		if (fileInfo) {
			fileContextForIntent = `O usuário enviou um anexo do tipo '${fileInfo.type}'.`;
			if (fileInfo.type === 'text' || fileInfo.type === 'json') {
				fileContextForIntent += ` Primeiras linhas do conteúdo: "${fileInfo.content.substring(0, 500)}"`;
			}
		}

		const intentPrompt = `
			Analisando a mensagem do usuário, o anexo e o histórico, qual é a intenção principal?
			MENSAGEM: "${message}".
			ANEXO: ${fileContextForIntent}
			HISTÓRICO RECENTE: ${history.slice(-4).map(h => h.text).join('; ')}
			
			Responda com uma das seguintes intenções: NAVEGAR, CRIAR_CAMPANHA, CRIAR_TAREFA, EXPORTAR_RELATORIO, ou CONVERSA_GERAL.
		`;
		const intentParts: Part[] = [{ text: intentPrompt }];
		if (fileInfo?.type === 'image' && fileInfo.mimeType) { 
			intentParts.push({ inlineData: { mimeType: fileInfo.mimeType, data: fileInfo.content } });
		}
		
		const intentResult = await genAI.models.generateContent({ model: geminiModelName, contents: [{ role: 'user', parts: intentParts }] }); 
		const intentResponse = intentResult.text.trim(); 
		console.log(`[MCP_HANDLER] Intenção detectada: ${intentResponse}`);

        if (intentResponse.includes('NAVEGAR')) {
            const validRoutes = ['/dashboard', '/campaigns', '/schedule', '/creatives', '/budget', '/landingpages', '/funnel', '/copy', '/metrics', '/alerts', '/whatsapp', '/integrations', '/export'];
            const navigationPrompt = `O usuário quer navegar. Qual destas rotas é a mais apropriada para a mensagem "${message}"? Responda APENAS com a rota da lista. Lista de rotas válidas: ${validRoutes.join(", ")}.`;
            const navResult = await genAI.models.generateContent({model: geminiModelName, contents: navigationPrompt}); 
            const navPath = navResult.text.trim(); 

            if (validRoutes.includes(navPath)) {
                agentReplyText = `Claro, abrindo a página de ${navPath.replace('/', '')}...`;
                responsePayload.action = "navigate";
                responsePayload.payload = { path: navPath };
            } else {
                agentReplyText = "Entendi que você quer navegar, mas não sei para qual página. Pode ser mais específico?";
            }
        } else if (intentResponse.includes('CRIAR_TAREFA')) {
			const taskDetails = await getTaskDetailsFromContext(message, history);
			agentReplyText = await handleCreateTask(userId, taskDetails); // taskDetails can be null
			responsePayload.action = "invalidateQuery"; responsePayload.payload = { queryKey: ["campaigns", "tasks", "campaignSchedule"] };
		} else if (intentResponse.includes('CRIAR_CAMPANHA')) {
			const campaignDetails = await getCampaignDetailsFromContext(message, fileInfo);
			if (campaignDetails && campaignDetails.name) {
				const newCampaignData: schema.DbInsertCampaign = { 
                    userId: userId, 
                    name: campaignDetails.name, 
                    description: campaignDetails.description || null, 
                    status: campaignDetails.status || 'draft', 
                    platforms: campaignDetails.platforms || [], 
                    objectives: Array.isArray(campaignDetails.objectives) ? campaignDetails.objectives : [], 
                    targetAudience: campaignDetails.targetAudience || null,
                    budget: campaignDetails.budget, // Will be string or undefined
                    dailyBudget: campaignDetails.dailyBudget, // Will be string or undefined
                    avgTicket: campaignDetails.avgTicket, // Will be string or undefined
                    isTemplate: false // Default for new campaigns via MCP
                };
				const createdCampaign = await storage.createCampaign(newCampaignData);
				agentReplyText = `Campanha **"${createdCampaign.name}"** criada com sucesso! Você pode editá-la na página de campanhas.`;
				responsePayload.action = "navigate"; responsePayload.payload = { path: `/campaigns?id=${createdCampaign.id}` };
			} else {
				agentReplyText = "Entendi que você quer criar uma campanha, mas não consegui extrair um nome. Poderia me dizer o nome para a campanha?";
			}
		} else { // CONVERSA_GERAL
			const historyForGemini = history.map(msg => ({ role: msg.sender === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] as Part[] })); // Ensure parts is Part[]

			const systemInstruction = "Você é ubie, um assistente de IA conciso e proativo. Use Markdown para formatar suas respostas."; 
			const userParts: Part[] = [{ text: message }]; 
			
			if (fileInfo?.type === 'image' && fileInfo.mimeType) {
				userParts.push({ inlineData: { mimeType: fileInfo.mimeType, data: fileInfo.content } });
			} else if (fileInfo?.type === 'text' || fileInfo?.type === 'json') {
				userParts[0].text += `\n\n--- CONTEÚDO DO ANEXO ---\n${fileInfo.content.substring(0, 6000)}`;
			}
            
            const chat = genAI.chats.create({ model: geminiModelName, config: { systemInstruction }, history: historyForGemini });
            const chatMessageParams: SendMessageParameters = { message: { role: 'user', parts: userParts } }; 
            const result = await chat.sendMessage(chatMessageParams); 
			agentReplyText = result.text;
		}
	} else {
		agentReplyText = `Recebido. ${!genAI ? 'O serviço de IA não está configurado.' : 'Por favor, envie uma mensagem de texto ou anexo válido.'}`;
	}

	await storage.addChatMessage({
		sessionId: activeSession.id,
		sender: 'agent',
		text: agentReplyText,
	});

	responsePayload.reply = agentReplyText;
	return responsePayload as MCPResponsePayload;
}


async function handleCreateTask(userId: number, taskDetails: Partial<schema.DbInsertCampaignTask> & { campaignName?: string; phaseName?: string; } | null): Promise<string> {
	if (!taskDetails || !taskDetails.name) {
		return "Entendi que você quer criar uma tarefa, mas não consegui identificar o nome dela. Poderia repetir, por favor?";
	}

	if (!taskDetails.campaignName) {
		return "Para qual campanha você gostaria de adicionar esta tarefa? Se ela não existir, eu posso criá-la.";
	}

	let finalCampaign: schema.Campaign;
	let messages: string[] = [];

	const foundCampaigns = await storage.searchCampaignsByName(userId, taskDetails.campaignName);
	if (foundCampaigns.length === 0) {
		const campaignData: schema.DbInsertCampaign = { 
            name: taskDetails.campaignName, 
            userId, 
            status: 'draft', 
            platforms: [], 
            objectives: [], 
            targetAudience: null, 
            isTemplate: false 
        };
		finalCampaign = await storage.createCampaign(campaignData);
		messages.push(`Campanha **"${taskDetails.campaignName}"** não encontrada, então criei uma nova para você.`);
	} else {
		finalCampaign = foundCampaigns[0];
	}

	const campaignDetailsFull = await storage.getCampaignWithDetails(finalCampaign.id, userId);
	let finalPhase: schema.CampaignPhase;

	if (taskDetails.phaseName) {
		const existingPhase = campaignDetailsFull?.phases.find(p => p.name.toLowerCase() === taskDetails.phaseName!.toLowerCase());
		if (existingPhase) {
			finalPhase = existingPhase;
		} else {
			finalPhase = await storage.createPhase(finalCampaign.id, { name: taskDetails.phaseName });
			messages.push(`Fase **"${taskDetails.phaseName}"** não encontrada, então adicionei à campanha.`);
		}
	} else {
        if (campaignDetailsFull && campaignDetailsFull.phases.length > 0) {
            finalPhase = campaignDetailsFull.phases.sort((a,b) => a.order - b.order)[0];
        } else {
            finalPhase = await storage.createPhase(finalCampaign.id, { name: "Planejamento", order: 1 });
            messages.push(`Criei uma fase padrão de **"Planejamento"** para sua tarefa.`);
        }
    }

	try {
		const taskToCreate: schema.DbInsertCampaignTask = {
			phaseId: finalPhase.id,
			name: taskDetails.name,
			description: taskDetails.description || null,
			status: taskDetails.status || 'pending',
			assigneeId: userId, // Default to current user, or make it part of taskDetails
            startDate: taskDetails.startDate,
            endDate: taskDetails.endDate,
		};
		await storage.createTask(taskToCreate);
		messages.push(`Tarefa **"${taskDetails.name}"** adicionada com sucesso na fase **"${finalPhase.name}"**.`);
		return messages.join('\n');
	} catch (error) {
		console.error("Erro ao salvar tarefa:", error);
		return "Ocorreu um erro ao tentar salvar a tarefa no banco de dados.";
	}
}
