/* 3D 黏土图标：按需动态加载 assets/clay/*.png，缺失时自动回退 emoji */
import { IconTile } from '../ui/ClayKit';

const modules = import.meta.glob('../../assets/clay/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

const ASSETS = Object.fromEntries(
  Object.entries(modules).map(([path, url]) => [path.split('/').pop().replace(/\.png$/i, ''), url])
);

export const ICON_EMOJI = {
  'nav-home': '🏠',
  'nav-review': '🔁',
  'nav-library': '📚',
  'nav-graph': '🕸️',
  'nav-universe': '🌌',
  'nav-agent': '🤖',
  'nav-trophy': '🏆',
  'act-create': '✨',
  'act-mic': '🎙️',
  'act-quiz': '📝',
  'act-streak': '🔥',
  'act-cards': '🃏',
  'act-target': '🎯',
  'badge-seed': '🌱',
  'badge-review': '🔁',
  'badge-mic': '🎙️',
  'badge-quiz': '🧠',
  'badge-streak': '🔥',
  'badge-calendar': '📅',
  'badge-book': '📚',
  'badge-crown': '👑',
  'badge-moon': '🌙',
  'badge-planet': '🪐',
};

export const AVATAR_PRESETS = [
  { key: 'sprout', emoji: '🌱', label: '小芽' },
  { key: 'cat', emoji: '🐱', label: '小猫' },
  { key: 'bear', emoji: '🐻', label: '小熊' },
  { key: 'chick', emoji: '🐤', label: '小鸡' },
  { key: 'frog', emoji: '🐸', label: '青蛙' },
  { key: 'bunny', emoji: '🐰', label: '小兔' },
  { key: 'panda', emoji: '🐼', label: '熊猫' },
  { key: 'fox', emoji: '🦊', label: '狐狸' },
];

export function avatarEmoji(key) {
  return AVATAR_PRESETS.find((p) => p.key === key)?.emoji || '🌱';
}

export function hasClayAsset(name) {
  return Boolean(ASSETS[name]);
}

export function clayAsset(name) {
  return ASSETS[name] || null;
}

export function AppIcon({ name, size = 52, round, plain, className }) {
  const src = ASSETS[name];
  return (
    <IconTile
      src={src}
      emoji={ICON_EMOJI[name] || '✨'}
      size={size}
      round={round}
      plain={plain}
      alt=""
      className={className}
    />
  );
}

/* 场景插画：scene-mascot / scene-auth / scene-celebrate，缺失时回退到指定内容 */
export function ClayScene({ name, className, style, alt = '', fallback = null }) {
  const src = ASSETS[name];
  if (!src) {
    if (!fallback) return null;
    return (
      <span className={className} style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', fontSize: 24, ...style }}>
        {fallback}
      </span>
    );
  }
  return (
    <div className={className} style={style}>
      <img src={src} alt={alt} loading="lazy" decoding="async" style={{ width: '100%', display: 'block' }} />
    </div>
  );
}
