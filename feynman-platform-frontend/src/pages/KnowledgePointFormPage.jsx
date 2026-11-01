import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MDEditor from '@uiw/react-md-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import apiClient from '../api/axios';
import {
  ClayButton,
  ClayChip,
  ClayModal,
  PageHead,
  Skeleton,
  TextArea,
  TextInput,
  useToast,
} from '../components/ui/ClayKit';
import { AppIcon } from '../components/icons/AppIcon';
import { IconChevronLeft, IconPlus, IconSparkles, IconStar } from '../components/ui/icons';

const PRESET_CATEGORIES = ['计算机基础', '前端开发', '后端开发', '算法与数据结构', '数据库', '人工智能', '产品与设计', '未分类'];

const EMPTY = {
  title: '',
  content: '',
  category: '未分类',
  tags: [],
  summary: '',
  favorite: false,
};

export default function KnowledgePointFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState(EMPTY);
  const [tagInput, setTagInput] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get(`/knowledge-points/${id}`);
      setForm({
        title: data.title || '',
        content: data.content || '',
        category: data.category || '未分类',
        tags: Array.isArray(data.tags) ? data.tags : [],
        summary: data.summary || '',
        favorite: Boolean(data.favorite),
      });
    } catch (err) {
      toast.error(err.response?.data?.msg || '加载知识点失败');
      navigate('/', { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => {
    if (isEdit) loadDetail();
  }, [isEdit, loadDetail]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const addTag = (raw) => {
    const value = String(raw || '').trim().replace(/^#/, '').slice(0, 12);
    if (!value) return;
    setForm((prev) => (prev.tags.includes(value) || prev.tags.length >= 8 ? prev : { ...prev, tags: [...prev.tags, value] }));
    setTagInput('');
  };

  const removeTag = (tag) => setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.warn('先给知识点起个标题吧');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, title: form.title.trim() };
      if (isEdit) {
        await apiClient.put(`/knowledge-points/${id}`, payload);
        toast.success('已保存修改');
        navigate('/', { replace: true });
      } else {
        const { data } = await apiClient.post('/knowledge-points', payload);
        toast.success('知识点已创建，去讲一遍吧');
        navigate(data?._id ? `/feynman/${data._id}` : '/', { replace: true });
      }
    } catch (err) {
      toast.error(err.response?.data?.msg || '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  };

  const runSummarize = async () => {
    if (!form.content.trim()) {
      toast.warn('先写点内容，再让 AI 帮忙提炼');
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    try {
      const { data } = await apiClient.post('/ai/summarize', {
        knowledgePointId: isEdit ? id : undefined,
        content: form.content,
      });
      setAiResult(data);
    } catch (err) {
      toast.error(err.response?.data?.msg || 'AI 摘要生成失败');
    } finally {
      setAiLoading(false);
    }
  };

  const applyAi = () => {
    if (!aiResult) return;
    setForm((prev) => ({
      ...prev,
      summary: aiResult.summary || prev.summary,
      tags: [...new Set([...prev.tags, ...(aiResult.tags || [])])].slice(0, 8),
    }));
    setAiOpen(false);
    toast.success('已填入摘要与标签');
  };

  const previewContent = useMemo(() => form.content.trim(), [form.content]);

  if (loading) {
    return (
      <div className="kpform">
        <Skeleton height={34} width="38%" />
        <div className="clay-card" style={{ padding: 24 }}>
          <Skeleton height={22} width="50%" />
          <div style={{ height: 14 }} />
          <Skeleton height={200} />
        </div>
      </div>
    );
  }

  return (
    <div className="kpform">
      <PageHead
        title={isEdit ? '编辑知识点' : '新建知识点'}
        sub="把你理解的内容写下来，越具体越好——待会儿要讲给别人听。"
        icon={<AppIcon name="act-create" size={54} round />}
        actions={
          <>
            <ClayButton variant="ghost" onClick={() => navigate(-1)}>
              <IconChevronLeft size={16} /> 返回
            </ClayButton>
            <ClayButton variant="lilac" onClick={() => setAiOpen(true)}>
              <IconSparkles size={16} /> AI 提炼
            </ClayButton>
            <ClayButton variant="primary" onClick={handleSave} loading={saving}>
              {isEdit ? '保存修改' : '创建并复述'}
            </ClayButton>
          </>
        }
      />

      <div className="kpform__layout">
        <section className="clay-card kpform__editor">
          <TextInput
            label="标题"
            placeholder="例如：什么是闭包？"
            value={form.title}
            maxLength={100}
            onChange={(e) => update('title', e.target.value)}
          />

          <div className="kpform__row">
            <div className="field">
              <span className="field__label">分类</span>
              <div className="kpform__cat-select">
                {PRESET_CATEGORIES.map((cat) => (
                  <ClayChip key={cat} active={form.category === cat} onClick={() => update('category', cat)}>
                    {cat}
                  </ClayChip>
                ))}
              </div>
              <div className="row-8" style={{ marginTop: 8 }}>
                <input
                  className="clay-input"
                  placeholder="自定义分类"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (customCategory.trim()) {
                        update('category', customCategory.trim().slice(0, 20));
                        setCustomCategory('');
                      }
                    }
                  }}
                />
                <ClayButton
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (customCategory.trim()) {
                      update('category', customCategory.trim().slice(0, 20));
                      setCustomCategory('');
                    }
                  }}
                >
                  <IconPlus size={14} /> 使用
                </ClayButton>
              </div>
            </div>

            <div className="field">
              <span className="field__label">标签（最多 8 个）</span>
              <div className="kpform__tags-input">
                <input
                  className="clay-input"
                  placeholder="输入后回车添加"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addTag(tagInput);
                    }
                  }}
                />
                <ClayButton size="sm" variant="ghost" onClick={() => addTag(tagInput)}>
                  添加
                </ClayButton>
              </div>
              <div className="kpform__tag-list">
                {form.tags.map((tag) => (
                  <span className="kpform__tag" key={tag}>
                    #{tag}
                    <button type="button" onClick={() => removeTag(tag)} aria-label={`移除标签 ${tag}`}>
                      ×
                    </button>
                  </span>
                ))}
                {form.tags.length === 0 ? <span className="muted">还没有标签</span> : null}
              </div>
            </div>
          </div>

          <div className="field">
            <span className="field__label">内容（支持 Markdown）</span>
            <div className="kpform__md" data-color-mode="light">
              <MDEditor
                value={form.content}
                onChange={(value) => update('content', value || '')}
                preview="edit"
                height={360}
                textareaProps={{ placeholder: '写下你的理解：它是什么、为什么这样、举个生活中的例子…' }}
              />
            </div>
          </div>

          <TextArea
            label="一句话摘要（可选）"
            hint="AI 提炼会自动填写，也可以自己写。"
            rows={3}
            value={form.summary}
            maxLength={200}
            onChange={(e) => update('summary', e.target.value)}
          />

          <div className="row-12 wrap">
            <ClayChip active={form.favorite} onClick={() => update('favorite', !form.favorite)}>
              <IconStar size={14} /> {form.favorite ? '已收藏' : '收藏这个知识点'}
            </ClayChip>
          </div>

          <div className="kpform__actions">
            <ClayButton variant="ghost" onClick={() => navigate(-1)}>
              取消
            </ClayButton>
            <ClayButton variant="primary" size="lg" onClick={handleSave} loading={saving}>
              {isEdit ? '保存修改' : '创建并开始复述'}
            </ClayButton>
          </div>
        </section>

        <aside className="clay-card kpform__preview">
          <div className="section-head">
            <h2>实时预览</h2>
            <span className="tag tag--mute">Markdown</span>
          </div>
          <h3 className="kpform__preview-title">{form.title || '这里会显示标题'}</h3>
          <div className="row-8 wrap" style={{ marginBottom: 12 }}>
            <span className="tag tag--coral">{form.category || '未分类'}</span>
            {form.tags.map((tag) => (
              <span className="tag" key={tag}>
                #{tag}
              </span>
            ))}
          </div>
          {form.summary ? <div className="notice notice--mint" style={{ marginBottom: 14 }}>{form.summary}</div> : null}
          {previewContent ? (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewContent}</ReactMarkdown>
            </div>
          ) : (
            <div className="kpform__preview-empty">
              <AppIcon name="nav-library" size={72} round />
              <span>开始输入内容，这里会同步显示预览</span>
            </div>
          )}
        </aside>
      </div>

      <ClayModal
        open={aiOpen}
        title="AI 提炼要点"
        onClose={() => setAiOpen(false)}
        footer={
          <>
            <ClayButton variant="ghost" onClick={() => setAiOpen(false)}>
              关闭
            </ClayButton>
            {aiResult ? (
              <ClayButton variant="primary" onClick={applyAi}>
                填入摘要与标签
              </ClayButton>
            ) : (
              <ClayButton variant="lilac" onClick={runSummarize} loading={aiLoading}>
                开始提炼
              </ClayButton>
            )}
          </>
        }
      >
        {aiResult ? (
          <div className="stack-12">
            <div className="notice notice--mint">{aiResult.summary}</div>
            {(aiResult.keyPoints || []).length > 0 ? (
              <ul className="feyn__list">
                {aiResult.keyPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : null}
            <div className="row-8 wrap">
              {(aiResult.tags || []).map((tag) => (
                <span className="tag tag--lilac" key={tag}>
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p>
            AI 会阅读当前内容，给出不超过 60 字的一句话摘要、3 个要点和 3-5 个标签建议。生成后可一键填入表单。
          </p>
        )}
      </ClayModal>
    </div>
  );
}