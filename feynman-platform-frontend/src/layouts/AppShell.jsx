/* 应用壳层：左侧黏土侧边栏 + 顶部栏 + 移动端底部 Tab */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/axios';
import { AppIcon, avatarEmoji } from '../components/icons/AppIcon';
import { Avatar, SkeletonList } from '../components/ui/ClayKit';
import ErrorBoundary from '../components/ErrorBoundary';
import CommandPalette from '../components/CommandPalette';
import {
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconLogout,
  IconMenu,
  IconSearch,
  IconSettings,
  IconTrophy,
  IconUser,
} from '../components/ui/icons';

const NAV_GROUPS = [
  {
    title: '学习',
    items: [
      { to: '/', label: '首页', icon: 'nav-home', end: true },
      { to: '/review', label: '今日复习', icon: 'nav-review', badgeKey: 'due' },
      { to: '/cards', label: '闪卡', icon: 'act-cards' },
      { to: '/practice', label: '语音陪练', icon: 'act-mic' },
      { to: '/mistakes', label: '错题本', icon: 'act-quiz' },
    ],
  },
  {
    title: '探索',
    items: [
      { to: '/graph', label: '知识图谱', icon: 'nav-graph' },
      { to: '/universe', label: '知识宇宙', icon: 'nav-universe' },
      { to: '/agent', label: 'AI 伙伴', icon: 'nav-agent' },
    ],
  },
  {
    title: '成长',
    items: [
      { to: '/stats', label: '学习统计', icon: 'act-target' },
      { to: '/achievements', label: '成就徽章', icon: 'nav-trophy' },
      { to: '/report', label: '学习周报', icon: 'nav-library' },
    ],
  },
];

const PAGE_TITLES = {
  '/': ['首页', '今天也来把知识讲明白吧'],
  '/review': ['今日复习', '按记忆曲线巩固到期的知识点'],
  '/cards': ['闪卡', '轻量问答，随翻随记'],
  '/practice': ['语音陪练', '把知识讲给 AI 伙伴听'],
  '/mistakes': ['错题本', '错过的题，值得再练一次'],
  '/graph': ['知识图谱', '看看知识点之间如何彼此相连'],
  '/universe': ['知识宇宙', '在糖果星系里漫游你的知识'],
  '/agent': ['AI 伙伴', '基于你的笔记提问与追问'],
  '/stats': ['学习统计', '连续天数、热力图与掌握度'],
  '/achievements': ['成就徽章', '每一次坚持都值得被记录'],
  '/report': ['学习周报', '这一周的收获，一目了然'],
  '/profile': ['个人中心', '昵称、头像与学习目标'],
  '/kp/new': ['新建知识点', '写下你想讲清楚的那个概念'],
  '/kp/edit': ['编辑知识点', '继续打磨你的讲解'],
  '/feynman': ['费曼复述', '用自己的话讲一遍'],
  '/quiz': ['随堂测评', '5 道题检验掌握程度'],
};

function resolveTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const key = Object.keys(PAGE_TITLES).find((p) => p !== '/' && pathname.startsWith(p));
  return key ? PAGE_TITLES[key] : ['费曼学习', '把知识讲明白'];
}

const MOBILE_TABS = [
  { to: '/', label: '首页', icon: 'nav-home', end: true },
  { to: '/review', label: '复习', icon: 'nav-review' },
  { to: '/kp/new', label: '新建', icon: 'act-create', raised: true },
  { to: '/graph', label: '图谱', icon: 'nav-graph' },
  { to: '/profile', label: '我的', icon: 'nav-trophy' },
];

