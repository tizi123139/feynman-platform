import { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../api/axios';
import { ClayButton, ClayCard, PageHead, ProgressBar, Skeleton, useToast } from '../components/ui/ClayKit';
import { AppIcon } from '../components/icons/AppIcon';
import { BarChart, LineChart, PieChart } from '../components/charts/Charts';
import { IconRefresh } from '../components/ui/icons';

const levelOf = (count) => {
  if (count >= 8) return 4;
  if (count >= 5) return 3;
  if (count >= 2) return 2;
  if (count >= 1) return 1;
  return 0;
};

export default function StatsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [heatmap, setHeatmap] = useState({ weeks: 12, days: [] });
  const [overview, setOverview] = useState(null);
  const [report, setReport] = useState(null);
  const [points, setPoints] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [heatRes, overviewRes, reportRes, pointsRes] = await Promise.all([
        apiClient.get('/dashboard/heatmap', { params: { weeks: 12 } }),
        apiClient.get('/dashboard/overview'),
        apiClient.get('/dashboard/weekly-report'),
        apiClient.get('/knowledge-points', { params: { sort: 'mastery' } }),
      ]);
      setHeatmap(heatRes.data || { weeks: 12, days: [] });
      setOverview(overviewRes.data || null);
      setReport(reportRes.data || null);
      setPoints(Array.isArray(pointsRes.data) ? pointsRes.data : []);
    } catch (err) {
      toast.error(err.response?.data?.msg || '加载统计数据失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = useMemo(() => {
    const days = heatmap.days || [];
    const cols = [];
    for (let i = 0; i < days.length; i += 7) cols.push(days.slice(i, i + 7));
    return cols;
  }, [heatmap]);

  const activeDays = useMemo(() => (heatmap.days || []).filter((d) => d.count > 0).length, [heatmap]);
  const totalMinutes = useMemo(
    () => (heatmap.days || []).reduce((sum, d) => sum + (d.minutes || 0), 0),
    [heatmap]
  );

  // 热力图右侧的四个微指标
  const heatStats = useMemo(() => {
    const days = (heatmap.days || []).filter((d) => d.count > 0);
    const total = days.reduce((sum, d) => sum + (d.minutes || 0), 0);
    const best = days.reduce((top, d) => ((d.minutes || 0) > (top.minutes || 0) ? d : top), {});
    return {
      total,
      best: best.minutes || 0,
      bestDate: best.date || '',
      avg: days.length ? Math.round(total / days.length) : 0,
    };
  }, [heatmap]);

  const categoryData = useMemo(
    () => (overview?.categories || []).map((c) => ({ name: c.name, value: c.count })),
    [overview]
  );

  const masteryBuckets = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0];
    points.forEach((kp) => {
      const value = Number(kp.mastery) || 0;
      const idx = value >= 80 ? 4 : value >= 60 ? 3 : value >= 40 ? 2 : value >= 20 ? 1 : 0;
      buckets[idx] += 1;
    });
    return buckets;
  }, [points]);

  const dailyActions = useMemo(() => (report?.daily || []).map((d) => d.actions), [report]);
  const dailyLabels = useMemo(() => (report?.daily || []).map((d) => d.date.slice(5)), [report]);

  const counts = overview?.counts || {};
  const user = overview?.user || {};
  const level = overview?.level || { level: 1, percent: 0, current: 0, need: 50 };

  if (loading) {
    return (
      <div className="stats">
        <Skeleton height={34} width="30%" />
        <div className="stats__grid">
          <div className="clay-card stats__panel">
            <Skeleton height={190} />
          </div>
          <div className="clay-card stats__panel">
            <Skeleton height={190} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stats">
      <PageHead
        title="学习统计"
        sub="连续打卡、掌握度分布与最近 12 周的学习节奏。"
        icon={<AppIcon name="act-target" size={54} round />}
        actions={
          <ClayButton variant="ghost" onClick={load}>
            <IconRefresh size={16} /> 刷新
          </ClayButton>
        }
      />

      <ClayCard tone="soft" style={{ padding: '20px 24px' }}>
        <div className="row-16 wrap" style={{ gap: 22 }}>
          <div className="row-12 grow" style={{ minWidth: 220 }}>
            <AppIcon name="act-streak" size={54} round />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 21 }}>
                连续学习 {user.streak || 0} 天
              </div>
              <div className="muted">
                最长纪录 {user.longestStreak || 0} 天 · 累计 {user.xp || 0} XP
              </div>
            </div>
          </div>
          <div className="grow" style={{ minWidth: 200 }}>
            <div className="row-8" style={{ justifyContent: 'space-between', fontSize: 12.5, fontWeight: 800 }}>
              <span>Lv.{level.level}</span>
              <span className="muted">
                {level.current ?? 0} / {level.need ?? 50} XP
              </span>
            </div>
            <ProgressBar value={level.percent || 0} tone="butter" />
          </div>
        </div>
      </ClayCard>

      <div className="stats__grid">
        <ClayCard className="stats__panel stats__panel--wide stats__panel--heatmap">
          <div className="stats__panel-head">
            <h2 className="stats__panel-title">学习热力图（近 12 周）</h2>
            <span className="tag tag--mint">活跃 {activeDays} 天</span>
          </div>
          <div className="heatmap">
            <div className="heatmap__body">
              <div className="heatmap__weeks">
                {columns.map((col, i) => (
                  <div className="heatmap__week" key={i}>
                    {col.map((day) => (
                      <span
                        key={day.date}
                        className="heatmap__cell"
                        data-level={levelOf(day.count)}
                        title={`${day.date} · ${day.count} 次学习 · ${day.minutes} 分钟`}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="heatmap__foot">
                <div className="heatmap__legend">
                  <span>少</span>
                  {[0, 1, 2, 3, 4].map((l) => (
                    <span className="heatmap__cell" data-level={l} key={l} />
                  ))}
                  <span>多</span>
                </div>
                <span className="muted">12 周共学习 {Math.round(totalMinutes)} 分钟</span>
              </div>
            </div>

            <div className="heatmap__stats">
              <div className="heatmap__stat">
                <span className="heatmap__stat-value">{activeDays}</span>
                <span className="heatmap__stat-label">活跃天数</span>
              </div>
              <div className="heatmap__stat">
                <span className="heatmap__stat-value">{Math.round(heatStats.total)}</span>
                <span className="heatmap__stat-label">累计分钟</span>
              </div>
              <div className="heatmap__stat">
                <span className="heatmap__stat-value">{heatStats.best}</span>
                <span className="heatmap__stat-label">
                  单日最长{heatStats.bestDate ? ` · ${heatStats.bestDate.slice(5)}` : ''}
                </span>
              </div>
              <div className="heatmap__stat">
                <span className="heatmap__stat-value">{heatStats.avg}</span>
                <span className="heatmap__stat-label">日均分钟</span>
              </div>
            </div>
          </div>
        </ClayCard>

        <ClayCard className="stats__panel">
          <div className="stats__panel-head">
            <h2 className="stats__panel-title">分类分布</h2>
          </div>
          {categoryData.length ? (
            <div className="stats__chart">
              <PieChart data={categoryData} height={230} />
            </div>
          ) : (
            <p className="muted">还没有分类数据，先建几个知识点吧。</p>
          )}
        </ClayCard>

        <ClayCard className="stats__panel">
          <div className="stats__panel-head">
            <h2 className="stats__panel-title">掌握度分布</h2>
          </div>
          <div className="stats__chart">
            <BarChart
              labels={['0-20', '20-40', '40-60', '60-80', '80-100']}
              values={masteryBuckets}
              color="#7FD1B9"
              height={230}
            />
          </div>
        </ClayCard>

        <ClayCard className="stats__panel stats__panel--wide">
          <div className="stats__panel-head">
            <h2 className="stats__panel-title">最近 7 天学习动作</h2>
            <span className="muted">共 {report?.totals?.actions || 0} 次</span>
          </div>
          <div className="stats__chart stats__chart--tall">
            <LineChart labels={dailyLabels} values={dailyActions} color="#7CB8FF" height={268} />
          </div>
        </ClayCard>
      </div>

      <div className="stats__summary">
        <ClayCard className="stat-tile" flat>
          <AppIcon name="nav-library" size={46} round />
          <div className="stat-tile__body">
            <div className="stat-tile__value">{counts.total || 0}</div>
            <div className="stat-tile__label">知识点</div>
          </div>
        </ClayCard>
        <ClayCard className="stat-tile" flat>
          <AppIcon name="badge-crown" size={46} round />
          <div className="stat-tile__body">
            <div className="stat-tile__value">{counts.mastered || 0}</div>
            <div className="stat-tile__label">已掌握</div>
          </div>
        </ClayCard>
        <ClayCard className="stat-tile" flat>
          <AppIcon name="nav-review" size={46} round />
          <div className="stat-tile__body">
            <div className="stat-tile__value">{counts.due || 0}</div>
            <div className="stat-tile__label">待复习</div>
          </div>
        </ClayCard>
        <ClayCard className="stat-tile" flat>
          <AppIcon name="act-streak" size={46} round />
          <div className="stat-tile__body">
            <div className="stat-tile__value">{report?.totals?.avgScore || 0}</div>
            <div className="stat-tile__label">复述平均分</div>
          </div>
        </ClayCard>
      </div>

      <p className="muted" style={{ textAlign: 'center' }}>
        复习节奏按 SM-2 记忆曲线自动安排，热力图统计近 12 周的学习动作。
      </p>
    </div>
  );
}