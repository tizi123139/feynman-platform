import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import apiClient from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { ClayButton, TextInput, useToast } from '../components/ui/ClayKit';
import { ClayScene } from '../components/icons/AppIcon';

const POINTS = ['语音费曼复述', '间隔复习闭环', '知识图谱与宇宙', 'AI 陪练伙伴'];

export default function LoginPage() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onChange = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.email || !form.password) {
      setError('请填写邮箱和密码');
      return;
    }
    setLoading(true);
    try {
      const { data } = await apiClient.post('/users/login', form);
      login({ token: data.token, user: data.user });
      toast.success(`欢迎回来，${data.user?.displayName || '同学'}`);
      navigate('/', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.msg || (err.response ? '登录失败，请稍后再试' : '无法连接服务器，请检查后端是否启动');
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
            讲一遍，
            <br />
            才算真的学会
          </h1>
          <p className="auth__art-desc">
            把刚学到的概念，用自己的话讲给 AI 伙伴听。讲得清楚的地方说明你真的懂了，卡住的地方就是下一步要补的洞。
          </p>
          <div className="auth__art-points">
            {POINTS.map((point) => (
              <span className="auth__art-point" key={point}>
                ✦ {point}
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

          <h2 className="auth__title">欢迎回来</h2>
          <p className="auth__sub">登录后继续你的知识旅程</p>

          <form className="auth__form" onSubmit={handleSubmit}>
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
              autoComplete="current-password"
              placeholder="请输入密码"
              value={form.password}
              onChange={onChange('password')}
            />
            {error ? <div className="notice notice--error">{error}</div> : null}
            <ClayButton type="submit" variant="primary" size="lg" block loading={loading}>
              登录
            </ClayButton>
          </form>

          <p className="auth__foot">
            还没有账号？<Link to="/register">立即注册</Link>
          </p>
        </div>
      </section>
    </div>
  );
}