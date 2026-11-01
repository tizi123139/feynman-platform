import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import {
  ClayButton,
  ClayCard,
  ClayChip,
  ConfirmDialog,
  EmptyState,
  ProgressBar,
  ProgressRing,
  Segmented,
  SkeletonList,
  useToast,
} from '../components/ui/ClayKit';
import { AppIcon } from '../components/icons/AppIcon';
import TodayPlanCard from '../components/TodayPlanCard';
import {
  IconEdit,
  IconMic,
  IconPlus,
  IconQuiz,
  IconRefresh,
  IconSearch,
  IconStar,
  IconTrash,
} from '../components/ui/icons';

const SORT_OPTIONS = [
  { value: 'recent', label: '最近更新' },
  { value: 'due', label: '最该复习' },
  { value: 'mastery', label: '掌握最低' },
  { value: 'created', label: '最新创建' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'not_started', label: '未开始' },
  { value: 'in_progress', label: '学习中' },
  { value: 'mastered', label: '已掌握' },
];

const formatDate = (value) => {
  if (!value) return '刚刚';
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < day * 7) return `${Math.floor(diff / day)} 天前`;
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

const isDue = (kp) => {
  const dueAt = kp?.review?.dueAt;
  if (!dueAt) return false;
  return new Date(dueAt).getTime() <= Date.now();
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export default function DashboardPage() {
  const { displayName } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [overview, setOverview] = useState(null);
  const [facets, setFacets] = useState(null);
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [sort, setSort] = useState('recent');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const debouncedSearch = useDebounce(search, 340);

  useEffect(() => {
    setSearch(searchParams.get('q') || '');
  }, [searchParams]);

  const loadMeta = useCallback(async () => {
    // 概览 / 分类 / 学习计划分别请求，任一失败不阻塞列表
    try {
      const [overviewRes, facetsRes, planRes] = await Promise.allSettled([
        apiClient.get('/dashboard/overview'),
        apiClient.get('/knowledge-points/facets'),
        apiClient.get('/dashboard/plan'),
      ]);
      if (overviewRes.status === 'fulfilled') setOverview(overviewRes.value.data);
      if (facetsRes.status === 'fulfilled') setFacets(facetsRes.value.data);
      if (planRes.status === 'fulfilled') setPlan(planRes.value.data);
    } finally {
      setPlanLoading(false);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = { sort };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (category !== 'all') params.category = category;
      if (status !== 'all') params.status = status;
      if (favoriteOnly) params.favorite = 'true';
      const { data } = await apiClient.get('/knowledge-points', { params });
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.response?.data?.msg || '加载知识点失败');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, category, status, favoriteOnly, sort, toast]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const toggleFavorite = async (kp) => {
    const next = !kp.favorite;
    setItems((list) => list.map((item) => (item._id === kp._id ? { ...item, favorite: next } : item)));
    try {
      await apiClient.put(`/knowledge-points/${kp._id}`, { favorite: next });
    } catch {
      setItems((list) => list.map((item) => (item._id === kp._id ? { ...item, favorite: !next } : item)));
      toast.error('收藏状态更新失败');
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/knowledge-points/${pendingDelete._id}`);
      setItems((list) => list.filter((item) => item._id !== pendingDelete._id));
      toast.success('知识点已删除');
      setPendingDelete(null);
      loadMeta();
    } catch (err) {
      toast.error(err.response?.data?.msg || '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const counts = overview?.counts || {};
  const today = overview?.today || {};
  const streak = overview?.user?.streak || 0;
  const longestStreak = overview?.user?.longestStreak || 0;
  const dueList = useMemo(() => items.filter(isDue).length, [items]);

  const categoryChips = useMemo(() => {
    const list = facets?.categories || [];
    return [{ name: 'all', count: facets?.total ?? counts.total ?? 0 }, ...list];
  }, [facets, counts.total]);

  return (
    <div className="dash">
      <section className="clay-card dash-hero">
        <div className="dash-hero__main">
          <span className="dash-hero__hi">
            <AppIcon name="act-streak" size={22} plain /> {greeting()}，{displayName}
          </span>
          <h1 className="dash-hero__title">
            {counts.due > 0 ? `今天有 ${counts.due} 个知识点该复习啦` : '今天也来把一个概念讲明白'}
          </h1>
          <p className="dash-hero__sub">
            {counts.total === 0
              ? '先记录第一个知识点，然后用自己的话讲一遍——讲不通的地方，就是你要补的地方。'
              : `已记录 ${counts.total} 个知识点，其中 ${counts.mastered} 个已经掌握。保持节奏，记忆会更牢。`}
          </p>
          <div className="dash-hero__actions">
            <ClayButton to="/kp/new" variant="primary">
              <IconPlus size={17} /> 新建知识点
            </ClayButton>
            {counts.due > 0 ? (
              <ClayButton to="/review" variant="mint">
                <IconRefresh size={17} /> 开始复习
              </ClayButton>
            ) : (
              <ClayButton to="/practice" variant="mint">
                <IconMic size={17} /> 语音陪练
              </ClayButton>
            )}
          </div>
        </div>
        <div className="dash-hero__ring">
          <ProgressRing value={today.percent || 0} size={118} thickness={13} label="今日" />
          <span className="dash-hero__ring-label">
            {today.practice || 0} / {today.goal || 3} 次练习
          </span>
        </div>
      </section>

      <div className="dash-stats">
        <div className="stat-tile">
          <AppIcon name="nav-library" size={50} round />
          <div className="stat-tile__body">
            <div className="stat-tile__value">{counts.total || 0}</div>
            <div className="stat-tile__label">知识点总数</div>
            <div className="stat-tile__hint">已掌握 {counts.mastered || 0} 个</div>
          </div>
        </div>
        <div className="stat-tile">
          <AppIcon name="nav-review" size={50} round />
          <div className="stat-tile__body">
            <div className="stat-tile__value">{counts.due || 0}</div>
            <div className="stat-tile__label">今日待复习</div>
            <div className="stat-tile__hint">{dueList > 0 ? `当前列表有 ${dueList} 个到期` : '按记忆曲线推送'}</div>
          </div>
        </div>
        <div className="stat-tile">
          <AppIcon name="act-streak" size={50} round />
          <div className="stat-tile__body">
            <div className="stat-tile__value">{streak}</div>
            <div className="stat-tile__label">连续学习天数</div>
            <div className="stat-tile__hint">最长纪录 {longestStreak} 天</div>
          </div>
        </div>
      </div>

      <TodayPlanCard plan={plan} loading={planLoading} />

      <section className="clay-card dash-toolbar">
        <div className="dash-toolbar__row">
          <div className="dash-search">
            <IconSearch size={17} />
            <input
              className="clay-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索标题、内容或标签"
              aria-label="搜索知识点"
            />
          </div>
          <Segmented options={SORT_OPTIONS} value={sort} onChange={setSort} />
          <ClayChip active={favoriteOnly} onClick={() => setFavoriteOnly((v) => !v)}>
            <IconStar size={14} /> 只看收藏
          </ClayChip>
        </div>

        <div className="dash-chips">
          {categoryChips.map((item) => (
            <ClayChip
              key={item.name}
              active={category === item.name}
              count={item.count}
              onClick={() => setCategory(item.name)}
            >
              {item.name === 'all' ? '全部分类' : item.name}
            </ClayChip>
          ))}
          {STATUS_OPTIONS.slice(1).map((opt) => (
            <ClayChip
              key={opt.value}
              tone="mint"
              active={status === opt.value}
              onClick={() => setStatus(status === opt.value ? 'all' : opt.value)}
            >
              {opt.label}
            </ClayChip>
          ))}
        </div>
      </section>

      {counts.due > 0 ? (
        <ClayCard tone="butter" className="row-12 wrap" style={{ padding: '16px 20px', gap: 14 }}>
          <AppIcon name="act-target" size={44} plain />
          <div className="grow">
            <div style={{ fontWeight: 800 }}>今日待复习 {counts.due} 个</div>
            <div className="muted" style={{ fontWeight: 700 }}>
              复习会按 SM-2 记忆曲线安排下一次时间，2 分钟就能过一轮。
            </div>
          </div>
          <ClayButton to="/review" variant="butter" size="sm">
            去复习
          </ClayButton>
        </ClayCard>
      ) : null}

      <div className="section-head">
        <h2>我的知识点</h2>
        <Link className="section-head__link" to="/stats">
          查看学习统计 →
        </Link>
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : items.length === 0 ? (
        <ClayCard>
          <EmptyState
            icon={<AppIcon name="act-create" size={92} round />}
            title={search || category !== 'all' || favoriteOnly ? '没有匹配的知识点' : '还没有知识点'}
            desc={
              search || category !== 'all' || favoriteOnly
                ? '换个关键词，或清空筛选条件再试试。'
                : '记录你最近学到的一个概念，然后用费曼复述讲一遍，掌握度会自动更新。'
            }
            action={
              <div className="row-12 wrap" style={{ justifyContent: 'center' }}>
                <ClayButton to="/kp/new" variant="primary">
                  <IconPlus size={17} /> 新建知识点
                </ClayButton>
                {search || category !== 'all' || favoriteOnly ? (
                  <ClayButton
                    variant="ghost"
                    onClick={() => {
                      setSearch('');
                      setCategory('all');
                      setStatus('all');
                      setFavoriteOnly(false);
                    }}
                  >
                    清空筛选
                  </ClayButton>
                ) : null}
              </div>
            }
          />
        </ClayCard>
      ) : (
        <div className="dash-list">
          {items.map((kp) => (
            <article className="kp-card" key={kp._id}>
              <div className="kp-card__ring">
                <ProgressRing
                  value={kp.mastery || 0}
                  size={62}
                  thickness={8}
                  color={kp.mastery >= 80 ? 'var(--mint-deep)' : kp.mastery >= 40 ? 'var(--sky)' : 'var(--coral)'}
                />
              </div>
              <div className="kp-card__body">
                <div className="kp-card__title-row">
                  <Link to={`/feynman/${kp._id}`} className="kp-card__title">
                    {kp.title}
                  </Link>
                  {isDue(kp) ? <span className="pill pill--due">待复习</span> : null}
                  {kp.status === 'mastered' ? <span className="tag tag--mint">已掌握</span> : null}
                  <button
                    type="button"
                    className="kp-card__star"
                    onClick={() => toggleFavorite(kp)}
                    title={kp.favorite ? '取消收藏' : '收藏'}
                    aria-label={kp.favorite ? '取消收藏' : '收藏'}
                    style={{ color: kp.favorite ? 'var(--butter-deep)' : 'var(--clay-ink-mute)' }}
                  >
                    {kp.favorite ? '★' : '☆'}
                  </button>
                </div>
                <div className="kp-card__meta">
                  <span>{kp.category || '未分类'}</span>
                  <span>·</span>
                  <span>更新于 {formatDate(kp.updatedAt)}</span>
                  <span>·</span>
                  <span>复述 {kp.stats?.feynmanCount || 0} 次</span>
                  <span>·</span>
                  <span>测评 {kp.stats?.quizCount || 0} 次</span>
                </div>
                {(kp.tags || []).length > 0 ? (
                  <div className="kp-card__tags">
                    {(kp.tags || []).slice(0, 5).map((tag) => (
                      <span className="tag" key={tag}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div style={{ marginTop: 10, maxWidth: 320 }}>
                  <ProgressBar
                    value={kp.mastery || 0}
                    tone={kp.mastery >= 80 ? 'mint' : kp.mastery >= 40 ? 'sky' : undefined}
                  />
                </div>
              </div>
              <div className="kp-card__actions">
                <ClayButton size="sm" variant="primary" onClick={() => navigate(`/feynman/${kp._id}`)}>
                  <IconMic size={15} /> 复述
                </ClayButton>
                <ClayButton size="sm" variant="sky" onClick={() => navigate(`/quiz/${kp._id}`)}>
                  <IconQuiz size={15} /> 测评
                </ClayButton>
                <ClayButton size="sm" variant="ghost" onClick={() => navigate(`/kp/edit/${kp._id}`)} title="编辑">
                  <IconEdit size={15} />
                </ClayButton>
                <ClayButton
                  size="sm"
                  variant="ghost"
                  onClick={() => setPendingDelete(kp)}
                  title="删除"
                  aria-label="删除知识点"
                >
                  <IconTrash size={15} />
                </ClayButton>
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除这个知识点？"
        description={`「${pendingDelete?.title || ''}」的复述记录、测评记录和闪卡都会一并失去关联，删除后不可恢复。`}
        confirmText="删除"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}