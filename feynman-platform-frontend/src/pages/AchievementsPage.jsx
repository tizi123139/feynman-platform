/* 成就徽章墙 + 每日挑战 */
import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../api/axios';
import {
  ClayButton,
  ClayCard,
  PageHead,
  ProgressBar,
  ProgressRing,
  Skeleton,
  useToast,
} from '../components/ui/ClayKit';
import { AppIcon } from '../components/icons/AppIcon';
import { IconCheck, IconRefresh, IconTrophy } from '../components/ui/icons';
import burstConfetti from '../utils/confetti';

const TONE_TO_COLOR = {
  mint: 'var(--mint)',
  sky: 'var(--sky)',
  coral: 'var(--coral)',
  butter: 'var(--butter)',
  lilac: 'var(--lilac)',
};

export default function AchievementsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [checking, setChecking] = useState(false);
  const seenRef = useRef(null);

  const load = useCallback(
    async ({ celebrate = false } = {}) => {
      try {
        const [achvRes, taskRes] = await Promise.all([
          apiClient.get('/achievements'),
          apiClient.get('/achievements/daily-tasks'),
        ]);
        const payload = achvRes.data || {};
        setData(payload);
        setTasks(taskRes.data?.tasks || []);

        // 首次进入记录基线，之后数量增加则放彩带庆祝
        const count = payload.unlockedCount || 0;
        if (celebrate) {
          setChecking(true);
          try {
            const { data: check } = await apiClient.post('/achievements/check');
            if (Array.isArray(check?.unlocked) && check.unlocked.length) {
              burstConfetti({ count: 110 });
              toast.success(`解锁新徽章：${check.unlocked.map((a) => a.name).join('、')}`);
              const again = await apiClient.get('/achievements');
              setData(again.data || payload);
            } else {
              toast.info('暂无新徽章，继续加油！');
            }
          } catch {
            toast.error('检查成就失败，请稍后再试');
          } finally {
            setChecking(false);
          }
        }
        if (seenRef.current !== null && count > seenRef.current) {
          burstConfetti({ count: 100 });
        }
        seenRef.current = count;
      } catch (err) {
        toast.error(err.response?.data?.msg || '加载成就失败');
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    load();
  }, [load]);

  const achievements = data?.achievements || [];
  const unlockedCount = data?.unlockedCount || 0;
  const total = data?.total || achievements.length || 0;
  const percent = total ? Math.round((unlockedCount / total) * 100) : 0;
  const level = data?.level || { level: 1, percent: 0, current: 0, needed: 50 };
  const doneCount = tasks.filter((t) => t.done).length;

  if (loading) {
    return (
      <div className="achv">
        <Skeleton height={34} width="26%" />
        <div className="achv__grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div className="clay-card" key={i} style={{ padding: 22 }}>
              <Skeleton height={64} width={64} radius="50%" />
              <div style={{ height: 12 }} />
              <Skeleton height={16} width="60%" />
              <div style={{ height: 8 }} />
              <Skeleton height={12} width="84%" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="achv">
      <PageHead
        title="成就徽章"
        sub="每一次坚持都会被记下来，解锁一枚就放一次彩带。"
        icon={<AppIcon name="nav-trophy" size={54} round />}
        actions={
          <ClayButton variant="ghost" loading={checking} onClick={() => load({ celebrate: true })}>
            <IconRefresh size={16} /> 检查新徽章
          </ClayButton>
        }
      />

      <div className="grid-2" style={{ alignItems: 'stretch' }}>
        <ClayCard tone="butter" className="row-16 wrap" style={{ gap: 22 }}>
          <ProgressRing value={percent} size={104} thickness={12} color="var(--butter)" label="收集" />
          <div className="grow" style={{ minWidth: 170 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 4 }}>
              {unlockedCount} / {total} 枚徽章
            </div>
            <p className="muted" style={{ marginBottom: 10 }}>
              累计 {data?.xp || 0} XP · 连续 {data?.streak || 0} 天 · 最长 {data?.longestStreak || 0} 天
            </p>
            <div className="row-8" style={{ justifyContent: 'space-between', fontSize: 12, fontWeight: 800 }}>
              <span>Lv.{level.level}</span>
              <span className="muted">
                {level.current ?? 0} / {level.needed ?? 50} XP
              </span>
            </div>
            <ProgressBar value={level.percent || 0} tone="mint" />
          </div>
        </ClayCard>

        <ClayCard className="stats__panel" tone="soft">
          <div className="stats__panel-head">
            <h2 className="stats__panel-title">今日挑战</h2>
            <span className="tag tag--mint">
              完成 {doneCount}/{tasks.length || 3}
            </span>
          </div>
          <div className="daily">
            {tasks.map((task) => (
              <div className={`daily__item${task.done ? ' is-done' : ''}`} key={task.key}>
                {task.done ? (
                  <span className="tag tag--mint">
                    <IconCheck size={12} /> 完成
                  </span>
                ) : (
                  <AppIcon name="act-target" size={34} round />
                )}
                <div className="daily__label">
                  <div>{task.title}</div>
                  <div className="muted" style={{ fontWeight: 700 }}>
                    {task.desc}
                  </div>
                </div>
                <span className="daily__count">
                  {task.progress}/{task.goal}
                </span>
                <span className="tag tag--butter">+{task.xp} XP</span>
              </div>
            ))}
          </div>
        </ClayCard>
      </div>

      <div className="section-head">
        <h2 className="row-8">
          <IconTrophy size={20} /> 徽章墙
        </h2>
        <span className="muted">已解锁的徽章会点亮，未解锁的显示进度</span>
      </div>

      <div className="achv__grid">
        {achievements.map((item) => {
          const color = TONE_TO_COLOR[item.tint] || 'var(--coral)';
          const ratio = item.goal ? Math.min(100, Math.round((item.rawProgress / item.goal) * 100)) : 0;
          return (
            <div className={`achv__item${item.unlocked ? '' : ' is-locked'}`} key={item.key}>
              <AppIcon name={item.icon} size={66} round />
              <div className="achv__name">{item.name}</div>
              <p className="achv__desc">{item.desc}</p>
              {item.unlocked ? (
                <span className="achv__unlocked">
                  <IconCheck size={12} /> 已解锁 · +{item.xp} XP
                </span>
              ) : (
                <div className="achv__progress">
                  <div className="achv__progress-text">
                    <span>
                      {Math.min(item.rawProgress, item.goal)} / {item.goal} {item.unit}
                    </span>
                    <span>{ratio}%</span>
                  </div>
                  <ProgressBar value={ratio} />
                </div>
              )}
              <span className="achv__progress-text" style={{ width: '100%', marginTop: 2 }}>
                <span style={{ color }}>●</span>
                <span>{item.unlocked ? '继续保持' : '待解锁'}</span>
              </span>
            </div>
          );
        })}
      </div>

      <p className="muted" style={{ textAlign: 'center' }}>
        成就由学习行为自动判定，解锁瞬间会自动发放经验并播放彩带。
      </p>
    </div>
  );
}