/* ECharts 黏土风封装：饼图 / 柱状图 / 折线图 */
import ReactECharts from 'echarts-for-react';

export const CLAY_PALETTE = [
  '#FF8A80',
  '#7FD1B9',
  '#7CB8FF',
  '#FFD166',
  '#B79CFF',
  '#F49AC1',
  '#8FD9C0',
  '#FFB27A',
];

const baseText = {
  color: '#6E6A80',
  fontFamily: 'Nunito, PingFang SC, Microsoft YaHei, sans-serif',
  fontSize: 12,
  fontWeight: 700,
};

const tooltipStyle = {
  backgroundColor: 'rgba(255,255,255,0.96)',
  borderColor: 'rgba(61,58,75,0.08)',
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { ...baseText, color: '#3D3A4B', fontSize: 12.5 },
  extraCssText: 'border-radius:14px;box-shadow:0 10px 24px rgba(61,58,75,.14);',
};

export function PieChart({ data = [], height = 230, donut = true }) {
  const option = {
    color: CLAY_PALETTE,
    tooltip: { trigger: 'item', ...tooltipStyle, formatter: '{b}<br/>{c} 个（{d}%）' },
    legend: {
      bottom: 0,
      icon: 'circle',
      itemWidth: 9,
      itemHeight: 9,
      itemGap: 12,
      textStyle: baseText,
    },
    series: [
      {
        type: 'pie',
        radius: donut ? ['46%', '70%'] : '66%',
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 4,
          borderRadius: 10,
        },
        label: { show: false },
        labelLine: { show: false },
        emphasis: { scale: true, scaleSize: 6 },
        data,
      },
    ],
  };
  return <ReactECharts option={option} style={{ height }} opts={{ renderer: 'canvas' }} notMerge />;
}

export function BarChart({ labels = [], values = [], height = 230, color = '#7CB8FF', max }) {
  const option = {
    color: [color],
    grid: { left: 8, right: 12, top: 22, bottom: 6, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...tooltipStyle },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: 'rgba(61,58,75,0.1)' } },
      axisTick: { show: false },
      axisLabel: { ...baseText, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      max,
      splitLine: { lineStyle: { color: 'rgba(61,58,75,0.06)', type: 'dashed' } },
      axisLabel: { ...baseText, fontSize: 11 },
    },
    series: [
      {
        type: 'bar',
        data: values,
        barMaxWidth: 30,
        itemStyle: { borderRadius: [12, 12, 6, 6] },
      },
    ],
  };
  return <ReactECharts option={option} style={{ height }} opts={{ renderer: 'canvas' }} notMerge />;
}

export function LineChart({ labels = [], values = [], height = 240, color = '#FF8A80', max = 100 }) {
  const option = {
    color: [color],
    grid: { left: 8, right: 14, top: 24, bottom: 6, containLabel: true },
    tooltip: { trigger: 'axis', ...tooltipStyle },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLine: { lineStyle: { color: 'rgba(61,58,75,0.1)' } },
      axisTick: { show: false },
      axisLabel: { ...baseText, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      max,
      splitLine: { lineStyle: { color: 'rgba(61,58,75,0.06)', type: 'dashed' } },
      axisLabel: { ...baseText, fontSize: 11 },
    },
    series: [
      {
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 4, cap: 'round' },
        itemStyle: { borderColor: '#fff', borderWidth: 3 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(255,138,128,0.36)' },
              { offset: 1, color: 'rgba(255,138,128,0.02)' },
            ],
          },
        },
      },
    ],
  };
  return <ReactECharts option={option} style={{ height }} opts={{ renderer: 'canvas' }} notMerge />;
}

/* 五维雷达：费曼评分的形状一眼看懂，比五个数字更有说服力 */
export function RadarChart({
  indicators = [],
  values = [],
  height = 268,
  color = '#2E9C82',
  areaColor = 'rgba(127, 209, 185, 0.32)',
  name = '本轮',
}) {
  const option = {
    color: [color],
    tooltip: { trigger: 'item', ...tooltipStyle },
    radar: {
      center: ['50%', '53%'],
      radius: '64%',
      splitNumber: 4,
      indicator: indicators.map((item) => ({ name: item.label, max: 100 })),
      axisName: { ...baseText, fontSize: 12, color: '#3D3A4B' },
      splitLine: { lineStyle: { color: 'rgba(61,58,75,0.09)' } },
      axisLine: { lineStyle: { color: 'rgba(61,58,75,0.09)' } },
      splitArea: {
        areaStyle: { color: ['rgba(255,248,240,0.75)', 'rgba(255,255,255,0.55)'] },
      },
    },
    series: [
      {
        type: 'radar',
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 3, cap: 'round' },
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: areaColor },
        data: [{ value: values, name }],
      },
    ],
  };
  return <ReactECharts option={option} style={{ height }} opts={{ renderer: 'canvas' }} notMerge />;
}