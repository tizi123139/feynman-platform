/* 学习周报：概览指标 + 图表 + Canvas 分享卡片 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/axios';
import { ClayButton, ClayCard, PageHead, ProgressBar, Skeleton, useToast } from '../components/ui/ClayKit';
import { AppIcon } from '../components/icons/AppIcon';
import { BarChart, PieChart } from '../components/charts/Charts';
import { IconDownload, IconRefresh } from '../components/ui/icons';
import AnnualReportCard from '../components/AnnualReportCard';

const TYPE_LABEL = {
  create: '新建',
  edit: '编辑',
  review: '复习',
  feynman: '复述',
  quiz: '测评',
  chat: 'AI 对话',
  flashcard: '闪卡',
  explore: '探索',
};

const CARD_W = 720;
const CARD_H = 1000;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function ReportPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [name, setName] = useState('同学');
  const canvasRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reportRes, meRes] = await Promise.all([
        apiClient.get('/dashboard/weekly-report'),
        apiClient.get('/users/me'),
      ]);
      setReport(reportRes.data || null);
      const me = meRes.data?.user || meRes.data;
      setName(me?.displayName || me?.username || '同学');
    } catch (err) {
      toast.error(err.response?.data?.msg || '加载周报失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = report?.totals || {};
  const typeEntries = useMemo(
    () =>
      Object.entries(report?.typeCounts || {})
        .map(([key, value]) => ({ name: TYPE_LABEL[key] || key, value }))
        .sort((a, b) => b.value - a.value),
    [report]
  );
  const dailyLabels = useMemo(() => (report?.daily || []).map((d) => d.date.slice(5)), [report]);
  const dailyMinutes = useMemo(() => (report?.daily || []).map((d) => d.minutes || 0), [report]);

  /* 用原生 Canvas 绘制分享卡片，不依赖任何图形库 */
  const drawCard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const totals = report?.totals || {};

    canvas.width = CARD_W;
    canvas.height = CARD_H;

    const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    bg.addColorStop(0, '#FFF8F0');
    bg.addColorStop(0.55, '#FFF1F0');
    bg.addColorStop(1, '#F1EEFF');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    const bubbles = [
      [90, 120, 74, 'rgba(255, 209, 102, 0.42)'],
      [620, 90, 58, 'rgba(183, 156, 255, 0.42)'],
      [660, 560, 88, 'rgba(127, 209, 185, 0.34)'],
      [70, 640, 56, 'rgba(255, 138, 128, 0.3)'],
    ];
    bubbles.forEach(([x, y, r, color]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });

    ctx.save();
    ctx.shadowColor = 'rgba(61, 58, 75, 0.16)';
    ctx.shadowBlur = 42;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, 56, 116, CARD_W - 112, CARD_H - 232, 44);
    ctx.fill();
    ctx.restore();

    const centerX = CARD_W / 2;
    const left = 108;
    const right = CARD_W - 108;
    const contentW = right - left;
    ctx.textAlign = 'center';

    ctx.font = '700 22px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#8B8598';
    ctx.fillText('FEYNMAN LAB · 学习周报', centerX, 190);

    ctx.font = '56px "ZCOOL KuaiLe", "PingFang SC", sans-serif';
    ctx.fillStyle = '#3D3A4B';
    ctx.fillText('这一周，讲明白了吗？', centerX, 264);

    ctx.font = '700 24px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#6E6A80';
    ctx.fillText(`${report?.range?.from || ''} — ${report?.range?.to || ''}`, centerX, 306);

    ctx.beginPath();
    ctx.arc(centerX, 400, 72, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF3D6';
    ctx.fill();
    ctx.font = '76px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.fillText('💡', centerX, 429);

    const stats = [
      ['学习动作', `${totals.actions || 0}`, '次'],
      ['专注时长', `${totals.minutes || 0}`, '分钟'],
      ['活跃天数', `${totals.activeDays || 0}`, '/7 天'],
      ['复述均分', `${totals.avgScore || 0}`, '分'],
    ];
    const tileW = 238;
    const tileH = 104;
    const tileGap = 28;
    stats.forEach(([label, value, unit], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = left + col * (tileW + tileGap);
      const y = 510 + row * (tileH + 20);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#FBF5EE';
      roundRect(ctx, x, y, tileW, tileH, 26);
      ctx.fill();

      ctx.font = '800 46px "Baloo 2", "PingFang SC", sans-serif';
      ctx.fillStyle = ['#EF6A60', '#2E9C82', '#3E7FC4', '#B98A1F'][i];
      ctx.fillText(value, x + 24, y + 58);

      ctx.font = '700 20px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#8B8598';
      ctx.fillText(`${label} · ${unit}`, x + 24, y + 86);
    });

    ctx.textAlign = 'left';
    ctx.font = '700 22px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#3D3A4B';
    ctx.fillText('本周打卡进度', left, 782);

    ctx.textAlign = 'right';
    ctx.font = '700 20px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#8B8598';
    ctx.fillText(`${Math.min(7, totals.activeDays || 0)} / 7 天`, right, 782);

    roundRect(ctx, left, 798, contentW, 20, 10);
    ctx.fillStyle = 'rgba(61, 58, 75, 0.08)';
    ctx.fill();
    roundRect(ctx, left, 798, (contentW * Math.min(7, totals.activeDays || 0)) / 7, 20, 10);
    const bar = ctx.createLinearGradient(left, 0, right, 0);
    bar.addColorStop(0, '#FFB1A8');
    bar.addColorStop(1, '#EF6A60');
    ctx.fillStyle = bar;
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.font = '700 20px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#8B8598';
    ctx.fillText(`${name} · 累计 ${totals.xp || 0} XP · 新增 ${totals.newNotes || 0} 个知识点`, centerX, 856);
  }, [name, report]);

  useEffect(() => {
    if (!loading) drawCard();
  }, [loading, drawCard]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `feynman-weekly-${report?.range?.to || 'report'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast.success('分享图已保存到下载目录');
  };

  if (loading) {
    return (
      <div className="report">
        <Skeleton height={34} width="26%" />
        <div className="report__grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div className="clay-card report__panel" key={i}>
              <Skeleton height={170} />
            </div>
          ))}
        </div>
        <Skeleton height={320} />
      </div>
    );
  }

  return (
    <div className="report">
      <PageHead
        title="学习周报"
        sub={`${report?.range?.from || ''} 至 ${report?.range?.to || ''} 的学习汇总，可导出分享图。`}
        icon={<AppIcon name="nav-library" size={54} round />}
        actions={
          <>
            <ClayButton variant="ghost" onClick={load}>
              <IconRefresh size={16} /> 刷新
            </ClayButton>
            <ClayButton onClick={download}>
              <IconDownload size={16} /> 导出分享图
            </ClayButton>
          </>
        }
      />

      <div className="report__grid">
        <ClayCard className="report__panel">
          <h2 className="report__panel-title">本周数据</h2>
          <div className="report__metrics">
            <div className="report__metric">
              <div className="report__metric-value">{totals.actions || 0}</div>
              <div className="report__metric-label">学习动作</div>
            </div>
            <div className="report__metric">
              <div className="report__metric-value">{totals.minutes || 0}</div>
              <div className="report__metric-label">专注分钟</div>
            </div>
            <div className="report__metric">
              <div className="report__metric-value">{totals.activeDays || 0}</div>
              <div className="report__metric-label">活跃天数</div>
            </div>
            <div className="report__metric">
              <div className="report__metric-value">{totals.avgScore || 0}</div>
              <div className="report__metric-label">复述平均分</div>
            </div>
          </div>
          <div className="row-8 wrap" style={{ marginTop: 14 }}>
            <span className="tag tag--mint">+{totals.xp || 0} XP</span>
            <span className="tag tag--sky">新增 {totals.newNotes || 0} 个知识点</span>
          </div>
        </ClayCard>

        <ClayCard className="report__panel">
          <h2 className="report__panel-title">每日投入（分钟）</h2>
          <BarChart labels={dailyLabels} values={dailyMinutes} color="#7CB8FF" height={222} />
        </ClayCard>

        <ClayCard className="report__panel">
          <h2 className="report__panel-title">学习动作构成</h2>
          {typeEntries.length ? (
            <PieChart data={typeEntries} height={222} />
          ) : (
            <p className="muted">本周还没有学习记录，去讲一个知识点吧。</p>
          )}
        </ClayCard>
      </div>

      <div className="report__split">
        <ClayCard className="report__panel report__panel--stack">
          <h2 className="report__panel-title">需要巩固的知识点</h2>
          {report?.weakPoints?.length ? (
            <div className="report__list">
              {report.weakPoints.map((kp) => (
                <div className="report__list-item" key={kp.id}>
                  <AppIcon name="act-target" size={38} round />
                  <div className="report__list-main">
                    <div className="report__list-title">{kp.title}</div>
                    <div className="report__list-meta">
                      <span className="report__list-cat">{kp.category || '未分类'}</span>
                      <span className="report__list-value">掌握度 {kp.mastery}%</span>
                    </div>
                    <ProgressBar value={kp.mastery} className="report__list-bar" />
                  </div>
                  <Link to={`/feynman/${kp.id}`} className="clay-btn clay-btn--ghost clay-btn--sm">
                    去复述
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">暂时没有薄弱点，保持节奏就好。</p>
          )}

          <div className="report__list-foot">
            <div className="report__list-foot-head">
              <span>本周新增知识点</span>
              <span className="muted">{totals.newNotes || 0} 个</span>
            </div>
            <ProgressBar value={Math.min(100, (totals.newNotes || 0) * 20)} tone="butter" />
          </div>
        </ClayCard>

        <ClayCard className="report__panel">
          <h2 className="report__panel-title">分享卡片预览</h2>
          <div className="report__share-preview">
            <canvas ref={canvasRef} />
          </div>
          <div className="row-8 wrap" style={{ marginTop: 14 }}>
            <ClayButton size="sm" onClick={download}>
              <IconDownload size={15} /> 保存 PNG
            </ClayButton>
            <span className="muted">卡片由 Canvas 实时绘制，可直接分享到社交平台</span>
          </div>
        </ClayCard>
      </div>

      <AnnualReportCard name={name} />
    </div>
  );
}