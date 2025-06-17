import React from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler } from 'chart.js';
import { Line, Bar, Doughnut, Pie } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';

ChartJS.register( CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler );

interface ChartProps { data: any; options?: any; className?: string; }

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      enabled: true,
      backgroundColor: 'rgba(10, 15, 25, 0.7)',
      borderColor: 'hsl(var(--primary), 0.5)',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#94a3b8',
      padding: 10,
      cornerRadius: 8,
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
      usePointStyle: true,
    },
  },
  scales: {
    x: {
      grid: { color: 'hsl(var(--border) / 0.1)', drawOnChartArea: true },
      ticks: { color: 'hsl(var(--muted-foreground))', font: { size: 10 } },
      border: { display: false },
    },
    y: {
      grid: { display: false },
      ticks: { display: false },
      border: { display: false },
    },
  },
};

const createGradient = (ctx: CanvasRenderingContext2D, chartArea: any) => {
    const primaryColor = `hsla(var(--primary), 1)`;
    const transparentColor = `hsla(var(--primary), 0)`;
    const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
    gradient.addColorStop(0, transparentColor);
    gradient.addColorStop(0.5, primaryColor.replace('1)', '0.2)'));
    gradient.addColorStop(1, primaryColor.replace('1)', '0.6)'));
    return gradient;
}

export function LineChart({ data, options = {}, className }: ChartProps) {
  const chartData = {
    ...data,
    datasets: data.datasets.map((ds: any) => ({
      ...ds,
      fill: true,
      borderColor: `hsl(var(--primary))`,
      backgroundColor: (context: any) => context.chart.ctx && context.chart.chartArea ? createGradient(context.chart.ctx, context.chart.chartArea) : 'transparent',
      pointRadius: 0,
      pointHoverRadius: 5,
      pointBackgroundColor: `hsl(var(--primary))`,
      pointBorderColor: `hsl(var(--background))`,
      pointBorderWidth: 2,
      tension: 0.4,
    })),
  };
  return <div className={className || ''}><Line data={chartData} options={{...baseOptions, ...options}} /></div>;
}

export function BarChart({ data, options = {}, className }: ChartProps) {
  const chartData = {
    ...data,
    datasets: data.datasets.map((ds: any) => ({
      ...ds,
      backgroundColor: `hsl(var(--primary) / 0.8)`,
      hoverBackgroundColor: `hsl(var(--primary))`,
      borderRadius: 4,
      barThickness: 12,
    })),
  };
  const barOptions = { ...baseOptions, scales: { ...baseOptions.scales, x: { ...baseOptions.scales.x, grid: { display: false } } } }
  return <div className={className || ''}><Bar data={chartData} options={{...barOptions, ...options}} /></div>;
}

export function DoughnutChart({ data, options = {}, className }: ChartProps) {
  const chartData = {
    ...data,
    datasets: data.datasets.map((ds: any) => ({
      ...ds,
      borderWidth: 0,
      hoverOffset: 8,
    })),
  };
  const doughnutOptions = { ...baseOptions, scales: undefined, cutout: '75%', plugins: {...baseOptions.plugins, legend: { display: true, position: 'right' as const, labels: { color: 'hsl(var(--muted-foreground))', font: {size: 10}, boxWidth: 10}}} };
  return <div className={className || ''}><Doughnut data={chartData} options={{...doughnutOptions, ...options}} /></div>;
}

export function PieChart({ data, options = {}, className }: ChartProps) {
    const pieOptions = { ...baseOptions, scales: undefined, plugins: {...baseOptions.plugins, legend: { display: true, position: 'right' as const, labels: { color: 'hsl(var(--muted-foreground))', font: {size: 10}, boxWidth: 10}}} };
    return <div className={className || ''}><Pie data={data} options={{...pieOptions, ...options}} /></div>;
}
