/* AI 伙伴：会话持久化 + 引用来源 + 复制 / 重新生成 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import apiClient from '../api/axios';
import {
  ClayButton,
  ClayCard,
  ClayModal,
  ConfirmDialog,
  TextInput,
  useToast,
} from '../components/ui/ClayKit';
import { AppIcon } from '../components/icons/AppIcon';
import { IconCopy, IconEdit, IconPlus, IconRefresh, IconSend, IconTrash } from '../components/ui/icons';

const STARTERS = [
  '帮我用费曼学习法讲清楚「熵」',
  '我笔记里最薄弱的知识点是什么？',
  '把「闭包」讲给 10 岁的小朋友听',
  '根据我的笔记出 3 个追问',
];

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return sameDay ? `${hh}:${mm}` : `${date.getMonth() + 1}/${date.getDate()}`;
}

// 流式请求：逐块解析后端 SSE，把每个事件交给 onEvent
// 注意不能用 apiClient，axios 的全局 15s 超时会打断长回答
async function streamRequest(path, body, onEvent) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${apiClient.defaults.baseURL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let msg = '请求失败';
    try {
      const data = await response.json();
      msg = data?.msg || msg;
    } catch {
      // 非 JSON 响应，保留默认提示
    }
    throw new Error(msg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let index;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let event;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }
        onEvent(event);
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export default function AgentPage() {
  const toast = useToast();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingConv, setLoadingConv] = useState(false);
  const [sending, setSending] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState(null);
  const listRef = useRef(null);
  const bottomRef = useRef(null);

  const activeConv = useMemo(
    () => conversations.find((conv) => conv.id === activeId) || null,
    [conversations, activeId]
  );

  const loadList = useCallback(
    async (preferredId) => {
      try {
        const { data } = await apiClient.get('/chat/conversations');
        const list = Array.isArray(data) ? data : [];
        setConversations(list);
        const nextId = preferredId || activeId || list[0]?.id || null;
        setActiveId(nextId);
        return { list, nextId };
      } catch (err) {
        toast.error(err.response?.data?.msg || '加载会话失败');
        return { list: [], nextId: null };
      } finally {
        setLoadingList(false);
      }
    },
    [activeId, toast]
  );

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMessages = useCallback(
    async (id) => {
      if (!id) {
        setMessages([]);
        return;
      }
      setLoadingConv(true);
      try {
        const { data } = await apiClient.get(`/chat/conversations/${id}`);
        setMessages(data?.messages || []);
      } catch (err) {
        toast.error(err.response?.data?.msg || '加载对话内容失败');
      } finally {
        setLoadingConv(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    loadMessages(activeId);
  }, [activeId, loadMessages]);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, sending]);

  const createConversation = async () => {
    try {
      const { data } = await apiClient.post('/chat/conversations', { title: '新建对话' });
      await loadList(data?._id);
      setActiveId(data?._id);
      setMessages([]);
      setInput('');
    } catch (err) {
      toast.error(err.response?.data?.msg || '新建会话失败');
    }
  };

  const patchLastAssistant = useCallback((patch) => {
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i -= 1) {
        if (prev[i].role === 'assistant') {
          const next = [...prev];
          next[i] = { ...next[i], ...patch };
          return next;
        }
      }
      return prev;
    });
  }, []);

  const consumeStream = useCallback(
    async (path, body) => {
      let streamed = '';
      let settled = false;
      let failure = null;

      await streamRequest(path, body, (event) => {
        if (event.type === 'delta') {
          streamed += event.text;
          patchLastAssistant({ content: streamed });
        } else if (event.type === 'done') {
          settled = true;
          streamed = event.text ?? streamed;
          patchLastAssistant({
            content: streamed,
            sources: (event.sources || []).map((s) => s.title || s),
            streaming: false,
          });
          if (event.reward?.xpGained) {
            toast.success(`+${event.reward.xpGained} XP，回答已生成`);
          }
        } else if (event.type === 'error') {
          // 服务端出错时仍会落库并补发 done，这里只记录，不提前中断读取
          failure = event.msg || '生成失败';
          if (event.text) {
            streamed = event.text;
            patchLastAssistant({ content: streamed });
          }
        }
      });

      if (!settled) {
        patchLastAssistant({ streaming: false });
        throw new Error(failure || '回答生成中断，请重试');
      }
    },
    [patchLastAssistant, toast]
  );

  const send = async (content) => {
    const text = (content ?? input).trim();
    if (!text || sending) return;

    let convId = activeId;
    try {
      if (!convId) {
        const { data } = await apiClient.post('/chat/conversations', { title: text.slice(0, 24) });
        convId = data?._id;
        setActiveId(convId);
      }

      setSending(true);
      setInput('');
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: text, createdAt: new Date().toISOString() },
        { role: 'assistant', content: '', sources: [], streaming: true },
      ]);

      await consumeStream(`/chat/conversations/${convId}/messages/stream`, { content: text });
      loadList(convId);
    } catch (err) {
      toast.error(err.message || '发送失败，请稍后再试');
      // 失败时保留用户消息，只移除还没出内容的空回答
      setMessages((prev) => prev.filter((m) => !(m.role === 'assistant' && m.streaming && !m.content)));
    } finally {
      setSending(false);
    }
  };

  const regenerate = async () => {
    if (!activeId || sending) return;
    setSending(true);
    try {
      setMessages((prev) => {
        const next = [...prev];
        while (next.length && next[next.length - 1].role === 'assistant') next.pop();
        next.push({ role: 'assistant', content: '', sources: [], streaming: true });
        return next;
      });
      await consumeStream(`/chat/conversations/${activeId}/retry/stream`, {});
      loadList(activeId);
    } catch (err) {
      toast.error(err.message || '重新生成失败');
      setMessages((prev) => prev.filter((m) => !(m.role === 'assistant' && m.streaming && !m.content)));
    } finally {
      setSending(false);
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('已复制到剪贴板');
    } catch {
      toast.error('浏览器不允许复制，请手动选择文本');
    }
  };

  const submitRename = async () => {
    if (!renaming) return;
    const title = renameValue.trim();
    if (!title) {
      toast.warn('标题不能为空');
      return;
    }
    try {
      await apiClient.put(`/chat/conversations/${renaming.id}`, { title });
      setConversations((prev) => prev.map((c) => (c.id === renaming.id ? { ...c, title } : c)));
      setRenaming(null);
      toast.success('已重命名');
    } catch (err) {
      toast.error(err.response?.data?.msg || '重命名失败');
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiClient.delete(`/chat/conversations/${deleting.id}`);
      const rest = conversations.filter((c) => c.id !== deleting.id);
      setConversations(rest);
      setDeleting(null);
      setActiveId(rest[0]?.id || null);
      toast.success('会话已删除');
    } catch (err) {
      toast.error(err.response?.data?.msg || '删除失败');
    }
  };

  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  }, [messages]);

  return (
    <div className="agent">
      <ClayCard className="agent__side" flat>
        <div className="agent__side-head">
          <span className="agent__side-title">对话</span>
          <ClayButton size="sm" variant="primary" onClick={createConversation}>
            <IconPlus size={14} /> 新建
          </ClayButton>
        </div>

        <div className="agent__list" ref={listRef}>
          {loadingList ? (
            <p className="muted">加载中…</p>
          ) : conversations.length === 0 ? (
            <p className="muted">还没有对话，问我一个问题试试。</p>
          ) : (
            conversations.map((conv) => (
              <button
                type="button"
                key={conv.id}
                className={`agent__conv${conv.id === activeId ? ' is-active' : ''}`}
                onClick={() => setActiveId(conv.id)}
              >
                <span className="agent__conv-title">{conv.title}</span>
                <span className="agent__conv-time">
                  {formatTime(conv.lastMessageAt)} · {conv.messageCount} 条
                </span>
                <span
                  className="agent__conv-del"
                  role="button"
                  tabIndex={0}
                  aria-label="删除会话"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleting(conv);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      setDeleting(conv);
                    }
                  }}
                >
                  <IconTrash size={12} />
                </span>
              </button>
            ))
          )}
        </div>

        <div className="notice notice--mint" style={{ fontSize: 12 }}>
          回答只引用你自己的知识点，不会串到别人的笔记。
        </div>
      </ClayCard>

      <ClayCard className="agent__main" flat>
        <div className="agent__top">
          <AppIcon name="nav-agent" size={42} round />
          <div className="agent__top-title">{activeConv?.title || '新的对话'}</div>
          {activeConv ? (
            <ClayButton
              size="sm"
              variant="ghost"
              onClick={() => {
                setRenaming(activeConv);
                setRenameValue(activeConv.title);
              }}
            >
              <IconEdit size={14} /> 重命名
            </ClayButton>
          ) : null}
          <ClayButton size="sm" variant="ghost" onClick={regenerate} disabled={!messages.length || sending}>
            <IconRefresh size={14} /> 重新生成
          </ClayButton>
        </div>

        <div className="agent__messages">
          {loadingConv ? (
            <p className="muted">正在打开对话…</p>
          ) : messages.length === 0 ? (
            <div className="empty" style={{ margin: 'auto' }}>
              <AppIcon name="nav-agent" size={88} round />
              <div className="empty__title">嗨，我是你的 AI 学习伙伴</div>
              <p className="empty__desc">
                我会基于你自己的知识点回答问题，也会追问「为什么」，帮你把概念讲得更透。
              </p>
              <div className="agent__starter" style={{ justifyContent: 'center', padding: 0 }}>
                {STARTERS.map((text) => (
                  <button type="button" key={text} className="chip" onClick={() => send(text)}>
                    {text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, index) => {
              const mine = msg.role === 'user';
              return (
                <div className={`agent__msg${mine ? ' agent__msg--me' : ''}`} key={`${msg.role}-${index}`}>
                  {mine ? (
                    <AppIcon name="act-create" size={34} round />
                  ) : (
                    <AppIcon name="nav-agent" size={34} round />
                  )}
                  <div className="agent__bubble">
                    {mine ? (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                    ) : msg.content ? (
                      /* 助手回答按 Markdown 渲染；流式过程中内容未闭合时会自行容错 */
                      <div className="markdown-body">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            // 回答里的外链一律新窗口打开，避免把当前会话页面顶掉
                            a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : sending && index === messages.length - 1 ? (
                      /* 还没有任何内容时，用打字指示器占住这个气泡，避免出现空气泡 */
                      <span className="agent__typing">
                        <span />
                        <span />
                        <span />
                      </span>
                    ) : null}

                    {!mine && msg.sources?.length ? (
                      <div className="agent__sources">
                        {msg.sources.map((source, i) => (
                          <span className="agent__source" key={`${source}-${i}`}>
                            📎 {source}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {!mine ? (
                      <div className="agent__bubble-tools">
                        <button type="button" className="agent__bubble-btn" onClick={() => copy(msg.content)}>
                          <IconCopy size={12} /> 复制
                        </button>
                        {index === lastAssistantIndex ? (
                          <button type="button" className="agent__bubble-btn" onClick={regenerate}>
                            <IconRefresh size={12} /> 重新生成
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}

          <div ref={bottomRef} />
        </div>

        <div className="agent__composer">
          <div className="agent__composer-box">
            <textarea
              value={input}
              placeholder="问点什么吧，比如「用费曼学习法讲讲闭包」…（Enter 发送，Shift+Enter 换行）"
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <ClayButton iconOnly variant="primary" onClick={() => send()} disabled={sending || !input.trim()}>
              <IconSend size={18} />
            </ClayButton>
          </div>
        </div>
      </ClayCard>

      <ClayModal
        open={Boolean(renaming)}
        title="重命名对话"
        onClose={() => setRenaming(null)}
        footer={
          <>
            <ClayButton variant="ghost" onClick={() => setRenaming(null)}>
              取消
            </ClayButton>
            <ClayButton onClick={submitRename}>保存</ClayButton>
          </>
        }
      >
        <TextInput value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={40} />
      </ClayModal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="删除这个对话？"
        description={`「${deleting?.title || ''}」中的所有消息都会被移除，操作不可撤销。`}
        confirmText="删除"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}