
// client/src/pages/alerts.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// import { Switch } from '@/components/ui/switch'; // Switch was unused
// import { Separator } from '@/components/ui/separator'; // Separator was unused
import { AlertTriangle, Bell, CheckCircle, Clock, TrendingDown, DollarSign, Users, Settings, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/api'; 
import { useToast } from "@/hooks/use-toast"; 

interface Alert {
  id: number;
  type: 'budget' | 'performance' | 'audience' | 'system';
  title: string;
  message: string;
  severity?: 'low' | 'medium' | 'high' | 'critical'; // Made severity optional as it might not come from API
  isRead: boolean;
  campaignId?: number;
  campaignName?: string; 
  createdAt: string;
  data?: any;
}

export default function AlertsPage() {
  const [selectedTab, setSelectedTab] = useState('active');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: alerts = [], isLoading, error: alertsError, refetch } = useQuery<Alert[]>({
    queryKey: ['alerts'], 
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/alerts'); 
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Falha ao carregar alertas.' }));
        throw new Error(errorData.message || 'Falha ao carregar alertas.');
      }
      return response.json();
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (alertId: number) => {
      // Backend needs to support PUT /api/alerts/:id/read or similar
      // For now, assuming a PATCH request to /api/alerts/:id with isRead: true
      const response = await apiRequest('PATCH', `/api/alerts/${alertId}`, { isRead: true });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Falha ao marcar como lido.' }));
        throw new Error(errorData.message || 'Falha ao marcar como lido.');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast({ title: "Alerta atualizado", description: "O alerta foi marcado como lido." });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  });
  
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      // This endpoint needs to be implemented in the backend
      // For example, PATCH /api/alerts/read-all
      const response = await apiRequest('PATCH', '/api/alerts/read-all', {}); 
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Falha ao marcar todos como lidos.' }));
        throw new Error(errorData.message || 'Falha ao marcar todos como lidos.');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast({ title: "Alertas atualizados", description: "Todos os alertas foram marcados como lidos." });
    },
    onError: (error: Error) => {
      // If the endpoint doesn't exist, this will likely be the error
      toast({ title: "Erro", description: "Funcionalidade 'Marcar Todos Como Lido' ainda não implementada no servidor.", variant: "destructive" });
      console.error("Mark all as read error:", error);
    }
  });


  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'budget': return <DollarSign className="w-5 h-5" />;
      case 'performance': return <TrendingDown className="w-5 h-5" />;
      case 'audience': return <Users className="w-5 h-5" />;
      case 'system': return <Settings className="w-5 h-5" />;
      default: return <Bell className="w-5 h-5" />;
    }
  };

  const getSeverityFromType = (type: Alert['type']): Alert['severity'] => {
    switch(type) {
      case 'budget': return 'high';
      case 'performance': return 'medium';
      case 'audience': return 'low';
      case 'system': return 'low';
      default: return 'low';
    }
  }

  const getSeverityColor = (severity?: Alert['severity'], type?: Alert['type']) => {
    const effectiveSeverity = severity || getSeverityFromType(type!);
    switch (effectiveSeverity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityBadge = (severity?: Alert['severity'], type?: Alert['type']) => {
    const effectiveSeverity = severity || getSeverityFromType(type!);
    switch (effectiveSeverity) {
      case 'critical': return <Badge variant="destructive">Crítico</Badge>;
      case 'high': return <Badge className="bg-orange-500 hover:bg-orange-600 text-white">Alto</Badge>;
      case 'medium': return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-black">Médio</Badge>;
      case 'low': return <Badge className="bg-blue-500 hover:bg-blue-600 text-white">Baixo</Badge>;
      default: return <Badge variant="outline">Baixo</Badge>;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
        return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
    } else if (hours > 0) {
      return `${hours}h atrás`;
    } else if (minutes > 0) {
      return `${minutes}m atrás`;
    } else {
        return "Agora mesmo";
    }
  };

  const activeAlerts = alerts.filter(alertItem => !alertItem.isRead);
  const criticalAlerts = alerts.filter(alertItem => !alertItem.isRead && getSeverityFromType(alertItem.type) === 'critical');

  if (isLoading) {
    return <div className="p-8 text-center"><Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" /> Carregando alertas...</div>;
  }

  if (alertsError) {
    return (
      <div className="p-8 text-center text-destructive">
        <AlertTriangle className="h-12 w-12 mx-auto mb-2" />
        Erro ao carregar alertas: {(alertsError as Error).message}
        <Button onClick={() => refetch()} className="mt-4">Tentar Novamente</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Central de Alertas</h1>
          <p className="text-muted-foreground">
            Monitore eventos importantes das suas campanhas
          </p>
        </div>
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            onClick={() => markAllAsReadMutation.mutate()}
            disabled={markAllAsReadMutation.isPending || activeAlerts.length === 0}
            className="neu-button"
          >
            {markAllAsReadMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" /> }
            Marcar Tudo Lido
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="neu-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas Ativos</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeAlerts.length}</div>
            <p className="text-xs text-muted-foreground">
              Precisam de atenção
            </p>
          </CardContent>
        </Card>
        <Card className="neu-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Críticos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{criticalAlerts.length}</div>
            <p className="text-xs text-muted-foreground">
              Ação imediata
            </p>
          </CardContent>
        </Card>
        <Card className="neu-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Orçamento</CardTitle>
            <DollarSign className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {alerts.filter(a => a.type === 'budget' && !a.isRead).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Alertas de gastos
            </p>
          </CardContent>
        </Card>
        <Card className="neu-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Performance</CardTitle>
            <TrendingDown className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {alerts.filter(a => a.type === 'performance' && !a.isRead).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Quedas detectadas
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="neu-card-inset p-1">
          <TabsTrigger value="active" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md">
            Ativos ({activeAlerts.length})
          </TabsTrigger>
          <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md">
            Todos ({alerts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {activeAlerts.length === 0 ? (
            <Card className="neu-card">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Tudo sob controle!</h3>
                <p className="text-muted-foreground text-center">
                  Não há alertas ativos no momento.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {activeAlerts.map((alertItem) => (
                <Card key={alertItem.id} className={`neu-card border-l-4 ${getSeverityColor(alertItem.severity, alertItem.type).replace('bg-', 'border-l-')}`}>
                  <CardContent className="p-4 md:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start space-x-3 md:space-x-4">
                        <div className={`w-2 h-2 rounded-full mt-1.5 ${getSeverityColor(alertItem.severity, alertItem.type)} flex-shrink-0`}></div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1 md:mb-2">
                            {getAlertIcon(alertItem.type)}
                            <h3 className="font-semibold text-base md:text-lg">{alertItem.title}</h3>
                            {getSeverityBadge(alertItem.severity, alertItem.type)}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2 md:mb-3">
                            {alertItem.message}
                          </p>
                          {alertItem.campaignName && ( 
                            <p className="text-xs text-primary mb-2">
                              Campanha: {alertItem.campaignName} 
                            </p>
                          )}
                          {alertItem.data && (
                            <div className="bg-muted/50 rounded-lg p-2.5 mb-2 md:mb-3 text-xs">
                              {alertItem.type === 'budget' && alertItem.data.budgetUsed && (
                                <p>Orçamento usado: {alertItem.data.budgetUsed}% | Restante: R$ {alertItem.data.remaining}</p>
                              )}
                              {alertItem.type === 'performance' && alertItem.data.currentCTR && (
                                <p>CTR: {alertItem.data.currentCTR}% (Anterior: {alertItem.data.previousCTR}%)</p>
                              )}
                            </div>
                          )}
                          <div className="flex items-center text-xs text-muted-foreground">
                            <Clock className="w-3 h-3 mr-1" />
                            {formatTime(alertItem.createdAt)}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-shrink-0">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => markAsReadMutation.mutate(alertItem.id)}
                          disabled={markAsReadMutation.isPending && markAsReadMutation.variables === alertItem.id}
                          className="neu-button text-xs"
                        >
                          { (markAsReadMutation.isPending && markAsReadMutation.variables === alertItem.id) && <Loader2 className="w-3 h-3 mr-1.5 animate-spin"/>}
                          Marcar Lido
                        </Button>
                        {alertItem.campaignId && ( 
                          <Button size="sm" onClick={() => window.alert(`Ir para campanha ID: ${alertItem.campaignId}`)} className="neu-button text-xs">
                            Ver Campanha
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {alerts.length === 0 ? (
             <Card className="neu-card">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bell className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-lg font-semibold mb-2">Sem Alertas</h3>
                <p className="text-muted-foreground text-center">
                  Não há nenhum alerta registrado no sistema.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
            {alerts.map((alertItem) => (
              <Card key={alertItem.id} className={`neu-card ${alertItem.isRead ? 'opacity-70 bg-card/70' : ''}`}>
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start space-x-3 md:space-x-4">
                      <div className={`w-2 h-2 rounded-full mt-1.5 ${getSeverityColor(alertItem.severity, alertItem.type)} flex-shrink-0`}></div>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1 md:mb-2">
                          {getAlertIcon(alertItem.type)}
                          <h3 className="font-semibold text-base md:text-lg">{alertItem.title}</h3>
                          {getSeverityBadge(alertItem.severity, alertItem.type)}
                          {alertItem.isRead && <Badge variant="outline" className="text-xs">Lido</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2 md:mb-3">
                          {alertItem.message}
                        </p>
                         <div className="flex items-center text-xs text-muted-foreground">
                          <Clock className="w-3 h-3 mr-1" />
                          {formatTime(alertItem.createdAt)}
                        </div>
                      </div>
                    </div>
                    {!alertItem.isRead && (
                         <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => markAsReadMutation.mutate(alertItem.id)}
                          disabled={markAsReadMutation.isPending && markAsReadMutation.variables === alertItem.id}
                          className="neu-button text-xs flex-shrink-0"
                        >
                           { (markAsReadMutation.isPending && markAsReadMutation.variables === alertItem.id) && <Loader2 className="w-3 h-3 mr-1.5 animate-spin"/>}
                          Marcar Lido
                        </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}