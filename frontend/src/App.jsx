import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import MainLayout from './layouts/MainLayout'
import LandingPage from './views/LandingPage'
import Login from './views/Login'
import GraphExplorer from './views/GraphExplorer'
import AdminDashboard from './views/AdminDashboard'
import InsightHub from './views/InsightHub'
import History from './views/History'
import Dashboard from './views/Dashboard'

// Simple Auth Guard
const ProtectedRoute = ({ children }) => {
  const isAuth = localStorage.getItem('isAuthenticated') === 'true'
  return isAuth ? children : <Navigate to="/login" replace />
}

function App() {
  return (
    <ThemeProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />

          {/* Protected Application Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="graph" element={<GraphExplorer />} />
            <Route path="history" element={<History />} />
            <Route path="insights" element={<InsightHub />} />
            <Route path="admin" element={<AdminDashboard />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ThemeProvider>
  )
}

export default App
