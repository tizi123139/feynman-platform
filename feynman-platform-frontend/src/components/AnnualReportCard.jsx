/* 年度回顾：12 个月投入 + 知识库增长 + 一键导出长图海报 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '../api/axios';
import { ClayButton, ClayCard, ProgressBar, Skeleton, useToast } from '../components/ui/ClayKit';
import { IconDownload } from '../components/ui/icons';

const POSTER_W = 1080;
const POSTER_H = 1920;
const FONT = '"PingFang SC", "Microsoft YaHei", sans-serif';
const NUMBER_FONT = '"Baloo 2", "PingFang SC", sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* 逐字断行，中文没有空格可断，只能按宽度切 */
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const char of text) {
    if (ctx.measureText(line + char).width > maxWidth && line) {
      lines.push(line);
      line = char;
    } else {
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export default function AnnualReportCard({ name = '同学' }) {
  const toast = useToast();
  const canvasRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: payload } = await apiClient.get('/dashboard/annual-report');
      setData(payload || null);
    } catch (err) {
      toast.error(err.response?.data?.msg || '加载年度回顾失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = POSTER_W;
    canvas.height = POSTER_H;

    const bg = ctx.createLinearGradient(0, 0, POSTER_W, POSTER_H);
    bg.addColorStop(0, '#FFFDF9');
    bg.addColorStop(0.5, '#FFF1F0');
    bg.addColorStop(1, '#EEE9FF');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, POSTER_W, POSTER_H);

    [
      [120, 150, 130, 'rgba(255, 209, 102, 0.34)'],
      [900, 240, 150, 'rgba(183, 156, 255, 0.28)'],
      [980, 1280, 190, 'rgba(127, 209, 185, 0.24)'],
      [70, 1500, 120, 'rgba(255, 138, 128, 0.22)'],
    ].forEach(([x, y, r, color]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });

    const totals = data.totals || {};
    const centerX = POSTER_W / 2;
    const left = 60;
    const right = POSTER_W - 60;

    ctx.textAlign = 'center';
    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = '#8B8598';
    ctx.fillText('FEYNMAN LAB · 年度学习回顾', centerX, 140);

    ctx.font = `800 172px ${NUMBER_FONT}`;
    const yearGrad = ctx.createLinearGradient(300, 200, 780, 360);
    yearGrad.addColorStop(0, '#FF8A80');
    yearGrad.addColorStop(0.55, '#B79CFF');
    yearGrad.addColorStop(1, '#7CB8FF');
    ctx.fillStyle = yearGrad;
    ctx.fillText(String(data.year), centerX, 330);

    ctx.font = `700 34px ${FONT}`;
    ctx.fillStyle = '#3D3A4B';
    ctx.fillText(`${name} 的这一年`, centerX, 386);

    // 一句话总结
    ctx.textAlign = 'left';
    ctx.font = `500 27px ${FONT}`;
    ctx.fillStyle = '#6E6A80';
    wrapText(ctx, data.summary || '', right - left).slice(0, 3).forEach((line, i) => {
      ctx.fillText(line, left, 452 + i * 44);
    });

    // 四块指标
    const stats = [
      ['学习动作', `${totals.actions || 0}`, '次', '#EF6A60'],
      ['专注时长', `${totals.minutes || 0}`, '分钟', '#2E9C82'],
      ['活跃天数', `${totals.activeDays || 0}`, '天', '#3E7FC4'],
      ['知识点', `${totals.totalNotes || 0}`, '个', '#B98A1F'],
    ];
    const tileW = 462;
    const tileH = 168;
    stats.forEach(([label, value, unit, color], i) => {
      const x = left + (i % 2) * (tileW + 36);
      const y = 590 + Math.floor(i / 2) * (tileH + 32);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
      roundRect(ctx, x, y, tileW, tileH, 36);
      ctx.fill();

      ctx.font = `800 76px ${NUMBER_FONT}`;
      ctx.fillStyle = color;
      ctx.fillText(value, x + 36, y + 100);

      ctx.font = `700 24px ${FONT}`;
      ctx.fillStyle = '#8B8598';
      ctx.fillText(`${label} · ${unit}`, x + 38, y + 142);
    });

    // 12 个月柱状图
    ctx.font = `700 30px ${FONT}`;
    ctx.fillStyle = '#3D3A4B';
    ctx.fillText('12 个月的投入（分钟）', left, 1000);

    const chartTop = 1040;
    const chartBottom = 1400;
    const months = data.months || [];
    const maxMinutes = Math.max(1, ...months.map((m) => m.minutes || 0));
    const barW = 52;
    const step = (right - left) / 12;

    ctx.textAlign = 'center';
    months.forEach((m, i) => {
      const cx = left + step * i + step / 2;
      const ratio = (m.minutes || 0) / maxMinutes;
      const barH = m.minutes ? Math.max(10, ratio * (chartBottom - chartTop)) : 4;
      const barGrad = ctx.createLinearGradient(0, chartBottom - barH, 0, chartBottom);
      barGrad.addColorStop(0, m.month === data.bestMonth ? '#FFB1A8' : '#C9E9E0');
      barGrad.addColorStop(1, m.month === data.bestMonth ? '#EF6A60' : '#7FD1B9');
      ctx.fillStyle = m.minutes ? barGrad : 'rgba(61, 58, 75, 0.08)';
      roundRect(ctx, cx - barW / 2, chartBottom - barH, barW, barH, 16);
      ctx.fill();

      if (m.minutes) {
        ctx.font = `700 20px ${NUMBER_FONT}`;
        ctx.fillStyle = '#6E6A80';
        ctx.fillText(String(m.minutes), cx, chartBottom - barH - 14);
      }

      ctx.font = `700 22px ${FONT}`;
      ctx.fillStyle = m.month === data.bestMonth ? '#EF6A60' : '#A29DAF';
      ctx.fillText(`${m.month}月`, cx, chartBottom + 40);
    });

    ctx.beginPath();
    ctx.moveTo(left, chartBottom + 2);
    ctx.lineTo(right, chartBottom + 2);
    ctx.strokeStyle = 'rgba(61, 58, 75, 0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 最常学的主题
    ctx.textAlign = 'left';
    ctx.font = `700 30px ${FONT}`;
    ctx.fillStyle = '#3D3A4B';
    ctx.fillText('最常学的主题', left, 1540);

    const cats = (data.categories || []).slice(0, 3);
    if (!cats.length) {
      ctx.font = `500 26px ${FONT}`;
      ctx.fillStyle = '#A29DAF';
      ctx.fillText('今年还没有分类记录', left, 1600);
    }
    cats.forEach((cat, i) => {
      const y = 1590 + i * 62;
      ctx.font = `700 27px ${FONT}`;
      ctx.fillStyle = '#3D3A4B';
      ctx.fillText(`${i + 1}. ${cat.name}`, left, y);
      ctx.textAlign = 'right';
      ctx.font = `700 26px ${NUMBER_FONT}`;
      ctx.fillStyle = '#8B8598';
      ctx.fillText(`${cat.count} 个 · 掌握度 ${cat.mastery}%`, right, y);
      ctx.textAlign = 'left';
    });

    ctx.beginPath();
    ctx.moveTo(left, 1776);
    ctx.lineTo(right, 1776);
    ctx.strokeStyle = 'rgba(61, 58, 75, 0.1)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = '#8B8598';
    ctx.fillText(
      `最长连续 ${data.longestStreak || 0} 天 · 累计 ${totals.xp || 0} XP · 讲明白才算学会`,
      centerX,
      1830
    );
  }, [data, name]);

  useEffect(() => {
    if (!loading) draw();
  }, [loading, draw]);

  /* 累计知识点曲线：把 months[].totalNotes 画成平滑面积图，右侧留白用真实数据填掉 */
  const growth = useMemo(() => {
    const months = data?.months || [];
    if (!months.length) return null;

    const W = 620;
    const H = 158;
    const padX = 12;
    const padTop = 22;
    const padBottom = 26;
    const values = months.map((m) => m.totalNotes || 0);
    const peakValue = Math.max(...values);
    const baseValue = Math.min(...values, data?.totals?.startNotes || 0);
    const span = Math.max(1, peakValue - baseValue);
    const stepX = (W - padX * 2) / Math.max(1, months.length - 1);
    const pts = values.map((v, i) => [
      padX + i * stepX,
      H - padBottom - ((v - baseValue) / span) * (H - padTop - padBottom),
    ]);

    // 控制点取水平中点，连成不抖的平滑曲线
    let line = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i += 1) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const cx = (x0 + x1) / 2;
      line += ` C ${cx.toFixed(1)} ${y0.toFixed(1)}, ${cx.toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${H - padBottom} L ${pts[0][0].toFixed(1)} ${H - padBottom} Z`;

    const peakIndex = Math.max(0, values.indexOf(peakValue));
    return {
      W,
      H,
      padBottom,
      line,
      area,
      peak: { x: pts[peakIndex][0], y: pts[peakIndex][1], value: peakValue },
      axis: pts.map(([x], i) => ({ x, label: `${months[i].month}月` })),
    };
  }, [data]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const link = document.createElement('a');
    link.download = `feynman-annual-${data.year}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast.success('年度回顾已保存到下载目录');
  };

  if (loading) {
    return (
      <ClayCard className="report__panel">
        <Skeleton height={220} />
      </ClayCard>
    );
  }

  if (!data) return null;

  const totals = data.totals || {};
  const peak = Math.max(1, ...(data.months || []).map((m) => m.minutes || 0));

  return (
    <ClayCard className="report__panel report__annual">
      <div className="section-head">
        <h2>{data.year} 年度回顾</h2>
        <span className="tag tag--lilac">可导出长图</span>
      </div>

      <div className="report__annual-body">
        <div className="report__annual-info">
          <p className="report__annual-summary">{data.summary}</p>
          <div className="report__annual-metrics">
            <div>
              <strong>{totals.actions || 0}</strong>
              <span>学习动作</span>
            </div>
            <div>
              <strong>{totals.minutes || 0}</strong>
              <span>专注分钟</span>
            </div>
            <div>
              <strong>{totals.activeDays || 0}</strong>
              <span>活跃天数</span>
            </div>
            <div>
              <strong>{totals.totalNotes || 0}</strong>
              <span>知识点</span>
            </div>
          </div>
          <div className="report__annual-months">
            {data.months.map((m) => (
              <div className="report__annual-month" key={m.month}>
                <div
                  className={`report__annual-bar${m.month === data.bestMonth ? ' is-best' : ''}`}
                  style={{ height: `${Math.max(6, ((m.minutes || 0) / peak) * 76)}px` }}
                  title={`${m.month} 月 · ${m.minutes || 0} 分钟 · 新增 ${m.newNotes || 0} 个`}
                />
                <span>{m.month}</span>
              </div>
            ))}
          </div>

          {growth ? (
            <div className="report__annual-growth">
              <div className="report__annual-subhead">
                <span>知识库增长曲线</span>
                <span className="muted">
                  {totals.startNotes || 0} → {totals.totalNotes || 0} 个
                </span>
              </div>
              <svg
                className="report__annual-curve"
                viewBox={`0 0 ${growth.W} ${growth.H}`}
                role="img"
                aria-label="知识点累计增长曲线"
              >
                <defs>
                  <linearGradient id="annualGrowthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7FD1B9" stopOpacity="0.42" />
                    <stop offset="100%" stopColor="#7FD1B9" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0.28, 0.54, 0.8].map((ratio) => (
                  <line
                    key={ratio}
                    x1={12}
                    x2={growth.W - 12}
                    y1={growth.H * ratio}
                    y2={growth.H * ratio}
                    stroke="rgba(61, 58, 75, 0.08)"
                    strokeWidth="1"
                    strokeDasharray="4 6"
                  />
                ))}
                <path d={growth.area} fill="url(#annualGrowthFill)" />
                <path
                  d={growth.line}
                  fill="none"
                  stroke="#4FB79A"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx={growth.peak.x} cy={growth.peak.y} r="5.5" fill="#fff" stroke="#4FB79A" strokeWidth="3" />
                <text className="report__annual-curve-tip" x={growth.peak.x} y={growth.peak.y - 13} textAnchor="middle">
                  {growth.peak.value}
                </text>
                {growth.axis
                  .filter((_, i) => i % 2 === 0)
                  .map((item) => (
                    <text
                      className="report__annual-curve-axis"
                      key={item.label}
                      x={item.x}
                      y={growth.H - 5}
                      textAnchor="middle"
                    >
                      {item.label}
                    </text>
                  ))}
              </svg>
            </div>
          ) : null}

          {data.categories?.length ? (
            <div className="report__annual-cats">
              <div className="report__annual-subhead">
                <span>最常学的主题</span>
                <span className="muted">按知识点数量</span>
              </div>
              {data.categories.slice(0, 4).map((cat, i) => (
                <div className="report__annual-cat" key={cat.name}>
                  <span className="report__annual-cat-rank">{i + 1}</span>
                  <div className="report__annual-cat-main">
                    <div className="report__annual-cat-head">
                      <span>{cat.name}</span>
                      <span className="muted">
                        {cat.count} 个 · 掌握 {cat.mastery}%
                      </span>
                    </div>
                    <ProgressBar value={cat.mastery} tone={['mint', 'butter', 'sky'][i % 3]} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="report__annual-poster">
          <canvas ref={canvasRef} />
          <ClayButton size="sm" onClick={download}>
            <IconDownload size={15} /> 保存长图
          </ClayButton>
          <div className="report__annual-poster-note">
            <div className="report__annual-poster-note-title">长图包含</div>
            <ul>
              <li>年度总结 + 四项核心指标</li>
              <li>12 个月投入柱状图</li>
              <li>最常学的主题排行</li>
              <li>最长连续学习与累计 XP</li>
              <li>导出尺寸 1080 × 1920</li>
            </ul>
          </div>
        </div>
      </div>
    </ClayCard>
  );
}
