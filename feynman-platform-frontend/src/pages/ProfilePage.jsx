import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../api/axios';
import { useAuth } from '../context/AuthContext';
import {
  Avatar,
  ClayButton,
  ClayCard,
  ClayChip,
  ConfirmDialog,
  PageHead,
  ProgressBar,
  ProgressRing,
  Skeleton,
  TextInput,
  useToast,
} from '../components/ui/ClayKit';
import { AVATAR_PRESETS, AppIcon, avatarEmoji } from '../components/icons/AppIcon';
import { IconBook, IconDownload, IconLock, IconLogout, IconSettings, IconUpload } from '../components/ui/icons';

const GOALS = [1, 2, 3, 5, 8];
const EMPTY_PASSWORD = { currentPassword: '', newPassword: '', confirm: '' };
const today = () => new Date().toISOString().slice(0, 10);

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* 把备份里的知识点拼成可读的 Markdown 笔记 */
function toMarkdown(backup) {
  const points = backup.knowledgePoints || [];
  const cards = backup.flashcards || [];
  const lines = [
    '# 费曼小课堂 · 知识笔记备份',
    '',
    `> 导出时间：${new Date(backup.exportedAt || Date.now()).toLocaleString('zh-CN')}`,
    `> 共 ${points.length} 个知识点、${cards.length} 张闪卡`,
    '',
  ];

  const groups = new Map();
  points.forEach((kp) => {
    const key = kp.category || '未分类';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(kp);
  });

  groups.forEach((list, category) => {
    lines.push(`## ${category}`, '');
    list.forEach((kp) => {
      lines.push(`### ${kp.title}`, '');
      const meta = [`掌握度 ${kp.mastery || 0}%`];
      if (Array.isArray(kp.tags) && kp.tags.length) meta.push(`标签：${kp.tags.join('、')}`);
      lines.push(`- ${meta.join(' · ')}`, '');
      if (kp.summary) lines.push(`> ${kp.summary}`, '');
      lines.push(kp.content || '', '');
    });
  });

  if (cards.length) {
    lines.push('## 闪卡', '');
    cards.forEach((card) => lines.push(`- **${card.front}** → ${card.back}`));
    lines.push('');
  }

  return lines.join('\n');
}

