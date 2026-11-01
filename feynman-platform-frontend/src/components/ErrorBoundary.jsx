// src/components/ErrorBoundary.jsx
// 页面级兜底：某个路由/组件渲染抛错时只坏它自己，不至于整站白屏。
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleBack = this.handleBack.bind(this);
    this.handleReload = this.handleReload.bind(this);
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // 留着方便在控制台定位是哪一层挂的
    console.error('[ErrorBoundary] 渲染出错:', error);
    if (info?.componentStack) console.error(info.componentStack);
  }

  handleReset() {
    this.setState({ error: null });
  }

  handleBack() {
    this.setState({ error: null });
    window.history.back();
  }

  handleReload() {
    window.location.reload();
  }

  render() {
    const { error } = this.state;
    const { children, compact } = this.props;

    if (!error) return children;

    return (
      <div className={compact ? 'oops oops--compact' : 'oops'}>
        <div className="oops__card">
          <div className="oops__badge" aria-hidden="true">
            !
          </div>
          <h1 className="oops__title">这一块没渲染出来</h1>
          <p className="oops__desc">
            页面在渲染时遇到了意外错误。可以先回上一页或刷新重试；如果反复出现，把下面这段信息发给开发者。
          </p>
          <pre className="oops__detail">{String(error?.message || error).slice(0, 400)}</pre>
          <div className="oops__actions">
            <button type="button" className="clay-btn clay-btn--ghost" onClick={this.handleBack}>
              返回上一页
            </button>
            <button type="button" className="clay-btn clay-btn--ghost" onClick={this.handleReset}>
              重试渲染
            </button>
            <button type="button" className="clay-btn clay-btn--primary" onClick={this.handleReload}>
              重新加载
            </button>
          </div>
        </div>
      </div>
    );
  }
}
