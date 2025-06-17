
import { db } from './db';
import * as schema from '../shared/schema';
import { eq, count, sum, desc, and, or, gte, lte, isNull, asc, ilike, sql, SQL } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { geminiService } from './services/gemini.service';
import type { PgSelect } from 'drizzle-orm/pg-core';


// Helper function to ensure budget fields are strings for DB, as schema expects decimal (string in JS)
function convertBudgetDataForDB(data: Partial<schema.DbInsertCampaign>): Partial<schema.DbInsertCampaign> {
  const converted = { ...data };
  if (converted.budget !== undefined && converted.budget !== null) converted.budget = String(converted.budget);
  else delete converted.budget; // Remove if undefined to use DB default or avoid errors if not nullable

  if (converted.dailyBudget !== undefined && converted.dailyBudget !== null) converted.dailyBudget = String(converted.dailyBudget);
  else delete converted.dailyBudget;

  if (converted.avgTicket !== undefined && converted.avgTicket !== null) converted.avgTicket = String(converted.avgTicket);
  else delete converted.avgTicket;
  
  return converted;
}


export class DatabaseStorage {

  async generateUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let counter = 1;
    while (await this.getLandingPageBySlug(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    return slug;
  }

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
  async createUser(userData: schema.DbInsertUser): Promise<schema.User> {
    const passwordToSave = userData.password ? await bcrypt.hash(userData.password, 10) : null;
    const [newUser] = await db.insert(schema.users).values({ 
        ...userData,
        password: passwordToSave, // password can be null if user signed up with Google
    }).returning();
    if (!newUser) throw new Error("Falha ao criar usuário.");
    return newUser;
  }
  async validatePassword(password: string, hashedPassword: string | null): Promise<boolean> {
    if (!hashedPassword) return false; 
    return bcrypt.compare(password, hashedPassword);
  }

  async getCampaigns(userId: number, limit?: number): Promise<schema.Campaign[]> {
    let queryBuilder: PgSelect<any, any, any> = db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.userId, userId))
      .orderBy(desc(schema.campaigns.createdAt));

