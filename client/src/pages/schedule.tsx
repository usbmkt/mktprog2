import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, Loader2, AlertTriangle, Plus, MoreVertical, Edit, Trash2, GanttChartSquare, Download, Minus } from 'lucide-react';
import { FullCampaignData, CampaignTask as CampaignTaskType, InsertCampaignPhase } from '@shared/schema';
import { format, parseISO, differenceInDays, addDays, subDays, isValid, eachDayOfInterval, isSaturday, isSunday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import TaskForm from '@/components/task-form';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Chart from 'chart.js/auto';
import LogoPng from '@/img/logo.png';

interface PhaseState {
  id: number;
  name: string;
  duration: number;
  order: number;
}

const getPhaseColor = (index: number, opacity: number = 1) => {
  const colors = [
    '59, 130, 246',   // blue-500
    '139, 92, 246',   // violet-500
    '239, 68, 68',    // red-500
    '249, 115, 22',   // orange-500
    '20, 184, 166',   // teal-500
    '234, 179, 8',    // yellow-500
    '236, 72, 153',   // pink-500
    '132, 204, 22'    // lime-500
  ];
  return `rgba(${colors[index % colors.length]}, ${opacity})`;
};

const getStatusBadgeConfig = (status: CampaignTaskType['status']) => {
    const statusConfig = {
      pending: { label: 'Pendente', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
      in_progress: { label: 'Em Progresso', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
      completed: { label: 'Concluído', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
      on_hold: { label: 'Em Espera', className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
    };
    return statusConfig[(status as keyof typeof statusConfig)] || statusConfig.pending;
};

const getWeekdayAbbreviation = (date: Date): string => {
    const day = date.getDay(); 
    const abbreviations = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    return abbreviations[day];
};

const ModernGanttChart = ({ campaign, calculatedPhases }: { campaign: FullCampaignData, calculatedPhases: any[] }) => {
    const ganttContainerRef = useRef<HTMLDivElement>(null);
    const timelineHeaderRef = useRef<HTMLDivElement>(null);
    const taskAreaRef = useRef<HTMLDivElement>(null);
    const taskListRef = useRef<HTMLDivElement>(null);

    const DAY_WIDTH = 40;
    const PHASE_HEADER_HEIGHT = 45;
    const TASK_ROW_HEIGHT = 50;

    const { startDate, totalDays, days } = useMemo(() => {
        const allDates = calculatedPhases.flatMap(p => [p.startDate, p.endDate]).filter(d => d && isValid(d));
        if (allDates.length === 0) {
            const today = new Date();
            const start = subDays(today, 15);
            const end = addDays(today, 15);
            return { startDate: start, endDate: end, totalDays: 31, days: eachDayOfInterval({start, end}) };
        }
        const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
        const finalStartDate = subDays(minDate, 3);
        const finalEndDate = addDays(maxDate, 3);
        const dayIntervals = eachDayOfInterval({ start: finalStartDate, end: finalEndDate });
        return { startDate: finalStartDate, endDate: finalEndDate, totalDays: dayIntervals.length, days: dayIntervals };
    }, [calculatedPhases]);

    const todayPosition = useMemo(() => differenceInDays(new Date(), startDate), [startDate]);
    const sortedPhases = useMemo(() => (campaign.phases || []).sort((a,b) => a.order - b.order), [campaign.phases]);
    
    const itemPositions = useMemo(() => {
        let topOffset = 0;
        const positions: Record<string, { top: number, height: number }> = {};
        sortedPhases.forEach(phase => {
            positions[`phase-${phase.id}`] = { top: topOffset, height: PHASE_HEADER_HEIGHT };
            topOffset += PHASE_HEADER_HEIGHT;
            const taskCount = phase.tasks?.length || 0;
            const phaseContentHeight = taskCount > 0 ? taskCount * TASK_ROW_HEIGHT : TASK_ROW_HEIGHT;
            (phase.tasks || []).forEach((task, index) => {
                positions[`task-${task.id}`] = { top: topOffset + (index * TASK_ROW_HEIGHT), height: TASK_ROW_HEIGHT };
            });
            topOffset += phaseContentHeight;
        });
        return { positions, totalHeight: topOffset };
    }, [sortedPhases]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (timelineHeaderRef.current) timelineHeaderRef.current.scrollLeft = e.currentTarget.scrollLeft;
        if (taskListRef.current) taskListRef.current.scrollTop = e.currentTarget.scrollTop;
    };

    return (
        <TooltipProvider>
            <div id="gantt-chart-container-inner" ref={ganttContainerRef} className="neu-card p-0 h-[600px] flex overflow-hidden">
                <div className="w-[300px] shrink-0 z-20 bg-card flex flex-col border-r border-border">
                    <div className="h-[80px] flex-shrink-0 border-b border-border flex items-center p-4 font-medium text-foreground text-sm bg-muted/50">
                        Fases / Tarefas
                    </div>
                    <div ref={taskListRef} className="overflow-y-hidden flex-grow custom-scrollbar">
                        <div className="relative" style={{ height: `${itemPositions.totalHeight}px`}}>
                            {sortedPhases.map((phase, phaseIndex) => (
                                <React.Fragment key={`name-group-${phase.id}`}>
                                    <div className="h-[45px] flex items-center p-4 font-medium text-foreground text-sm border-b border-border bg-card-foreground/5" style={{ top: `${itemPositions.positions[`phase-${phase.id}`].top}px`, position: 'absolute', width: '100%' }}>
                                        <div className="w-3 h-3 rounded-full mr-3 flex-shrink-0" style={{backgroundColor: getPhaseColor(phaseIndex, 1)}}></div>
                                        <span className="truncate">{phase.name}</span>
                                    </div>
                                    {(phase.tasks || []).map((task) => (
                                        <div key={`name-${task.id}`} className="h-[50px] flex items-center p-4 text-sm text-muted-foreground truncate border-b border-border/50 hover:bg-accent/50" style={{ top: `${itemPositions.positions[`task-${task.id}`].top}px`, position: 'absolute', width: '100%' }}>
                                            <div className="w-2 h-2 rounded-full bg-muted-foreground/50 mr-3 flex-shrink-0"></div>
                                            {task.name}
                                        </div>
                                    ))}
                                    {(phase.tasks?.length || 0) === 0 && (
                                        <div className="h-[50px] border-b border-border/50" style={{ top: `${itemPositions.positions[`phase-${phase.id}`].top + PHASE_HEADER_HEIGHT}px`, position: 'absolute', width: '100%' }}>
                                            <div className="h-full flex items-center p-4 text-muted-foreground text-sm italic">Nenhuma tarefa</div>
                                        </div>
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>
                <div ref={taskAreaRef} onScroll={handleScroll} className="flex-grow overflow-auto custom-scrollbar bg-background">
                    <div className="relative" style={{ width: `${totalDays * DAY_WIDTH}px`}}>
                        <div ref={timelineHeaderRef} className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10 grid h-[80px] border-b border-border" style={{ width: `${totalDays * DAY_WIDTH}px`, gridTemplateColumns: `repeat(${totalDays}, minmax(${DAY_WIDTH}px, 1fr))` }}>
                            {days.map((day, index) => (
                                <div key={index} className={cn("text-center py-3 border-l border-border/50 text-xs flex flex-col justify-center", (isSaturday(day) || isSunday(day)) && 'bg-accent/30')}>
                                    <div className="font-medium text-muted-foreground text-[10px] mb-1">{getWeekdayAbbreviation(day)}</div>
                                    <div className="font-bold text-foreground text-sm">{format(day, 'd')}</div>
                                    <div className="text-muted-foreground text-[10px] mt-1">{format(day, 'MMM', { locale: ptBR })}</div>
                                </div>
                            ))}
                        </div>
                        <div className="absolute inset-0 top-[80px]" style={{height: `${itemPositions.totalHeight}px`}}>
                            <div className="absolute inset-0 grid -z-10" style={{gridTemplateColumns: `repeat(${totalDays}, minmax(${DAY_WIDTH}px, 1fr))`}}>
                                {days.map((_, index) => ( <div key={`bg-${index}`} className={cn("h-full border-l border-border/50", (isSaturday(days[index]) || isSunday(days[index])) && 'bg-accent/20')}></div> ))}
                            </div>
                            {todayPosition >= 0 && todayPosition < totalDays && (
                                <div className="absolute top-0 h-full pointer-events-none z-10" style={{ left: `${todayPosition * DAY_WIDTH + (DAY_WIDTH / 2)}px` }}><div className="w-0.5 h-full bg-destructive"></div><div className="absolute -top-[70px] left-1/2 -translate-x-1/2 bg-destructive text-white text-[10px] font-bold px-2 py-1 rounded-full z-20">Hoje</div></div>
                            )}
                            {sortedPhases.map((phase, pIndex) => {
                                const phaseTimeline = calculatedPhases.find(p => p.id === phase.id);
                                if (!phaseTimeline || !phaseTimeline.startDate || !phaseTimeline.endDate) return null;
                                const phaseStartOffset = differenceInDays(phaseTimeline.startDate, startDate);
                                const phaseDurationDays = Math.max(1, differenceInDays(phaseTimeline.endDate, phaseTimeline.startDate) + 1);
                                const phasePos = itemPositions.positions[`phase-${phase.id}`];
                                return (
                                <React.Fragment key={`bar-group-${phase.id}`}>
                                    <Tooltip><TooltipTrigger asChild><div className="absolute h-full border-l-4 border-opacity-60" style={{ top: `${phasePos.top}px`, height: `${phasePos.height}px`, left: `${phaseStartOffset * DAY_WIDTH}px`, width: `${phaseDurationDays * DAY_WIDTH}px`, padding: '12px 4px', borderLeftColor: getPhaseColor(pIndex, 1) }}><div className="h-full w-full rounded-md opacity-30" style={{backgroundColor: getPhaseColor(pIndex, 0.6)}}></div></div></TooltipTrigger><TooltipContent><p>{format(phaseTimeline.startDate, 'dd/MM/yy')} a {format(phaseTimeline.endDate, 'dd/MM/yy')} ({phaseDurationDays} dias)</p></TooltipContent></Tooltip>
                                    {(phase.tasks || []).map(task => {
                                        if (!task.startDate || !task.endDate || !isValid(parseISO(task.startDate)) || !isValid(parseISO(task.endDate))) return null;
                                        const taskStart = parseISO(task.startDate);
                                        const taskEnd = parseISO(task.endDate);
                                        const startOffset = differenceInDays(taskStart, startDate);
                                        const durationDays = Math.max(1, differenceInDays(taskEnd, taskStart) + 1);
                                        const taskPos = itemPositions.positions[`task-${task.id}`];
                                        return (
                                            <div key={`bar-${task.id}`} className="absolute" style={{ top: `${taskPos.top}px`, height: `${taskPos.height}px`, left: `${startOffset * DAY_WIDTH}px`, width: `${durationDays * DAY_WIDTH}px`, padding: '12px 4px' }}>
                                                <Tooltip><TooltipTrigger asChild><div className="h-full w-full rounded-full flex items-center justify-start px-3 text-white text-xs shadow-lg border border-opacity-20 border-white" style={{backgroundColor: getPhaseColor(pIndex, 0.9)}}><div className="w-2 h-2 rounded-full bg-white bg-opacity-80 mr-2 flex-shrink-0"></div><span className="truncate font-medium">{task.name}</span></div></TooltipTrigger><TooltipContent><div className="text-center"><p className="font-medium">{task.name}</p><p className="text-xs">{format(taskStart, 'dd/MM/yy')} - {format(taskEnd, 'dd/MM/yy')}</p><p className="text-xs text-muted-foreground">{task.assignee?.username || 'Não atribuído'}</p></div></TooltipContent></Tooltip>
                                            </div>
                                        );
                                    })}
                                </React.Fragment>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
};

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<{ isOpen: boolean; phaseId?: number; task?: CampaignTaskType; }>({ isOpen: false });
  const [phasesState, setPhasesState] = useState<PhaseState[]>([]);
  const [eventDate, setEventDate] = useState<Date>(new Date());
  const [isExporting, setIsExporting] = useState(false);

  const { data: campaigns, isLoading: isLoadingCampaigns } = useQuery<FullCampaignData[]>({
    queryKey: ['campaignsListForSchedule'],
    queryFn: async () => apiRequest('GET', '/api/campaigns').then(res => res.json()),
  });

  const { data: campaign, isLoading: isLoadingCampaignDetails, error } = useQuery<FullCampaignData>({
    queryKey: ['campaignSchedule', selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      if (!selectedCampaignId) return null;
      const res = await apiRequest('GET', `/api/campaigns/${selectedCampaignId}`);
      if (!res.ok) throw new Error('Campanha não encontrada.');
      return res.json();
    },
  });

  useEffect(() => {
    if (campaign?.phases) {
        const eventPhase = campaign.phases.find(p => p.name.toLowerCase() === 'evento');
        if (eventPhase?.startDate && isValid(parseISO(String(eventPhase.startDate)))) { setEventDate(parseISO(String(eventPhase.startDate)));
        } else if (campaign.startDate && isValid(parseISO(String(campaign.startDate)))) { setEventDate(parseISO(String(campaign.startDate)));
        } else { setEventDate(new Date()); }
        setPhasesState(campaign.phases.map(p => ({ id: p.id, name: p.name, duration: (p.startDate && p.endDate && isValid(parseISO(String(p.startDate))) && isValid(parseISO(String(p.endDate)))) ? differenceInDays(parseISO(String(p.endDate)), parseISO(String(p.startDate))) + 1 : 7, order: p.order, })).sort((a,b) => (a.order ?? 0) - (b.order ?? 0)));
    } else { setPhasesState([]); }
  }, [campaign]);

  const timeline = useMemo(() => {
    if (!selectedCampaignId || phasesState.length === 0 || !eventDate || !isValid(eventDate)) return { calculatedPhases: [] };
    const eventPhaseIndex = phasesState.findIndex(p => p.name.toLowerCase() === 'evento');
    if (eventPhaseIndex === -1) return { calculatedPhases: [] };
    let currentDate = new Date(eventDate);
    const tempPhases: (Omit<InsertCampaignPhase, 'campaignId'> & { duration: number })[] = [];
    for (let i = eventPhaseIndex; i < phasesState.length; i++) {
        const phase = phasesState[i];
        const startDate = new Date(currentDate);
        const endDate = addDays(startDate, Math.max(0, phase.duration - 1));
        tempPhases.push({ id: phase.id, name: phase.name, order: phase.order, startDate, endDate, duration: phase.duration });
        currentDate = addDays(endDate, 1);
    }
    currentDate = subDays(new Date(eventDate), 1);
    for (let i = eventPhaseIndex - 1; i >= 0; i--) {
        const phase = phasesState[i];
        const endDate = new Date(currentDate);
        const startDate = subDays(endDate, Math.max(0, phase.duration - 1));
        tempPhases.unshift({ id: phase.id, name: phase.name, order: phase.order, startDate, endDate, duration: phase.duration });
        currentDate = subDays(startDate, 1);
    }
    return { calculatedPhases: tempPhases.sort((a,b) => (a.order ?? 0) - (b.order ?? 0)) };
  }, [phasesState, eventDate, selectedCampaignId]);

  const updateCampaignMutation = useMutation({
    mutationFn: (data: { phases: Omit<InsertCampaignPhase, 'campaignId' | 'name' | 'order'>[] }) => apiRequest('PUT', `/api/campaigns/${selectedCampaignId}`, data),
    onSuccess: () => { toast({ title: "Cronograma Atualizado!" }); queryClient.invalidateQueries({ queryKey: ['campaignSchedule', selectedCampaignId] }); },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const handleSaveChanges = () => { if (!selectedCampaignId) return; updateCampaignMutation.mutate({ phases: timeline.calculatedPhases as any }); };
  const handlePhaseDurationChange = (id: number, duration: number) => { setPhasesState(currentPhases => currentPhases.map(p => p.id === id ? { ...p, duration: Math.max(1, duration) } : p)); };

  const deleteMutation = useMutation({
    mutationFn: (taskId: number) => apiRequest('DELETE', `/api/tasks/${taskId}`),
    onSuccess: () => { toast({ title: "Tarefa excluída!"}); queryClient.invalidateQueries({ queryKey: ['campaignSchedule', selectedCampaignId] }); },
    onError: (err: Error) => toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" })
  });

  const handleDeleteTask = (taskId: number) => { if (window.confirm("Tem certeza que deseja excluir esta tarefa?")) { deleteMutation.mutate(taskId); } };
  
  const getChartImage = async (chartConfig: any, chartType: 'doughnut' | 'bar'): Promise<string> => {
    return new Promise((resolve) => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 450; tempCanvas.height = 300;
        document.body.appendChild(tempCanvas);
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) { document.body.removeChild(tempCanvas); resolve(''); return; }
        new Chart(ctx, {
            type: chartType, data: chartConfig,
            options: { responsive: false, animation: { duration: 0 }, plugins: { legend: { display: true, position: 'bottom', labels: {font: {size: 10}} }, title: { display: false } } }
        });
        setTimeout(() => { resolve(tempCanvas.toDataURL('image/png', 1.0)); document.body.removeChild(tempCanvas); }, 500);
    });
  };
  
  const handleExportToPdf = async () => {
    if (!campaign) return;
    setIsExporting(true);
    toast({ title: 'Gerando PDF...', description: 'Isso pode levar alguns segundos.' });
    try {
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const addHeaderAndFooter = async () => {
            const logoDataUrl = await new Promise<string>(resolve => { fetch(LogoPng).then(res => res.blob()).then(blob => {const reader = new FileReader(); reader.onloadend = () => resolve(reader.result as string); reader.readAsDataURL(blob);});});
            const pageCount = doc.getNumberOfPages();
            const margin = 15;
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                // Header
                if (logoDataUrl) {
                    const imgProps = doc.getImageProperties(logoDataUrl);
                    const imgWidth = 30;
                    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
                    doc.addImage(logoDataUrl, 'PNG', margin, 10, imgWidth, imgHeight);
                }
                doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
                doc.text('RELATÓRIO DE CRONOGRAMA', doc.internal.pageSize.width - margin, 15, { align: 'right' });
                doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
                doc.text(campaign.name, doc.internal.pageSize.width - margin, 22, { align: 'right' });
                doc.text(`Data de Emissão: ${format(new Date(), 'dd/MM/yyyy')}`, doc.internal.pageSize.width - margin, 27, { align: 'right' });

                // Footer
                doc.setFontSize(8); doc.setTextColor(150,150,150);
                doc.text(`www.usb.mkt.br`, margin, doc.internal.pageSize.height - 10);
                doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - margin, doc.internal.pageSize.height - 10, { align: 'right' });
            }
        };

        // --- PAGE 1: OVERVIEW ---
        doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
        doc.text("Visão Geral do Cronograma", 15, 45);

        const allTasks = (campaign.phases || []).flatMap(p => p.tasks || []);
        const statusCounts = allTasks.reduce((acc, task) => { acc[task.status] = (acc[task.status] || 0) + 1; return acc; }, {} as Record<string, number>);
        const phaseCounts = (campaign.phases || []).map(p => ({ name: p.name, count: (p.tasks || []).length }));
        
        const statusChartData = { labels: Object.keys(statusCounts).map(s => getStatusBadgeConfig(s as any).label), datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#f59e0b', '#3b82f6', '#22c55e', '#6b7280'] }] };
        const phaseChartData = { labels: phaseCounts.map(p => p.name), datasets: [{ label: 'Nº de Tarefas', data: phaseCounts.map(p => p.count), backgroundColor: getPhaseColor(0, 0.7), borderRadius: 4 }] };
        
        const statusChartImage = await getChartImage(statusChartData, 'doughnut');
        const phaseChartImage = await getChartImage(phaseChartData, 'bar');
        
        const chartWidth = (doc.internal.pageSize.width - 15 * 3) / 2;
        const chartHeight = chartWidth * 0.75;
        let currentY = 55;

        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(51, 65, 85);
        doc.text("Status das Tarefas", 15 + chartWidth/2, currentY, { align: 'center'});
        doc.text("Tarefas por Fase", 15 + chartWidth + 10 + chartWidth/2, currentY, { align: 'center'});
        currentY += 5;
        
        if(statusChartImage) doc.addImage(statusChartImage, 'PNG', 15, currentY, chartWidth, chartHeight);
        if(phaseChartImage) doc.addImage(phaseChartImage, 'PNG', 15 + chartWidth + 10, currentY, chartWidth, chartHeight);
        
        // --- PAGE 2+: DETAILS ---
        const tableData = allTasks.map(task => { const phaseName = (campaign.phases || []).find(p => p.id === task.phaseId)?.name || 'N/A'; return [ phaseName, task.name, task.startDate ? format(parseISO(task.startDate), 'dd/MM/yy') : 'N/A', task.endDate ? format(parseISO(task.endDate), 'dd/MM/yy') : 'N/A', task.assignee?.username || 'N/A', getStatusBadgeConfig(task.status).label, task.notes || '']; });
        if(tableData.length > 0) {
            doc.addPage();
            doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
            doc.text("Detalhamento das Tarefas", 15, 45);
            autoTable(doc, { head: [['Fase', 'Tarefa', 'Início', 'Fim', 'Responsável', 'Status', 'Anotações']], body: tableData, startY: 55, theme: 'grid', headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' }, styles: { textColor: [51, 65, 85], cellPadding: 2.5, fontSize: 8 }, alternateRowStyles: { fillColor: [252, 252, 253] } });
        }
        
        await addHeaderAndFooter();
        doc.save(`cronograma_${campaign.name.replace(/\s/g, '_')}.pdf`);
        toast({ title: 'PDF Gerado!', description: 'Seu cronograma foi exportado com sucesso.' });
    } catch (err) {
        console.error("Erro ao gerar PDF:", err);
        toast({ title: 'Erro na Exportação', description: (err as Error).message || 'Ocorreu um problema ao gerar o arquivo PDF.', variant: 'destructive' });
    } finally { setIsExporting(false); }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div><h1 className="text-3xl font-bold text-foreground">Cronograma da Campanha</h1><p className="text-muted-foreground mt-1">Gerencie o cronograma de suas campanhas, fases e tarefas.</p></div>
        <div className="flex gap-3">
          {campaign && (<>
              <Button onClick={handleExportToPdf} disabled={isExporting} variant="outline" className="neu-button">{isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}Exportar PDF</Button>
              <Button onClick={handleSaveChanges} disabled={updateCampaignMutation.isPending} className="neu-button-primary">{updateCampaignMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar Alterações</Button>
          </>)}
        </div>
      </div>
      <Card className="neu-card">
        <CardHeader><CardTitle>Seleção de Campanha</CardTitle><CardDescription>Escolha uma campanha para visualizar e editar seu cronograma.</CardDescription></CardHeader>
        <CardContent><Select value={selectedCampaignId || ""} onValueChange={setSelectedCampaignId}><SelectTrigger className="neu-input"><SelectValue placeholder="Selecione uma campanha..." /></SelectTrigger><SelectContent className='neu-card'>{isLoadingCampaigns ? <SelectItem value="loading" disabled><Loader2 className="w-4 h-4 animate-spin mr-2" />Carregando...</SelectItem> : campaigns?.map(camp => (<SelectItem key={camp.id} value={String(camp.id)}>{camp.name}</SelectItem>))}</SelectContent></Select></CardContent>
      </Card>
      {selectedCampaignId && (<>
          {isLoadingCampaignDetails ? (<Card className="neu-card"><CardContent className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary mr-2" /><span className="text-muted-foreground">Carregando detalhes...</span></CardContent></Card>
          ) : error ? (<Card className="neu-card border-destructive"><CardContent className="flex items-center justify-center py-12"><AlertTriangle className="w-8 h-8 text-destructive mr-2" /><span className="text-destructive-foreground">Erro ao carregar campanha.</span></CardContent></Card>
          ) : campaign ? (
            <>
              <Card className="neu-card"><CardHeader><CardTitle className="flex items-center gap-2"><GanttChartSquare className="w-5 h-5" />Configuração das Fases</CardTitle><CardDescription>Ajuste a duração de cada fase baseada na data do evento.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4"><Label className="text-foreground font-medium">Data do Evento:</Label><Popover><PopoverTrigger asChild><Button variant="outline" className={cn("w-[240px] justify-start text-left font-normal neu-button", !eventDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{eventDate ? format(eventDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0 neu-card"><Calendar mode="single" selected={eventDate} onSelect={(date) => date && setEventDate(date)} initialFocus /></PopoverContent></Popover></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {phasesState.map((phase, index) => (<div key={phase.id} className="flex items-center gap-3 p-3 neu-card-inset"><div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: getPhaseColor(index) }}/><div className="flex-grow min-w-0"><p className="text-sm font-medium text-foreground truncate">{phase.name}</p></div><div className="flex items-center gap-1"><Button size="icon" variant="ghost" onClick={() => handlePhaseDurationChange(phase.id, phase.duration - 1)} disabled={phase.duration <= 1} className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground neu-button"><Minus className="w-3 h-3" /></Button><Input type="number" min="1" value={phase.duration} onChange={(e) => handlePhaseDurationChange(phase.id, parseInt(e.target.value) || 1)} className="w-12 h-6 text-xs text-center neu-input"/><Button size="icon" variant="ghost" onClick={() => handlePhaseDurationChange(phase.id, phase.duration + 1)} className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground neu-button"><Plus className="w-3 h-3" /></Button></div><span className="text-xs text-muted-foreground flex-shrink-0">dias</span></div>))}
                  </div>
                </CardContent>
              </Card>
              <Card className="neu-card"><CardHeader><CardTitle>Cronograma Visual</CardTitle><CardDescription>Visualização em formato Gantt das fases e tarefas da campanha.</CardDescription></CardHeader><CardContent className="p-0"><div id="gantt-chart-container"><ModernGanttChart campaign={campaign} calculatedPhases={timeline.calculatedPhases} /></div></CardContent></Card>
              <Card className="neu-card">
                <CardHeader><CardTitle>Resumo das Tarefas</CardTitle><CardDescription>Lista detalhada de todas as tarefas organizadas por fase.</CardDescription></CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {campaign.phases.map((phase, phaseIndex) => (<div key={phase.id} className="space-y-3"><div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full" style={{ backgroundColor: getPhaseColor(phaseIndex) }}/><h3 className="text-lg font-semibold text-foreground">{phase.name}</h3><Badge variant="outline">{(phase.tasks || []).length} tarefa{phase.tasks?.length !== 1 ? 's' : ''}</Badge></div>{phase.tasks.length === 0 ? <p className="text-muted-foreground italic ml-7">Nenhuma tarefa nesta fase</p> : (<div className="ml-7 space-y-2">{(phase.tasks || []).map(task => (<div key={task.id} className="flex items-center justify-between p-3 neu-card-inset"><div className="flex-grow"><div className="flex items-center gap-3"><h4 className="font-medium text-foreground">{task.name}</h4><Badge variant="outline" className={cn("text-xs", getStatusBadgeConfig(task.status).className)}>{getStatusBadgeConfig(task.status).label}</Badge></div><div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">{task.startDate && task.endDate && (<span>{format(parseISO(task.startDate), 'dd/MM/yy')} - {format(parseISO(task.endDate), 'dd/MM/yy')}</span>)}{task.assignee && (<span>Responsável: {task.assignee.username}</span>)}</div></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground neu-button"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger><DropdownMenuContent className="neu-card"><DropdownMenuItem onClick={() => setModalState({ isOpen: true, phaseId: phase.id, task })}><Edit className="w-4 h-4 mr-2" />Editar</DropdownMenuItem><DropdownMenuItem onClick={() => handleDeleteTask(task.id)} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" />Excluir</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>))}</div>)}<Button variant="outline" size="sm" onClick={() => setModalState({ isOpen: true, phaseId: phase.id })} className="ml-7 neu-button"><Plus className="w-4 h-4 mr-2" />Adicionar Tarefa</Button></div>))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </>)}
      {modalState.isOpen && selectedCampaignId && ( <TaskForm onClose={() => setModalState({ isOpen: false })} campaignId={Number(selectedCampaignId)} phaseId={modalState.phaseId!} task={modalState.task} onSuccess={() => queryClient.invalidateQueries({ queryKey: ['campaignSchedule', selectedCampaignId] })} /> )}
    </div>
  );
}
