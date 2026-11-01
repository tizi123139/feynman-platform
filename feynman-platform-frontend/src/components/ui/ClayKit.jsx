/* 黏土组件库：卡片 / 按钮 / 输入 / 弹窗 / Toast / 进度 / 骨架 / 空状态 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/* ---------------- 卡片 ---------------- */
export function ClayCard({ tone, hover, flat, className, as: Tag = 'div', ...rest }) {
  return (
    <Tag
      className={cx('clay-card', tone && `clay-card--${tone}`, hover && 'clay-card-hover', flat && 'clay-card--flat', className)}
      {...rest}
    />
  );
}

/* ---------------- 按钮 ---------------- */
export function ClayButton({
  variant = 'primary',
  size,
  block,
  iconOnly,
  loading,
  disabled,
  to,
  href,
  className,
  children,
  ...rest
}) {
  const cls = cx(
    'clay-btn',
    variant && `clay-btn--${variant}`,
    size && `clay-btn--${size}`,
    block && 'clay-btn--block',
    iconOnly && 'clay-btn--icon',
    className
  );
  const inner = (
    <>
      {loading ? <span className="spinner" style={{ width: 15, height: 15, borderWidth: 2.5 }} /> : null}
      {children}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls} {...rest}>
        {inner}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={cls} {...rest}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" className={cls} disabled={disabled || loading} {...rest}>
      {inner}
    </button>
  );
}