    if (limit) {
      queryBuilder = queryBuilder.limit(limit);
    }
    return queryBuilder.execute() as unknown as schema.Campaign[];
  }
  async getCampaign(id: number, userId: number): Promise<schema.Campaign | undefined> {
    const [campaign] = await db.select().from(schema.campaigns).where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.userId, userId))).limit(1);
    return campaign;
  }
  async getCampaignWithDetails(id: number, userId: number): Promise<schema.FullCampaignData | undefined> {
    const campaign = await db.query.campaigns.findFirst({
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
     if (campaign) {
        return campaign as schema.FullCampaignData;
    }
    return undefined;
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
  async createCampaign(campaignData: schema.DbInsertCampaign): Promise<schema.Campaign> {
    const dataForDb = convertBudgetDataForDB(campaignData);
    const [newCampaign] = await db.insert(schema.campaigns).values(dataForDb).returning();
    if (!newCampaign) throw new Error("Falha ao criar campanha.");
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
  async createCampaignFromTemplate(campaignData: schema.DbInsertCampaign, templateId: number): Promise<schema.Campaign> {
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

    const newCampaignData: schema.DbInsertCampaign = {
      ...campaignData,
      description: campaignData.description || template.description,
      platforms: campaignData.platforms && campaignData.platforms.length > 0 ? campaignData.platforms : template.platforms,
      objectives: campaignData.objectives && campaignData.objectives.length > 0 ? campaignData.objectives : template.objectives,
      targetAudience: campaignData.targetAudience || template.targetAudience,
      industry: campaignData.industry || template.industry,
      isTemplate: false,
    };
    const dataForDb = convertBudgetDataForDB(newCampaignData);


    const [newCampaign] = await db.insert(schema.campaigns).values(dataForDb).returning();
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

        if (phase.tasks && Array.isArray(phase.tasks)) { 
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
  async updateCampaign(id: number, userId: number, data: Partial<Omit<schema.DbInsertCampaign, 'userId'>> & {
    phases?: Partial<schema.DbInsertCampaignPhase>[]
  }) {
    const {
      phases,
      ...campaignDataRaw
    } = data;
    const campaignDataForDb = convertBudgetDataForDB(campaignDataRaw);

    await db.transaction(async (tx) => {
      if (Object.keys(campaignDataForDb).length > 0) {
        await tx.update(schema.campaigns).set({ ...campaignDataForDb,
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
    return this.getCampaignWithDetails(id, userId);
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

  async createTask(taskData: schema.DbInsertCampaignTask): Promise<schema.CampaignTask> {
    const [newTask] = await db.insert(schema.campaignTasks).values(taskData).returning();
    if (!newTask) throw new Error("Falha ao criar tarefa.");
    return newTask;
  }
  async updateTask(id: number, taskData: Partial<Omit<schema.DbInsertCampaignTask, 'phaseId'>>): Promise<schema.CampaignTask | undefined> {
    const [updatedTask] = await db.update(schema.campaignTasks).set(taskData).where(eq(schema.campaignTasks.id, id)).returning();
    return updatedTask;
  }
  async deleteTask(id: number): Promise<boolean> {
    const result = await db.delete(schema.campaignTasks).where(eq(schema.campaignTasks.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getCreatives(userId: number, campaignId?: number | null): Promise<schema.Creative[]> {
    const conditions: (SQL<unknown> | undefined)[] = [eq(schema.creatives.userId, userId)];
    if (campaignId !== undefined) {
      conditions.push(campaignId === null ? isNull(schema.creatives.campaignId) : eq(schema.creatives.campaignId, campaignId));
    }
    return db.select().from(schema.creatives).where(and(...conditions.filter(c => c !== undefined) as SQL<unknown>[])).orderBy(desc(schema.creatives.createdAt));
  }
  async getCreative(id: number, userId: number): Promise<schema.Creative | undefined> {
    const [creative] = await db.select().from(schema.creatives).where(and(eq(schema.creatives.id, id), eq(schema.creatives.userId, userId))).limit(1);
    return creative;
  }
  async createCreative(creativeData: schema.DbInsertCreative): Promise<schema.Creative> {
    const [newCreative] = await db.insert(schema.creatives).values(creativeData).returning();
    if (!newCreative) throw new Error("Falha ao criar criativo.");
    return newCreative;
  }
  async updateCreative(id: number, creativeData: Partial<Omit<schema.DbInsertCreative, 'userId'>>, userId: number): Promise<schema.Creative | undefined> {
    const [updatedCreative] = await db.update(schema.creatives).set({ ...creativeData,
      updatedAt: new Date()
    }).where(and(eq(schema.creatives.id, id), eq(schema.creatives.userId, userId))).returning();
    return updatedCreative;
  }
  async deleteCreative(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(schema.creatives).where(and(eq(schema.creatives.id, id), eq(schema.creatives.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getCopies(userId: number, campaignId?: number | null, phase?: string, purposeKey?: string, searchTerm?: string): Promise<schema.Copy[]> {
    const conditions: (SQL<unknown> | undefined)[] = [eq(schema.copies.userId, userId)];
    if (campaignId !== undefined) {
      conditions.push(campaignId === null ? isNull(schema.copies.campaignId) : eq(schema.copies.campaignId, campaignId));
    }
    if (phase && phase !== 'all') {
       if (schema.launchPhaseEnum.enumValues.includes(phase as any)) {
        conditions.push(eq(schema.copies.launchPhase, phase as (typeof schema.launchPhaseEnum.enumValues)[number]));
      }
    }
    if (purposeKey && purposeKey !== 'all') {
      conditions.push(eq(schema.copies.purposeKey, purposeKey));
    }
    if (searchTerm && searchTerm.trim() !== '') {
      const searchPattern = `%${searchTerm.toLowerCase()}%`;
      conditions.push(or(ilike(schema.copies.title, searchPattern), ilike(schema.copies.content, searchPattern)));
    }
    return db.select().from(schema.copies).where(and(...conditions.filter(c => c !== undefined) as SQL<unknown>[])).orderBy(desc(schema.copies.createdAt));
  }
  async createCopy(copyData: schema.DbInsertCopy): Promise<schema.Copy> {
    const [newCopy] = await db.insert(schema.copies).values(copyData).returning();
    if (!newCopy) throw new Error("Falha ao salvar a copy.");
    return newCopy;
  }
  async updateCopy(id: number, copyData: Partial<Omit<schema.DbInsertCopy, 'userId' | 'id' | 'createdAt'>>, userId: number): Promise<schema.Copy | undefined> {
    const [updatedCopy] = await db.update(schema.copies).set({ ...copyData,
      lastUpdatedAt: new Date()
    }).where(and(eq(schema.copies.id, id), eq(schema.copies.userId, userId))).returning();
    return updatedCopy;
  }
  async deleteCopy(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(schema.copies).where(and(eq(schema.copies.id, id), eq(schema.copies.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

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
  async createLandingPage(lpData: schema.DbInsertLandingPage): Promise<schema.LandingPage> {
    const [newLP] = await db.insert(schema.landingPages).values(lpData).returning();
    if (!newLP) throw new Error("Falha ao criar landing page.");
    return newLP;
  }
  async updateLandingPage(id: number, lpData: Partial<Omit<schema.DbInsertLandingPage, 'userId'>>, userId: number): Promise<schema.LandingPage | undefined> {
    const [updatedLP] = await db.update(schema.landingPages).set({ ...lpData,
      updatedAt: new Date()
    }).where(and(eq(schema.landingPages.id, id), eq(schema.landingPages.userId, userId))).returning();
    return updatedLP;
  }
  async deleteLandingPage(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(schema.landingPages).where(and(eq(schema.landingPages.id, id), eq(schema.landingPages.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getBudgets(userId: number, campaignId?: number | null): Promise<schema.Budget[]> {
    const conditions: (SQL<unknown> | undefined)[] = [eq(schema.budgets.userId, userId)];
    if (campaignId !== undefined) {
      conditions.push(campaignId === null ? isNull(schema.budgets.campaignId) : eq(schema.budgets.campaignId, campaignId));
    }
    return db.select().from(schema.budgets).where(and(...conditions.filter(c => c !== undefined) as SQL<unknown>[])).orderBy(desc(schema.budgets.createdAt));
  }
  async createBudget(budgetData: schema.DbInsertBudget): Promise<schema.Budget> {
    const dataForDb = {
        ...budgetData,
        totalBudget: String(budgetData.totalBudget),
        spentAmount: String(budgetData.spentAmount ?? "0"),
    };
    const [newBudget] = await db.insert(schema.budgets).values(dataForDb).returning();
    if (!newBudget) throw new Error("Falha ao criar orçamento.");
    return newBudget;
  }
  async updateBudget(id: number, budgetData: Partial<Omit<schema.DbInsertBudget, 'userId' | 'campaignId'>>, userId: number): Promise<schema.Budget | undefined> {
     const dataForDb = { ...budgetData };
    if (budgetData.totalBudget !== undefined) dataForDb.totalBudget = String(budgetData.totalBudget);
    if (budgetData.spentAmount !== undefined) dataForDb.spentAmount = String(budgetData.spentAmount);

    const [updatedBudget] = await db.update(schema.budgets).set(dataForDb).where(and(eq(schema.budgets.id, id), eq(schema.budgets.userId, userId))).returning();
    return updatedBudget;
  }

  async getAlerts(userId: number, onlyUnread?: boolean): Promise<schema.Alert[]> {
    const conditions: (SQL<unknown> | undefined)[] = [eq(schema.alerts.userId, userId)];
    if (onlyUnread) {
      conditions.push(eq(schema.alerts.isRead, false));
    }
    return db.select().from(schema.alerts).where(and(...conditions.filter(c => c !== undefined) as SQL<unknown>[])).orderBy(desc(schema.alerts.createdAt));
  }
  async createAlert(alertData: schema.DbInsertAlert): Promise<schema.Alert> {
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
  async addChatMessage(messageData: schema.DbInsertChatMessage): Promise<schema.ChatMessage> {
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

  async getFunnels(userId: number, campaignId?: number | null): Promise<schema.Funnel[]> {
    return db.query.funnels.findMany({
      where: (funnels, {
        eq,
        and,
        isNull
      }) => and(eq(funnels.userId, userId), campaignId !== undefined ? (campaignId === null ? isNull(funnels.campaignId) : eq(funnels.campaignId, campaignId)) : undefined),
      with: {
        stages: {
          orderBy: [asc(schema.funnelStages.order)]
        }
      },
      orderBy: [desc(schema.funnels.createdAt)]
    });
  }
  async getFunnel(id: number, userId: number): Promise<(schema.Funnel & { stages: schema.FunnelStage[]}) | undefined> {
    return db.query.funnels.findFirst({
      where: and(eq(schema.funnels.id, id), eq(schema.funnels.userId, userId)),
      with: {
        stages: {
          orderBy: [asc(schema.funnelStages.order)]
        }
      }
    });
  }
  async createFunnel(funnelData: schema.DbInsertFunnel): Promise<schema.Funnel> {
    const [newFunnel] = await db.insert(schema.funnels).values(funnelData).returning();
    return newFunnel;
  }
  async updateFunnel(id: number, funnelData: Partial<Omit<schema.DbInsertFunnel, 'userId' | 'campaignId'>>, userId: number): Promise<schema.Funnel | undefined> {
    const [updatedFunnel] = await db.update(schema.funnels).set({ ...funnelData,
      updatedAt: new Date()
    }).where(and(eq(schema.funnels.id, id), eq(schema.funnels.userId, userId))).returning();
    return updatedFunnel;
  }
  async deleteFunnel(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(schema.funnels).where(and(eq(schema.funnels.id, id), eq(schema.funnels.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }
  async createFunnelStage(stageData: schema.DbInsertFunnelStage): Promise<schema.FunnelStage> {
    const [newStage] = await db.insert(schema.funnelStages).values(stageData).returning();
    return newStage;
  }
  async getFlows(userId: number, campaignId?: number | null): Promise<schema.Flow[]> {
    const conditions: (SQL<unknown> | undefined)[] = [eq(schema.flows.userId, userId)];
    if (campaignId !== undefined) {
      conditions.push(campaignId === null ? isNull(schema.flows.campaignId) : eq(schema.flows.campaignId, campaignId));
    }
    return db.select().from(schema.flows).where(and(...conditions.filter(c => c !== undefined) as SQL<unknown>[])).orderBy(desc(schema.flows.createdAt));
  }
  
  async getActiveFlow(userId: number): Promise<schema.Flow | undefined> {
    const [flow] = await db
        .select()
        .from(schema.flows)
        .where(and(eq(schema.flows.userId, userId), eq(schema.flows.status, 'active')))
        .orderBy(desc(schema.flows.updatedAt)) 
        .limit(1);
    return flow;
  }

  async getFlow(id: number, userId: number): Promise<schema.Flow | undefined> {
    const [flow] = await db.select().from(schema.flows).where(and(eq(schema.flows.id, id), eq(schema.flows.userId, userId))).limit(1);
    return flow;
  }
  async createFlow(flowData: Omit<schema.DbInsertFlow, 'userId'>, userId: number): Promise<schema.Flow> {
    const dataToInsert: schema.DbInsertFlow = { ...flowData, userId }; 
    const [newFlow] = await db.insert(schema.flows).values(dataToInsert).returning();
    if (!newFlow) throw new Error("Falha ao criar o fluxo.");
    return newFlow;
  }
  async updateFlow(id: number, flowData: Partial<Omit<schema.DbInsertFlow, 'userId'>>, userId: number): Promise<schema.Flow | undefined> {
    const dataToSet = { ...flowData,
      updatedAt: new Date(),
    };
    const [updatedFlow] = await db.update(schema.flows).set(dataToSet).where(and(eq(schema.flows.id, id), eq(schema.flows.userId, userId))).returning();
    return updatedFlow;
  }
  async deleteFlow(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(schema.flows).where(and(eq(schema.flows.id, id), eq(schema.flows.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getContacts(userId: number): Promise<any[]> {
    const allMessages = await db.select()
      .from(schema.whatsappMessages)
      .where(eq(schema.whatsappMessages.userId, userId))
      .orderBy(desc(schema.whatsappMessages.timestamp));

    const contactsMap = new Map<string, any>();
    for (const msg of allMessages) {
      if (!contactsMap.has(msg.contactNumber)) {
        contactsMap.set(msg.contactNumber, {
          contactNumber: msg.contactNumber,
          contactName: msg.contactName || null,
          lastMessage: msg.message,
          timestamp: msg.timestamp,
          unreadCount: 0,
        });
      }
      const contact = contactsMap.get(msg.contactNumber)!;
      if (!msg.isRead && msg.direction === 'incoming') {
        contact.unreadCount++;
      }
    }
    return Array.from(contactsMap.values());
  }

  async getMessages(userId: number, contactNumber: string): Promise<schema.WhatsappMessage[]> {
    return db.select()
      .from(schema.whatsappMessages)
      .where(and(
        eq(schema.whatsappMessages.userId, userId),
        eq(schema.whatsappMessages.contactNumber, contactNumber)
      ))
      .orderBy(asc(schema.whatsappMessages.timestamp));
  }

  async createWhatsappMessage(messageData: schema.DbInsertWhatsappMessage): Promise<schema.WhatsappMessage> {
    const [newMessage] = await db.insert(schema.whatsappMessages).values(messageData).returning();
    if (!newMessage) throw new Error("Falha ao salvar mensagem do WhatsApp.");
    return newMessage;
  }

  async getDashboardData(userId: number, timeRange: string = '30d'): Promise<any> {
    const now = new Date();
    let startDate = new Date();
    if (timeRange === '7d') startDate.setDate(now.getDate() - 7);
    else if (timeRange === '90d') startDate.setDate(now.getDate() - 90);
    else startDate.setDate(now.getDate() - 30);

    const metricsTimeCondition = and(eq(schema.metrics.userId, userId), gte(schema.metrics.date, startDate));

    const [activeCampaignsResult] = await db.select({
      count: count()
    }).from(schema.campaigns).where(and(eq(schema.campaigns.userId, userId), eq(schema.campaigns.status, 'active')));
    
    const performanceResults = await db.select({
      totalCost: sum(schema.metrics.cost).mapWith(Number),
      totalRevenue: sum(schema.metrics.revenue).mapWith(Number),
      totalConversions: sum(schema.metrics.conversions).mapWith(Number),
      totalClicks: sum(schema.metrics.clicks).mapWith(Number),
      totalImpressions: sum(schema.metrics.impressions).mapWith(Number)
    }).from(schema.metrics).where(metricsTimeCondition);

    const perf = performanceResults[0];
    const totalCost = perf?.totalCost || 0;
    const totalRevenue = perf?.totalRevenue || 0;
    const totalConversions = perf?.totalConversions || 0;
    const totalClicks = perf?.totalClicks || 0;
    const totalImpressions = perf?.totalImpressions || 0;

    const metrics = {
      activeCampaigns: activeCampaignsResult?.count || 0,
      totalCostPeriod: totalCost,
      conversions: totalConversions,
      impressions: totalImpressions,
      clicks: totalClicks,
      avgROI: totalCost > 0 ? parseFloat(((totalRevenue - totalCost) / totalCost).toFixed(2)) : 0,
      ctr: totalImpressions > 0 ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0,
      cpc: totalClicks > 0 ? parseFloat((totalCost / totalClicks).toFixed(2)) : 0,
      cpa: totalConversions > 0 ? parseFloat((totalCost / totalConversions).toFixed(2)) : 0,
      cvr: totalClicks > 0 ? parseFloat(((totalConversions / totalClicks) * 100).toFixed(2)) : 0,
      cpm: totalImpressions > 0 ? parseFloat(((totalCost / totalImpressions) * 1000).toFixed(2)) : 0,
    };

    const recentCampaigns = await this.getCampaigns(userId, 5);

    let aiInsights: string[] = [];
    try {
        const prompt = `Você é um especialista em marketing digital. Analise os seguintes dados de performance de campanha do período e forneça 3 insights acionáveis em formato de lista (use '*' para cada item). Seja conciso e direto. Dados: ${JSON.stringify(metrics)}`;
        if (geminiService && typeof geminiService.generateText === 'function') {
            const rawInsights = await geminiService.generateText(prompt);
            aiInsights = rawInsights.split('*').map(s => s.trim()).filter(Boolean);
        } else {
            aiInsights = ["Serviço de geração de insights não está configurado corretamente."];
        }
    } catch (aiError) {
        console.error("AI Insight Generation Failed:", aiError);
        aiInsights = ["A geração de insights falhou. Verifique a conexão com o serviço de IA."];
    }

    const timeSeriesData = { labels: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'], datasets: [{ label: 'Cliques', data: [120, 180, 150, 220], borderColor: '#3b82f6', tension: 0.3 }] };
    const channelPerformanceData = { labels: ['Google Ads', 'Meta Ads', 'TikTok Ads'], datasets: [{ label: 'Investimento', data: [300, 500, 200], backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899'] }] };
    const roiData = { labels: ['Google Ads', 'Meta Ads', 'TikTok Ads'], datasets: [{ label: 'ROI', data: [4.5, 3.2, 5.1], backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899'] }] };

    return {
        metrics,
        recentCampaigns,
        aiInsights,
        timeSeriesData,
        channelPerformanceData,
        roiData
    };
  }
}

export const storage = new DatabaseStorage();
