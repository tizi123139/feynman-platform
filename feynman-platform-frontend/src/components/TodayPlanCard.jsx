import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClayButton,
  ClayCard,
  ProgressBar,
  Skeleton,
  useToast,
} from './ui/ClayKit';
import { IconCheck, IconClose, IconFlame, IconPlus, IconSparkles } from './ui/icons';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const mmss = (seconds) => {
  const safe = Math.max(0, Math.round(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/** 番茄阶段流转：专注 → 休息 → 下一个专注 */
function advance(timer) {
  if (timer.phase === 'focus') {
    return { ...timer, phase: 'rest', left: timer.restSeconds, total: timer.restSeconds, running: true };
  }
  const next = timer.pods[timer.index];
  if (!next) return { ...timer, phase: 'done', running: false, left: 0, total: 1 };
  const seconds = next.minutes * 60;
  return { ...timer, index: timer.index + 1, phase: 'focus', left: seconds, total: seconds, running: true };
}

function FocusLayer({ timer, onClose, onToggle, onSkip }) {
  const progress = timer.total > 0 ? ((timer.total - timer.left) / timer.total) * 100 : 0;
  const isRest = timer.phase === 'rest';
  const isDone = timer.phase === 'done';
  const current = timer.pods[timer.index - 1];

  return (
    <div className="focus-layer" role="dialog" aria-modal="true" aria-label="番茄专注计时">
      <div className="focus-card">
        <div className="focus-card__head">
          <span className="focus-card__eyebrow">
            {isRest ? '休息一下' : isDone ? '今天走完一轮了' : `第 ${timer.index} / ${timer.pods.length} 个番茄`}
          </span>
          <button type="button" className="focus-card__close" onClick={onClose} aria-label="关闭计时">
            <IconClose size={16} />
          </button>
        </div>

        <div className="focus-card__dial">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle className="focus-card__dial-bg" cx="60" cy="60" r={RADIUS} />
            <circle
              className={`focus-card__dial-value${isRest ? ' is-rest' : ''}`}
              cx="60"
              cy="60"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress / 100)}
            />
          </svg>
          <div className="focus-card__dial-text">
            <span className="focus-card__time">{isDone ? '完成' : mmss(timer.left)}</span>
            <span className="focus-card__hint">{isRest ? '休息' : isDone ? '收工' : '专注'}</span>
          </div>
        </div>

        <p className="focus-card__label">
          {isRest ? '起身、喝水、别再刷手机' : isDone ? '本轮的番茄都完成了，去休息一下吧' : current?.label || timer.label}
        </p>

        <div className="focus-card__actions">
          {isDone ? (
            <ClayButton variant="primary" onClick={onClose}>
              收工
            </ClayButton>
          ) : (
            <>
              <ClayButton variant="ghost" onClick={onSkip}>
                跳过这段
              </ClayButton>
              <ClayButton variant={isRest ? 'sky' : 'mint'} onClick={onToggle}>
                {timer.running ? '暂停' : '继续'}
              </ClayButton>
              <ClayButton variant="primary" onClick={onSkip}>
                提前结束
              </ClayButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanSkeleton() {
  return (
    <ClayCard className="plan">
      <Skeleton width="38%" height={22} />
      <div style={{ height: 12 }} />
      <Skeleton width="76%" height={13} />
      <div style={{ height: 18 }} />
      <Skeleton width="100%" height={72} />
    </ClayCard>
  );
}

export default function TodayPlanCard({ plan, loading }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [timer, setTimer] = useState(null);

  useEffect(() => {
    if (!timer?.running) return undefined;
    const id = setInterval(() => {
      setTimer((prev) => {
        if (!prev || !prev.running) return prev;
        if (prev.left <= 1) return advance(prev);
        return { ...prev, left: prev.left - 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timer?.running]);

  useEffect(() => {
    if (!timer) return;
    if (timer.phase === 'rest') toast.info('专注完成，休息一下');
    else if (timer.phase === 'focus') toast.success(`第 ${timer.index} 个番茄开始`);
  }, [timer?.phase, timer?.index]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = plan?.items || [];
  const pomodoros = plan?.pomodoros || [];
  const today = plan?.today || { minutes: 0, xp: 0 };

  const totalMinutes = items.reduce((sum, item) => sum + item.minutes, 0);
  const doneCount = items.filter((item) => item.done).length;

  if (loading) return <PlanSkeleton />;
  if (!plan) return null;

  const startPomodoro = (pod) => {
    const seconds = pod.minutes * 60;
    setTimer({
      pods: pomodoros,
      index: pod.index,
      phase: 'focus',
      left: seconds,
      total: seconds,
      running: true,
      restSeconds: Math.max(1, plan.rest || 5) * 60,
      label: pod.label,
    });
  };

  return (
    <>
      <section className="clay-card plan">
        <div className="plan__head">
          <div className="plan__head-main">
            <span className="plan__eyebrow">
              <IconFlame size={15} /> 今日学习计划
            </span>
            <h2 className="plan__title">{plan.summary}</h2>
            <div className="plan__meta">
              <span>{items.length} 个任务</span>
              <span>·</span>
              <span>预计 {totalMinutes} 分钟</span>
              <span>·</span>
              <span>{pomodoros.length} 个番茄</span>
              <span>·</span>
              <span>已投入 {today.minutes || 0} 分钟</span>
            </div>
          </div>
          <div className="plan__score">
            <span className="plan__score-value">{plan.percent || 0}%</span>
            <span className="plan__score-label">
              完成 {doneCount}/{items.length}
            </span>
          </div>
        </div>

        <div className="plan__progress">
          <ProgressBar value={plan.percent || 0} tone="mint" />
        </div>

        {items.length === 0 ? (
          <div className="plan__empty">
            <span className="plan__empty-icon">
              <IconSparkles size={26} />
            </span>
            <div>
              <div className="plan__empty-title">今天还没有排程</div>
              <div className="plan__empty-desc">先记录一个概念，系统明天就会自动把它排进计划。</div>
            </div>
            <ClayButton size="sm" variant="primary" onClick={() => navigate('/kp/new')}>
              <IconPlus size={15} /> 新建知识点
            </ClayButton>
          </div>
        ) : (
          <ol className="plan__list">
            {items.map((item, index) => (
              <li key={item.key} className={`plan__item${item.done ? ' is-done' : ''}`}>
                <span className={`plan__dot plan__dot--${item.tone}`}>
                  {item.done ? <IconCheck size={14} /> : index + 1}
                </span>
                <div className="plan__item-body">
                  <div className="plan__item-row">
                    <span className={`plan__badge plan__badge--${item.tone}`}>{item.badge}</span>
                    <span className="plan__name">{item.title}</span>
                    <span className="plan__minutes">{item.minutes} min</span>
                  </div>
                  <div className="plan__reason">{item.reason}</div>
                </div>
                <ClayButton
                  size="sm"
                  variant={item.done ? 'ghost' : 'primary'}
                  onClick={() => navigate(item.link)}
                >
                  {item.done ? '再看一遍' : '去完成'}
                </ClayButton>
              </li>
            ))}
          </ol>
        )}

        {pomodoros.length > 0 ? (
          <div className="plan__track-wrap">
            <div className="plan__track-label">番茄序列 · 点一下就开始计时</div>
            <div className="plan__track">
              {pomodoros.map((pod, index) => (
                <Fragment key={pod.index}>
                  {index > 0 ? (
                    <span className="plan__rest" aria-hidden="true">
                      {plan.rest || 5}′
                    </span>
                  ) : null}
                  <button type="button" className="plan__pod" onClick={() => startPomodoro(pod)}>
                    <span className="plan__pod-index">番茄 {pod.index}</span>
                    <span className="plan__pod-label">{pod.label}</span>
                    <span className="plan__pod-minutes">{pod.minutes} 分钟</span>
                  </button>
                </Fragment>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {timer ? (
        <FocusLayer
          timer={timer}
          onClose={() => setTimer(null)}
          onToggle={() => setTimer((prev) => (prev ? { ...prev, running: !prev.running } : prev))}
          onSkip={() => setTimer((prev) => (prev ? advance(prev) : prev))}
        />
      ) : null}
    </>
  );
}
