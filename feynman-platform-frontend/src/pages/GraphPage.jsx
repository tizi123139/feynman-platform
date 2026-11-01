/* 知识图谱：糖果配色力导向图 + 分类图例 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import apiClient from '../api/axios';
import { ClayButton, ClayCard, PageHead, Skeleton, useToast } from '../components/ui/ClayKit';
import { AppIcon } from '../components/icons/AppIcon';
import { IconRefresh, IconSparkles } from '../components/ui/icons';

const PALETTE = ['#FF8A80', '#7FD1B9', '#7CB8FF', '#FFD166', '#B79CFF', '#F49AC1', '#8FD9C0', '#FFB27A'];

const labelStyle = {
  color: '#3D3A4B',
  fontFamily: 'Nunito, PingFang SC, Microsoft YaHei, sans-serif',
  fontSize: 12,
  fontWeight: 800,
};

// 关系类型 → 线条样式（与后端 buildLinks 的 type 对应）
const LINK_STYLE = {
  reference: { color: 'rgba(255,138,128,0.85)', width: 3 },
  tag: { color: 'rgba(127,209,185,0.8)', width: 2.4 },
  category: { color: 'rgba(124,184,255,0.7)', width: 2 },
  day: { color: 'rgba(183,156,255,0.6)', width: 1.8 },
  auto: { color: 'rgba(170,163,190,0.45)', width: 1.4, type: 'dashed' },
  // AI 推理出来的语义关系，比规则连线更粗更亮
  prerequisite: { color: 'rgba(79,183,154,0.95)', width: 4, curveness: 0.2 },
  extends: { color: 'rgba(143,108,240,0.9)', width: 3.4, curveness: 0.2 },
  contrast: { color: 'rgba(239,106,96,0.9)', width: 3.2, type: 'dashed', curveness: 0.26 },
  applies: { color: 'rgba(79,149,232,0.85)', width: 2.8, curveness: 0.18 },
};

const LINK_LEGEND = [
  { type: 'prerequisite', label: 'AI·前置' },
  { type: 'extends', label: 'AI·延伸' },
  { type: 'contrast', label: 'AI·易混' },
  { type: 'applies', label: 'AI·应用' },
  { type: 'reference', label: '正文引用' },
  { type: 'tag', label: '共同标签' },
  { type: 'category', label: '同分类' },
  { type: 'day', label: '同日创建' },
];

const LINK_LABEL = Object.fromEntries(LINK_LEGEND.map((item) => [item.type, item.label]));

export default function GraphPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [insights, setInsights] = useState({ relations: [], path: [] });
  const [inferring, setInferring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [graphRes, reasonRes] = await Promise.allSettled([
        apiClient.get('/graph/knowledge-map'),
        apiClient.get('/graph/reason'),
      ]);
      if (graphRes.status === 'fulfilled') {
        setGraph({ nodes: graphRes.value.data?.nodes || [], links: graphRes.value.data?.links || [] });
      } else {
        toast.error(graphRes.reason?.response?.data?.msg || '获取图谱数据失败');
      }
      if (reasonRes.status === 'fulfilled') {
        setInsights({
          relations: reasonRes.value.data?.relations || [],
          path: reasonRes.value.data?.path || [],
        });
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  /** 触发一次模型推理（有缓存会直接命中，12 小时内不重复烧额度） */
  const runReasoning = async () => {
    setInferring(true);
    try {
      const { data } = await apiClient.post('/graph/reason', { force: true }, { timeout: 90000 });
      const relations = data?.relations || [];
      setInsights({ relations, path: data?.path || [] });
      if (relations.length === 0) toast.warn('这批知识点之间还没看出强关系，再补充点内容试试');
      else toast.success(`推理出 ${relations.length} 条语义关系`);
    } catch (err) {
      toast.error(err.response?.data?.msg || 'AI 关系推理失败');
    } finally {
      setInferring(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const categoryMap = useMemo(() => {
    const map = new Map();
    graph.nodes.forEach((node) => {
      const key = node.category || '未分类';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [graph.nodes]);

  // 语义关系优先：同一对知识点被 AI 推出关系后，用它替掉原来的规则连线
  const visibleLinks = useMemo(() => {
    const relations = insights.relations || [];
    if (relations.length === 0) return graph.links;

    const covered = new Set();
    relations.forEach((rel) => {
      covered.add(`${rel.source}|${rel.target}`);
      covered.add(`${rel.target}|${rel.source}`);
    });

    const rest = graph.links.filter((link) => !covered.has(`${link.source}|${link.target}`));
    const semantic = relations.map((rel) => ({
      source: rel.source,
      target: rel.target,
      type: rel.type,
      value: 5,
      reason: rel.reason,
      confidence: rel.confidence,
    }));
    return [...rest, ...semantic];
  }, [graph.links, insights.relations]);

  const seriesOption = useMemo(() => {
    const categories = Array.from(categoryMap.keys());
    const nodes = graph.nodes.map((node) => {
      const label = node.category || '未分类';
      const idx = Math.max(0, categories.indexOf(label));
      return {
        ...node,
        category: idx,
        categoryLabel: label,
        itemStyle: {
          color: PALETTE[idx % PALETTE.length],
          borderColor: '#FFFFFF',
          borderWidth: 3,
          shadowBlur: 18,
          shadowColor: 'rgba(61,58,75,0.18)',
          shadowOffsetY: 6,
        },
      };
    });

    const links = visibleLinks.map((link) => ({
      ...link,
      lineStyle: { ...(LINK_STYLE[link.type] || LINK_STYLE.auto), opacity: 0.95 },
    }));

    return {
      tooltip: {
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderColor: 'rgba(61,58,75,0.08)',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: '#3D3A4B', fontSize: 12.5, fontWeight: 700 },
        extraCssText: 'border-radius:14px;box-shadow:0 10px 24px rgba(61,58,75,.14);',
        formatter: (params) => {
          if (params.dataType === 'edge') {
            const link = params.data;
            if (!link?.reason) return '';
            return `<div style="font-weight:800;font-size:12.5px;margin-bottom:3px">${LINK_LABEL[link.type] || '语义关系'}</div>
              <div style="color:#6E6A80;font-size:11.5px;line-height:1.6">${link.reason}</div>`;
          }
          if (params.dataType !== 'node') return '';
          const node = params.data;
          return `<div style="font-weight:800;font-size:13.5px;margin-bottom:4px">${node.name}</div>
            <div style="color:#8B8598;font-size:11.5px">${node.categoryLabel || ''} · 掌握度 ${node.mastery || 0}%</div>`;
        },
      },
      series: [
        {
          type: 'graph',
          layout: 'force',
          roam: true,
          draggable: true,
          data: nodes,
          links,
          categories: categories.map((name) => ({ name })),
          label: { show: true, position: 'bottom', distance: 6, formatter: '{b}', ...labelStyle },
          lineStyle: { color: 'rgba(124,184,255,0.55)', width: 2.2, curveness: 0.16, cap: 'round' },
          emphasis: {
            focus: 'adjacency',
            scale: 1.1,
            label: { ...labelStyle, fontSize: 13.5 },
            lineStyle: { width: 4, color: 'rgba(255,138,128,0.85)' },
          },
          force: { repulsion: 260, edgeLength: [70, 150], gravity: 0.08, friction: 0.16 },
          itemStyle: { opacity: 1 },
        },
      ],
    };
  }, [graph, visibleLinks, categoryMap]);

  const onChartClick = (params) => {
    if (params.componentType === 'series' && params.dataType === 'node') {
      navigate(`/kp/edit/${params.data.id}`);
    }
  };

  const linkCountByType = useMemo(() => {
    const counts = {};
    visibleLinks.forEach((link) => {
      counts[link.type] = (counts[link.type] || 0) + 1;
    });
    return counts;
  }, [visibleLinks]);

  const isEmpty = !loading && graph.nodes.length === 0;

  return (
    <div className="graph">
      <PageHead
        title="知识图谱"
        sub="正文引用、共同标签会自动连线；点一下「AI 推理关系」，模型会读出前置/延伸/易混/应用四类语义关系，并排出推荐学习路径。"
        icon={<AppIcon name="nav-graph" size={54} round />}
        actions={
          <ClayButton variant="ghost" onClick={load}>
            <IconRefresh size={16} /> 重新布局
          </ClayButton>
        }
      />

      <div className="graph__layout">
        <div className="graph__canvas">
          {loading ? (
            <div style={{ padding: 24 }}>
              <Skeleton height={480} />
            </div>
          ) : isEmpty ? (
            <div className="graph__empty">
              <div className="empty">
                <AppIcon name="act-empty" size={92} round />
                <div className="empty__title">图谱还是空的</div>
                <p className="empty__desc">创建两个以上知识点，这里就会长出第一根连线。</p>
                <ClayButton to="/kp/new">新建知识点</ClayButton>
              </div>
            </div>
          ) : (
            <ReactECharts
              option={seriesOption}
              style={{ height: '100%', width: '100%', minHeight: 540 }}
              opts={{ renderer: 'canvas' }}
              onEvents={{ click: onChartClick }}
              notMerge
            />
          )}
        </div>

        <ClayCard className="graph__legend">
          <div className="graph__legend-title">分类图例</div>
          <div className="graph__legend-group">
            {Array.from(categoryMap.entries()).map(([name, count], i) => (
              <div className="graph__legend-item" key={name}>
                <span className="graph__legend-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className="nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {name}
                </span>
                <span className="graph__legend-count">{count}</span>
              </div>
            ))}
            {categoryMap.size === 0 ? <span className="muted">暂无分类</span> : null}
          </div>

          <div className="graph__legend-title">关系图例</div>
          <div className="graph__legend-group">
            {LINK_LEGEND.map(({ type, label }) => (
              <div className="graph__legend-item" key={type}>
                <span
                  className="graph__legend-line"
                  style={{
                    background:
                      LINK_STYLE[type].type === 'dashed'
                        ? `repeating-linear-gradient(90deg, ${LINK_STYLE[type].color} 0 5px, transparent 5px 9px)`
                        : LINK_STYLE[type].color,
                  }}
                />
                <span className="nowrap">{label}</span>
                <span className="graph__legend-count">{linkCountByType[type] || 0}</span>
              </div>
            ))}
          </div>

          <div className="graph__ai">
            <p className="graph__ai-desc">
              {insights.relations.length > 0
                ? `已推理出 ${insights.relations.length} 条语义关系，粗线就是 AI 判断的依赖。`
                : '让模型读出知识点之间的前置、延伸、易混与应用关系。'}
            </p>
            <ClayButton variant="sky" size="sm" onClick={runReasoning} loading={inferring}>
              <IconSparkles size={15} /> {insights.relations.length > 0 ? '重新推理' : 'AI 推理关系'}
            </ClayButton>
          </div>

          {insights.path.length > 0 ? (
            <>
              <div className="graph__legend-title">推荐学习路径</div>
              <div className="graph__path">
                {insights.path.map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    className="graph__path-item"
                    onClick={() => navigate(`/feynman/${step.id}`)}
                    title={`去复述「${step.title}」`}
                  >
                    <span className="graph__path-stage">{step.stage}</span>
                    <span className="graph__path-body">
                      <span className="graph__path-title">{step.title}</span>
                      <span className="graph__path-meta">
                        {step.category} · 掌握 {step.mastery}%
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="graph__tip">
            节点越大表示正文越长，颜色对应分类。滚轮缩放、拖拽节点可以重新排布，双击画布可恢复布局。
          </div>

          <div className="stack-8">
            <span className="muted">
              共 {graph.nodes.length} 个知识点 · {visibleLinks.length} 条连线
            </span>
            <ClayButton to="/universe" variant="sky" size="sm">
              去知识宇宙看看
            </ClayButton>
          </div>
        </ClayCard>
      </div>
    </div>
  );
}