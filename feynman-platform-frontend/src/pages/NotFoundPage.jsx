// src/pages/NotFoundPage.jsx
import { useLocation } from 'react-router-dom';
import { ClayButton, ClayCard } from '../components/ui/ClayKit';
import { AppIcon } from '../components/icons/AppIcon';
import { IconGraph, IconHome, IconSearch } from '../components/ui/icons';

const LINKS = [
  { to: '/', label: '回到首页', icon: <IconHome size={16} /> },
  { to: '/graph', label: '知识图谱', icon: <IconGraph size={16} /> },
  { to: '/review', label: '今日复习', icon: <IconSearch size={16} /> },
];

export default function NotFoundPage() {
  const { pathname } = useLocation();

  return (
    <div className="notfound">
      <ClayCard className="notfound__card">
        <AppIcon name="badge-planet" size={104} plain />
        <div className="notfound__code">404</div>
        <h1 className="notfound__title">这条路径没有知识点</h1>
        <p className="notfound__desc">
          你要找的页面可能已经被删掉，或者链接少打了一个字。换个入口试试看：
        </p>
        <code className="notfound__path">{pathname}</code>
        <div className="notfound__actions">
          <ClayButton variant="primary" to="/">
            <IconHome size={16} /> 回到首页
          </ClayButton>
          <ClayButton variant="ghost" onClick={() => window.history.back()}>
            返回上一页
          </ClayButton>
        </div>
        <div className="notfound__links">
          {LINKS.map((link) => (
            <ClayButton key={link.to} variant="ghost" size="sm" to={link.to}>
              {link.icon} {link.label}
            </ClayButton>
          ))}
        </div>
      </ClayCard>
    </div>
  );
}
