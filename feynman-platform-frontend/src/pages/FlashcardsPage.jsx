import { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../api/axios';
import {
  ClayButton,
  ClayCard,
  ClayChip,
  EmptyState,
  PageHead,
  Select,
  SkeletonList,
  useToast,
} from '../components/ui/ClayKit';
import { AppIcon } from '../components/icons/AppIcon';
import { IconRefresh, IconSparkles, IconTrash } from '../components/ui/icons';

const GRADES = [
  { value: 1, label: '忘记', cls: 'review__grade--1' },
  { value: 3, label: '模糊', cls: 'review__grade--2' },
  { value: 5, label: '记得', cls: 'review__grade--4' },
];

const dueText = (date) => {
  if (!date) return '待复习';
  const diff = new Date(date).getTime() - Date.now();
  if (diff <= 0) return '今天到期';
  const days = Math.round(diff / (24 * 60 * 60 * 1000));
  return `${days} 天后`;
};

export default function FlashcardsPage() {
  const toast = useToast();
  const [cards, setCards] = useState([]);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dueOnly, setDueOnly] = useState(false);
  const [selectedKp, setSelectedKp] = useState('');
  const [generating, setGenerating] = useState(false);
  const [flipped, setFlipped] = useState({});
  const [busyId, setBusyId] = useState('');
  const [nowTs] = useState(() => Date.now());

  const loadCards = useCallback(
    async (onlyDue = dueOnly) => {
      setLoading(true);
      try {
        const { data } = await apiClient.get('/flashcards', { params: onlyDue ? { due: 1 } : {} });
        setCards(Array.isArray(data) ? data : []);
      } catch (err) {
        toast.error(err.response?.data?.msg || '加载闪卡失败');
      } finally {
        setLoading(false);
      }
    },
    [dueOnly, toast]
  );

  const loadPoints = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/knowledge-points');
      const list = Array.isArray(data) ? data : [];
      setPoints(list);
      if (list.length > 0) setSelectedKp((prev) => prev || list[0]._id);
    } catch {
      /* 忽略 */
    }
  }, []);

  useEffect(() => {
    loadCards(dueOnly);
  }, [loadCards, dueOnly]);

  useEffect(() => {
    loadPoints();
  }, [loadPoints]);

  const generate = async () => {
    if (!selectedKp) {
      toast.warn('先选择一个知识点');
      return;
    }
    setGenerating(true);
    try {
      const { data } = await apiClient.post('/ai/flashcards', { knowledgePointId: selectedKp, count: 5 }, { timeout: 90000 });
      toast.success(`生成了 ${data.cards?.length || 0} 张闪卡`);
      await loadCards(dueOnly);
    } catch (err) {
      toast.error(err.response?.data?.msg || '生成闪卡失败');
    } finally {
      setGenerating(false);
    }
  };

  const review = async (card, grade) => {
    setBusyId(card._id);
    try {
      const { data } = await apiClient.post(`/flashcards/${card._id}/review`, { grade });
      setCards((list) =>
        list.map((item) => (item._id === card._id ? { ...item, ...data.card } : item))
      );
      setFlipped((prev) => ({ ...prev, [card._id]: false }));
      if (data?.reward?.xp) toast.success(`+${data.reward.xp} XP`);
    } catch (err) {
      toast.error(err.response?.data?.msg || '复习闪卡失败');
    } finally {
      setBusyId('');
    }
  };

  const remove = async (card) => {
    setBusyId(card._id);
    try {
      await apiClient.delete(`/flashcards/${card._id}`);
      setCards((list) => list.filter((item) => item._id !== card._id));
      toast.success('闪卡已删除');
    } catch (err) {
      toast.error(err.response?.data?.msg || '删除失败');
    } finally {
      setBusyId('');
    }
  };

  const dueCount = useMemo(
    () => cards.filter((c) => new Date(c.nextReviewAt || 0).getTime() <= nowTs).length,
    [cards, nowTs]
  );

  return (
    <div className="cards">
      <PageHead
        title="闪卡"
        sub="把知识点拆成问答卡片，利用碎片时间快速自测。"
        icon={<AppIcon name="act-cards" size={54} round />}
        actions={
          <ClayButton variant="ghost" onClick={() => loadCards(dueOnly)}>
            <IconRefresh size={16} /> 刷新
          </ClayButton>
        }
      />

      <ClayCard className="row-12 wrap" style={{ padding: '16px 20px', gap: 14 }}>
        <div className="grow" style={{ minWidth: 220 }}>
          <Select value={selectedKp} onChange={(e) => setSelectedKp(e.target.value)} aria-label="选择知识点">
            {points.length === 0 ? <option value="">还没有知识点</option> : null}
            {points.map((kp) => (
              <option value={kp._id} key={kp._id}>
                {kp.title}
              </option>
            ))}
          </Select>
        </div>
        <ClayButton variant="lilac" onClick={generate} loading={generating} disabled={!selectedKp}>
          <IconSparkles size={16} /> 用 AI 生成 5 张
        </ClayButton>
        <ClayChip tone="mint" active={dueOnly} onClick={() => setDueOnly((v) => !v)}>
          只看到期（{dueCount}）
        </ClayChip>
      </ClayCard>

      {loading ? (
        <SkeletonList rows={2} />
      ) : cards.length === 0 ? (
        <ClayCard>
          <EmptyState
            icon={<AppIcon name="act-cards" size={92} round />}
            title={dueOnly ? '暂时没有到期的闪卡' : '还没有闪卡'}
            desc={
              dueOnly
                ? '取消「只看到期」，或稍后再来看看。'
                : '选一个知识点，让 AI 帮你把内容拆成 5 张问答卡，翻一翻就能自测。'
            }
            action={
              <ClayButton variant="primary" onClick={generate} loading={generating} disabled={!selectedKp}>
                <IconSparkles size={16} /> 生成闪卡
              </ClayButton>
            }
          />
        </ClayCard>
      ) : (
        <div className="cards__grid">
          {cards.map((card) => {
            const isFlipped = Boolean(flipped[card._id]);
            return (
              <div
                className={`cards__item${isFlipped ? ' is-flipped' : ''}`}
                key={card._id}
                onClick={() => setFlipped((prev) => ({ ...prev, [card._id]: !prev[card._id] }))}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setFlipped((prev) => ({ ...prev, [card._id]: !prev[card._id] }));
                  }
                }}
              >
                <div className="cards__item-actions">
                  <button
                    type="button"
                    className="clay-btn clay-btn--ghost clay-btn--icon"
                    style={{ width: 28, height: 28 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(card);
                    }}
                    disabled={busyId === card._id}
                    aria-label="删除闪卡"
                  >
                    <IconTrash size={13} />
                  </button>
                </div>

                <div className="cards__face">
                  <span className="cards__face-tag">正面 · 问题</span>
                  <div className="cards__face-text">{card.front}</div>
                  <span className="cards__face-hint">
                    点击翻面 · 下次复习 {dueText(card.nextReviewAt)}
                  </span>
                </div>

                <div className="cards__face cards__face--back">
                  <span className="cards__face-tag">背面 · 答案</span>
                  <div className="cards__face-text">{card.back}</div>
                  <div className="row-8 wrap" onClick={(e) => e.stopPropagation()} style={{ marginTop: 'auto' }}>
                    {GRADES.map((item) => (
                      <button
                        type="button"
                        key={item.value}
                        className={`review__grade ${item.cls}`}
                        style={{ padding: '7px 12px', fontSize: 12 }}
                        onClick={() => review(card, item.value)}
                        disabled={busyId === card._id}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}