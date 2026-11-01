import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../api/axios';
import {
  ClayButton,
  ClayCard,
  ClayChip,
  PageHead,
  ProgressRing,
  TextArea,
  useToast,
} from '../components/ui/ClayKit';
import { AppIcon } from '../components/icons/AppIcon';
import { burstConfetti } from '../utils/confetti';
import { IconChevronLeft, IconRefresh, IconSend } from '../components/ui/icons';

const ROUND_SIZE = 5;
const DIFFICULTIES = ['基础', '基础', '中等', '中等', '进阶'];
const TYPES = ['single-choice', 'short-answer', 'single-choice', 'single-choice', 'short-answer'];

export default function QuizPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [kp, setKp] = useState(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState('loading');
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState('');
  const [shortAnswer, setShortAnswer] = useState('');
  const [verdict, setVerdict] = useState(null);
  const [records, setRecords] = useState([]);

  const loadKp = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/knowledge-points/${id}`);
      setKp(data);
      return data;
    } catch (err) {
      toast.error(err.response?.data?.msg || '加载知识点失败');
      navigate('/', { replace: true });
      return null;
    }
  }, [id, navigate, toast]);

  const loadQuestion = useCallback(
    async (roundIndex, content) => {
      if (!content) return;
      setPhase('loading');
      setSelected('');
      setShortAnswer('');
      setVerdict(null);
      try {
        const { data } = await apiClient.post(
          '/ai/generate-question',
          {
            knowledgePointContent: content,
            difficulty: DIFFICULTIES[roundIndex] || '中等',
            type: TYPES[roundIndex] || 'single-choice',
          },
          { timeout: 60000 }
        );
        setQuestion(data);
        setPhase('answering');
      } catch (err) {
        toast.error(err.response?.data?.msg || '出题失败，请稍后再试');
        setPhase('error');
      }
    },
    [toast]
  );

  useEffect(() => {
    (async () => {
      const data = await loadKp();
      if (data) {
        if (!data.content || !data.content.trim()) {
          setPhase('nocontent');
          return;
        }
        loadQuestion(0, data.content);
      }
    })();
  }, [loadKp, loadQuestion]);

  const saveAttempt = (payload) => {
    apiClient
      .post('/quiz-attempts', { knowledgePointId: id, ...payload })
      .then(({ data }) => {
        if (data?.reward?.xp) toast.info(`+${data.reward.xp} 经验值`);
      })
      .catch(() => {
        /* 记录失败不影响答题体验 */
      });
  };

  const submitChoice = async (key) => {
    if (phase !== 'answering') return;
    setSelected(key);
    const isCorrect = key === question.answer;
    const feedback = {
      isCorrect,
      explanation: question.explanation || (isCorrect ? '答对啦！' : `正确答案是 ${question.answer}。`),
    };
    setVerdict(feedback);
    setPhase('feedback');
    setRecords((list) => [...list, { question, answer: question.answer, userAnswer: key, ...feedback }]);
    saveAttempt({
      questionType: 'single-choice',
      difficulty: question.difficulty || DIFFICULTIES[index],
      question: question.question,
      options: question.options,
      answer: question.answer,
      userAnswer: key,
      isCorrect,
      explanation: question.explanation || '',
    });
  };

  const submitShort = async () => {
    const text = shortAnswer.trim();
    if (!text) {
      toast.warn('先写下你的答案');
      return;
    }
    setPhase('grading');
    try {
      const { data } = await apiClient.post(
        '/ai/grade-answer',
        {
          question: question.question,
          answerKeyPoints: question.answer_key_points || question.answerKeyPoints || question.answer,
          studentAnswer: text,
        },
        { timeout: 60000 }
      );
      const isCorrect = Boolean(data.isCorrect);
      setVerdict({ isCorrect, explanation: data.explanation || '' });
      setPhase('feedback');
      setRecords((list) => [
        ...list,
        { question, answer: (question.answer_key_points || []).join('；'), userAnswer: text, isCorrect, explanation: data.explanation },
      ]);
      saveAttempt({
        questionType: 'short-answer',
        difficulty: question.difficulty || DIFFICULTIES[index],
        question: question.question,
        options: null,
        answer: (question.answer_key_points || []).join('；'),
        userAnswer: text,
        isCorrect,
        explanation: data.explanation || '',
      });
    } catch (err) {
      toast.error(err.response?.data?.msg || '评分失败，请稍后再试');
      setPhase('answering');
    }
  };

  const next = () => {
    const nextIndex = index + 1;
    if (nextIndex >= ROUND_SIZE) {
      setPhase('done');
      return;
    }
    setIndex(nextIndex);
    loadQuestion(nextIndex, kp?.content || '');
  };

  const restart = () => {
    setIndex(0);
    setRecords([]);
    loadQuestion(0, kp?.content || '');
  };

  const correctCount = records.filter((r) => r.isCorrect).length;
  const accuracy = records.length ? Math.round((correctCount / records.length) * 100) : 0;

  useEffect(() => {
    if (phase === 'done' && accuracy >= 80) burstConfetti({ count: 70 });
  }, [phase, accuracy]);

  if (phase === 'done') {
    const wrong = records.filter((r) => !r.isCorrect);
    return (
      <div className="quiz">
        <PageHead title="本轮完成" sub={kp?.title} icon={<AppIcon name="act-quiz" size={54} round />} />
        <ClayCard className="quiz__result">
          <div className="quiz__result-ring">
            <ProgressRing
              value={accuracy}
              size={152}
              thickness={16}
              color={accuracy >= 80 ? 'var(--mint-deep)' : accuracy >= 60 ? 'var(--sky)' : 'var(--coral)'}
              label="%"
            />
          </div>
          <h2 className="quiz__result-title">
            {accuracy >= 80 ? '掌握得不错！' : accuracy >= 60 ? '还差一点点' : '这块还需要再过一遍'}
          </h2>
          <p className="quiz__result-sub">
            共 {records.length} 题，答对 {correctCount} 题。
            {wrong.length > 0 ? '下面的错题值得回去把知识点再讲一遍。' : '这个知识点可以进入更长的复习间隔了。'}
          </p>
          <div className="row-12 wrap" style={{ justifyContent: 'center' }}>
            <ClayButton variant="ghost" onClick={restart}>
              <IconRefresh size={16} /> 再来一轮
            </ClayButton>
            <ClayButton variant="sky" to="/mistakes">
              错题本
            </ClayButton>
            <ClayButton variant="primary" to={`/feynman/${id}`}>
              回去再讲一遍
            </ClayButton>
          </div>
        </ClayCard>

        {wrong.length > 0 ? (
          <div className="stack-16">
            <div className="section-head">
              <h2>本轮错题</h2>
              <span className="tag tag--coral">{wrong.length} 题</span>
            </div>
            {wrong.map((item, i) => (
              <ClayCard key={`${item.question?.question || i}-${i}`}>
                <div className="mistake">
                  <div className="mistake__q">{item.question?.question}</div>
                  <div className="mistake__row">
                    <span className="mistake__badge mistake__badge--wrong">你的答案：{item.userAnswer || '（空）'}</span>
                    <span className="mistake__badge mistake__badge--right">参考：{item.answer}</span>
                  </div>
                  {item.explanation ? <div className="mistake__explain">{item.explanation}</div> : null}
                </div>
              </ClayCard>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (phase === 'nocontent') {
    return (
      <div className="quiz">
        <PageHead title="随堂测评" sub={kp?.title} icon={<AppIcon name="act-quiz" size={54} round />} />
        <ClayCard>
          <div className="empty">
            <AppIcon name="act-create" size={88} round />
            <div className="empty__title">这个知识点还没有内容</div>
            <p className="empty__desc">补充内容后 AI 才能出题。</p>
            <ClayButton variant="primary" to={`/kp/edit/${id}`}>
              去补充内容
            </ClayButton>
          </div>
        </ClayCard>
      </div>
    );
  }

  return (
    <div className="quiz">
      <PageHead
        title="随堂测评"
        sub={kp?.title}
        icon={<AppIcon name="act-quiz" size={54} round />}
        actions={
          <ClayButton variant="ghost" onClick={() => navigate('/')}>
            <IconChevronLeft size={16} /> 返回首页
          </ClayButton>
        }
      />

      <ClayCard className="quiz__progress">
        <div className="quiz__dots">
          {Array.from({ length: ROUND_SIZE }).map((_, i) => {
            const record = records[i];
            const cls = record ? (record.isCorrect ? 'is-right' : 'is-wrong') : i === index ? 'is-current' : '';
            return (
              <span className={`quiz__dot ${cls}`} key={i}>
                {record ? (record.isCorrect ? '✓' : '×') : i + 1}
              </span>
            );
          })}
        </div>
        <span className="quiz__progress-meta">
          第 {Math.min(index + 1, ROUND_SIZE)} / {ROUND_SIZE} 题 · 已答对 {correctCount}
        </span>
      </ClayCard>

      {phase === 'loading' ? (
        <ClayCard className="quiz__card">
          <div className="skeleton" style={{ height: 26, width: '66%' }} />
          <div className="skeleton" style={{ height: 52 }} />
          <div className="skeleton" style={{ height: 52 }} />
          <p className="muted">AI 正在根据你的笔记出题…</p>
        </ClayCard>
      ) : phase === 'error' ? (
        <ClayCard className="quiz__card">
          <div className="empty">
            <AppIcon name="act-quiz" size={80} round />
            <div className="empty__title">题目生成失败</div>
            <p className="empty__desc">可能是 AI 服务暂时不可用，稍后再试一次。</p>
            <ClayButton variant="primary" onClick={restart}>
              重试
            </ClayButton>
          </div>
        </ClayCard>
      ) : question ? (
        <ClayCard className="quiz__card">
          <div className="quiz__qhead">
            <ClayChip active tone="mint">
              {question.difficulty || DIFFICULTIES[index]}
            </ClayChip>
            <ClayChip active={false}>{TYPES[index] === 'short-answer' ? '简答题' : '单选题'}</ClayChip>
          </div>

          <h2 className="quiz__question">{question.question}</h2>

          {question.options ? (
            <div className="quiz__options">
              {Object.entries(question.options).map(([key, text]) => {
                let cls = 'quiz__option';
                if (phase === 'feedback') {
                  if (key === question.answer) cls += ' is-right';
                  else if (key === selected) cls += ' is-wrong';
                } else if (key === selected) {
                  cls += ' is-selected';
                }
                return (
                  <button
                    type="button"
                    key={key}
                    className={cls}
                    onClick={() => submitChoice(key)}
                    disabled={phase !== 'answering'}
                  >
                    <span className="quiz__option-key">{key}</span>
                    <span>{text}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="stack-12">
              <TextArea
                rows={5}
                placeholder="用自己的话回答，AI 会根据答案要点判断是否答对"
                value={shortAnswer}
                onChange={(e) => setShortAnswer(e.target.value)}
                disabled={phase !== 'answering'}
              />
              <div className="row-12" style={{ justifyContent: 'flex-end' }}>
                <ClayButton
                  variant="primary"
                  onClick={submitShort}
                  loading={phase === 'grading'}
                  disabled={phase === 'feedback'}
                >
                  <IconSend size={16} /> 提交答案
                </ClayButton>
              </div>
            </div>
          )}

          {verdict ? (
            <div className={`quiz__feedback quiz__feedback--${verdict.isCorrect ? 'right' : 'wrong'}`}>
              <div className="quiz__feedback-title">
                {verdict.isCorrect ? '✓ 回答正确' : '× 还需要再看看'}
              </div>
              <div>
                {verdict.explanation}
                {!verdict.isCorrect && question.answer ? (
                  <div style={{ marginTop: 6, fontWeight: 800 }}>参考答案：{question.answer}</div>
                ) : null}
                {!verdict.isCorrect && (question.answer_key_points || []).length > 0 ? (
                  <div style={{ marginTop: 6, fontWeight: 800 }}>
                    答案要点：{(question.answer_key_points || []).join('；')}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {phase === 'feedback' ? (
            <div className="quiz__actions">
              <ClayButton variant="primary" onClick={next}>
                {index + 1 >= ROUND_SIZE ? '查看本轮结果' : '下一题'}
              </ClayButton>
            </div>
          ) : null}
        </ClayCard>
      ) : null}
    </div>
  );
}