
// client/src/pages/landingpages.tsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/api';
import { LandingPage as LpType, InsertLandingPage, Campaign as CampaignType } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { MoreHorizontal, Edit, Bot, Loader2, Link as LinkIcon, Save, ExternalLink, Palette, Zap, Target, Settings, Sparkles, Wand2, Eye, Code, Layers, Rocket } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import GrapesJsEditor from '@/components/grapesjs-editor';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label'; // Added missing import

// Schema atualizado com todas as opções avançadas
const generateLpFormSchema = z.object({
  name: z.string().min(3, "O nome deve ter pelo menos 3 caracteres."),
  campaignId: z.preprocess(
    (val) => {
      if (val === "NONE" || val === "" || val === null || val === undefined) return null;
      const num = parseInt(String(val), 10);
      return isNaN(num) ? undefined : num; // Return undefined if NaN, so optional() handles it, or null if it's explicitly "NONE" etc.
    }, 
    z.number().int().positive().nullable().optional()
  ),
  reference: z.string().url("Por favor, insira uma URL válida.").optional().or(z.literal('')),
  prompt: z.string().min(20, "O prompt deve ter pelo menos 20 caracteres."),
  
  style: z.enum(['modern', 'minimal', 'bold', 'elegant', 'tech', 'startup']).default('modern'),
  colorScheme: z.enum(['dark', 'light', 'gradient', 'neon', 'earth', 'ocean']).default('dark'),
  industry: z.string().optional(),
  targetAudience: z.string().optional(),
  primaryCTA: z.string().default('Começar Agora'),
  secondaryCTA: z.string().default('Saber Mais'),
  includeTestimonials: z.boolean().default(true),
  includePricing: z.boolean().default(false),
  includeStats: z.boolean().default(true),
  includeFAQ: z.boolean().default(true),
  animationsLevel: z.enum(['none', 'subtle', 'moderate', 'dynamic']).default('moderate'),
});

type GenerateLpFormData = z.infer<typeof generateLpFormSchema>;

interface LandingPageOptions {
  style?: 'modern' | 'minimal' | 'bold' | 'elegant' | 'tech' | 'startup';
  colorScheme?: 'dark' | 'light' | 'gradient' | 'neon' | 'earth' | 'ocean';
  industry?: string;
  targetAudience?: string;
  primaryCTA?: string;
  secondaryCTA?: string;
  includeTestimonials?: boolean;
  includePricing?: boolean;
  includeStats?: boolean;
  includeFAQ?: boolean;
  animationsLevel?: 'none' | 'subtle' | 'moderate' | 'dynamic';
}

