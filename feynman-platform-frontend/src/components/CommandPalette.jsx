/* Ctrl+K 命令面板：语义搜索知识库 + 常用入口，全键盘可用 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/axios';
import { useDebounce } from '../hooks/useDebounce';
import { AppIcon } from './icons/AppIcon';
import { IconChevronRight, IconSearch } from './ui/icons';

const QUICK_ACTIONS = [
  { key: 'new', title: '新建知识点', desc: '写下今天想讲清楚的那个概念', to: '/kp/new', icon: 'act-create' },
  { key: 'review', title: '今日复习', desc: '按记忆曲线巩固到期内容', to: '/review', icon: 'nav-review' },
  { key: 'universe', title: '知识宇宙', desc: '回放你的知识是怎么长出来的', to: '/universe', icon: 'nav-universe' },
  { key: 'report', title: '年度回顾', desc: '把这一年的投入导出成长图', to: '/report', icon: 'nav-library' },
];

/** 把后端给的区间画成高亮，纯切片不做 dangerouslySetInnerHTML */
function Highlighted({ text, ranges }) {
  if (!ranges || !ranges.length) return text;
  const parts = [];
  let cursor = 0;
  ranges.forEach(([from, to], index) => {
    if (from > cursor) parts.push(<span key={`t${index}`}>{text.slice(cursor, from)}</span>);
    parts.push(<mark key={`m${index}`}>{text.slice(from, to)}</mark>);
    cursor = to;
  });
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);
  return parts;
}

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const debounced = useDebounce(term, 260);

  // 每次打开都回到干净状态，避免上次的关键词残留
  useEffect(() => {
    if (!open) return undefined;
    setTerm('');
    setResults([]);
    setMeta(null);
    setActive(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const query = debounced.trim();
    if (!query) {
      setResults([]);
      setMeta(null);
      setLoading(false);
      return undefined;
    }

    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const { data } = await apiClient.get('/search', { params: { q: query, limit: 8 } });
        if (!alive) return;
        setResults(Array.isArray(data?.results) ? data.results : []);
        setMeta(data || null);
      } catch {
        if (!alive) return;
        setResults([]);
        setMeta(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [debounced, open]);

  const searching = Boolean(term.trim());
  const items = useMemo(() => (searching ? results : QUICK_ACTIONS), [searching, results]);
  const safeActive = items.length ? Math.min(active, items.length - 1) : 0;

  const pick = useCallback(
    (item) => {
      if (!item) return;
      onClose();
      navigate(item.to || `/feynman/${item.id}`);
    },
    [navigate, onClose]
  );

  const goEdit = (item) => {
    onClose();
    if (item?.id) navigate(`/kp/edit/${item.id}`);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (items.length) setActive((index) => (index + 1) % items.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length) setActive((index) => (index - 1 + items.length) % items.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      pick(items[safeActive]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="cmdk" role="dialog" aria-modal="true" aria-label="搜索知识库">
      <div className="cmdk__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="cmdk__panel" onKeyDown={onKeyDown}>
        <div className="cmdk__input-row">
          <IconSearch size={18} />
          <input
            ref={inputRef}
            className="cmdk__input"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setActive(0);
            }}
            placeholder="用一句话描述你想找的知识，比如「闭包为什么不回收」"
            aria-label="搜索知识库"
          />
          {loading ? <span className="cmdk__spinner" aria-hidden="true" /> : null}
          <kbd className="cmdk__kbd">esc</kbd>
        </div>

        <div className="cmdk__body">
          {!items.length ? (
            <div className="cmdk__empty">
              {loading
                ? '正在翻你的知识库…'
                : searching
                  ? '没找到相关知识点，换个说法试试，或者新建一个。'
                  : '输入关键词开始搜索'}
            </div>
          ) : (
            <ul className="cmdk__list">
              {items.map((item, index) => (
                <li key={item.id || item.key}>
                  <button
                    type="button"
                    className={`cmdk__item${index === safeActive ? ' is-active' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(item)}
                  >
                    {searching ? (
                      <div className="cmdk__item-main">
                        <div className="cmdk__item-head">
                          <span className="cmdk__item-title">{item.title}</span>
                          <span className="cmdk__score">{item.score}</span>
                        </div>
                        {item.snippet ? (
                          <p className="cmdk__snippet">
                            <Highlighted text={item.snippet} ranges={item.ranges} />
                          </p>
                        ) : null}
                        <div className="cmdk__meta">
                          <span className="tag tag--mint">{item.category}</span>
                          <span>掌握度 {item.mastery}%</span>
                          <span className="cmdk__source">
                            {item.confidence === 'low'
                              ? '可能相关'
                              : item.source === 'vector'
                                ? '语义命中'
                                : '关键词命中'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="cmdk__item-main">
                        <div className="cmdk__item-head">
                          <span className="cmdk__quick">
                            <AppIcon name={item.icon} size={30} round />
                            <span className="cmdk__item-title">{item.title}</span>
                          </span>
                          <IconChevronRight size={15} />
                        </div>
                        <p className="cmdk__desc">{item.desc}</p>
                      </div>
                    )}
                  </button>
                  {searching ? (
                    <button type="button" className="cmdk__edit" onClick={() => goEdit(item)} title="编辑这个知识点">
                      编辑
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="cmdk__foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> 选择
          </span>
          <span>
            <kbd>Enter</kbd> 去复述
          </span>
          <span className="cmdk__foot-meta">
            {meta ? `${meta.mode === 'hybrid' ? '语义 + 关键词' : '关键词'} · ${meta.count} 条 · ${meta.took}ms` : '知识库语义检索'}
          </span>
        </div>
      </div>
    </div>
  );
}
