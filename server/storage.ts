import { db } from './db';
import * as schema from '../shared/schema';
import { eq, count, sum, desc, and, or, gte, lte, isNull, asc, ilike, sql } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { geminiService } from './services/gemini.service';

export class DatabaseStorage {

  // ✅ NOVO: Gera um slug único para garantir que não haja conflitos no banco
  async generateUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let counter = 1;
    while (await this.getLandingPageBySlug(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    return slug;
  }

  // --- Usuários e Autenticação ---
  async getUser(id: number): Promise<schema.User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return result[0];
  }
  async getAllUsers(): Promise<Omit<schema.User, 'password'>[]> {
    return db.select({
      id: schema.users.id,
      username: schema.users.username,
      email: schema.users.email,
      createdAt: schema.users.createdAt,
      updatedAt: schema.users.updatedAt
    }).from(schema.users).orderBy(asc(schema.users.username));
  }
  async getUserByUsername(username: string): Promise<schema.User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
    return result[0];
  }
  async getUserByEmail(email: string): Promise<schema.User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    return result[0];
  }
  async createUser(userData: schema.InsertUser): Promise<schema.User> {
    const passwordToSave = userData.password ? await bcrypt.hash(userData.password, 10) : null;
    const [newUser] = await db.insert(schema.users).values({ ...userData,
      password: passwordToSave || '', // Ensure password is not null if user table requires it
    }).returning();
    if (!newUser) throw new Error("Falha ao criar usuário.");
    return newUser;
  }
  async validatePassword(password: string, hashedPassword: string | null): Promise<boolean> {
    if (!hashedPassword) return false;
    return bcrypt.compare(password, hashedPassword);
  }

  // --- Campanhas e Fases ---
  async getCampaigns(userId: number, limit?: number): Promise<schema.Campaign[]> {
    let query = db.select().from(schema.campaigns).where(eq(schema.campaigns.userId, userId)).orderBy(desc(schema.campaigns.createdAt));
    if (limit) {
      return query.limit(limit);
    }
    return query;
  }
  async getCampaign(id: number, userId: number): Promise<schema.Campaign | undefined> {
    const [campaign] = await db.select().from(schema.campaigns).where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.userId, userId))).limit(1);
    return campaign;
  }
  async getCampaignWithDetails(id: number, userId: number) {
    return await db.query.campaigns.findFirst({
      where: and(eq(schema.campaigns.id, id), eq(schema.campaigns.userId, userId)),
      with: {
        phases: {
          orderBy: [asc(schema.campaignPhases.order)],
          with: {
            tasks: {
              orderBy: [asc(schema.campaignTasks.startDate), asc(schema.campaignTasks.id)],
              with: {
                assignee: {
                  columns: {
                    id: true,
                    username: true
                  }
                }
              }
            }
          }
        }
      }
    });
  }
  async searchCampaignsByName(userId: number, nameFragment: string): Promise<schema.Campaign[]> {
    if (!nameFragment || nameFragment.trim() === '') return [];
    return db.select()
      .from(schema.campaigns)
      .where(
        and(
          eq(schema.campaigns.userId, userId),
          ilike(schema.campaigns.name, `%${nameFragment}%`)
        )
      )
      .orderBy(desc(schema.campaigns.createdAt));
  }
  async createCampaign(campaignData: schema.InsertCampaign): Promise<schema.Campaign> {
    const [newCampaign] = await db.insert(schema.campaigns).values(campaignData).returning();
    if (!newCampaign) throw new Error("Falha ao criar campanha.");
    // Ao criar uma campanha, adiciona fases padrão para uma estrutura inicial.
    const defaultPhases = ['Planejamento', 'Aquisição', 'Aquecimento', 'Evento', 'Carrinho', 'Recuperação', 'Downsell', 'Debriefing'];
    for (let i = 0; i < defaultPhases.length; i++) {
      await db.insert(schema.campaignPhases).values({
        campaignId: newCampaign.id,
        name: defaultPhases[i],
        order: i
      });
    }
    return newCampaign;
  }
  async createCampaignFromTemplate(campaignData: schema.InsertCampaign, templateId: number): Promise<schema.Campaign> {
    const template = await db.query.campaigns.findFirst({
      where: and(eq(schema.campaigns.id, templateId), eq(schema.campaigns.isTemplate, true)),
      with: {
        phases: {
          with: {
            tasks: true
          }
        }
      }
    });

    if (!template) throw new Error("Template não encontrado.");

    const newCampaignData = {
      ...campaignData,
      description: campaignData.description || template.description,
      platforms: campaignData.platforms && campaignData.platforms.length > 0 ? campaignData.platforms : template.platforms,
      objectives: campaignData.objectives && campaignData.objectives.length > 0 ? campaignData.objectives : template.objectives,
      targetAudience: campaignData.targetAudience || template.targetAudience,
      industry: campaignData.industry || template.industry,
      isTemplate: false,
    };

    const [newCampaign] = await db.insert(schema.campaigns).values(newCampaignData).returning();
    if (!newCampaign) throw new Error("Falha ao criar campanha a partir do template.");

    if (template.phases) {
      for (const phase of template.phases) {
        const [newPhase] = await db.insert(schema.campaignPhases).values({
          campaignId: newCampaign.id,
          name: phase.name,
          order: phase.order,
          startDate: newCampaign.startDate,
          endDate: newCampaign.endDate
        }).returning();

        if (phase.tasks) {
          for (const task of phase.tasks) {
            await db.insert(schema.campaignTasks).values({
              phaseId: newPhase.id,
              name: task.name,
              description: task.description,
              status: 'pending',
              assigneeId: task.assigneeId
            });
          }
        }
      }
    }
    return newCampaign;
  }
  async updateCampaign(id: number, userId: number, data: Partial<Omit<schema.InsertCampaign, 'userId'>> & {
    phases?: Partial<schema.InsertCampaignPhase>[]
  }) {
    const {
      phases,
      ...campaignData
    } = data;
    await db.transaction(async (tx) => {
      if (Object.keys(campaignData).length > 0) {
        await tx.update(schema.campaigns).set({ ...campaignData,
          updatedAt: new Date()
        }).where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.userId, userId)));
      }
      if (phases) {
        for (const phaseData of phases) {
          if (phaseData.id && phaseData.startDate && phaseData.endDate) {
            await tx.update(schema.campaignPhases).set({
              startDate: phaseData.startDate,
              endDate: phaseData.endDate
            }).where(eq(schema.campaignPhases.id, phaseData.id));
          }
        }
      }
    });
    return await this.getCampaignWithDetails(id, userId);
  }
  async deleteCampaign(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(schema.campaigns).where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }
  async getPhaseByName(campaignId: number, phaseName: string): Promise<schema.CampaignPhase | undefined> {
    const result = await db.select()
      .from(schema.campaignPhases)
      .where(
        and(
          eq(schema.campaignPhases.campaignId, campaignId),
          ilike(schema.campaignPhases.name, `%${phaseName}%`)
        )
      )
      .limit(1);
    return result[0];
  }
  async createPhase(campaignId: number, phaseData: { name: string; order?: number }): Promise<schema.CampaignPhase> {
    const [newPhase] = await db.insert(schema.campaignPhases).values({
      campaignId,
      name: phaseData.name,
      order: phaseData.order ?? 0,
    }).returning();
    if (!newPhase) throw new Error("Falha ao criar a fase da campanha.");
    return newPhase;
  }

  // --- Tarefas ---
  async createTask(taskData: schema.InsertCampaignTask): Promise<schema.CampaignTask> {
    const [newTask] = await db.insert(schema.campaignTasks).values(taskData).returning();
    if (!newTask) throw new Error("Falha ao criar tarefa.");
    return newTask;
  }
  async updateTask(id: number, taskData: Partial<Omit<schema.InsertCampaignTask, 'phaseId'>>): Promise<schema.CampaignTask | undefined> {
    const [updatedTask] = await db.update(schema.campaignTasks).set(taskData).where(eq(schema.campaignTasks.id, id)).returning();
    return updatedTask;
  }
  async deleteTask(id: number): Promise<boolean> {
    const result = await db.delete(schema.campaignTasks).where(eq(schema.campaignTasks.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // --- Criativos ---
  async getCreatives(userId: number, campaignId?: number | null): Promise<schema.Creative[]> {
    const conditions = [eq(schema.creatives.userId, userId)];
    if (campaignId !== undefined) {
      conditions.push(campaignId === null ? isNull(schema.creatives.campaignId) : eq(schema.creatives.campaignId, campaignId));
    }
    return db.select().from(schema.creatives).where(and(...conditions)).orderBy(desc(schema.creatives.createdAt));
  }
  async getCreative(id: number, userId: number): Promise<schema.Creative | undefined> {
    const [creative] = await db.select().from(schema.creatives).where(and(eq(schema.creatives.id, id), eq(schema.creatives.userId, userId))).limit(1);
    return creative;
  }
  async createCreative(creativeData: schema.InsertCreative): Promise<schema.Creative> {
    const [newCreative] = await db.insert(schema.creatives).values(creativeData).returning();
    if (!newCreative) throw new Error("Falha ao criar criativo.");
    return newCreative;
  }
  async updateCreative(id: number, creativeData: Partial<Omit<schema.InsertCreative, 'userId'>>, userId: number): Promise<schema.Creative | undefined> {
    const [updatedCreative] = await db.update(schema.creatives).set({ ...creativeData,
      updatedAt: new Date()
    }).where(and(eq(schema.creatives.id, id), eq(schema.creatives.userId, userId))).returning();
    return updatedCreative;
  }
  async deleteCreative(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(schema.creatives).where(and(eq(schema.creatives.id, id), eq(schema.creatives.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  // --- Copies ---
  async getCopies(userId: number, campaignId?: number | null, phase?: string, purposeKey?: string, searchTerm?: string): Promise<schema.Copy[]> {
    const conditions: any[] = [eq(schema.copies.userId, userId)];
    if (campaignId !== undefined) {
      conditions.push(campaignId === null ? isNull(schema.copies.campaignId) : eq(schema.copies.campaignId, campaignId));
    }
    if (phase && phase !== 'all') {
      conditions.push(eq(schema.copies.launchPhase, phase as schema.LaunchPhase));
    }
    if (purposeKey && purposeKey !== 'all') {
      conditions.push(eq(schema.copies.purposeKey, purposeKey));
    }
    if (searchTerm && searchTerm.trim() !== '') {
      const searchPattern = `%${searchTerm.toLowerCase()}%`;
      conditions.push(or(ilike(schema.copies.title, searchPattern), ilike(schema.copies.content, searchPattern)));
    }
    return db.select().from(schema.copies).where(and(...conditions)).orderBy(desc(schema.copies.createdAt));
  }
  async createCopy(copyData: schema.InsertCopy): Promise<schema.Copy> {
    const [newCopy] = await db.insert(schema.copies).values(copyData).returning();
    if (!newCopy) throw new Error("Falha ao salvar a copy.");
    return newCopy;
  }
  async updateCopy(id: number, copyData: Partial<Omit<schema.InsertCopy, 'userId' | 'id' | 'createdAt'>>, userId: number): Promise<schema.Copy | undefined> {
    const [updatedCopy] = await db.update(schema.copies).set({ ...copyData,
      lastUpdatedAt: new Date()
    }).where(and(eq(schema.copies.id, id), eq(schema.copies.userId, userId))).returning();
    return updatedCopy;
  }
  async deleteCopy(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(schema.copies).where(and(eq(schema.copies.id, id), eq(schema.copies.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  // --- Landing Pages ---
  async getLandingPages(userId: number): Promise<schema.LandingPage[]> {
    return db.select().from(schema.landingPages).where(eq(schema.landingPages.userId, userId)).orderBy(desc(schema.landingPages.createdAt));
  }
  async getLandingPage(id: number, userId: number): Promise<schema.LandingPage | undefined> {
    const [lp] = await db.select().from(schema.landingPages).where(and(eq(schema.landingPages.id, id), eq(schema.landingPages.userId, userId))).limit(1);
    return lp;
  }
  async getLandingPageBySlug(slug: string): Promise<schema.LandingPage | undefined> {
    const [lp] = await db.select().from(schema.landingPages).where(eq(schema.landingPages.slug, slug)).limit(1);
    return lp;
  }
  async getLandingPageByStudioProjectId(studioProjectId: string, userId: number): Promise<schema.LandingPage | undefined> {
    const [lp] = await db.select().from(schema.landingPages).where(and(eq(schema.landingPages.studioProjectId, studioProjectId), eq(schema.landingPages.userId, userId))).limit(1);
    return lp;
  }
  async createLandingPage(lpData: schema.InsertLandingPage, userId: number): Promise<schema.LandingPage> {
    const [newLP] = await db.insert(schema.landingPages).values({ ...lpData, userId }).returning();
    if (!newLP) throw new Error("Falha ao criar landing page.");
    return newLP;
  }
  async updateLandingPage(id: number, lpData: Partial<Omit<schema.InsertLandingPage, 'userId'>>, userId: number): Promise<schema.LandingPage | undefined> {
    const [updatedLP] = await db.update(schema.landingPages).set({ ...lpData,
      updatedAt: new Date()
    }).where(and(eq(schema.landingPages.id, id), eq(schema.landingPages.userId, userId))).returning();
    return updatedLP;
  }
  async deleteLandingPage(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(schema.landingPages).where(and(eq(schema.landingPages.id, id), eq(schema.landingPages.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  // --- Orçamentos (Budgets) ---
  async getBudgets(userId: number, campaignId?: number | null): Promise<schema.Budget[]> {
    const conditions = [eq(schema.budgets.userId, userId)];
    if (campaignId !== undefined) {
      conditions.push(campaignId === null ? isNull(schema.budgets.campaignId) : eq(schema.budgets.campaignId, campaignId));
    }
    return db.select().from(schema.budgets).where(and(...conditions)).orderBy(desc(schema.budgets.createdAt));
  }
  async createBudget(budgetData: schema.InsertBudget): Promise<schema.Budget> {
    const [newBudget] = await db.insert(schema.budgets).values(budgetData).returning();
    if (!newBudget) throw new Error("Falha ao criar orçamento.");
    return newBudget;
  }
  async updateBudget(id: number, budgetData: Partial<Omit<schema.InsertBudget, 'userId' | 'campaignId'>>, userId: number): Promise<schema.Budget | undefined> {
    const [updatedBudget] = await db.update(schema.budgets).set(budgetData).where(and(eq(schema.budgets.id, id), eq(schema.budgets.userId, userId))).returning();
    return updatedBudget;
  }

  // --- Alertas ---
  async getAlerts(userId: number, onlyUnread?: boolean): Promise<schema.Alert[]> {
    const conditions = [eq(schema.alerts.userId, userId)];
    if (onlyUnread) {
      conditions.push(eq(schema.alerts.isRead, false));
    }
    return db.select().from(schema.alerts).where(and(...conditions)).orderBy(desc(schema.alerts.createdAt));
  }
  async createAlert(alertData: schema.InsertAlert): Promise<schema.Alert> {
    const [newAlert] = await db.insert(schema.alerts).values(alertData).returning();
    if (!newAlert) throw new Error("Falha ao criar alerta.");
    return newAlert;
  }
  async markAlertAsRead(id: number, userId: number): Promise<boolean> {
    const result = await db.update(schema.alerts).set({
      isRead: true
    }).where(and(eq(schema.alerts.id, id), eq(schema.alerts.userId, userId), eq(schema.alerts.isRead, false)));
    return (result.rowCount ?? 0) > 0;
  }
  async markAllAlertsAsRead(userId: number): Promise<boolean> {
    const result = await db.update(schema.alerts).set({
      isRead: true
    }).where(and(eq(schema.alerts.userId, userId), eq(schema.alerts.isRead, false)));
    return (result.rowCount ?? 0) > 0;
  }

  // --- Chat (MCP) ---
  async createChatSession(userId: number, title: string = 'Nova Conversa'): Promise<schema.ChatSession> {
    const [newSession] = await db.insert(schema.chatSessions).values({
      userId,
      title,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    if (!newSession) throw new Error("Falha ao criar sessão de chat.");
    return newSession;
  }
  async getChatSession(sessionId: number, userId: number): Promise<schema.ChatSession | undefined> {
    const [session] = await db.select().from(schema.chatSessions).where(and(eq(schema.chatSessions.id, sessionId), eq(schema.chatSessions.userId, userId))).limit(1);
    return session;
  }
  async getChatSessions(userId: number): Promise<schema.ChatSession[]> {
    return db.select().from(schema.chatSessions).where(eq(schema.chatSessions.userId, userId)).orderBy(desc(schema.chatSessions.updatedAt));
  }
  async updateChatSessionTitle(sessionId: number, userId: number, newTitle: string): Promise<schema.ChatSession | undefined> {
    const [updatedSession] = await db.update(schema.chatSessions).set({
      title: newTitle,
      updatedAt: new Date()
    }).where(and(eq(schema.chatSessions.id, sessionId), eq(schema.chatSessions.userId, userId))).returning();
    return updatedSession;
  }
  async deleteChatSession(sessionId: number, userId: number): Promise<boolean> {
    const result = await db.delete(schema.chatSessions).where(and(eq(schema.chatSessions.id, sessionId), eq(schema.chatSessions.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }
  async addChatMessage(messageData: schema.InsertChatMessage): Promise<schema.ChatMessage> {
    const [newMessage] = await db.insert(schema.chatMessages).values({ ...messageData,
      timestamp: new Date()
    }).returning();
    if (!newMessage) throw new Error("Falha ao adicionar mensagem.");
    await db.update(schema.chatSessions).set({
      updatedAt: new Date()
    }).where(eq(schema.chatSessions.id, messageData.sessionId));
    return newMessage;
  }
  async getChatMessages(sessionId: number, userId: number): Promise<schema.ChatMessage[]> {
    const sessionExists = await db.query.chatSessions.findFirst({
      where: and(eq(schema.chatSessions.id, sessionId), eq(schema.chatSessions.userId, userId))
    });
    if (!sessionExists) return [];
    return db.select().from(schema.chatMessages).where(eq(schema.chatMessages.sessionId, sessionId)).orderBy(asc(schema.chatMessages.timestamp));
  }

  // --- Funis e Fluxos (WhatsApp) ---
  async getFunnels(userId: number, campaignId?: number | null): Promise<schema.Funnel[]> {
    const conditions = [eq(schema.funnels.userId, userId)];
    if (campaignId !== undefined) {
      conditions.push(campaignId === null ? isNull(schema.funnels.campaignId) : eq(schema.funnels.campaignId, campaignId));
    }
    return db.select().from(schema.funnels).where(and(...conditions)).orderBy(desc(schema.funnels.createdAt));
  }

  async getFunnelWithStages(funnelId: number, userId: number): Promise<(schema.Funnel & { stages: schema.FunnelStage[] }) | undefined> {
    return db.query.funnels.findFirst({
      where: and(eq(schema.funnels.id, funnelId), eq(schema.funnels.userId, userId)),
      with: { stages: { orderBy: [asc(schema.funnelStages.order)] } }
    });
  }
  async createFunnel(funnelData: schema.InsertFunnel, userId: number): Promise<schema.Funnel> {
    const [newFunnel] = await db.insert(schema.funnels).values({ ...funnelData, userId }).returning();
    if (!newFunnel) throw new Error("Falha ao criar funil.");
    return newFunnel;
  }
  async updateFunnel(id: number, funnelData: Partial<Omit<schema.InsertFunnel, 'userId'>>, userId: number): Promise<schema.Funnel | undefined> {
    const [updatedFunnel] = await db.update(schema.funnels).set({ ...funnelData, updatedAt: new Date() }).where(and(eq(schema.funnels.id, id), eq(schema.funnels.userId, userId))).returning();
    return updatedFunnel;
  }
  async deleteFunnel(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(schema.funnels).where(and(eq(schema.funnels.id, id), eq(schema.funnels.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }
  
  async getFlows(userId: number, campaignId?: number | null): Promise<schema.Flow[]> {
    const conditions = [eq(schema.flows.userId, userId)];
    if (campaignId !== undefined) {
        conditions.push(campaignId === null ? isNull(schema.flows.campaignId) : eq(schema.flows.campaignId, campaignId));
    }
    return db.select().from(schema.flows).where(and(...conditions)).orderBy(desc(schema.flows.createdAt));
  }
  async getFlow(flowId: number, userId: number): Promise<schema.Flow | undefined> {
    const [flow] = await db.select().from(schema.flows).where(and(eq(schema.flows.id, flowId), eq(schema.flows.userId, userId))).limit(1);
    return flow;
  }
  async createFlow(flowData: schema.InsertFlow, userId: number): Promise<schema.Flow> {
    const [newFlow] = await db.insert(schema.flows).values({ ...flowData, userId }).returning();
    if (!newFlow) throw new Error("Falha ao criar fluxo.");
    return newFlow;
  }
  async updateFlow(flowId: number, flowData: Partial<Omit<schema.InsertFlow, 'userId'>>, userId: number): Promise<schema.Flow | undefined> {
    const [updatedFlow] = await db.update(schema.flows).set({ ...flowData, updatedAt: new Date() }).where(and(eq(schema.flows.id, flowId), eq(schema.flows.userId, userId))).returning();
    return updatedFlow;
  }
  async deleteFlow(flowId: number, userId: number): Promise<boolean> {
    const result = await db.delete(schema.flows).where(and(eq(schema.flows.id, flowId), eq(schema.flows.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }
  async getActiveFlow(userId: number): Promise<schema.Flow | undefined> {
    const [flow] = await db.select().from(schema.flows).where(and(eq(schema.flows.userId, userId), eq(schema.flows.status, 'active'))).orderBy(desc(schema.flows.updatedAt)).limit(1);
    return flow;
  }

  // --- Funções para o Dashboard ---
  // ... (Implementação das funções de dashboard como na versão anterior)
  // Note que as funções generateSimulated... foram removidas conforme o pedido anterior.
  // Elas precisam ser recriadas ou os dados vir de uma fonte real.
  // Por agora, vou mockar os dados de gráfico para não quebrar.
  async getDashboardData(userId: number, timeRange: string = '30d'): Promise<any> {
    const activeCampaignsResult = await db.select({ count: count() }).from(schema.campaigns).where(and(eq(schema.campaigns.userId, userId), eq(schema.campaigns.status, 'active')));
    const metricsSummary = await db.select({
      totalSpent: sum(schema.metrics.cost),
      totalConversions: sum(schema.metrics.conversions),
      totalRevenue: sum(schema.metrics.revenue),
      totalImpressions: sum(schema.metrics.impressions),
      totalClicks: sum(schema.metrics.clicks),
    }).from(schema.metrics).where(eq(schema.metrics.userId, userId)); // Adicionar filtro de data aqui se necessário para timeRange

    const totalCostPeriod = parseFloat(metricsSummary[0]?.totalSpent || "0");
    const conversions = parseInt(metricsSummary[0]?.totalConversions || "0", 10);
    const revenue = parseFloat(metricsSummary[0]?.totalRevenue || "0");
    const impressions = parseInt(metricsSummary[0]?.totalImpressions || "0", 10);
    const clicks = parseInt(metricsSummary[0]?.totalClicks || "0", 10);

    const avgROI = totalCostPeriod > 0 ? (revenue / totalCostPeriod) : 0;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? (totalCostPeriod / clicks) : 0;
    const cpa = conversions > 0 ? (totalCostPeriod / conversions) : 0;
    const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
    const cpm = impressions > 0 ? (totalCostPeriod / impressions) * 1000 : 0;

    const metrics = {
      activeCampaigns: activeCampaignsResult[0]?.count || 0,
      totalCostPeriod,
      conversions,
      avgROI,
      impressions,
      clicks,
      ctr,
      cpc,
      cpa,
      cvr,
      cpm
    };
    const recentCampaigns = await this.getCampaigns(userId, 5); // Pega 5 campanhas mais recentes

    // Mock data para gráficos, já que as funções de simulação foram removidas
    const mockLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
    const timeSeriesData = { labels: mockLabels, datasets: [{ label: 'Impressões', data: [1200, 1900, 3000, 5000, 2300, 3200], borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.2)' }] };
    const channelPerformanceData = { labels: ['Google', 'Facebook', 'Instagram'], datasets: [{ data: [300, 150, 100], backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'] }] };
    const roiData = { labels: mockLabels, datasets: [{ label: 'ROI (%)', data: [2.5, 3.1, 2.8, 3.5, 3.0, 3.2], backgroundColor: 'rgba(153, 102, 255, 0.6)'}] };

    return {
      metrics,
      recentCampaigns,
      alertCount: (await db.select({ count: count() }).from(schema.alerts).where(and(eq(schema.alerts.userId, userId), eq(schema.alerts.isRead, false))))[0]?.count || 0,
      timeSeriesData,
      channelPerformanceData,
      roiData,
    };
  }
}

export const storage = new DatabaseStorage();
