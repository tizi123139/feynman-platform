import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import apiClient from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { ClayButton, TextInput, useToast } from '../components/ui/ClayKit';
import { ClayScene } from '../components/icons/AppIcon';

export default function RegisterPage() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onChange = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.username.trim() || !form.email.trim() || !form.password) {
      setError('请填写用户名、邮箱和密码');
      return;
    }
    if (form.password.length < 6) {
      setError('密码至少需要 6 位');
      return;
    }
    if (form.password !== form.confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      const { data } = await apiClient.post('/users/register', {
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      login({ token: data.token, user: data.user });
      toast.success('注册成功，开始你的第一个知识点吧');
      navigate('/', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.msg || (err.response ? '注册失败，请稍后再试' : '无法连接服务器，请检查后端是否启动');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (token) return <Navigate to="/" replace />;

  return (
    <div className="auth">
      <section className="auth__art">
        <span className="auth__blob auth__blob--1" />
        <span className="auth__blob auth__blob--2" />
        <span className="auth__blob auth__blob--3" />
        <ClayScene name="scene-auth" className="auth__mascot" alt="黏土风格学习场景" />
        <div className="auth__art-copy">
          <h1 className="auth__art-title">
            从一个小知识点
            <br />
            开始你的知识宇宙
          </h1>
          <p className="auth__art-desc">
            每记录一个概念、讲一次、复习一次，它都会在你的知识宇宙里亮起来一点点。坚持几天，就能看到属于自己的星系。
          </p>
          <div className="auth__art-points">
            {['免费使用', '数据只属于你', '每天 10 分钟', '随时导出笔记'].map((item) => (
              <span className="auth__art-point" key={item}>
                ✦ {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="auth__panel">
        <div className="clay-card auth__card">
          <div className="auth__brand">
            <span className="auth__brand-mark">
              <ClayScene name="scene-mascot" alt="吉祥物" fallback="🐣" />
            </span>
            <div>
              <div className="auth__brand-name">费曼小课堂</div>
              <div className="auth__brand-tag">FEYNMAN LAB</div>
            </div>
          </div>

          <h2 className="auth__title">创建账号</h2>
          <p className="auth__sub">三步开始：记录、讲解、复习</p>

          <form className="auth__form" onSubmit={handleSubmit}>
            <TextInput
              label="用户名"
              name="username"
              autoComplete="nickname"
              placeholder="给自己起个名字"
              value={form.username}
              onChange={onChange('username')}
            />
            <TextInput
              label="邮箱"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={onChange('email')}
            />
            <TextInput
              label="密码"
              type="password"
              name="password"
              autoComplete="new-password"
              placeholder="至少 6 位"
              value={form.password}
              onChange={onChange('password')}
            />
            <TextInput
              label="确认密码"
              type="password"
              name="confirm"
              autoComplete="new-password"
              placeholder="再输入一次密码"
              value={form.confirm}
              onChange={onChange('confirm')}
            />
            {error ? <div className="notice notice--error">{error}</div> : null}
            <ClayButton type="submit" variant="primary" size="lg" block loading={loading}>
              注册并开始
            </ClayButton>
          </form>

          <p className="auth__foot">
            已经有账号了？<Link to="/login">返回登录</Link>
          </p>
        </div>
      </section>
    </div>
  );
}