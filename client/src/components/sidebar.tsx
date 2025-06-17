import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuthStore } from '@/lib/auth';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import LogoPng from '@/img/logo.png';
import {
  LayoutDashboard, Rocket, Image as ImageIcon, DollarSign, Filter, PenTool, TrendingUp, Bell, MessageCircle, Download, LogOut, Globe, ChevronLeft, ChevronRight, Settings, CalendarCheck
} from 'lucide-react';

const menuItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/campaigns', label: 'Campanhas', icon: Rocket },
  { path: '/schedule', label: 'Cronograma', icon: CalendarCheck },
  { path: '/creatives', label: 'Criativos', icon: ImageIcon },
  { path: '/budget', label: 'Orçamento', icon: DollarSign },
  { path: '/landingpages', label: 'Landing Pages', icon: Globe },
  { path: '/funnel', label: 'Funil de Vendas', icon: Filter },
  { path: '/copy', label: 'Copy & IA', icon: PenTool },
  { path: '/metrics', label: 'Métricas', icon: TrendingUp },
  { path: '/alerts', label: 'Alertas', icon: Bell, notificationKey: 'alerts' },
  { path: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { path: '/integrations', label: 'Integrações', icon: Settings },
  { path: '/export', label: 'Exportar', icon: Download },
];

interface DashboardData {
  metrics: any;
  recentCampaigns: any[];
  alertCount: number;
}

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuthStore();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const { data: dashboardData } = useQuery<DashboardData>({
    queryKey: ['sidebarAlerts'],
    queryFn: async () => {
      if (!user) return { alertCount: 0, metrics: {}, recentCampaigns: [] };
      try {
        const response = await apiRequest('GET', '/api/dashboard?timeRange=30d');
        if (!response.ok) return { alertCount: 0, metrics: {}, recentCampaigns: [] };
        return await response.json();
      } catch (e) {
        return { alertCount: 0, metrics: {}, recentCampaigns: [] };
      }
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const alertCount = dashboardData?.alertCount || 0;
  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  const getUserInitials = (username: string | undefined) => {
    if (!username) return 'U';
    return username.split(' ').map(name => name[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <aside className={cn("flex h-full flex-col bg-sidebar-background transition-all duration-300 ease-in-out border-r border-sidebar-border", isCollapsed ? "w-[72px]" : "w-60")}>
      <div className="flex h-[72px] shrink-0 items-center justify-center p-2">
        <img src={LogoPng} alt="Logo" className={cn("transition-all duration-300", isCollapsed ? "h-10" : "h-12")} />
      </div>

      <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
        {menuItems.map((item) => {
          const isActive = location === item.path || (location === '/' && item.path === '/dashboard');
          const Icon = item.icon;
          const hasNotification = item.notificationKey === 'alerts' && user && alertCount > 0;
          return (
            <Link key={item.path} href={item.path} title={isCollapsed ? item.label : undefined}>
              <a className={cn( "group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-accent/50", isCollapsed && "h-11 w-11 justify-center p-0" )}>
                <Icon className={cn("h-5 w-5 shrink-0", !isCollapsed && "mr-3", isActive && "icon-glow")} />
                <span className={cn("truncate", isCollapsed && "sr-only")}>{item.label}</span>
                {!isCollapsed && hasNotification && (<span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">{alertCount > 9 ? '9+' : alertCount}</span>)}
                {isCollapsed && hasNotification && (<span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar-background bg-destructive"></span>)}
              </a>
            </Link>
          );
        })}
      </nav>

      <div className={cn("mt-auto shrink-0 border-t border-sidebar-border p-3 space-y-2")}>
        <ThemeToggle />
        <Button variant="ghost" size="icon" className="w-full h-10" onClick={toggleSidebar} title={isCollapsed ? "Expandir sidebar" : "Recolher sidebar"}>
            {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </Button>
        {user && (
          <div className={cn("flex items-center", isCollapsed ? "justify-center" : "justify-between")}>
             <div className={cn("flex items-center gap-2", isCollapsed && "hidden")}>
                <Avatar className="h-8 w-8"><AvatarFallback className="bg-primary/20 text-primary">{getUserInitials(user.username)}</AvatarFallback></Avatar>
                <span className="text-xs font-medium truncate">{user.username}</span>
             </div>
             <Button variant="ghost" size="icon" className="h-10 text-muted-foreground hover:text-destructive" onClick={logout} title="Sair">
                <LogOut className="h-5 w-5" />
             </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
