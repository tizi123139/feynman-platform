import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import apiClient from '../api/axios';
import { ClayButton, ClayCard, EmptyState, PageHead, ProgressBar, SkeletonList, useToast } from '../components/ui/ClayKit';
import { AppIcon } from '../components/icons/AppIcon';
import { IconCheck, IconRefresh } from '../components/ui/icons';

const GRADES = [
  { value: 1, label: '忘记了', hint: '明天再来', cls: 'review__grade--1' },
  { value: 3, label: '有点难', hint: '缩短间隔', cls: 'review__grade--2' },
  { value: 4, label: '记得', hint: '正常推进', cls: 'review__grade--3' },
  { value: 5, label: '很简单', hint: '拉长间隔', cls: 'review__grade--4' },
];

const nextDueText = (date) => {
  if (!date) return '稍后';
  const diff = new Date(date).getTime() - Date.now();
  const days = Math.max(1, Math.round(diff / (24 * 60 * 60 * 1000)));
  return `${days} 天后`;
};

export default function ReviewPage() {
  const toast = useToast();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [lastResult, setLastResult] = useState(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/knowledge-points/review/due');
      setQueue(Array.isArray(data) ? data : []);
      setFlipped(false);
    } catch (err) {
      toast.error(err.response?.data?.msg || '加载复习队列失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const current = queue[0];
  const total = queue.length + doneCount;
  const progress = total ? Math.round((doneCount / total) * 100) : 0;

  const grade = async (value) => {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      const { data } = await apiClient.post(`/knowledge-points/${current._id}/review`, { grade: value });
      setLastResult({
        title: current.title,
        dueAt: data?.knowledgePoint?.review?.dueAt,
        mastery: data?.knowledgePoint?.mastery,
        xp: data?.reward?.xp,
      });
      setQueue((list) => list.slice(1));
      setDoneCount((n) => n + 1);
      setFlipped(false);
      if (data?.reward?.xp) toast.success(`复习完成，+${data.reward.xp} XP`);
    } catch (err) {
      toast.error(err.response?.data?.msg || '提交复习失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="review">
      <PageHead
        title="今日复习"
        sub="按记忆曲线推送的到期知识点，评价越准确，间隔安排越贴合你的记忆。"
        icon={<AppIcon name="nav-review" size={54} round />}
        actions={
          <ClayButton variant="ghost" onClick={loadQueue}>
            <IconRefresh size={16} /> 刷新队列
          </ClayButton>
        }
      />

      {loading ? (
        <SkeletonList rows={2} />
      ) : queue.length === 0 ? (
        <ClayCard>
          <EmptyState
            icon={<AppIcon name="badge-seed" size={92} round />}
            title={doneCount > 0 ? '今天的复习都完成啦' : '暂时没有到期的知识点'}
            desc={
              doneCount > 0
                ? `本轮巩固了 ${doneCount} 个知识点，下一次会出现在更合适的时间点。`
                : '新建知识点后会自动进入复习计划，到点就会出现在这里。'
            }
            action={
              <div className="row-12 wrap" style={{ justifyContent: 'center' }}>
                <ClayButton variant="primary" to="/kp/new">
                  新建知识点
                </ClayButton>
                <ClayButton variant="ghost" to="/">
                  回首页看看
                </ClayButton>
              </div>
            }
          />
        </ClayCard>
      ) : (
        <>
          <ClayCard className="review__head">
            <div className="review__stat">
              <AppIcon name="nav-review" size={28} plain /> 剩余 {queue.length} 个
            </div>
            <div className="review__stat">
              <AppIcon name="nav-library" size={28} plain /> 已完成 {doneCount} 个
            </div>
            <div className="grow" style={{ minWidth: 160 }}>
              <ProgressBar value={progress} tone="mint" />
            </div>
            <span className="muted">{progress}%</span>
          </ClayCard>

          <div className="review__card-stage">
            <div
              className={`review__card${flipped ? ' is-flipped' : ''}`}
              onClick={() => setFlipped((v) => !v)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setFlipped((v) => !v);
              }}
            >
              <div className="review__face">
                <span className="review__face-label">提示 · 点击翻转</span>
                <h2 className="review__face-title">{current?.title}</h2>
                <div className="row-8 wrap">
                  <span className="tag tag--coral">{current?.category || '未分类'}</span>
                  {(current?.tags || []).map((tag) => (
                    <span className="tag" key={tag}>
                      #{tag}
                    </span>
                  ))}
                </div>
                <p className="review__face-body">
                  {current?.summary || '先在心里讲一遍：它是什么？为什么这样？能举什么例子？想好了再翻面。'}
                </p>
                <span className="review__flip-hint">↻ 点一下卡片看内容</span>
              </div>
              <div className="review__face review__face--back">
                <span className="review__face-label">内容 · 对照检查</span>
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {(current?.content || '（这个知识点还没有内容）').slice(0, 1600)}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>

          <div className="review__grades">
            {GRADES.map((item) => (
              <button
                type="button"
                key={item.value}
                className={`review__grade ${item.cls}`}
                onClick={() => grade(item.value)}
                disabled={submitting}
              >
                <span>{item.label}</span>
                <small>{item.hint}</small>
              </button>
            ))}
          </div>

          {lastResult ? (
            <div className="notice notice--mint" style={{ justifyContent: 'center' }}>
              <IconCheck size={16} />
              「{lastResult.title}」已记录，下次复习：{nextDueText(lastResult.dueAt)}
              {lastResult.mastery !== undefined ? ` · 掌握度 ${lastResult.mastery}` : ''}
            </div>
          ) : (
            <p className="muted" style={{ textAlign: 'center' }}>
              评价越诚实，复习越省力：想不起来就选「忘记了」。
            </p>
          )}
        </>
      )}
    </div>
  );
}