export default function LandingPages() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewVariations, setPreviewVariations] = useState<string[]>([]);
  const [activePreview, setActivePreview] = useState(0);
  const [showEditor, setShowEditor] = useState(false);
  const [editingLp, setEditingLp] = useState<LpType | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const { data: campaigns = [] } = useQuery<CampaignType[]>({
    queryKey: ['campaignsForLpSelect'],
    queryFn: () => apiRequest('GET', '/api/campaigns').then(res => res.json())
  });

  const { data: landingPages = [] } = useQuery<LpType[]>({
    queryKey: ['landingPages'],
    queryFn: () => apiRequest('GET', '/api/landingpages').then(res => res.json())
  });

  const form = useForm<GenerateLpFormData>({
    resolver: zodResolver(generateLpFormSchema),
    defaultValues: { 
      name: '', 
      campaignId: null, 
      reference: '', 
      prompt: '',
      style: 'modern',
      colorScheme: 'dark',
      industry: '',
      targetAudience: '',
      primaryCTA: 'Começar Agora',
      secondaryCTA: 'Saber Mais',
      includeTestimonials: true,
      includePricing: false,
      includeStats: true,
      includeFAQ: true,
      animationsLevel: 'moderate'
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (data: { prompt: string; reference?: string; options?: LandingPageOptions }) => {
      const response = await apiRequest('POST', '/api/landingpages/preview-advanced', data);
      return response.json();
    },
    onSuccess: (data: { htmlContent: string }) => {
      setPreviewHtml(data.htmlContent);
      setPreviewVariations([]);
      setActivePreview(0);
      toast({ 
        title: "Landing Page Gerada! 🚀", 
        description: "Sua página está pronta para revisão." 
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro na Geração", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const variationsMutation = useMutation({
    mutationFn: async (data: { prompt: string; reference?: string; options?: LandingPageOptions; count?: number }) => {
      const response = await apiRequest('POST', '/api/landingpages/generate-variations', data);
      return response.json();
    },
    onSuccess: (data: { variations: string[] }) => {
      setPreviewVariations(data.variations);
      setPreviewHtml(data.variations[0] || null);
      setActivePreview(0);
      toast({ 
        title: `${data.variations.length} Variações Criadas! ✨`, 
        description: "Explore as diferentes opções de design." 
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao Gerar Variações", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const saveAndEditMutation = useMutation({
    mutationFn: (data: { name: string; campaignId: number | null; grapesJsData: { html: string; css: string }; generationOptions?: LandingPageOptions }) =>
      apiRequest('POST', '/api/landingpages', data).then(res => res.json()),
    onSuccess: (savedLp: LpType) => {
      toast({ 
        title: "Página Salva com Sucesso! 💾", 
        description: "Abrindo o editor visual..." 
      });
      queryClient.invalidateQueries({ queryKey: ['landingPages'] });
      setEditingLp(savedLp);
      setShowEditor(true);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao Salvar", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
  
  const updateLpMutation = useMutation({
    mutationFn: async (data: { id: number, grapesJsData: any }) => {
      return apiRequest('PUT', `/api/landingpages/${data.id}`, { grapesJsData: data.grapesJsData });
    },
    onSuccess: () => {
      toast({ 
        title: "Alterações Salvas! ✅", 
        description: "Sua landing page foi atualizada com sucesso." 
      });
      queryClient.invalidateQueries({ queryKey: ['landingPages'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao Salvar Alterações", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  const optimizeMutation = useMutation({
    mutationFn: async (data: { html: string; goals: string[] }) => {
      const response = await apiRequest('POST', '/api/landingpages/optimize', data);
      return response.json();
    },
    onSuccess: (data: { htmlContent: string }) => {
      setPreviewHtml(data.htmlContent);
      toast({ 
        title: "Página Otimizada! ⚡", 
        description: "Aplicamos melhorias para aumentar a conversão." 
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro na Otimização", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const onGenerateSubmit = (data: GenerateLpFormData) => {
    setPreviewHtml(null);
    setPreviewVariations([]);
    
    const options: LandingPageOptions = {
      style: data.style,
      colorScheme: data.colorScheme,
      industry: data.industry,
      targetAudience: data.targetAudience,
      primaryCTA: data.primaryCTA,
      secondaryCTA: data.secondaryCTA,
      includeTestimonials: data.includeTestimonials,
      includePricing: data.includePricing,
      includeStats: data.includeStats,
      includeFAQ: data.includeFAQ,
      animationsLevel: data.animationsLevel,
    };

    previewMutation.mutate({ 
      prompt: data.prompt, 
      reference: data.reference,
      options 
    });
  };

  const onGenerateVariations = () => {
    const data = form.getValues();
    if (!data.prompt) {
      toast({ title: "Prompt necessário", description: "Por favor, preencha a descrição da página.", variant: "destructive"});
      return;
    }
    const options: LandingPageOptions = {
      style: data.style,
      colorScheme: data.colorScheme,
      industry: data.industry,
      targetAudience: data.targetAudience,
      primaryCTA: data.primaryCTA,
      secondaryCTA: data.secondaryCTA,
      includeTestimonials: data.includeTestimonials,
      includePricing: data.includePricing,
      includeStats: data.includeStats,
      includeFAQ: data.includeFAQ,
      animationsLevel: data.animationsLevel,
    };

    variationsMutation.mutate({ 
      prompt: data.prompt, 
      reference: data.reference,
      options,
      count: 3 
    });
  };

  const handleOptimize = () => {
    const currentHtml = getCurrentPreview();
    if (!currentHtml) return;
    
    optimizeMutation.mutate({
      html: currentHtml,
      goals: ['conversion', 'performance', 'accessibility']
    });
  };
  
  const handleEditClick = () => {
    const currentHtml = getCurrentPreview();
    if (!currentHtml) return;
    
    const formData = form.getValues();
    
    const generationOptions: LandingPageOptions = {
      style: formData.style,
      colorScheme: formData.colorScheme,
      industry: formData.industry,
      targetAudience: formData.targetAudience,
      primaryCTA: formData.primaryCTA,
      secondaryCTA: formData.secondaryCTA,
      includeTestimonials: formData.includeTestimonials,
      includePricing: formData.includePricing,
      includeStats: formData.includeStats,
      includeFAQ: formData.includeFAQ,
      animationsLevel: formData.animationsLevel,
    };

    saveAndEditMutation.mutate({
      name: formData.name,
      campaignId: formData.campaignId || null,
      grapesJsData: { html: currentHtml, css: '' }, 
      generationOptions: generationOptions, 
    });
  };

  const handleOpenInNewTab = () => {
    const currentHtml = getCurrentPreview();
    if (currentHtml) {
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(currentHtml);
        newWindow.document.close();
      } else {
        toast({ 
          title: "Erro", 
          description: "Não foi possível abrir a nova aba. Verifique se o seu navegador está bloqueando pop-ups.", 
          variant: "destructive" 
        });
      }
    }
  };

  const handleSaveFromEditor = (id: number, data: any) => {
    updateLpMutation.mutate({ id, grapesJsData: data });
  };

  const handleEditExistingLp = (lp: LpType) => {
    setEditingLp(lp);
    setShowEditor(true);
  };

  const getCurrentPreview = () => {
    return previewVariations.length > 0 ? previewVariations[activePreview] : previewHtml;
  };

  const isGenerating = previewMutation.isPending || variationsMutation.isPending;

  if (showEditor && editingLp) {
    return (
      <GrapesJsEditor 
        initialData={editingLp.grapesJsData as any} 
        onSave={(data) => handleSaveFromEditor(editingLp.id, data)}
        onBack={() => {
          setShowEditor(false);
          setEditingLp(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900 dark:to-gray-900">
      <div className="container mx-auto p-4 md:p-6 space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Wand2 className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              AI Landing Page Generator
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Crie landing pages profissionais em segundos com nossa IA avançada. 
            Design moderno, alta conversão e totalmente responsivo.
          </p>
        </div>

        {/* Estatísticas Rápidas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="text-center">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-primary">{landingPages.length}</div>
              <div className="text-sm text-muted-foreground">Páginas Criadas</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">98%</div>
              <div className="text-sm text-muted-foreground">Taxa de Sucesso</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">6</div>
              <div className="text-sm text-muted-foreground">Estilos Únicos</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-purple-600">AI</div>
              <div className="text-sm text-muted-foreground">Powered</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
          {/* Formulário de Configuração */}
          <div className="space-y-6">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="text-primary" />
                  Configuração da Landing Page
                </CardTitle>
                <CardDescription>
                  Configure todos os detalhes da sua página para obter o melhor resultado
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onGenerateSubmit)} className="space-y-6">
                    <Tabs defaultValue="basic" className="space-y-4">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="basic">Básico</TabsTrigger>
                        <TabsTrigger value="advanced">Avançado</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="basic" className="space-y-4">
                        <FormField 
                          control={form.control} 
                          name="name" 
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nome da Página *</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Ex: Lançamento do Produto Y" 
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )} 
                        />

                        <FormField 
                          control={form.control} 
                          name="campaignId" 
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Campanha</FormLabel>
                              <Select 
                                onValueChange={(value) => field.onChange(value === "NONE" ? null : parseInt(value))} 
                                defaultValue={field.value === null ? "NONE" : String(field.value)}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecione uma campanha" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="NONE">Nenhuma campanha</SelectItem>
                                  {campaigns.map(c => (
                                    <SelectItem key={c.id} value={String(c.id)}>
                                      {c.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} 
                        />

                        <FormField 
                          control={form.control} 
                          name="prompt" 
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Descrição da Página *</FormLabel>
                              <FormControl>
                                <Textarea 
                                  placeholder="Descreva detalhadamente sua landing page: objetivo, público-alvo, principais seções, produtos/serviços, tom de voz, etc..."
                                  rows={6}
                                  className="resize-none"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                Seja específico para obter melhores resultados (mínimo 20 caracteres)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )} 
                        />

                        <FormField 
                          control={form.control} 
                          name="reference" 
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>URL de Referência (Opcional)</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="https://exemplo.com/inspiracao"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                URL de uma página que serve como inspiração visual
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )} 
                        />
                      </TabsContent>

                      <TabsContent value="advanced" className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <FormField 
                            control={form.control} 
                            name="style" 
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Estilo Visual</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="modern">Moderno</SelectItem>
                                    <SelectItem value="minimal">Minimalista</SelectItem>
                                    <SelectItem value="bold">Ousado</SelectItem>
                                    <SelectItem value="elegant">Elegante</SelectItem>
                                    <SelectItem value="tech">Tecnológico</SelectItem>
                                    <SelectItem value="startup">Startup</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )} 
                          />

                          <FormField 
                            control={form.control} 
                            name="colorScheme" 
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Esquema de Cores</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="dark">Escuro</SelectItem>
                                    <SelectItem value="light">Claro</SelectItem>
                                    <SelectItem value="gradient">Gradiente</SelectItem>
                                    <SelectItem value="neon">Neon</SelectItem>
                                    <SelectItem value="earth">Terra</SelectItem>
                                    <SelectItem value="ocean">Oceano</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )} 
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <FormField 
                            control={form.control} 
                            name="industry" 
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Indústria/Setor</FormLabel>
                                <FormControl>
                                  <Input placeholder="Ex: SaaS, E-commerce, Saúde" {...field} />
                                </FormControl>
                              </FormItem>
                            )} 
                          />

                          <FormField 
                            control={form.control} 
                            name="targetAudience" 
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Público-Alvo</FormLabel>
                                <FormControl>
                                  <Input placeholder="Ex: Gestores de TI, Empreendedores" {...field} />
                                </FormControl>
                              </FormItem>
                            )} 
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <FormField 
                            control={form.control} 
                            name="primaryCTA" 
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>CTA Primário</FormLabel>
                                <FormControl>
                                  <Input placeholder="Ex: Teste Grátis por 14 Dias" {...field} />
                                </FormControl>
                              </FormItem>
                            )} 
                          />

                          <FormField 
                            control={form.control} 
                            name="secondaryCTA" 
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>CTA Secundário</FormLabel>
                                <FormControl>
                                  <Input placeholder="Ex: Ver Demonstração" {...field} />
                                </FormControl>
                              </FormItem>
                            )} 
                          />
                        </div>

                        <FormField 
                          control={form.control} 
                          name="animationsLevel" 
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nível de Animações</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">Nenhuma</SelectItem>
                                  <SelectItem value="subtle">Sutil</SelectItem>
                                  <SelectItem value="moderate">Moderada</SelectItem>
                                  <SelectItem value="dynamic">Dinâmica</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )} 
                        />

                        <Separator />

                        <div className="space-y-3">
                          <div className="text-sm font-medium">Seções Incluídas</div>
                          <div className="grid grid-cols-2 gap-4">
                            <FormField 
                              control={form.control} 
                              name="includeTestimonials" 
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-2">
                                  <FormControl>
                                    <Switch 
                                      checked={field.value} 
                                      onCheckedChange={field.onChange}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm">Depoimentos</FormLabel>
                                </FormItem>
                              )} 
                            />

                            <FormField 
                              control={form.control} 
                              name="includePricing" 
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-2">
                                  <FormControl>
                                    <Switch 
                                      checked={field.value} 
                                      onCheckedChange={field.onChange}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm">Preços</FormLabel>
                                </FormItem>
                              )} 
                            />

                            <FormField 
                              control={form.control} 
                              name="includeStats" 
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-2">
                                  <FormControl>
                                    <Switch 
                                      checked={field.value} 
                                      onCheckedChange={field.onChange}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm">Estatísticas</FormLabel>
                                </FormItem>
                              )} 
                            />
                            
                            <FormField 
                              control={form.control} 
                              name="includeFAQ" 
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-2">
                                  <FormControl>
                                    <Switch 
                                      checked={field.value} 
                                      onCheckedChange={field.onChange}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm">FAQ</FormLabel>
                                </FormItem>
                              )} 
                            />
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>

                    <Button type="submit" className="w-full" disabled={isGenerating}>
                      {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Gerar Landing Page
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {/* Páginas Salvas */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="text-purple-500" />
                  Páginas Salvas
                </CardTitle>
                <CardDescription>
                  Gerencie suas landing pages existentes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {landingPages.length > 0 ? (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {landingPages.map(lp => (
                      <div key={lp.id} className="flex items-center justify-between p-3 border rounded-md">
                        <div>
                          <p className="font-medium">{lp.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {lp.slug} - {lp.status}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => window.open(`/landingpages/slug/${lp.slug}`, '_blank')}>
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleEditExistingLp(lp)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma landing page salva ainda.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Área de Preview */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="text-green-500" />
                  Preview da Landing Page
                </CardTitle>
                <CardDescription>
                  Visualize a página gerada pela IA.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="aspect-video bg-muted/50 rounded-md overflow-hidden border relative">
                  {isGenerating && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm z-10">
                      <Loader2 className="h-10 w-10 text-primary animate-spin mb-3" />
                      <p className="text-sm text-primary-foreground">Gerando... isso pode levar um momento.</p>
                    </div>
                  )}
                  {!isGenerating && !previewHtml && !previewVariations.length && (
                     <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                        <Palette className="h-12 w-12 text-muted-foreground mb-3 opacity-70"/>
                        <p className="text-sm text-muted-foreground">Preencha o formulário e clique em "Gerar" para ver o preview aqui.</p>
                     </div>
                  )}
                  {(previewHtml || previewVariations.length > 0) && (
                    <iframe
                      srcDoc={getCurrentPreview() || ''}
                      title="Preview da Landing Page"
                      className="w-full h-full border-0"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  )}
                </div>
                {(previewHtml || previewVariations.length > 0) && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={handleEditClick} disabled={saveAndEditMutation.isPending}>
                      {saveAndEditMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Code className="mr-2 h-4 w-4" />}
                      Salvar e Editar no Builder
                    </Button>
                    <Button variant="outline" onClick={onGenerateVariations} disabled={variationsMutation.isPending}>
                      {variationsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Layers className="mr-2 h-4 w-4" />}
                      Gerar Variações
                    </Button>
                    <Button variant="outline" onClick={handleOptimize} disabled={optimizeMutation.isPending}>
                      {optimizeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                      Otimizar com IA
                    </Button>
                    <Button variant="outline" onClick={handleOpenInNewTab}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Abrir em Nova Aba
                    </Button>
                  </div>
                )}
                {previewVariations.length > 0 && (
                  <div className="mt-4">
                    <Label className="text-sm font-medium">Variações:</Label>
                    <div className="flex gap-2 mt-1">
                      {previewVariations.map((