/* ---------------- 表单 ---------------- */
export function Field({ label, hint, htmlFor, children, className }) {
  return (
    <div className={cx('field', className)}>
      {label ? (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

export function TextInput({ label, hint, id, className, ...rest }) {
  const inputId = id || rest.name;
  if (!label && !hint) return <input id={inputId} className={cx('clay-input', className)} {...rest} />;
  return (
    <Field label={label} hint={hint} htmlFor={inputId}>
      <input id={inputId} className={cx('clay-input', className)} {...rest} />
    </Field>
  );
}

export function TextArea({ label, hint, id, className, ...rest }) {
  const inputId = id || rest.name;
  if (!label && !hint) return <textarea id={inputId} className={cx('clay-textarea', className)} {...rest} />;
  return (
    <Field label={label} hint={hint} htmlFor={inputId}>
      <textarea id={inputId} className={cx('clay-textarea', className)} {...rest} />
    </Field>
  );
}

export function Select({ label, hint, id, className, children, ...rest }) {
  const inputId = id || rest.name;
  const select = (
    <select id={inputId} className={cx('clay-select', className)} {...rest}>
      {children}
    </select>
  );
  if (!label && !hint) return select;
  return (
    <Field label={label} hint={hint} htmlFor={inputId}>
      {select}
    </Field>
  );
}

/* ---------------- 胶囊 ---------------- */
export function ClayChip({ active, tone, count, className, children, ...rest }) {
  return (
    <button
      type="button"
      className={cx('chip', tone && `chip--${tone}`, active && 'is-active', className)}
      {...rest}
    >
      {children}
      {count !== undefined && count !== null ? <span className="chip__count">{count}</span> : null}
    </button>
  );
}

export function Segmented({ options = [], value, onChange, className }) {
  return (
    <div className={cx('segmented', className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={cx('segmented__item', opt.value === value && 'is-active')}
          onClick={() => onChange?.(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- 进度 ---------------- */
export function ProgressRing({ value = 0, size = 84, thickness, color, label, className }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const style = {
    '--ring-size': `${size}px`,
    '--ring-value': v,
  };
  if (thickness) style['--ring-thickness'] = `${thickness}px`;
  if (color) style['--ring-color'] = color;
  return (
    <div className={cx('clay-ring', className)} style={style}>
      <div className="clay-ring__inner">
        <span className="clay-ring__value">{Math.round(v)}</span>
        {label ? <span className="clay-ring__label">{label}</span> : null}
      </div>
    </div>
  );
}

export function ProgressBar({ value = 0, tone, className }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={cx('clay-progress', tone && `clay-progress--${tone}`, className)}>
      <div className="clay-progress__bar" style={{ width: `${v}%` }} />
    </div>
  );
}

/* ---------------- 图标底座 ---------------- */
export function IconTile({ src, emoji, size = 52, round, plain, alt = '', className }) {
  return (
    <span
      className={cx('icon-tile', round && 'icon-tile--round', plain && 'icon-tile--plain', className)}
      style={{ '--tile-size': `${size}px` }}
    >
      {src ? <img src={src} alt={alt} loading="lazy" decoding="async" /> : <span className="icon-tile__emoji">{emoji || '✨'}</span>}
    </span>
  );
}

export function Avatar({ name, emoji, src, size, className }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <span className={cx('avatar', size && `avatar--${size}`, className)}>
      {src ? <img src={src} alt={name || '头像'} /> : emoji || initial}
    </span>
  );
}

/* ---------------- 骨架屏 ---------------- */
export function Skeleton({ width = '100%', height = 16, radius, className, style }) {
  return (
    <span
      className={cx('skeleton', className)}
      style={{ display: 'block', width, height, borderRadius: radius, ...style }}
    />
  );
}

export function SkeletonList({ rows = 3 }) {
  return (
    <div className="stack-12">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="clay-card" style={{ padding: 20 }}>
          <Skeleton width="42%" height={20} />
          <div style={{ height: 12 }} />
          <Skeleton width="84%" height={13} />
          <div style={{ height: 8 }} />
          <Skeleton width="64%" height={13} />
        </div>
      ))}
    </div>
  );
}

/* ---------------- 空状态 ---------------- */
export function EmptyState({ icon, title, desc, action, children }) {
  return (
    <div className="empty">
      {icon}
      {title ? <div className="empty__title">{title}</div> : null}
      {desc ? <p className="empty__desc">{desc}</p> : null}
      {action}
      {children}
    </div>
  );
}

/* ---------------- 弹窗 ---------------- */
export function ClayModal({ open, title, children, footer, onClose, width }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="clay-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="clay-modal" style={width ? { width } : undefined} role="dialog" aria-modal="true">
        {title ? <h3 className="clay-modal__title">{title}</h3> : null}
        <div className="clay-modal__body">{children}</div>
        {footer ? <div className="clay-modal__actions">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title = '确认操作',
  description,
  confirmText = '确定',
  cancelText = '取消',
  danger,
  loading,
  onConfirm,
  onCancel,
}) {
  return (
    <ClayModal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <ClayButton variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelText}
          </ClayButton>
          <ClayButton variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmText}
          </ClayButton>
        </>
      }
    >
      <p style={{ lineHeight: 1.75 }}>{description}</p>
    </ClayModal>
  );
}

/* ---------------- Toast ---------------- */
const ToastContext = createContext(null);
let toastSeq = 0;
const noopToast = { push: () => 0, success: () => 0, error: () => 0, warn: () => 0, info: () => 0 };

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  const remove = useCallback((id) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message, tone = 'success', duration = 2800) => {
      const id = ++toastSeq;
      setItems((list) => [...list.slice(-3), { id, message, tone }]);
      timers.current.set(id, setTimeout(() => remove(id), duration));
      return id;
    },
    [remove]
  );

  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); }, []);

  const api = useMemo(
    () => ({
      push,
      success: (m, d) => push(m, 'success', d),
      error: (m, d) => push(m, 'error', d),
      warn: (m, d) => push(m, 'warn', d),
      info: (m, d) => push(m, 'info', d),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {items.length > 0 ? (
        <div className="toast-stack">
          {items.map((t) => (
            <div key={t.id} className={cx('toast', `toast--${t.tone}`)} onClick={() => remove(t.id)}>
              <span className="toast__dot" />
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext) || noopToast;
}

/* ---------------- 页面标题 ---------------- */
export function PageHead({ title, sub, icon, actions }) {
  return (
    <div className="page-head">
      <div>
        <div className="page-head__title">
          {icon}
          <h1>{title}</h1>
        </div>
        {sub ? <p className="page-head__sub">{sub}</p> : null}
      </div>
      {actions ? <div className="page-head__actions">{actions}</div> : null}
    </div>
  );
}
