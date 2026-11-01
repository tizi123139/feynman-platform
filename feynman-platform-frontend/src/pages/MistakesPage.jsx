import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/axios';
import {
  ClayButton,
  ClayCard,
  ClayChip,
  ConfirmDialog,
  EmptyState,
  PageHead,
  SkeletonList,
  useToast,
} from '../components/ui/ClayKit';
import { AppIcon } from '../components/icons/AppIcon';
import { IconRefresh, IconTrash } from '../components/ui/icons';

const fmtDate = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function MistakesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [pending, setPending] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/quiz-attempts', { params: { correct: 'false' } });
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.response?.data?.msg || '加载错题失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    if (!pending) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/quiz-attempts/${pending._id}`);
      setItems((list) => list.filter((item) => item._id !== pending._id));
      toast.success('已从错题本移除');
      setPending(null);
    } catch (err) {
      toast.error(err.response?.data?.msg || '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = filter === 'all' ? items : items.filter((item) => item.knowledgePoint?._id === filter);
  const kpTabs = [];
  items.forEach((item) => {
    const kp = item.knowledgePoint;
    if (kp && !kpTabs.find((t) => t._id === kp._id)) kpTabs.push(kp);
  });

  return (
    <div className="mistakes">
      <PageHead
        title="错题本"
        sub="错过的题目会留在这里，重练一遍比重新看一遍更有效。"
        icon={<AppIcon name="act-quiz" size={54} round />}
        actions={
          <ClayButton variant="ghost" onClick={load}>
            <IconRefresh size={16} /> 刷新
          </ClayButton>
        }
      />

      {items.length > 0 ? (
        <div className="dash-chips">
          <ClayChip active={filter === 'all'} count={items.length} onClick={() => setFilter('all')}>
            全部
          </ClayChip>
          {kpTabs.map((kp) => (
            <ClayChip
              key={kp._id}
              tone="mint"
              active={filter === kp._id}
              count={items.filter((item) => item.knowledgePoint?._id === kp._id).length}
              onClick={() => setFilter(kp._id)}
            >
              {kp.title}
            </ClayChip>
          ))}
        </div>
      ) : null}

      {loading ? (
        <SkeletonList rows={3} />
      ) : filtered.length === 0 ? (
        <ClayCard>
          <EmptyState
            icon={<AppIcon name="badge-crown" size={92} round />}
            title="错题本是空的"
            desc="去测评几轮，答错的题目会自动收集到这里，方便集中攻克。"
            action={
              <ClayButton variant="primary" to="/">
                去首页挑个知识点
              </ClayButton>
            }
          />
        </ClayCard>
      ) : (
        <div className="stack-16">
          {filtered.map((item) => (
            <ClayCard key={item._id} className="mistake">
              <div className="mistake__head">
                <span className="tag tag--coral">{item.questionType === 'short-answer' ? '简答题' : '单选题'}</span>
                {item.knowledgePoint?.title ? <span className="tag tag--mute">{item.knowledgePoint.title}</span> : null}
                <span className="muted" style={{ marginLeft: 'auto' }}>
                  {fmtDate(item.createdAt)}
                </span>
              </div>
              <div className="mistake__q">{item.question}</div>
              <div className="mistake__row">
                <span className="mistake__badge mistake__badge--wrong">
                  你的答案：{item.userAnswer || '（未作答）'}
                </span>
                <span className="mistake__badge mistake__badge--right">参考：{item.answer || '—'}</span>
              </div>
              {item.explanation ? <div className="mistake__explain">{item.explanation}</div> : null}
              <div className="row-8 wrap" style={{ justifyContent: 'flex-end' }}>
                {item.knowledgePoint?._id ? (
                  <ClayButton
                    size="sm"
                    variant="sky"
                    onClick={() => navigate(`/quiz/${item.knowledgePoint._id}`)}
                  >
                    重练这个知识点
                  </ClayButton>
                ) : null}
                <ClayButton size="sm" variant="ghost" onClick={() => setPending(item)}>
                  <IconTrash size={14} /> 移除
                </ClayButton>
              </div>
            </ClayCard>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title="从错题本移除？"
        description="移除后这条答题记录会从错题本消失，历史统计也会相应减少。"
        confirmText="移除"
        danger
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}