export default function ProfilePage() {
  const { user, logout, refreshUser } = useAuth();
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ displayName: '', avatarKey: 'sprout', dailyGoal: 3 });
  const [pwForm, setPwForm] = useState(EMPTY_PASSWORD);
  const [pwSaving, setPwSaving] = useState(false);
  const [backupBusy, setBackupBusy] = useState('');
  const [pendingImport, setPendingImport] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, overviewRes] = await Promise.all([
        apiClient.get('/users/me'),
        apiClient.get('/dashboard/overview'),
      ]);
      const me = meRes.data;
      setForm({
        displayName: me.displayName || me.username || '',
        avatarKey: me.avatarKey || 'sprout',
        dailyGoal: me.dailyGoal || 3,
      });
      setOverview(overviewRes.data || null);
    } catch (err) {
      toast.error(err.response?.data?.msg || '加载个人信息失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.displayName.trim()) {
      toast.warn('昵称不能为空');
      return;
    }
    setSaving(true);
    try {
      await apiClient.put('/users/me', {
        displayName: form.displayName.trim(),
        avatarKey: form.avatarKey,
        dailyGoal: form.dailyGoal,
      });
      await refreshUser();
      toast.success('资料已更新');
    } catch (err) {
      toast.error(err.response?.data?.msg || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const exportData = async () => {
    setBackupBusy('json');
    try {
      const { data } = await apiClient.get('/users/backup');
      download(`feynman-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
      toast.success(
        `已导出 ${data.knowledgePoints.length} 个知识点、${data.flashcards.length} 张闪卡`
      );
    } catch (err) {
      toast.error(err.response?.data?.msg || '导出失败');
    } finally {
      setBackupBusy('');
    }
  };

  const exportMarkdown = async () => {
    setBackupBusy('md');
    try {
      const { data } = await apiClient.get('/users/backup');
      download(`feynman-notes-${today()}.md`, toMarkdown(data), 'text/markdown;charset=utf-8');
      toast.success('已导出为 Markdown 笔记');
    } catch (err) {
      toast.error(err.response?.data?.msg || '导出失败');
    } finally {
      setBackupBusy('');
    }
  };

  const onPickFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.knowledgePoints) && !Array.isArray(parsed.flashcards)) {
        throw new Error('missing arrays');
      }
      setPendingImport(parsed);
    } catch {
      toast.error('无法解析这个文件，请选择本应用导出的备份 JSON');
    }
  };

  const confirmImport = async () => {
    setImporting(true);
    try {
      const { data } = await apiClient.post('/users/restore', {
        knowledgePoints: pendingImport?.knowledgePoints || [],
        flashcards: pendingImport?.flashcards || [],
      });
      const skipped = (data.skipped?.knowledgePoints || 0) + (data.skipped?.flashcards || 0);
      toast.success(
        `导入完成：新增 ${data.created.knowledgePoints} 个知识点、${data.created.flashcards} 张闪卡${skipped ? `，跳过重复 ${skipped} 条` : ''}`
      );
      setPendingImport(null);
      await Promise.all([load(), refreshUser()]);
    } catch (err) {
      toast.error(err.response?.data?.msg || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const changePassword = async () => {
    if (pwForm.newPassword.length < 6) {
      toast.warn('新密码至少需要 6 位');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirm) {
      toast.warn('两次输入的新密码不一致');
      return;
    }
    setPwSaving(true);
    try {
      const { data } = await apiClient.put('/users/password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      toast.success(data?.msg || '密码已更新');
      setPwForm(EMPTY_PASSWORD);
    } catch (err) {
      toast.error(err.response?.data?.msg || '修改密码失败');
    } finally {
      setPwSaving(false);
    }
  };

  const counts = overview?.counts || {};
  const level = overview?.level || { level: 1, percent: 0, current: 0, need: 50 };
  const streak = overview?.user?.streak || user?.streak || 0;
  const masteryPercent = counts.total ? Math.round(((counts.mastered || 0) / counts.total) * 100) : 0;

  if (loading) {
    return (
      <div className="profile">
        <Skeleton height={34} width="28%" />
        <div className="clay-card" style={{ padding: 26 }}>
          <Skeleton height={96} />
        </div>
      </div>
    );
  }

  return (
    <div className="profile">
      <PageHead
        title="个人中心"
        sub="换个头像、改个昵称，再定一个能坚持下来的每日目标。"
        icon={<AppIcon name="badge-crown" size={54} round />}
      />

      <div className="profile__layout">
        <div className="stack-16">
          <ClayCard className="profile__hero">
            <Avatar name={form.displayName} emoji={avatarEmoji(form.avatarKey)} size="lg" />
            <div className="profile__hero-copy">
              <h2 className="profile__hero-name">{form.displayName || '同学'}</h2>
              <div className="profile__hero-mail">{user?.email || '—'}</div>
              <div className="profile__level">
                <div className="profile__level-text">
                  <span>Lv.{level.level}</span>
                  <span>
                    {level.current ?? 0} / {level.need ?? 50} XP
                  </span>
                </div>
                <ProgressBar value={level.percent || 0} tone="lilac" />
              </div>
            </div>
            <div className="row-12 wrap">
              <span className="pill pill--streak">
                <AppIcon name="act-streak" size={18} plain /> {streak} 天
              </span>
              <span className="pill pill--level">累计 {user?.xp || 0} XP</span>
            </div>
          </ClayCard>

          <ClayCard className="profile__card">
            <div className="section-head">
              <h2>基础资料</h2>
              <span className="tag tag--mute">随时可改</span>
            </div>

            <TextInput
              label="昵称"
              value={form.displayName}
              maxLength={24}
              placeholder="想被怎么称呼？"
              onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
            />

            <div className="field">
              <span className="field__label">头像</span>
              <div className="profile__avatars">
                {AVATAR_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.key}
                    className={`profile__avatar-opt${form.avatarKey === preset.key ? ' is-active' : ''}`}
                    title={preset.label}
                    onClick={() => setForm((prev) => ({ ...prev, avatarKey: preset.key }))}
                  >
                    <span style={{ fontSize: 28, lineHeight: 1 }}>{preset.emoji}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field__label">每日目标（次练习）</span>
              <div className="profile__goal">
                {GOALS.map((goal) => (
                  <ClayChip
                    key={goal}
                    tone="butter"
                    active={form.dailyGoal === goal}
                    onClick={() => setForm((prev) => ({ ...prev, dailyGoal: goal }))}
                  >
                    {goal} 次
                  </ClayChip>
                ))}
              </div>
              <span className="field__hint">新建、复述、测评、复习、闪卡都算一次练习。</span>
            </div>

            <div className="row-12" style={{ justifyContent: 'flex-end' }}>
              <ClayButton variant="ghost" onClick={load}>
                重置
              </ClayButton>
              <ClayButton variant="primary" onClick={save} loading={saving}>
                保存修改
              </ClayButton>
            </div>
          </ClayCard>

          <ClayCard className="profile__card">
            <div className="section-head">
              <h2>账号安全</h2>
              <span className="tag tag--mute">建议定期更换</span>
            </div>

            <div className="profile__pw">
              <TextInput
                label="当前密码"
                type="password"
                autoComplete="current-password"
                placeholder="请输入登录密码"
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
              />
              <TextInput
                label="新密码"
                type="password"
                autoComplete="new-password"
                placeholder="至少 6 位"
                value={pwForm.newPassword}
                onChange={(e) => setPwForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              />
              <TextInput
                label="确认新密码"
                type="password"
                autoComplete="new-password"
                placeholder="再输入一次"
                value={pwForm.confirm}
                onChange={(e) => setPwForm((prev) => ({ ...prev, confirm: e.target.value }))}
              />
            </div>

            <span className="field__hint">
              修改后旧密码立即失效，当前登录状态会保留。暂时没有找回密码功能，忘记密码只能重新注册，建议记在安全的地方。
            </span>

            <div className="row-12" style={{ justifyContent: 'flex-end' }}>
              <ClayButton
                variant="ghost"
                disabled={pwSaving}
                onClick={() => setPwForm(EMPTY_PASSWORD)}
              >
                清空
              </ClayButton>
              <ClayButton
                variant="primary"
                onClick={changePassword}
                loading={pwSaving}
                disabled={!pwForm.currentPassword || !pwForm.newPassword || !pwForm.confirm}
              >
                <IconLock size={16} /> 更新密码
              </ClayButton>
            </div>
          </ClayCard>
        </div>

        <aside className="profile__side">
          <ClayCard className="profile__mini">
            <div className="profile__mini-title">我的数据</div>
            <div className="row-16 wrap" style={{ gap: 16 }}>
              <ProgressRing value={masteryPercent} size={78} label="掌握" />
              <div className="stack-8" style={{ fontSize: 13, fontWeight: 800 }}>
                <div className="row-8">
                  <span className="tag tag--mint">{counts.total || 0}</span> 知识点
                </div>
                <div className="row-8">
                  <span className="tag tag--sky">{counts.mastered || 0}</span> 已掌握
                </div>
                <div className="row-8">
                  <span className="tag tag--coral">{counts.due || 0}</span> 待复习
                </div>
                <div className="row-8">
                  <span className="tag tag--butter">{counts.favorite || 0}</span> 已收藏
                </div>
              </div>
            </div>
          </ClayCard>

          <ClayCard className="profile__mini">
            <div className="profile__mini-title">数据备份</div>
            <div className="stack-8">
              <ClayButton
                variant="ghost"
                block
                onClick={exportData}
                loading={backupBusy === 'json'}
                disabled={backupBusy === 'md'}
              >
                <IconDownload size={16} /> 导出 JSON 备份
              </ClayButton>
              <ClayButton
                variant="ghost"
                block
                onClick={exportMarkdown}
                loading={backupBusy === 'md'}
                disabled={backupBusy === 'json'}
              >
                <IconBook size={16} /> 导出 Markdown 笔记
              </ClayButton>
              <ClayButton
                variant="ghost"
                block
                onClick={() => fileRef.current?.click()}
                disabled={importing || Boolean(backupBusy)}
              >
                <IconUpload size={16} /> 从备份导入
              </ClayButton>
              <span className="profile__hint">
                JSON 含复习状态，可用于完整还原；Markdown 适合放进其它笔记软件里阅读。
              </span>
            </div>
          </ClayCard>

          <ClayCard className="profile__mini">
            <div className="profile__mini-title">账号</div>
            <div className="stack-8">
              <ClayButton variant="ghost" block to="/stats">
                <IconSettings size={16} /> 查看学习统计
              </ClayButton>
              <ClayButton
                variant="danger"
                block
                onClick={() => {
                  logout();
                  window.location.href = '/login';
                }}
              >
                <IconLogout size={16} /> 退出登录
              </ClayButton>
            </div>
          </ClayCard>

          <div className="profile__danger">
            <strong>关于数据</strong>
            <span>
              所有知识点、复述与测评记录都只属于你，AI 提问也只会检索你自己的笔记。导出后可以自行备份。
            </span>
          </div>
        </aside>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={onPickFile}
      />

      <ConfirmDialog
        open={Boolean(pendingImport)}
        title="确认导入这份备份？"
        description={`文件里包含 ${pendingImport?.knowledgePoints?.length || 0} 个知识点、${pendingImport?.flashcards?.length || 0} 张闪卡。导入只做新增，不会覆盖或删除你现有的内容，重复的知识点会自动跳过。`}
        confirmText="开始导入"
        loading={importing}
        onConfirm={confirmImport}
        onCancel={() => setPendingImport(null)}
      />
    </div>
  );
}