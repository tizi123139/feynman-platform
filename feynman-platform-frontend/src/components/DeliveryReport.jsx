import { ClayCard, ProgressBar, ProgressRing } from './ui/ClayKit';

const ringColor = (score) => (score >= 80 ? 'var(--mint-deep)' : score >= 60 ? 'var(--sky)' : 'var(--coral)');
const tagTone = (score) => (score >= 80 ? 'mint' : score >= 60 ? 'sky' : 'butter');

/** 表达体检：内容分之外的「讲得顺不顺」，纯规则计算的结果卡片 */
export default function DeliveryReport({ report }) {
  if (!report) return null;

  const { score = 0, grade, words = 0, seconds = 0, pace = 0, metrics = [], fillers = [], tips = [] } = report;

  return (
    <ClayCard className="deliv">
      <div className="section-head">
        <h2>表达体检</h2>
        <span className={`tag tag--${tagTone(score)}`}>{grade}</span>
      </div>

      <div className="deliv__grid">
        <div className="deliv__score">
          <ProgressRing value={score} size={112} thickness={13} color={ringColor(score)} label="表达" />
          <span className="deliv__meta">
            {words} 字 · {seconds} 秒 · {pace} 字/分
          </span>
        </div>

        <div className="deliv__metrics">
          {metrics.map((item) => (
            <div className="deliv__metric" key={item.key}>
              <div className="deliv__metric-top">
                <span className="deliv__metric-label">{item.label}</span>
                <span className={`deliv__metric-value deliv__metric-value--${item.level}`}>{item.value}</span>
              </div>
              <ProgressBar
                value={item.score}
                tone={item.level === 'good' ? 'mint' : item.level === 'ok' ? 'sky' : undefined}
              />
              <div className="deliv__metric-hint">{item.hint}</div>
            </div>
          ))}
        </div>
      </div>

      {fillers.length > 0 ? (
        <div className="deliv__fillers">
          <span className="deliv__fillers-label">口头禅排行</span>
          {fillers.map((item) => (
            <span className="deliv__filler" key={item.word}>
              「{item.word}」×{item.count}
            </span>
          ))}
        </div>
      ) : null}

      {tips.length > 0 ? (
        <ul className="deliv__tips">
          {tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      ) : null}
    </ClayCard>
  );
}
