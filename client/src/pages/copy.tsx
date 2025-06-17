
// client/src/pages/copy.tsx
'use client';

import React, { useState, useEffect, useMemo, ChangeEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { GoogleGenAI } from "@google/genai";


// Componentes SHADCN/UI REAIS
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel as ShadcnSelectLabel,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'; // Para o modal de ideias
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"; // Para o rhfBaseForm

// Ícones LUCIDE-REACT REAIS
import {
  Bot,
  Copy as CopyIcon,
  Save,
  Trash2,
  Loader2,
  Sparkles,
  FileText,
  Search as SearchIcon,
  Info as InfoIcon,
  RotateCcw,
  Lightbulb,
  Wand2,
  Plus,
  Edit,
  MessageCircle,
  Filter as FilterIconLucide,
  BarChart3,
  Target,
  DollarSign as DollarSignIcon,
  CalendarDays,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';

// Hooks e Utils do SEU projeto
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';

// Configurações e Tipos de @/config/copyConfigurations.ts
import {
  allCopyPurposesConfig,
  type CopyPurposeConfig,
  type FieldDefinition,
  type LaunchPhase,
  type BaseGeneratorFormState,
} from '@/config/copyConfigurations';

// Tipos locais que podem ser movidos para copyConfigurations.ts se forem reutilizados
export type SpecificPurposeData = Record<string, string | number | boolean | string[] | undefined>;

export interface FullGeneratorPayload extends BaseGeneratorFormState {
    launchPhase: LaunchPhase;
    copyPurposeKey: string;
    details: SpecificPurposeData;
}

export interface BackendGeneratedCopyItem {
    mainCopy: string;
    alternativeVariation1?: string;
    alternativeVariation2?: string;
    platformSuggestion?: string;
    notes?: string;
}

export interface DisplayGeneratedCopy extends BackendGeneratedCopyItem {
    timestamp: Date;
    purposeKey: string;
}

export type SavedCopy = {
    id: number;
    title: string;
    content: string;
    purposeKey: string;
    launchPhase: LaunchPhase;
    details: Record<string, any>; 
    baseInfo: BaseGeneratorFormState;
    platform?: string | null;
    isFavorite: boolean;
    tags: string[];
    createdAt: string; 
    lastUpdatedAt: string; 
    campaignId?: number | null;
    userId: number;
    fullGeneratedResponse: BackendGeneratedCopyItem; 
}

// Schemas da IA (definidos localmente ou importados de copyConfigurations.ts)
const aiResponseSchema = { type: "OBJECT", properties: { mainCopy: { type: "STRING" }, alternativeVariation1: { type: "STRING" }, alternativeVariation2: { type: "STRING" }, platformSuggestion: { type: "STRING" }, notes: { type: "STRING" } }, required: ["mainCopy", "platformSuggestion"] };
const contentIdeasResponseSchema = { type: "OBJECT", properties: { contentIdeas: { type: "ARRAY", items: { "type": "STRING" } } }, required: ["contentIdeas"] };
const optimizeCopyResponseSchema = { type: "OBJECT", properties: { optimizedCopy: { type: "STRING" }, optimizationNotes: { type: "STRING" } }, required: ["optimizedCopy"] };

// Schema para o formulário base (definido localmente ou importado de copyConfigurations.ts)
const baseGeneratorFormSchema = z.object({
  product: z.string().min(3, "Produto/Serviço deve ter pelo menos 3 caracteres."),
  audience: z.string().min(3, "Público-Alvo deve ter pelo menos 3 caracteres."),
  objective: z.enum(['sales', 'leads', 'engagement', 'awareness']),
  tone: z.enum(['professional', 'casual', 'urgent', 'inspirational', 'educational', 'empathetic', 'divertido', 'sofisticado']),
});

// Opções para Selects (definidas localmente ou importadas de copyConfigurations.ts)
const objectiveOptions: Array<{ value: BaseGeneratorFormState['objective']; label: string }> = [
    { value: 'sales', label: 'Gerar Vendas' }, { value: 'leads', label: 'Gerar Leads' },
    { value: 'engagement', label: 'Aumentar Engajamento' }, { value: 'awareness', label: 'Criar Reconhecimento' }
];
const toneOptions: Array<{ value: BaseGeneratorFormState['tone']; label: string }> = [
    { value: 'professional', label: 'Profissional' }, { value: 'casual', label: 'Casual' },
    { value: 'urgent', label: 'Urgente' }, { value: 'inspirational', label: 'Inspiracional' },
    { value: 'educational', label: 'Educativo' }, { value: 'empathetic', label: 'Empático' },
    { value: 'divertido', label: 'Divertido' }, { value: 'sofisticado', label: 'Sofisticado' }
];

const genAI = process.env.API_KEY ? new GoogleGenAI({apiKey: process.env.API_KEY}) : null;


// --- Início do Componente ---
export default function CopyPage() {
  const rhfBaseForm = useForm<BaseGeneratorFormState>({
    resolver: zodResolver(baseGeneratorFormSchema),
    defaultValues: { product: '', audience: '', objective: 'sales', tone: 'professional' },
  });

  const [selectedLaunchPhase, setSelectedLaunchPhase] = useState<LaunchPhase | ''>('');
  const [selectedCopyPurposeKey, setSelectedCopyPurposeKey] = useState<string>('');
  const [specificPurposeData, setSpecificPurposeData] = useState<SpecificPurposeData>({});
  const [generatedCopies, setGeneratedCopies] = useState<DisplayGeneratedCopy[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLaunchPhase, setFilterLaunchPhase] = useState<LaunchPhase | 'all'>('all');
  const [filterCopyPurpose, setFilterCopyPurpose] = useState<string | 'all'>('all');
  
  const [contentIdeas, setContentIdeas] = useState<string[]>([]);
  const [isContentIdeasModalOpen, setIsContentIdeasModalOpen] = useState(false);
  const [optimizingCopy, setOptimizingCopy] = useState<{text: string; index: number} | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    setSelectedCopyPurposeKey('');
  }, [selectedLaunchPhase]);

  useEffect(() => {
    const currentConfig = allCopyPurposesConfig.find(p => p.key === selectedCopyPurposeKey);
    const defaultValues: SpecificPurposeData = {};
    if (currentConfig) {
      currentConfig.fields.forEach(field => {
        if (field.defaultValue !== undefined) {
          defaultValues[field.name] = field.defaultValue;
        } else {
          defaultValues[field.name] = field.type === 'number' ? '' : field.type === 'select' && field.options && field.options.length > 0 ? field.options[0].value : '';
        }
      });
    }
    setSpecificPurposeData(defaultValues);
    setGeneratedCopies([]);
  }, [selectedCopyPurposeKey]);

  const { data: savedCopiesList = [], isLoading: isSavedCopiesLoading } = useQuery<SavedCopy[]>({
    queryKey: ['savedCopies', filterLaunchPhase, filterCopyPurpose, searchTerm],
    queryFn: async () => {
        const params = new URLSearchParams();
        if (filterLaunchPhase !== 'all') params.append('phase', filterLaunchPhase);
        if (filterCopyPurpose !== 'all') params.append('purpose', filterCopyPurpose);
        if (searchTerm) params.append('search', searchTerm);
        
        const response = await apiRequest('GET', `/api/copies?${params.toString()}`); 
        if (!response.ok) throw new Error('Falha ao buscar copies salvas');
        return (await response.json()) || [];
    },
  });

  const generateSpecificCopyMutation = useMutation<BackendGeneratedCopyItem[], Error, FullGeneratorPayload>({
    mutationFn: async (payload) => {
        if (!genAI) {
            toast({ title: "IA Não Configurada", description: "A API Key do Gemini não está configurada para usar esta funcionalidade.", variant: "destructive" });
            throw new Error("IA não configurada");
        }
        const currentPurposeConfig = allCopyPurposesConfig.find(p => p.key === payload.copyPurposeKey);
        if (!currentPurposeConfig) throw new Error("Configuração da finalidade da copy não encontrada.");
        
        const launchPhaseLabel = payload.launchPhase === 'pre_launch' ? 'Pré-Lançamento' : payload.launchPhase === 'launch' ? 'Lançamento' : 'Pós-Lançamento';
        
        let basePrompt = `Contexto da IA: Você é um Copywriter Mestre, especialista em criar textos persuasivos e altamente eficazes para lançamentos digitais no mercado brasileiro. Sua linguagem deve ser adaptada ao tom solicitado.
---
INFORMAÇÕES BASE PARA ESTA COPY:
- Produto/Serviço Principal: "${payload.product}"
- Público-Alvo Principal: "${payload.audience}"
- Objetivo Geral da Campanha: "${objectiveOptions.find(o => o.value === payload.objective)?.label || payload.objective}"
- Tom da Mensagem Desejado: "${toneOptions.find(t => t.value === payload.tone)?.label || payload.tone}"
- Fase Atual do Lançamento: "${launchPhaseLabel}"
---
FINALIDADE ESPECÍFICA DESTA COPY:
- Nome da Finalidade: "${currentPurposeConfig.label}"
- Categoria: "${currentPurposeConfig.category}"
${currentPurposeConfig.description ? `- Descrição da Finalidade: "${currentPurposeConfig.description}"\n` : ''}---
DETALHES ESPECÍFÍCOS FORNECIDOS PARA ESTA FINALIDADE:
${Object.entries(payload.details).map(([key, value]) => {
  const fieldConfig = currentPurposeConfig.fields.find(f => f.name === key);
  return `- ${fieldConfig?.label || key}: ${value || '(Não informado)'}`;
}).join('\n')}
---
TAREFA:
Com base em TODAS as informações acima, gere os seguintes textos para a finalidade "${currentPurposeConfig.label}".
Responda OBRIGATORIAMENTE em formato JSON VÁLIDO, seguindo o schema abaixo.
Schema JSON esperado: ${JSON.stringify(aiResponseSchema)}
Observações importantes para sua geração:
- Incorpore os "Detalhes Específicos" de forma inteligente e natural na "mainCopy".
- Se um detalhe crucial não foi informado, use seu conhecimento para criar a melhor copy possível.
- Seja direto, claro e use gatilhos mentais apropriados.
- Para anúncios, pense em limite de caracteres.
- Para e-mails, estruture com parágrafos curtos e CTA claro.`;
        
        if (currentPurposeConfig.promptEnhancer) {
            basePrompt = currentPurposeConfig.promptEnhancer(basePrompt, payload.details, payload);
        }
        
        const response = await genAI.models.generateContent({
            model: "gemini-2.5-flash-preview-04-17",
            contents: [{ role: "user", parts: [{ text: basePrompt }] }],
            config: { responseMimeType: "application/json" }
        });
        
        let jsonStr = response.text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
          jsonStr = match[2].trim();
        }
        
        const parsedData = JSON.parse(jsonStr) as BackendGeneratedCopyItem;
        return [parsedData];
    },
    onSuccess: (data) => {
        const newCopies: DisplayGeneratedCopy[] = data.map(item => ({
            ...item,
            timestamp: new Date(),
            purposeKey: selectedCopyPurposeKey,
        }));
        setGeneratedCopies(prev => [...newCopies, ...prev].slice(0, 10));
        toast({ title: "Copies Geradas!", description: "Novas copies criadas pela IA." });
    },
    onError: (error: Error) => {
        toast({ title: "Erro ao Gerar Copies", description: error.message, variant: "destructive" });
        console.error("Erro na geração de copies:", error);
    },
  });
  
  const generateContentIdeasMutation = useMutation<string[], Error, { baseInfo: BaseGeneratorFormState; purposeConfig?: CopyPurposeConfig }>({
    mutationFn: async ({ baseInfo, purposeConfig }) => {
        if (!genAI) {
            toast({ title: "IA Não Configurada", variant: "destructive" });
            throw new Error("IA não configurada");
        }
        
        let prompt = `Contexto da IA: Você é um Estrategista de Conteúdo Criativo, expert em brainstorming de ideias para marketing digital.
---
INFORMAÇÕES BASE:
- Produto/Serviço Principal: "${baseInfo.product}"
- Público-Alvo Principal: "${baseInfo.audience}"
- Objetivo Geral da Campanha: "${objectiveOptions.find(o => o.value === baseInfo.objective)?.label || baseInfo.objective}"
- Tom da Mensagem Desejado: "${toneOptions.find(t => t.value === baseInfo.tone)?.label || baseInfo.tone}"
---
${purposeConfig ? `FINALIDADE ESPECÍFICA (para guiar as ideias):\n- Nome da Finalidade: "${purposeConfig.label}"\n- Categoria: "${purposeConfig.category}"\n${purposeConfig.description ? `- Descrição: "${purposeConfig.description}"\n` : ''}` : 'FOCO GERAL: Brainstorm de ideias de conteúdo relevantes para o produto e público informados.'}
---
TAREFA:
Gere uma lista de 5 a 7 ideias de conteúdo distintas e criativas que podem ser usadas em diferentes formatos (posts, vídeos, artigos, e-mails, etc.).
As ideias devem ser relevantes para o produto/serviço, público-alvo, objetivo e tom fornecidos. Se uma finalidade específica foi dada, as ideias devem se alinhar a ela.
Responda OBRIGATORIAMENTE em formato JSON VÁLIDO, seguindo o schema abaixo.
Schema JSON esperado: ${JSON.stringify(contentIdeasResponseSchema)}
`;
        
        const response = await genAI.models.generateContent({
            model: "gemini-2.5-flash-preview-04-17",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" }
        });

        let jsonStr = response.text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
          jsonStr = match[2].trim(); 
        }
        const parsedData = JSON.parse(jsonStr) as { contentIdeas: string[] };
        return parsedData.contentIdeas || [];
    },
    onSuccess: (ideas) => {
        setContentIdeas(ideas);
        setIsContentIdeasModalOpen(true);
        toast({ title: "Ideias de Conteúdo Geradas!" });
    },
    onError: (error: Error) => {
        toast({ title: "Erro ao Gerar Ideias", description: error.message, variant: "destructive" });
    },
  });

  const optimizeCopyMutation = useMutation<{ optimizedCopy: string, optimizationNotes?: string }, Error, { copyText: string; baseInfo: BaseGeneratorFormState; purposeConfig?: CopyPurposeConfig }>({
    mutationFn: async ({ copyText, baseInfo, purposeConfig }) => {
        if (!genAI) {
            toast({ title: "IA Não Configurada", variant: "destructive" });
            throw new Error("IA não configurada");
        }
        
        let prompt = `Contexto da IA: Você é um Editor de Copy Sênior, especialista em otimizar textos para máxima clareza, persuasão e conversão.
---
COPY ORIGINAL PARA OTIMIZAÇÃO:
"${copyText}"
---
INFORMAÇÕES BASE (para guiar a otimização):
- Produto/Serviço Principal: "${baseInfo.product}"
- Público-Alvo Principal: "${baseInfo.audience}"
- Objetivo Geral da Campanha: "${objectiveOptions.find(o => o.value === baseInfo.objective)?.label || baseInfo.objective}"
- Tom da Mensagem Desejado: "${toneOptions.find(t => t.value === baseInfo.tone)?.label || baseInfo.tone}"
---
${purposeConfig ? `FINALIDADE ESPECÍFICA DA COPY ORIGINAL:\n- Nome da Finalidade: "${purposeConfig.label}"\n- Categoria: "${purposeConfig.category}"\n` : ''}
---
TAREFA:
Analise a "COPY ORIGINAL" e otimize-a, mantendo a intenção e o contexto fornecidos.
A "optimizedCopy" deve ser uma versão melhorada da original.
Em "optimizationNotes", explique brevemente (1-2 frases) as principais alterações e porquês.
Responda OBRIGATORIAMENTE em formato JSON VÁLIDO, seguindo o schema abaixo.
Schema JSON esperado: ${JSON.stringify(optimizeCopyResponseSchema)}
`;
        
        const response = await genAI.models.generateContent({
            model: "gemini-2.5-flash-preview-04-17",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" }
        });
        
        let jsonStr = response.text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
          jsonStr = match[2].trim();
        }
        const parsedData = JSON.parse(jsonStr) as { optimizedCopy: string, optimizationNotes?: string };
        return parsedData;
    },
    onSuccess: (data) => {
        if (optimizingCopy !== null) {
            const updatedCopies = [...generatedCopies];
            updatedCopies[optimizingCopy.index].mainCopy = data.optimizedCopy;
            if (data.optimizationNotes) {
                 updatedCopies[optimizingCopy.index].notes = (updatedCopies[optimizingCopy.index].notes || "") + `\nOtimização: ${data.optimizationNotes}`;
            }
            setGeneratedCopies(updatedCopies);
            toast({ title: "Copy Otimizada!", description: data.optimizationNotes || "A copy foi melhorada."});
        }
        setOptimizingCopy(null);
    },
    onError: (error: Error) => {
        toast({ title: "Erro ao Otimizar Copy", description: error.message, variant: "destructive" });
        setOptimizingCopy(null);
    },
  });

  const saveCopyMutation = useMutation<SavedCopy, Error, DisplayGeneratedCopy>({
    mutationFn: async (copyItem) => {
      const baseInfo = rhfBaseForm.getValues();
      const payload: Omit<SavedCopy, 'id' | 'userId' | 'createdAt' | 'lastUpdatedAt'> = {
        title: `${currentSpecificConfig?.label || 'Copy Gerada'} - ${baseInfo.product.substring(0,20)}`,
        content: copyItem.mainCopy,
        purposeKey: copyItem.purposeKey,
        launchPhase: selectedLaunchPhase as LaunchPhase, // Ensure this is correctly typed
        details: specificPurposeData,
        baseInfo,
        platform: copyItem.platformSuggestion,
        isFavorite: false,
        tags: [],
        campaignId: null, // TODO: Add campaign selection if needed
        fullGeneratedResponse: copyItem,
      };
      const response = await apiRequest('POST', '/api/copies', payload);
      if (!response.ok) throw new Error('Falha ao salvar a copy');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Copy Salva!" });
      queryClient.invalidateQueries({ queryKey: ['savedCopies'] });
    },
    onError: (error) => {
      toast({ title: "Erro ao Salvar", description: error.message, variant: "destructive" });
    }
  });

  const deleteSavedCopyMutation = useMutation<void, Error, number>({
    mutationFn: (copyId) => apiRequest('DELETE', `/api/copies/${copyId}`),
    onSuccess: () => {
      toast({ title: "Copy Excluída!" });
      queryClient.invalidateQueries({ queryKey: ['savedCopies'] });
    },
    onError: (error) => {
      toast({ title: "Erro ao Excluir", description: error.message, variant: "destructive" });
    }
  });


  const renderSpecificFields = () => {
    if (!selectedCopyPurposeKey || !currentSpecificConfig) return null;
    return currentSpecificConfig.fields.map(field => (
      <FormItem key={field.name}>
        <div className="flex items-center justify-between">
          <FormLabel htmlFor={field.name}>{field.label}{field.required && ' *'}</FormLabel>
          <TooltipProvider><Tooltip><TooltipTrigger type="button" className="cursor-help"><InfoIcon className="h-3.5 w-3.5 text-muted-foreground"/></TooltipTrigger><TooltipContent className="max-w-xs"><p>{field.tooltip}</p></TooltipContent></Tooltip></TooltipProvider>
        </div>
        <FormControl>
          {field.type === 'textarea' ? (
            <Textarea id={field.name} placeholder={field.placeholder} value={String(specificPurposeData[field.name] || '')} onChange={(e) => handleSpecificFieldChange(field.name, e.target.value)} required={field.required} rows={3}/>
          ) : field.type === 'select' && field.options ? (
            <Select value={String(specificPurposeData[field.name] || field.defaultValue || '')} onValueChange={(value) => handleSpecificFieldChange(field.name, value)} required={field.required}>
              <SelectTrigger id={field.name}><SelectValue placeholder={field.placeholder || "Selecione..."} /></SelectTrigger>
              <SelectContent>{field.options.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <Input id={field.name} type={field.type} placeholder={field.placeholder} value={String(specificPurposeData[field.name] || '')} onChange={(e) => handleSpecificFieldChange(field.name, e.target.value)} required={field.required}/>
          )}
        </FormControl>
        <FormMessage /> {/* Para mostrar erros específicos do campo se houver validação */}
      </FormItem>
    ));
  };

  const handleSpecificFieldChange = (name: string, value: string | number | boolean | string[]) => {
    setSpecificPurposeData(prev => ({ ...prev, [name]: value }));
  };

  const handleGenerateCopies = (baseData: BaseGeneratorFormState) => {
    if (!selectedLaunchPhase || !selectedCopyPurposeKey) {
      toast({ title: "Seleção Necessária", description: "Por favor, selecione a fase de lançamento e a finalidade da copy.", variant: "destructive"});
      return;
    }
    const payload: FullGeneratorPayload = {
      ...baseData,
      launchPhase: selectedLaunchPhase as LaunchPhase,
      copyPurposeKey: selectedCopyPurposeKey,
      details: specificPurposeData,
    };
    generateSpecificCopyMutation.mutate(payload);
  };
  
  const handleSaveCopy = (copyItem: DisplayGeneratedCopy) => {
    saveCopyMutation.mutate(copyItem);
  };
  
  const handleDeleteSavedCopy = (copyId: number) => {
    if (window.confirm("Tem certeza que deseja excluir esta copy?")) {
      deleteSavedCopyMutation.mutate(copyId);
    }
  };
  
  const handleGetContentIdeas = async () => {
    const baseInfo = rhfBaseForm.getValues();
    if (!baseInfo.product || !baseInfo.audience) {
        toast({ title: "Informações Base Necessárias", description: "Preencha Produto/Serviço e Público-Alvo para gerar ideias.", variant: "destructive" });
        return;
    }
    const purposeConfig = allCopyPurposesConfig.find(p => p.key === selectedCopyPurposeKey);
    generateContentIdeasMutation.mutate({ baseInfo, purposeConfig });
  };
  
  const handleOptimizeCopy = async (originalCopy: string, index: number) => {
    const baseInfo = rhfBaseForm.getValues();
    if (!originalCopy) {
        toast({ title: "Copy Necessária", description: "Não há copy para otimizar.", variant: "destructive" });
        return;
    }
     if (!baseInfo.product || !baseInfo.audience) {
        toast({ title: "Informações Base Necessárias", description: "Preencha Produto/Serviço e Público-Alvo para otimizar.", variant: "destructive" });
        return;
    }
    setOptimizingCopy({text: originalCopy, index});
    const purposeConfig = allCopyPurposesConfig.find(p => p.key === selectedCopyPurposeKey);
    optimizeCopyMutation.mutate({ copyText: originalCopy, baseInfo, purposeConfig });
  };


  const isLoading = generateSpecificCopyMutation.isPending || isSavedCopiesLoading || generateContentIdeasMutation.isPending || optimizeCopyMutation.isPending;
  const currentSpecificConfig = allCopyPurposesConfig.find(p => p.key === selectedCopyPurposeKey);
  const launchPhaseOptions = Array.from(new Set(allCopyPurposesConfig.map(p => p.phase))).map(phaseValue => ({ value: phaseValue, label: phaseValue === 'pre_launch' ? 'Pré-Lançamento' : phaseValue === 'launch' ? 'Lançamento' : 'Pós-Lançamento' }));
  const purposeOptionsForPhase = selectedLaunchPhase ? allCopyPurposesConfig.filter(p => p.phase === selectedLaunchPhase) : [];

  const copyToClipboard = (text: string, toastFn: Function) => {
    navigator.clipboard.writeText(text).then(() => {
      toastFn({ title: "Copiado!", description: "Texto copiado para a área de transferência." });
    }, (err) => {
      toastFn({ title: "Erro ao Copiar", description: `Não foi possível copiar: ${err}`, variant: "destructive" });
    });
  };
  
  const CopyCardActions = ({ copyText, onSave, onOptimize }: { copyText: string, onSave: () => void, onOptimize: () => void }) => {
    const { toast: localToast } = useToast(); // Use the hook inside the component
    return (
        <div className="flex items-center space-x-1.5 mt-2">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => copyToClipboard(copyText, localToast)} title="Copiar"><CopyIcon className="h-3.5 w-3.5"/></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={onSave} title="Salvar"><Save className="h-3.5 w-3.5"/></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={onOptimize} title="Otimizar com IA"><Sparkles className="h-3.5 w-3.5"/></Button>
        </div>
    );
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center"><Wand2 className="mr-3 h-8 w-8 text-primary"/>Gerador de Copy com IA</h1>
          <p className="text-muted-foreground mt-1">Crie textos persuasivos para todas as fases do seu lançamento.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="neu-card">
            <CardHeader><CardTitle>Informações Base</CardTitle><CardDescription>Forneça os dados principais para a IA.</CardDescription></CardHeader>
            <CardContent>
              <FormProvider {...rhfBaseForm}>
                <Form {...rhfBaseForm}> {/* Use Form aqui */}
                    <form className="space-y-4">
                      <FormField control={rhfBaseForm.control} name="product" render={({ field }) => (<FormItem><FormLabel>Produto/Serviço *</FormLabel><FormControl><Input placeholder="Ex: Curso Online de Marketing Digital" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                      <FormField control={rhfBaseForm.control} name="audience" render={({ field }) => (<FormItem><FormLabel>Público-Alvo *</FormLabel><FormControl><Input placeholder="Ex: Empreendedores Iniciantes" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                      <FormField control={rhfBaseForm.control} name="objective" render={({ field }) => (<FormItem><FormLabel>Objetivo Principal</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{objectiveOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
                      <FormField control={rhfBaseForm.control} name="tone" render={({ field }) => (<FormItem><FormLabel>Tom de Voz</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{toneOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
                    </form>
                </Form>
              </FormProvider>
            </CardContent>
          </Card>

          <Card className="neu-card">
            <CardHeader><CardTitle>Finalidade da Copy</CardTitle><CardDescription>Selecione a fase do lançamento e o tipo de copy.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <FormItem>
                <FormLabel>Fase do Lançamento</FormLabel>
                <Select value={selectedLaunchPhase} onValueChange={v => setSelectedLaunchPhase(v as LaunchPhase | '')}>
                  <SelectTrigger><SelectValue placeholder="Selecione a fase..." /></SelectTrigger>
                  <SelectContent>{launchPhaseOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                </Select>
              </FormItem>
              {selectedLaunchPhase && (
                <FormItem>
                  <FormLabel>Tipo de Copy / Finalidade</FormLabel>
                  <Select value={selectedCopyPurposeKey} onValueChange={setSelectedCopyPurposeKey}>
                    <SelectTrigger><SelectValue placeholder="Selecione a finalidade..." /></SelectTrigger>
                    <SelectContent>
                      {purposeOptionsForPhase.map(opt => <SelectItem key={opt.key} value={opt.key}>{opt.label} ({opt.category})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            </CardContent>
          </Card>
          
          {currentSpecificConfig && currentSpecificConfig.fields.length > 0 && (
            <Card className="neu-card">
              <CardHeader><CardTitle>Detalhes Específicos</CardTitle><CardDescription>{currentSpecificConfig.description || "Preencha os detalhes para esta finalidade."}</CardDescription></CardHeader>
              <CardContent className="space-y-4">{renderSpecificFields()}</CardContent>
            </Card>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={rhfBaseForm.handleSubmit(handleGenerateCopies)} disabled={isLoading || !selectedCopyPurposeKey} className="flex-1 neu-button-primary">
                {isLoading && generateSpecificCopyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}
                Gerar Copies
            </Button>
            <Button variant="outline" onClick={handleGetContentIdeas} disabled={isLoading} className="flex-1 neu-button">
                {isLoading && generateContentIdeasMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Lightbulb className="mr-2 h-4 w-4"/>}
                Gerar Ideias
            </Button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="generated">
            <TabsList className="neu-card-inset p-1 grid w-full grid-cols-2">
              <TabsTrigger value="generated">Copies Geradas</TabsTrigger>
              <TabsTrigger value="saved">Copies Salvas</TabsTrigger>
            </TabsList>
            <TabsContent value="generated" className="space-y-4">
              {generatedCopies.length === 0 && !generateSpecificCopyMutation.isPending && ( <Card className="neu-card text-center py-12"><CardContent><FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50"/><p className="mt-4 text-muted-foreground">Nenhuma copy gerada ainda. Preencha o formulário e clique em "Gerar Copies".</p></CardContent></Card>)}
              {generateSpecificCopyMutation.isPending && (<Card className="neu-card text-center py-12"><CardContent><Loader2 className="mx-auto h-12 w-12 animate-spin text-primary"/><p className="mt-4 text-muted-foreground">Gerando suas copies... Isso pode levar alguns segundos.</p></CardContent></Card>)}
              {generatedCopies.map((copy, index) => (
                <Card key={copy.timestamp.toISOString() + index} className="neu-card">
                    <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base flex items-center justify-between">{copy.platformSuggestion || "Copy Principal"} {copy.notes && <TooltipProvider><Tooltip><TooltipTrigger asChild><InfoIcon className="h-4 w-4 text-muted-foreground cursor-help"/></TooltipTrigger><TooltipContent className="max-w-xs"><p className="text-xs">{copy.notes}</p></TooltipContent></Tooltip></TooltipProvider>}</CardTitle></CardHeader>
                    <CardContent className="px-4 pb-3 space-y-1.5">
                        <div className="p-2.5 bg-muted/50 rounded-md text-sm whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto custom-scrollbar">{copy.mainCopy}</div>
                        <CopyCardActions copyText={copy.mainCopy} onSave={() => handleSaveCopy(copy)} onOptimize={() => handleOptimizeCopy(copy.mainCopy, index)} />
                        {copy.alternativeVariation1 && (<Accordion type="single" collapsible className="w-full text-xs"><AccordionItem value="var1"><AccordionTrigger className="py-1.5 text-muted-foreground hover:text-foreground">Variação 1</AccordionTrigger><AccordionContent className="pt-1 pb-2"><div className="p-2.5 bg-muted/30 rounded-md text-sm whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">{copy.alternativeVariation1}</div><CopyCardActions copyText={copy.alternativeVariation1} onSave={() => handleSaveCopy({...copy, mainCopy: copy.alternativeVariation1!})} onOptimize={() => handleOptimizeCopy(copy.alternativeVariation1!, index)}/></AccordionContent></AccordionItem></Accordion>)}
                        {copy.alternativeVariation2 && (<Accordion type="single" collapsible className="w-full text-xs"><AccordionItem value="var2"><AccordionTrigger className="py-1.5 text-muted-foreground hover:text-foreground">Variação 2</AccordionTrigger><AccordionContent className="pt-1 pb-2"><div className="p-2.5 bg-muted/30 rounded-md text-sm whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">{copy.alternativeVariation2}</div><CopyCardActions copyText={copy.alternativeVariation2} onSave={() => handleSaveCopy({...copy, mainCopy: copy.alternativeVariation2!})} onOptimize={() => handleOptimizeCopy(copy.alternativeVariation2!, index)}/></AccordionContent></AccordionItem></Accordion>)}
                    </CardContent>
                </Card>
              ))}
            </TabsContent>
            <TabsContent value="saved" className="space-y-4">
              <div className="flex items-center space-x-2 mb-4">
                <SearchIcon className="h-5 w-5 text-muted-foreground" />
                <Input placeholder="Buscar copies salvas..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="flex-1"/>
                 <Select value={filterLaunchPhase} onValueChange={(v) => setFilterLaunchPhase(v as LaunchPhase | 'all')}>
                  <SelectTrigger className="w-[180px] text-xs"><SelectValue placeholder="Fase..." /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Todas as Fases</SelectItem>{launchPhaseOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={filterCopyPurpose} onValueChange={setFilterCopyPurpose}>
                  <SelectTrigger className="w-[220px] text-xs"><SelectValue placeholder="Finalidade..." /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Todas Finalidades</SelectItem>{allCopyPurposesConfig.map(opt => <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {isSavedCopiesLoading ? <Card className="neu-card text-center py-12"><CardContent><Loader2 className="mx-auto h-12 w-12 animate-spin text-primary"/><p className="mt-4 text-muted-foreground">Carregando copies salvas...</p></CardContent></Card> :
               savedCopiesList.length === 0 ? <Card className="neu-card text-center py-12"><CardContent><FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50"/><p className="mt-4 text-muted-foreground">Nenhuma copy salva encontrada com os filtros atuais.</p></CardContent></Card> :
               savedCopiesList.map(saved => (
                <Card key={saved.id} className="neu-card">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{saved.title || "Copy Salva"}</CardTitle>
                      <div className="flex items-center space-x-1.5">
                        {saved.platform && <Badge variant="secondary" className="text-xs">{saved.platform}</Badge>}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => copyToClipboard(saved.content, toast)} title="Copiar"><CopyIcon className="h-3.5 w-3.5"/></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive-foreground hover:bg-destructive/10" onClick={() => handleDeleteSavedCopy(saved.id)} title="Excluir"><Trash2 className="h-3.5 w-3.5"/></Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Salva em: {new Date(saved.createdAt).toLocaleDateString('pt-BR')}</p>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="p-2.5 bg-muted/50 rounded-md text-sm whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">{saved.content}</div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {isContentIdeasModalOpen && (
        <Dialog open={isContentIdeasModalOpen} onOpenChange={setIsContentIdeasModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="flex items-center"><Lightbulb className="mr-2 h-5 w-5 text-yellow-400"/>Ideias de Conteúdo Geradas</DialogTitle><DialogDescription>Use estas ideias como inspiração para suas próximas copies ou posts.</DialogDescription></DialogHeader>
            <ScrollArea className="max-h-[60vh] my-4"><ul className="list-disc list-inside space-y-2 pl-2">{contentIdeas.map((idea, i) => <li key={i} className="text-sm">{idea}</li>)}</ul></ScrollArea>
            <DialogFooter><Button onClick={() => setIsContentIdeasModalOpen(false)}>Fechar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
