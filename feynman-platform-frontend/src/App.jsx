// src/App.jsx
import { lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AppShell from './layouts/AppShell';
import ProtectedRoute from './components/ProtectedRoute';

/* 路由级懒加载：图谱(ECharts)、宇宙(Three.js)、编辑器(MD 编辑器) 体积较大，按需加载 */
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const KnowledgePointFormPage = lazy(() => import('./pages/KnowledgePointFormPage'));
const FeynmanRecordPage = lazy(() => import('./pages/FeynmanRecordPage'));
const QuizPage = lazy(() => import('./pages/QuizPage'));
const AgentPage = lazy(() => import('./pages/AgentPage'));
const GraphPage = lazy(() => import('./pages/GraphPage'));
const KnowledgeUniversePage = lazy(() => import('./pages/KnowledgeUniversePage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const StatsPage = lazy(() => import('./pages/StatsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const FlashcardsPage = lazy(() => import('./pages/FlashcardsPage'));
const MistakesPage = lazy(() => import('./pages/MistakesPage'));
const PracticePage = lazy(() => import('./pages/PracticePage'));
const AchievementsPage = lazy(() => import('./pages/AchievementsPage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<AppShell />}>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/kp/new" element={<KnowledgePointFormPage />} />
          <Route path="/kp/edit/:id" element={<KnowledgePointFormPage />} />
          <Route path="/feynman/:id" element={<FeynmanRecordPage />} />
          <Route path="/quiz/:id" element={<QuizPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/cards" element={<FlashcardsPage />} />
          <Route path="/mistakes" element={<MistakesPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/universe" element={<KnowledgeUniversePage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/achievements" element={<AchievementsPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          {/* 未知路径：登录后看到 404，未登录仍会先被 ProtectedRoute 带回登录页 */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
export default App;