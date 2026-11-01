import { useCallback, useEffect, useRef, useState } from 'react';
import { useReactMediaRecorder } from 'react-media-recorder';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import apiClient from '../api/axios';
import {
  ClayButton,
  ClayCard,
  ClayChip,
  EmptyState,
  PageHead,
  ProgressRing,
  Select,
  TextArea,
  useToast,
} from '../components/ui/ClayKit';
import { AppIcon } from '../components/icons/AppIcon';
import { IconMic, IconRefresh, IconSend, IconVolume } from '../components/ui/icons';

const speak = (text) => {
  if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 1;
    window.speechSynthesis.speak(utter);
  } catch {
    /* 浏览器不支持时静默 */
  }
};

export default function PracticePage() {
  const toast = useToast();
  const [points, setPoints] = useState([]);
  const [kpId, setKpId] = useState('');
  const [phase, setPhase] = useState('idle');
  const [question, setQuestion] = useState('');
  const [transcript, setTranscript] = useState('');
  const [manual, setManual] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [history, setHistory] = useState([]);
  const [blob, setBlob] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [mode, setMode] = useState('voice');

  const stopRef = useRef(null);
  const { startRecording, stopRecording, clearBlobUrl } = useReactMediaRecorder({
    audio: true,
    onStop: (_url, recordedBlob) => setBlob(recordedBlob),
  });

  useEffect(() => {
    stopRef.current = stopRecording;
  }, [stopRecording]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await apiClient.get('/knowledge-points');
        const list = Array.isArray(data) ? data : [];
        setPoints(list);
        if (list.length > 0) setKpId((prev) => prev || list[0]._id);
      } catch {
        /* 忽略 */
      }
    })();
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return undefined;
    const timer = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= 45) {
          stopRef.current?.();
          return 45;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const startPractice = async () => {
    if (!kpId) {
      toast.warn('先选择一个知识点');
      return;
    }
    setPhase('loading');
    setHistory([]);
    setFeedback(null);
    setTranscript('');
    setManual('');
    try {
      const { data } = await apiClient.post('/ai/practice-start', { knowledgePointId: kpId }, { timeout: 60000 });
      setQuestion(data.question);
      setHistory([{ role: 'assistant', content: data.question }]);
      setPhase('asking');
      speak(data.question);
    } catch (err) {
      toast.error(err.response?.data?.msg || '开始陪练失败');
      setPhase('idle');
    }
  };

  const submitAnswer = useCallback(
    async (text) => {
      const answer = String(text || '').trim();
      if (!answer) {
        toast.warn('先讲两句再提交');
        return;
      }
      setPhase('evaluating');
      setTranscript(answer);
      try {
        const { data } = await apiClient.post(
          '/ai/practice-reply',
          { knowledgePointId: kpId, transcript: answer, history },
          { timeout: 90000 }
        );
        setFeedback(data);
        setQuestion(data.nextQuestion);
        setHistory((prev) => [
          ...prev,
          { role: 'user', content: answer },
          { role: 'assistant', content: data.nextQuestion },
        ]);
        setManual('');
        setPhase('asking');
        speak(data.nextQuestion);
      } catch (err) {
        toast.error(err.response?.data?.msg || '点评失败，请稍后再试');
        setPhase('asking');
      }
    },
    [history, kpId, toast]
  );

  const handleMic = () => {
    if (phase === 'recording') {
      stopRecording();
      setPhase('transcribing');
      return;
    }
    setElapsed(0);
    setPhase('recording');
    startRecording();
  };

  useEffect(() => {
    if (!blob) return undefined;
    let alive = true;
    (async () => {
      setPhase('transcribing');
      const form = new FormData();
      form.append('audio', blob, 'practice.webm');
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
          toast.warn('没有听清，再说一次试试');
          setPhase('asking');
          return;
        }
        await submitAnswer(text);
      } catch (err) {
        if (!alive) return;
        clearBlobUrl();
        setBlob(null);
        toast.error(err.response?.data?.msg || '语音识别失败，可改用文字作答');
        setPhase('asking');
      }
    })();
    return () => {
      alive = false;
    };
  }, [blob, clearBlobUrl, submitAnswer, toast]);

  const busy = ['loading', 'transcribing', 'evaluating', 'recording'].includes(phase);

  return (
    <div className="practice">
      <PageHead
        title="语音陪练"
        sub="AI 伙伴会像同学一样追问你，逼你把模糊的地方讲清楚。"
        icon={<AppIcon name="act-mic" size={54} round />}
        actions={
          question ? (
            <ClayButton variant="ghost" onClick={startPractice}>
              <IconRefresh size={16} /> 换一轮
            </ClayButton>
          ) : null
        }
      />

      <ClayCard className="row-12 wrap" style={{ padding: '16px 20px', gap: 14 }}>
        <div className="grow" style={{ minWidth: 220 }}>
          <Select value={kpId} onChange={(e) => setKpId(e.target.value)} aria-label="选择知识点">
            {points.length === 0 ? <option value="">还没有知识点</option> : null}
            {points.map((kp) => (
              <option value={kp._id} key={kp._id}>
                {kp.title}
              </option>
            ))}
          </Select>
        </div>
        <ClayChip tone="mint" active={mode === 'voice'} onClick={() => setMode('voice')}>
          语音作答
        </ClayChip>
        <ClayChip tone="mint" active={mode === 'text'} onClick={() => setMode('text')}>
          文字作答
        </ClayChip>
        <ClayButton variant="lilac" onClick={startPractice} loading={phase === 'loading'} disabled={!kpId}>
          开始陪练
        </ClayButton>
      </ClayCard>

      {!question && phase === 'idle' ? (
        <ClayCard>
          <EmptyState
            icon={<AppIcon name="nav-agent" size={92} round />}
            title="准备好讲给别人听了吗"
            desc="选一个知识点，AI 伙伴会先抛出一个开放式问题，再根据你的回答继续追问。"
            action={
              <ClayButton variant="primary" onClick={startPractice} loading={phase === 'loading'} disabled={!kpId}>
                开始第一问
              </ClayButton>
            }
          />
        </ClayCard>
      ) : null}

      {question ? (
        <ClayCard className="practice__stage">
          <span className="muted">AI 伙伴的提问</span>
          <h2 className="practice__question">{question}</h2>
          <div className="practice__meta">
            <span className="pill pill--level">{phase === 'recording' ? '正在录音' : '可以开始作答'}</span>
            {elapsed > 0 ? <span className="pill">已录 {elapsed}s</span> : null}
          </div>

          <div className="practice__controls">
            <ClayButton variant="ghost" onClick={() => speak(question)}>
              <IconVolume size={16} /> 再听一遍
            </ClayButton>
            {mode === 'voice' ? (
              <ClayButton
                variant={phase === 'recording' ? 'danger' : 'primary'}
                onClick={handleMic}
                disabled={busy && phase !== 'recording'}
              >
                <IconMic size={17} />
                {phase === 'recording' ? '停止并提交' : phase === 'transcribing' ? '识别中…' : '按下作答'}
              </ClayButton>
            ) : null}
          </div>

          {mode === 'text' ? (
            <div style={{ width: 'min(620px, 100%)', textAlign: 'left' }}>
              <TextArea
                rows={4}
                placeholder="像跟同学解释一样，写下你的回答"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                disabled={phase === 'evaluating'}
              />
              <div className="row-12" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <ClayButton variant="primary" onClick={() => submitAnswer(manual)} loading={phase === 'evaluating'}>
                  <IconSend size={16} /> 提交回答
                </ClayButton>
              </div>
            </div>
          ) : null}

          {transcript ? <div className="practice__transcript">{transcript}</div> : null}
        </ClayCard>
      ) : null}

      {feedback ? (
        <ClayCard className="practice__score-row">
          <ProgressRing
            value={feedback.score || 0}
            size={104}
            thickness={12}
            color={(feedback.score || 0) >= 80 ? 'var(--mint-deep)' : 'var(--sky)'}
            label="分"
          />
          <div className="practice__tips">
            <strong style={{ fontSize: 15 }}>本轮点评</strong>
            <div className="practice__tip">{feedback.feedback}</div>
            <span className="muted">继续回答下一问，分数会随讲解质量变化。</span>
          </div>
        </ClayCard>
      ) : null}

      {history.length > 1 ? (
        <ClayCard style={{ padding: 22 }}>
          <div className="section-head">
            <h2>对话回顾</h2>
            <span className="tag tag--mute">{history.length} 条</span>
          </div>
          <div className="stack-12">
            {history.map((item, i) => (
              <div
                key={`${item.role}-${i}`}
                className={`agent__msg${item.role === 'user' ? ' agent__msg--me' : ''}`}
              >
                <div className="agent__bubble" style={{ maxWidth: '88%' }}>
                  {item.role === 'user' ? (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{item.content}</div>
                  ) : (
                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ClayCard>
      ) : null}
    </div>
  );
}