export default function AppShell() {
  const { user, logout, displayName, token } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('shell-collapsed') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [overview, setOverview] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const menuRef = useRef(null);

  const [title, subtitle] = resolveTitle(location.pathname);

  useEffect(() => {
    // 没有登录态就不发请求：AppShell 作为父路由，在 ProtectedRoute 重定向到登录页的
    // 那一帧依然会挂载，否则会在登录页刷出一屏 401
    if (!token) {
      setOverview(null);
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        const { data } = await apiClient.get('/dashboard/overview');
        if (alive) setOverview(data);
      } catch {
        /* 静默失败：顶栏徽章只是锦上添花 */
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, location.pathname]);

  useEffect(() => {
    localStorage.setItem('shell-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  /* Ctrl/Cmd + K：任何时候都能拉出语义搜索 */
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const streak = overview?.user?.streak ?? user?.streak ?? 0;
  const level = overview?.level?.level ?? 1;
  const dueCount = overview?.counts?.due ?? 0;
  const badgeValues = useMemo(() => ({ due: dueCount }), [dueCount]);
  const avatarKey = overview?.user?.avatarKey || user?.avatarKey || 'sprout';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`shell${collapsed ? ' is-collapsed' : ''}${mobileOpen ? ' is-mobile-open' : ''}`}>
      <aside className="shell__sidebar">
        <Link to="/" className="sidebar__brand">
          <span className="sidebar__brand-mark">
            <AppIcon name="nav-home" size={30} plain />
          </span>
          <span className="sidebar__brand-text">
            <span className="sidebar__brand-name">费曼小课堂</span>
            <span className="sidebar__brand-tag">Feynman Lab</span>
          </span>
        </Link>

        <div className="sidebar__scroll">
          {NAV_GROUPS.map((group) => (
            <div className="sidebar__group" key={group.title}>
              <span className="sidebar__group-title">{group.title}</span>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
                  title={item.label}
                >
                  <AppIcon name={item.icon} size={40} round />
                  <span className="nav-item__text">{item.label}</span>
                  {item.badgeKey && badgeValues[item.badgeKey] > 0 ? <span className="nav-item__dot" /> : null}
                </NavLink>
              ))}
            </div>
          ))}

          <div className="sidebar__cta">
            <span className="sidebar__cta-title">今天想讲点什么？</span>
            <span className="sidebar__cta-desc">新建一个知识点，开始费曼复述</span>
            <Link to="/kp/new" className="clay-btn clay-btn--butter clay-btn--sm">
              新建知识点
            </Link>
          </div>
        </div>

        <div className="sidebar__footer">
          <Avatar name={displayName} emoji={avatarEmoji(avatarKey)} size="sm" />
          <div className="sidebar__user">
            <div className="sidebar__user-name">{displayName}</div>
            <div className="sidebar__user-role">
              Lv.{level} · 连续 {streak} 天
            </div>
          </div>
          <button
            type="button"
            className="clay-btn clay-btn--ghost clay-btn--icon sidebar__collapse"
            style={{ width: 34, height: 34 }}
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
            aria-label="切换侧边栏"
          >
            {collapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="shell__backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      ) : null}

      <div className="shell__main">
        <header className="topbar">
          <button
            type="button"
            className="topbar__menu"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="打开菜单"
          >
            {mobileOpen ? <IconClose size={19} /> : <IconMenu size={19} />}
          </button>

          <div className="topbar__title">
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </div>

          <div
            className="topbar__search"
            role="button"
            tabIndex={0}
            onClick={() => setPaletteOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setPaletteOpen(true);
              }
            }}
            aria-label="搜索知识库（Ctrl+K）"
          >
            <IconSearch size={16} />
            <span className="topbar__search-hint">搜索知识点、标签…</span>
            <kbd className="topbar__search-kbd">Ctrl K</kbd>
          </div>

          <div className="topbar__right">
            <span className="pill pill--streak" title="连续学习天数">
              <AppIcon name="act-streak" size={20} plain /> {streak}
            </span>
            <span className="pill pill--level" title="当前等级">
              Lv.{level}
            </span>

            <div className="user-menu" ref={menuRef}>
              <button
                type="button"
                className="user-menu__trigger"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <Avatar name={displayName} emoji={avatarEmoji(avatarKey)} size="sm" />
                <span style={{ fontSize: 13, fontWeight: 800 }}>{displayName}</span>
              </button>
              {menuOpen ? (
                <div className="user-menu__panel" role="menu">
                  <div className="user-menu__head">
                    <Avatar name={displayName} emoji={avatarEmoji(avatarKey)} size="sm" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{displayName}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--clay-ink-mute)' }}>
                        {user?.email || '已登录'}
                      </div>
                    </div>
                  </div>
                  <Link to="/profile" className="user-menu__item" role="menuitem">
                    <IconUser size={16} /> 个人中心
                  </Link>
                  <Link to="/achievements" className="user-menu__item" role="menuitem">
                    <IconTrophy size={16} /> 我的成就
                  </Link>
                  <Link to="/stats" className="user-menu__item" role="menuitem">
                    <IconSettings size={16} /> 学习统计
                  </Link>
                  <button
                    type="button"
                    className="user-menu__item user-menu__item--danger"
                    onClick={handleLogout}
                    role="menuitem"
                  >
                    <IconLogout size={16} /> 退出登录
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="page">
          <Suspense fallback={<SkeletonList rows={3} />}>
            {/* key 跟随路径：切走后错误状态自动清掉，不会把下一页也卡在兜底页 */}
            <ErrorBoundary key={location.pathname} compact>
              <Outlet />
            </ErrorBoundary>
          </Suspense>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      <nav className="mobile-tabs" aria-label="底部导航">
        <div className="mobile-tabs__list">
          {MOBILE_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `mobile-tab${isActive ? ' is-active' : ''}${tab.raised ? ' mobile-tab--add' : ''}`
              }
            >
              <AppIcon name={tab.icon} size={tab.raised ? 50 : 32} round />
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}