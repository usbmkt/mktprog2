
import React, { useState } from 'react';
import {
  TrendingUp, Eye, MousePointer, CreditCard, Users, Download, AlertTriangle, Loader2,
  DollarSign, Activity, PlayCircle, PauseCircle, CheckCircle, Clock, ChevronRight,
  BarChart3, PieChart as PieChartIcon, Sparkles, Target, BarChartHorizontal,
  TrendingDown, Zap, Star, Calendar, Filter
} from 'lucide-react';

// Mock data para o dashboard
const mockData = {
  metrics: {
    activeCampaigns: 12,
    totalCostPeriod: 87690,
    conversions: 1247,
    impressions: 2845630,
    clicks: 45287,
    avgROI: 3.2,
    ctr: 1.59,
    cpc: 1.94,
    cpa: 70.32,
    cvr: 2.75,
    cpm: 30.84
  },
  recentCampaigns: [
    { id: 1, name: "Campanha Black Friday", status: 'active', budget: 15000, spent: 12450, clicks: 2847, conversions: 156 },
    { id: 2, name: "Lançamento Produto X", status: 'active', budget: 8000, spent: 7200, clicks: 1523, conversions: 89 },
    { id: 3, name: "Remarketing Q4", status: 'paused', budget: 5000, spent: 3200, clicks: 894, conversions: 45 },
    { id: 4, name: "Display Awareness", status: 'completed', budget: 12000, spent: 11800, clicks: 3456, conversions: 234 },
    { id: 5, name: "Search Premium", status: 'active', budget: 6000, spent: 4890, clicks: 1789, conversions: 98 }
  ],
  aiInsights: [
    "📈 Suas campanhas de Search estão superando o benchmark em 45% no CTR",
    "🎯 Recomendamos aumentar o budget da campanha 'Black Friday' em 30%",
    "⚡ O horário de pico de conversões é entre 14h-18h nos dias úteis",
    "💡 Campanhas com vídeo têm 3.2x mais engajamento que display estático",
    "🔥 Audiência 25-34 anos apresenta maior LTV e menor CPA"
  ],
  timeSeriesData: {
    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
    datasets: [{
      label: 'Investimento',
      data: [45000, 52000, 48000, 61000, 55000, 67000, 73000, 69000, 78000, 85000, 92000, 87000],
      borderColor: 'rgb(59, 130, 246)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)'
    }]
  },
  channelData: ['Google Ads', 'Facebook', 'Instagram', 'LinkedIn', 'TikTok'],
  roiData: [4.2, 3.8, 3.1, 2.9, 3.6]
};

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  trend?: number;
  subtitle?: string;
}

