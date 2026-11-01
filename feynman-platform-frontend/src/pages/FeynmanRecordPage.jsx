import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useReactMediaRecorder } from 'react-media-recorder';
import apiClient from '../api/axios';
import {
  ClayButton,
  ClayCard,
  EmptyState,
  PageHead,
  ProgressRing,
  Segmented,
  TextArea,
  useToast,
} from '../components/ui/ClayKit';
import { AppIcon } from '../components/icons/AppIcon';
import { IconChat, IconChevronLeft, IconMic, IconQuiz, IconRefresh, IconSend } from '../components/ui/icons';
import { LineChart, RadarChart } from '../components/charts/Charts';
import DeliveryReport from '../components/DeliveryReport';

const MAX_SECONDS = 60;

// 与后端 feynmanCoachService.DIMENSIONS 的 key 一一对应，顺序也一致
const DIMENSIONS = [
  { key: 'accuracy', label: '准确性' },
  { key: 'completeness', label: '完整性' },
  { key: 'logic', label: '逻辑结构' },
  { key: 'fluency', label: '表达流畅' },
  { key: 'depth', label: '深度延伸' },
];

const STAGE_TEXT = {
  idle: '按下麦克风，用自己的话讲一遍',
  recording: '正在录音，讲完点一下停止',
  transcribing: '正在把语音转成文字…',
  evaluating: 'AI 教练正在听你的讲解…',
  done: '这一轮讲完啦',
};

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function FeynmanRecordPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [kp, setKp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState('voice');
  const [manualText, setManualText] = useState('');
  const [blob, setBlob] = useState(null);
  // 逐轮分数轨迹：同一知识点连讲几轮，能看到分数往上爬
  const [rounds, setRounds] = useState([]);
  // 弱点驱动追问：题目 / 作答 / 判定
  const [probe, setProbe] = useState(null);
  const [probeAnswer, setProbeAnswer] = useState('');
  const [probeResult, setProbeResult] = useState(null);
  const [probeBusy, setProbeBusy] = useState(false);
  const [probeRecords, setProbeRecords] = useState([]);
  // 表达体检：语速 / 口头禅 / 句长 / 讲解结构
  const [delivery, setDelivery] = useState(null);

  const stopRef = useRef(null);
  // 体检请求的序号，避免上一轮结果盖掉新一轮
  const deliverySeq = useRef(0);
  const { status, startRecording, stopRecording, clearBlobUrl, error: recorderError } = useReactMediaRecorder({
    audio: true,
    onStop: (_url, recordedBlob) => setBlob(recordedBlob),
  });

  useEffect(() => {
    stopRef.current = stopRecording;
  }, [stopRecording]);

  const loadKp = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get(`/knowledge-points/${id}`);
      setKp(data);
    } catch (err) {
      toast.error(err.response?.data?.msg || '加载知识点失败');
      navigate('/', { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => {
    loadKp();
  }, [loadKp]);

  useEffect(() => {
    if (!recorderError) return;
    toast.error('无法访问麦克风，可切换成文字输入');
  }, [recorderError, toast]);

  /* 录音计时，到达 60 秒自动停止（百度语音识别单次上限） */
  useEffect(() => {
    if (stage !== 'recording') return undefined;
    const timer = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= MAX_SECONDS) {
          stopRef.current?.();
          return MAX_SECONDS;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [stage]);

  /** 提交转录文本做费曼评分 */
  const evaluate = useCallback(
    async (text, seconds) => {
      setStage('evaluating');
      // 表达体检是纯规则计算，和内容评分并行，互不阻塞
      setDelivery(null);
      const seq = ++deliverySeq.current;
      apiClient
        .post('/ai/delivery', { text, durationSeconds: seconds }, { timeout: 20000 })
        .then(({ data }) => {
          if (seq === deliverySeq.current) setDelivery(data || null);
        })
        .catch(() => {
          if (seq === deliverySeq.current) setDelivery(null);
        });
      try {
        const { data } = await apiClient.post(
          '/ai/evaluate',
          {
            originalContent: kp?.content || '',
            transcribedText: text,
            knowledgePoint: kp?.title || '',
            knowledgePointId: id,
            durationSeconds: seconds,
            provider: 'auto',
          },
          { timeout: 90000 }
        );
        setResult(data);
        setStage('done');
        // 记一笔本轮成绩，用来画「讲给同一个人听，越讲越清楚」的轨迹
        setRounds((prev) => [
          ...prev,
          {
            round: prev.length + 1,
            score: data.score ?? 0,
            dimensions: data.dimensions || null,
          },
        ]);
        toast.success(`本轮得分 ${data.score ?? 0} 分`);
        if (data.reward?.xp) toast.info(`+${data.reward.xp} 经验值`);
        // 模型已经给了追问就先用它的，没给就让用户主动要
        if (data.followUp?.question) {
          setProbe({ ...data.followUp, reference: '', provider: data.provider });
          setProbeAnswer('');
          setProbeResult(null);
        }
      } catch (err) {
        toast.error(err.response?.data?.msg || 'AI 评分失败，请稍后再试');
        setStage('idle');
      }
    },
    [id, kp, toast]
  );

  /** 录音结束后自动上传识别 */
  useEffect(() => {
    if (!blob) return undefined;
    let alive = true;
    (async () => {
      setStage('transcribing');
      const form = new FormData();
      form.append('audio', blob, 'feynman.webm');
      try {
        const { data } = await apiClient.post('/audio/transcribe', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000,
        });
        if (!alive) return;
        const text = (data.result || '').trim();
        clearBlobUrl();
        setBlob(null);
        if (!text) {
          toast.warn('没有听清内容，再说一次试试');
          setStage('idle');
          return;
        }
        setTranscript(text);
        await evaluate(text, elapsed);
      } catch (err) {
        if (!alive) return;
        clearBlobUrl();
        setBlob(null);
        toast.error(err.response?.data?.msg || '语音识别失败，可以改用文字输入');
        setStage('idle');
      }
    })();
    return () => {
      alive = false;
    };
  }, [blob, clearBlobUrl, elapsed, evaluate, toast]);

  const resetProbe = () => {
    setProbe(null);
    setProbeAnswer('');
    setProbeResult(null);
  };

  const handleMicClick = () => {
    if (stage === 'recording') {
      stopRecording();
      setStage('transcribing');
      return;
    }
    setResult(null);
    setTranscript('');
    setElapsed(0);
    resetProbe();
    setDelivery(null);
    deliverySeq.current += 1;
    setStage('recording');
    startRecording();
  };

  const submitManual = async () => {
    const text = manualText.trim();
    if (!text) {
      toast.warn('先写点内容再提交');
      return;
    }
    setTranscript(text);
    await evaluate(text, Math.max(30, Math.round(text.length / 4)));
  };

  const restart = () => {
    setResult(null);
    setTranscript('');
    setElapsed(0);
    setManualText('');
    resetProbe();
    setDelivery(null);
    deliverySeq.current += 1;
    setStage('idle');
  };

  /** 让教练针对薄弱点再追问一问，轮次越高越往反例/边界/迁移上压 */
  const askProbe = async () => {
    if (probeBusy) return;
    setProbeBusy(true);
    try {
      const { data } = await apiClient.post(
        '/ai/probe',
        {
          knowledgePoint: kp?.title || '',
          originalContent: kp?.content || '',
          transcript,
          weaknesses: result?.weaknesses || [],
          round: probeRecords.length + 1,
          history: probeRecords.map((item) => item.question).filter(Boolean),
        },
        { timeout: 60000 }
      );
      setProbe(data);
      setProbeAnswer('');
      setProbeResult(null);
    } catch (err) {
      toast.error(err.response?.data?.msg || '追问没生成出来，再试一次');
    } finally {
      setProbeBusy(false);
    }
  };

  /** 回答追问：看这一轮有没有把没讲清的地方补上 */
  const submitProbe = async () => {
    const text = probeAnswer.trim();
    if (!text) {
      toast.warn('先写两句再提交');
      return;
    }
    if (probeBusy) return;
    setProbeBusy(true);
    try {
      const { data } = await apiClient.post(
        '/ai/probe-grade',
        {
          knowledgePoint: kp?.title || '',
          question: probe?.question || '',
          answer: text,
          reference: probe?.reference || '',
        },
        { timeout: 60000 }
      );
      setProbeResult(data);
      setProbeRecords((prev) => [...prev, { question: probe?.question, answer: text, ...data }]);
      toast.success(`这次补答 ${data.score} 分`);
    } catch (err) {
      toast.error(err.response?.data?.msg || '评分失败，稍后再试');
    } finally {
      setProbeBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="feyn">
        <div className="clay-card" style={{ padding: 28 }}>
          <div className="skeleton" style={{ height: 26, width: '40%' }} />
        </div>
      </div>
    );
  }

  const busy = stage === 'transcribing' || stage === 'evaluating';

  return (
    <div className="feyn">
      <PageHead
        title={kp?.title || '费曼复述'}
        sub="不看笔记，把这个概念讲给一个完全不懂的人听。"
        icon={<AppIcon name="act-mic" size={54} round />}
        actions={
          <>
            <ClayButton variant="ghost" onClick={() => navigate('/')}>
              <IconChevronLeft size={16} /> 返回首页
            </ClayButton>
            <ClayButton variant="sky" to={`/quiz/${id}`}>
              <IconQuiz size={16} /> 去测评
            </ClayButton>
          </>
        }
      />

      {!result ? (
        <ClayCard className="feyn__stage">
          <h2 className="feyn__stage-title">{STAGE_TEXT[stage]}</h2>
          <p className="feyn__stage-sub">
            {kp?.summary || '讲清楚「它是什么、为什么这样、举个例子」，AI 教练会从准确度、结构、生动度三个方面给你反馈。'}
          </p>

          <Segmented
            options={[
              { value: 'voice', label: '语音复述' },
              { value: 'text', label: '文字复述' },
            ]}
            value={mode}
            onChange={(value) => {
              if (stage === 'recording') return;
              setMode(value);
            }}
          />

          {mode === 'voice' ? (
            <>
              <div className="feyn__mic-wrap">
                {stage === 'recording' ? (
                  <>
                    <span className="feyn__wave" />
                    <span className="feyn__wave feyn__wave--2" />
                  </>
                ) : null}
                <button
                  type="button"
                  className={`feyn__mic${stage === 'recording' ? ' is-recording' : ''}`}
                  onClick={handleMicClick}
                  disabled={busy}
                  aria-label={stage === 'recording' ? '停止录音' : '开始录音'}
                >
                  <IconMic size={stage === 'recording' ? 34 : 40} />
                  <span className="feyn__mic-label">{stage === 'recording' ? '点击停止' : '开始'}</span>
                </button>
              </div>

              <div className={`feyn__timer${elapsed >= MAX_SECONDS ? ' is-warn' : ''}`}>{fmt(elapsed)}</div>

              {stage === 'recording' ? (
                <div className="feyn__waveform" aria-hidden="true">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <span
                      key={i}
                      className="feyn__bar"
                      style={{ height: `${10 + ((i * 7) % 26)}px`, animationDelay: `${i * 0.07}s` }}
                    />
                  ))}
                </div>
              ) : null}

              <span className="feyn__hint">
                {busy ? '请稍等，正在处理…' : `单次录音最长 ${MAX_SECONDS} 秒，超时会自动截断`}
              </span>
              {status === 'acquiring_media' ? <span className="feyn__hint">正在请求麦克风权限…</span> : null}
            </>
          ) : (
            <div style={{ width: 'min(620px, 100%)', textAlign: 'left' }}>
              <TextArea
                rows={7}
                placeholder="把讲解写下来也一样有效：先讲它是什么，再讲为什么，最后举一个例子。"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
              />
              <div className="row-12" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <ClayButton variant="primary" onClick={submitManual} loading={busy}>
                  <IconSend size={16} /> 提交给 AI 教练
                </ClayButton>
              </div>
            </div>
          )}
        </ClayCard>
      ) : (
        <>
          <ClayCard className="feyn__score-wrap feyn__score-grid">
            <div className="feyn__score-ring">
              <ProgressRing
                value={result.score || 0}
                size={132}
                thickness={14}
                color={(result.score || 0) >= 80 ? 'var(--mint-deep)' : (result.score || 0) >= 60 ? 'var(--sky)' : 'var(--coral)'}
                label="分"
              />
            </div>
            <div className="feyn__score-copy">
              <h2 className="feyn__score-title">
                {(result.score || 0) >= 85 ? '讲得真清楚！' : (result.score || 0) >= 70 ? '不错，再打磨一点' : '还有提升空间'}
              </h2>
              <p className="feyn__score-desc">{result.evaluation || '继续用更具体的例子把抽象概念落到地上。'}</p>
              <div className="row-8 wrap" style={{ marginTop: 12 }}>
                {result.mastery !== null && result.mastery !== undefined ? (
                  <span className="pill pill--level">掌握度 {result.mastery}</span>
                ) : null}
                {result.reward?.xp ? <span className="pill pill--streak">+{result.reward.xp} XP</span> : null}
                {result.provider ? <span className="tag tag--mute">{result.provider}</span> : null}
              </div>
              {result.dimensionsEstimated ? (
                <p className="feyn__radar-note">该模型只给了综合分，五维形状由综合分推算</p>
              ) : null}
            </div>
            <div className="feyn__radar">
              <RadarChart
                indicators={DIMENSIONS}
                values={DIMENSIONS.map((item) => result.dimensions?.[item.key] ?? 0)}
                name={`第 ${rounds.length || 1} 轮`}
                height={244}
              />
              <div className="feyn__radar-legend">
                {DIMENSIONS.map((item) => (
                  <span key={item.key} className="feyn__radar-item">
                    {item.label}
                    <strong>{result.dimensions?.[item.key] ?? 0}</strong>
                  </span>
                ))}
              </div>
            </div>
          </ClayCard>

          <DeliveryReport report={delivery} />

          <div className="feyn__panels">
            <ClayCard className="feyn__panel feyn__panel--good">
              <h3 className="feyn__panel-title">👍 讲得好的地方</h3>
              {(result.strengths || []).length > 0 ? (
                <ul className="feyn__list">
                  {result.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">这次没有捕捉到明显亮点，再讲一次试试。</p>
              )}
            </ClayCard>
            <ClayCard className="feyn__panel feyn__panel--warn">
              <h3 className="feyn__panel-title">🔧 可以更好</h3>
              {(result.weaknesses || []).length > 0 ? (
                <ul className="feyn__list">
                  {result.weaknesses.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">没有明显问题，可以挑战更难的追问。</p>
              )}
            </ClayCard>
          </div>

          {rounds.length > 1 ? (
            <ClayCard className="feyn__panel">
              <div className="section-head">
                <h2>逐轮分数轨迹</h2>
                <span className="tag tag--mint">
                  {rounds[0].score} → {rounds[rounds.length - 1].score} 分
                </span>
              </div>
              <LineChart
                labels={rounds.map((item) => `第 ${item.round} 轮`)}
                values={rounds.map((item) => item.score)}
                height={220}
              />
            </ClayCard>
          ) : null}

          <ClayCard className="feyn__probe">
            <div className="section-head">
              <h2>
                <IconChat size={18} /> 教练追问
              </h2>
              {probeRecords.length ? <span className="tag tag--butter">已补答 {probeRecords.length} 次</span> : null}
            </div>

            {probe ? (
              <>
                <p className="feyn__probe-q">{probe.question}</p>
                {probe.focus ? (
                  <p className="feyn__probe-meta">
                    这题在考：{probe.focus}
                    {probe.hint ? ` · 提示：${probe.hint}` : ''}
                  </p>
                ) : null}

                {probeResult ? (
                  <div className="feyn__probe-result">
                    <div className="feyn__probe-score">
                      <strong>{probeResult.score}</strong>
                      <span>补答得分</span>
                    </div>
                    <div>
                      <p className="feyn__probe-verdict">{probeResult.verdict}</p>
                      {probeResult.filled ? <p className="feyn__probe-line">✓ {probeResult.filled}</p> : null}
                      {probeResult.stillMissing ? (
                        <p className="feyn__probe-line feyn__probe-line--warn">△ {probeResult.stillMissing}</p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <>
                    <TextArea
                      rows={4}
                      placeholder="把刚才没讲清的地方补上：是什么、为什么、什么情况下不成立"
                      value={probeAnswer}
                      onChange={(event) => setProbeAnswer(event.target.value)}
                    />
                    <div className="row-8" style={{ marginTop: 12 }}>
                      <ClayButton variant="primary" size="sm" onClick={submitProbe} loading={probeBusy}>
                        <IconSend size={15} /> 提交补答
                      </ClayButton>
                      <ClayButton variant="ghost" size="sm" onClick={askProbe} loading={probeBusy}>
                        换一个问题
                      </ClayButton>
                    </div>
                  </>
                )}

                {probeResult ? (
                  <div className="row-8" style={{ marginTop: 14 }}>
                    <ClayButton variant="primary" size="sm" onClick={askProbe} loading={probeBusy}>
                      再来一问
                    </ClayButton>
                    <ClayButton variant="ghost" size="sm" onClick={resetProbe}>
                      先到这里
                    </ClayButton>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="feyn__probe-empty">
                  {(result.weaknesses || [])[0]
                    ? `刚才的评语里提到「${result.weaknesses[0]}」，让教练就这一点追问一句？`
                    : '讲完了不等于讲透了，让教练再追问一句试试。'}
                </p>
                <ClayButton variant="sky" size="sm" onClick={askProbe} loading={probeBusy}>
                  <IconChat size={15} /> 让教练追问
                </ClayButton>
              </>
            )}
          </ClayCard>

          <ClayCard className="feyn__transcript">
            <div className="section-head">
              <h2>你的原话</h2>
              <span className="tag tag--mute">语音识别</span>
            </div>
            {transcript || '（没有记录）'}
          </ClayCard>

          {result.polishedText ? (
            <ClayCard tone="mint" className="feyn__transcript">
              <div className="section-head">
                <h2>更清晰的版本</h2>
                <span className="tag tag--mint">AI 润色</span>
              </div>
              {result.polishedText}
            </ClayCard>
          ) : null}

          <div className="feyn__actions">
            <ClayButton variant="ghost" onClick={restart}>
              <IconRefresh size={16} /> 再讲一次
            </ClayButton>
            <ClayButton variant="sky" to={`/quiz/${id}`}>
              <IconQuiz size={16} /> 换个方式检验
            </ClayButton>
            <ClayButton variant="primary" to="/">
              回到首页
            </ClayButton>
          </div>
        </>
      )}

      {!result && stage === 'idle' && !kp?.content ? (
        <ClayCard>
          <EmptyState
            icon={<AppIcon name="act-create" size={80} round />}
            title="这个知识点还没有内容"
            desc="先补充一些内容，复述时 AI 才有参照来判断讲得准不准。"
            action={
              <ClayButton variant="primary" to={`/kp/edit/${id}`}>
                去补充内容
              </ClayButton>
            }
          />
        </ClayCard>
      ) : null}
    </div>
  );
}