import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import apiClient, { AUTH_EXPIRED_EVENT } from '../api/axios';

const AuthContext = createContext(null);

const readStoredUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** 不依赖后端，直接读 JWT 的 exp，过期就不再发请求（避免一屏 401） */
const isTokenExpired = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return true; // 结构损坏的 token 一律视为无效
  }
};

const bootstrapAuth = () => {
  const token = localStorage.getItem('token');
  if (!token) return { token: null, user: readStoredUser() };
  if (isTokenExpired(token)) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return { token: null, user: null };
  }
  return { token, user: readStoredUser() };
};

export function AuthProvider({ children }) {
  const [initial] = useState(bootstrapAuth);
  const [token, setToken] = useState(initial.token);
  const [user, setUser] = useState(initial.user);
  const [loadingUser, setLoadingUser] = useState(Boolean(initial.token));

  useEffect(() => {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  }, [token]);

  useEffect(() => {
    if (user) localStorage.setItem('user', JSON.stringify(user));
    else localStorage.removeItem('user');
  }, [user]);

  /** 拉取当前登录用户，失败时静默忽略（401 由拦截器统一处理） */
  const refreshUser = useCallback(async () => {
    if (!localStorage.getItem('token')) {
      setLoadingUser(false);
      return null;
    }
    try {
      const { data } = await apiClient.get('/users/me');
      const me = data?.user || data;
      if (me && typeof me === 'object') setUser(me);
      return me;
    } catch {
      return null;
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    if (token) refreshUser();
    else setLoadingUser(false);
  }, [token, refreshUser]);

  /** 兼容两种调用：login(token) 与 login({ token, user }) */
  const login = useCallback(
    (payload) => {
      const nextToken = typeof payload === 'string' ? payload : payload?.token;
      const nextUser = typeof payload === 'object' && payload ? payload.user : null;
      if (nextToken) {
        localStorage.setItem('token', nextToken);
        setToken(nextToken);
      }
      if (nextUser) setUser(nextUser);
      if (nextToken && !nextUser) refreshUser();
    },
    [refreshUser]
  );

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  /* 拦截器判定登录态失效时通知这里，由 ProtectedRoute 客户端重定向 */
  useEffect(() => {
    const onExpired = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      loadingUser,
      login,
      logout,
      refreshUser,
      setUser,
      displayName: user?.displayName || user?.username || '同学',
    }),
    [token, user, loadingUser, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext) || {};
}