export default function GlassmorphismDashboard() {
  const [timeRange, setTimeRange] = useState('30d');
  const [isLoading, setIsLoading] = useState(false);

  // Funções de formatação
  const formatCurrency = (value: number | string | null | undefined) => {
    if (value == null || isNaN(Number(value))) return "R$ 0,00";
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
  };

  const formatNumber = (value: number | string | null | undefined) => new Intl.NumberFormat('pt-BR').format(Number(value ?? 0));
  const formatPercentage = (value: number | string | null | undefined) => `${(Number(value ?? 0)).toFixed(2)}%`;

  const getStatusBadge = (status: string) => {
    const config: Record<string, { class: string; icon: React.ElementType; label: string }> = {
      active: { class: 'glass-badge-success', icon: PlayCircle, label: 'Ativo' },
      paused: { class: 'glass-badge-warning', icon: PauseCircle, label: 'Pausado' },
      completed: { class: 'glass-badge-info', icon: CheckCircle, label: 'Concluído' },
      draft: { class: 'glass-badge-secondary', icon: Clock, label: 'Rascunho' }
    };
    const currentConfig = config[status] || { class: 'glass-badge-secondary', icon: Clock, label: 'Rascunho' };

    const IconComponent = currentConfig.icon;
    return (
      <span className={`inline-flex items-center gap-1 ${currentConfig.class}`}>
        <IconComponent className="w-3 h-3" />
        {currentConfig.label}
      </span>
    );
  };

  const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon: Icon, trend, subtitle }) => (
    <div className="glass-metric-card p-6 group">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-100/30">
            <Icon className="w-5 h-5 text-blue-400 icon-glow-primary" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-300">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
        </div>
        {typeof trend === 'number' && (
          <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
            trend > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-white text-glow-accent mb-2">
        {value}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="glass-loader w-16 h-16 animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 glass-scrollbar">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-glow-primary floating-element">
            Dashboard Inteligente
          </h1>
          <p className="text-gray-400">
            Visão completa e insights em tempo real das suas campanhas
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="glass-select px-4 py-2 rounded-xl">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-transparent text-white outline-none"
            >
              <option value="7d" className="bg-gray-800">7 dias</option>
              <option value="30d" className="bg-gray-800">30 dias</option>
              <option value="90d" className="bg-gray-800">90 dias</option>
            </select>
          </div>

          <button className="glass-button-primary">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
        <MetricCard
          title="Investimento Total"
          value={formatCurrency(mockData.metrics.totalCostPeriod)}
          icon={DollarSign}
          trend={12.5}
        />
        <MetricCard
          title="ROI Médio"
          value={`${mockData.metrics.avgROI}x`}
          icon={TrendingUp}
          trend={8.2}
        />
        <MetricCard
          title="Conversões"
          value={formatNumber(mockData.metrics.conversions)}
          icon={Target}
          trend={15.3}
        />
        <MetricCard
          title="Cliques"
          value={formatNumber(mockData.metrics.clicks)}
          icon={MousePointer}
          trend={-2.1}
        />
        <MetricCard
          title="Impressões"
          value={formatNumber(mockData.metrics.impressions)}
          icon={Eye}
          trend={7.8}
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        <MetricCard
          title="CPA"
          value={formatCurrency(mockData.metrics.cpa)}
          icon={Target}
          subtitle="Custo por aquisição"
        />
        <MetricCard
          title="CPC"
          value={formatCurrency(mockData.metrics.cpc)}
          icon={MousePointer}
          subtitle="Custo por clique"
        />
        <MetricCard
          title="CVR"
          value={formatPercentage(mockData.metrics.cvr)}
          icon={Users}
          subtitle="Taxa de conversão"
        />
        <MetricCard
          title="CTR"
          value={formatPercentage(mockData.metrics.ctr)}
          icon={Activity}
          subtitle="Taxa de cliques"
        />
        <MetricCard
          title="CPM"
          value={formatCurrency(mockData.metrics.cpm)}
          icon={BarChartHorizontal}
          subtitle="Custo por mil"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
        {/* AI Insights */}
        <div className="xl:col-span-2 glass-content-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30">
              <Sparkles className="w-6 h-6 text-purple-400 icon-glow-primary" />
            </div>
            <h2 className="text-xl font-semibold text-glow-primary">Insights Inteligentes</h2>
          </div>

          <div className="space-y-4">
            {mockData.aiInsights.map((insight, index) => (
              <div key={index} className="glass-table-row p-4 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="p-1 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 mt-1">
                    <Zap className="w-3 h-3 text-blue-400" />
                  </div>
                  <p className="text-gray-300 leading-relaxed">{insight}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Campaigns */}
        <div className="glass-content-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30">
              <Activity className="w-6 h-6 text-green-400 icon-glow-primary" />
            </div>
            <h2 className="text-xl font-semibold text-glow-primary">Campanhas Ativas</h2>
          </div>

          <div className="space-y-3">
            {mockData.recentCampaigns.filter(c => c.status === 'active').map(campaign => (
              <div key={campaign.id} className="glass-table-row p-4 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-white mb-1">{campaign.name}</h3>
                    <p className="text-sm text-gray-400">
                      {formatCurrency(campaign.spent)} / {formatCurrency(campaign.budget)}
                    </p>
                  </div>
                  {getStatusBadge(campaign.status)}
                </div>

                <div className="mt-3 bg-gray-800/50 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(campaign.spent / campaign.budget) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Performance Chart */}
        <div className="glass-content-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30">
              <BarChart3 className="w-6 h-6 text-blue-400 icon-glow-primary" />
            </div>
            <h2 className="text-xl font-semibold text-glow-primary">Performance por Canal</h2>
          </div>

          <div className="glass-chart-container h-64 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-4 w-full">
              {mockData.channelData.map((channel, index) => (
                <div key={channel} className="text-center p-4 glass-table-row rounded-lg">
                  <div className="text-2xl font-bold text-blue-400 mb-2">
                    {mockData.roiData[index]}x
                  </div>
                  <div className="text-sm text-gray-400">{channel}</div>
                  <div className="mt-2 bg-gray-700/50 rounded-full h-1">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-cyan-500 h-1 rounded-full"
                      style={{ width: `${(mockData.roiData[index] / 5) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ROI Trends */}
        <div className="glass-content-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30">
              <TrendingUp className="w-6 h-6 text-green-400 icon-glow-primary" />
            </div>
            <h2 className="text-xl font-semibold text-glow-primary">Tendência de ROI</h2>
          </div>

          <div className="glass-chart-container h-64 flex items-center justify-center">
            <div className="w-full">
              <div className="flex items-end justify-between h-40 gap-2"> {/* Aumentei a altura para melhor visualização */}
                {mockData.timeSeriesData.labels.slice(6).map((month, index) => (
                  <div key={month} className="flex flex-col items-center flex-1">
                    <div
                      className="bg-gradient-to-t from-green-500 to-emerald-400 rounded-t w-8 transition-all duration-500 hover:from-green-400 hover:to-emerald-300"
                      style={{
                        height: `${(mockData.timeSeriesData.datasets[0].data[index + 6] / 100000) * 100}%`,
                        minHeight: '20px'
                      }}
                    ></div>
                    <span className="text-xs text-gray-400 mt-2">{month}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-center">
                <div className="text-2xl font-bold text-green-400 mb-1">
                  +{((mockData.metrics.avgROI - 2.8) / 2.8 * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-gray-400">vs. período anterior</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* All Campaigns Table */}
      <div className="glass-content-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/30">
              <BarChart3 className="w-6 h-6 text-orange-400 icon-glow-primary" />
            </div>
            <h2 className="text-xl font-semibold text-glow-primary">Todas as Campanhas</h2>
          </div>
          <button className="glass-button-primary text-sm">
            <Filter className="w-4 h-4 mr-2" />
            Filtrar
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700/50">
                <th className="text-left py-3 px-2 text-sm font-medium text-gray-400">Campanha</th>
                <th className="text-left py-3 px-2 text-sm font-medium text-gray-400">Status</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-400">Budget</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-400">Gasto</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-400">Cliques</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-400">Conversões</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-400">ROI</th>
              </tr>
            </thead>
            <tbody>
              {mockData.recentCampaigns.map(campaign => (
                <tr key={campaign.id} className="glass-table-row border-b border-gray-800/30">
                  <td className="py-4 px-2">
                    <div className="font-medium text-white">{campaign.name}</div>
                  </td>
                  <td className="py-4 px-2">
                    {getStatusBadge(campaign.status)}
                  </td>
                  <td className="py-4 px-2 text-right text-gray-300">
                    {formatCurrency(campaign.budget)}
                  </td>
                  <td className="py-4 px-2 text-right text-gray-300">
                    {formatCurrency(campaign.spent)}
                  </td>
                  <td className="py-4 px-2 text-right text-gray-300">
                    {formatNumber(campaign.clicks)}
                  </td>
                  <td className="py-4 px-2 text-right text-gray-300">
                    {formatNumber(campaign.conversions)}
                  </td>
                  <td className="py-4 px-2 text-right">
                    <span className="text-green-400 font-semibold">
                      {(campaign.conversions * 100 / campaign.spent).toFixed(1)}x
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div> 
  ); 
} 
