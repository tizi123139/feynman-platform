// scripts/make-icons.mjs
// 用一套矢量源图生成全站图标：favicon / PWA（含 maskable）/ Apple Touch / Electron 打包图标。
// 用法：node scripts/make-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const BUILD_DIR = path.join(ROOT, 'build');

/* 黏土星球：薄荷行星 + 淡紫陨石坑 + 奶油光环（bg=false 时去底色、透明底） */
function brandSvg({ rounded = false, scale = 1, bg = true } = {}) {
  const inner = scale === 1 ? '' : `transform="translate(256 256) scale(${scale}) translate(-256 -256)"`;
  const bgRect = !bg
    ? ''
    : rounded
      ? '<rect x="8" y="8" width="496" height="496" rx="116" fill="url(#bg)"/>'
      : '<rect width="512" height="512" fill="url(#bg)"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="32%" cy="22%" r="88%">
      <stop offset="0%" stop-color="#FFFDF9"/>
      <stop offset="62%" stop-color="#FFF6EA"/>
      <stop offset="100%" stop-color="#FFE9D6"/>
    </radialGradient>
    <radialGradient id="planet" cx="34%" cy="26%" r="82%">
      <stop offset="0%" stop-color="#BDF0E2"/>
      <stop offset="52%" stop-color="#7FD1B9"/>
      <stop offset="100%" stop-color="#4FB79A"/>
    </radialGradient>
    <radialGradient id="crater" cx="34%" cy="28%" r="82%">
      <stop offset="0%" stop-color="#E4DAFF"/>
      <stop offset="100%" stop-color="#B79CFF"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFEDB8"/>
      <stop offset="55%" stop-color="#FFD166"/>
      <stop offset="100%" stop-color="#E7AC2F"/>
    </linearGradient>
    <clipPath id="front">
      <rect x="0" y="268" width="512" height="244"/>
    </clipPath>
  </defs>

  ${bgRect}

  <g ${inner}>
    <ellipse cx="256" cy="272" rx="226" ry="64" fill="none" stroke="url(#ring)" stroke-width="26"
             stroke-linecap="round" transform="rotate(-15 256 272)" opacity="0.55"/>
    <circle cx="256" cy="266" r="146" fill="url(#planet)"/>
    <ellipse cx="198" cy="206" rx="52" ry="30" fill="#FFFFFF" opacity="0.45" transform="rotate(-22 198 206)"/>
    <circle cx="330" cy="322" r="38" fill="url(#crater)" opacity="0.92"/>
    <circle cx="178" cy="330" r="22" fill="url(#crater)" opacity="0.8"/>
    <circle cx="332" cy="196" r="17" fill="url(#crater)" opacity="0.72"/>
    <ellipse cx="256" cy="272" rx="226" ry="64" fill="none" stroke="url(#ring)" stroke-width="26"
             stroke-linecap="round" transform="rotate(-15 256 272)" clip-path="url(#front)"/>
    <circle cx="150" cy="146" r="8" fill="#FFFFFF" opacity="0.85"/>
  </g>
</svg>
`;
}

async function render(svg, size, file) {
  const png = await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(file, png);
  console.log(`✓ ${path.relative(ROOT, file)} (${size}×${size}, ${(png.length / 1024).toFixed(1)} KB)`);
}

await mkdir(PUBLIC_DIR, { recursive: true });
await mkdir(BUILD_DIR, { recursive: true });

const full = brandSvg();
const rounded = brandSvg({ rounded: true });
const maskable = brandSvg({ scale: 0.78 });

await writeFile(path.join(PUBLIC_DIR, 'app-icon.svg'), full, 'utf8');
await writeFile(path.join(PUBLIC_DIR, 'favicon.svg'), rounded, 'utf8');
console.log('✓ public/app-icon.svg / public/favicon.svg');

await render(full, 512, path.join(PUBLIC_DIR, 'pwa-512x512.png'));
await render(full, 192, path.join(PUBLIC_DIR, 'pwa-192x192.png'));
await render(rounded, 180, path.join(PUBLIC_DIR, 'apple-touch-icon.png'));
// maskable 要求内容收在中心安全区内，行星整体缩到 78%
await render(maskable, 512, path.join(PUBLIC_DIR, 'maskable-512x512.png'));
// electron-builder 默认从 build/icon.png（≥256）自动生成 .ico；桌面图标用透明底，避免快捷方式出现色块背景
await render(brandSvg({ bg: false }), 512, path.join(BUILD_DIR, 'icon.png'));
