import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { AuthProvider } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import CampaignList from './pages/CampaignList';
import CampaignDetail from './pages/CampaignDetail';
import CreateCampaign from './pages/CreateCampaign';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import './App.css';

function App() {
  const { t } = useTranslation();
  
  return (
    <Router>
      <AuthProvider>
        <div className="app">
          <Navbar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/campaigns" element={<CampaignList />} />
              <Route path="/campaign/:id" element={<CampaignDetail />} />
              <Route path="/create" element={<CreateCampaign />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/admin" element={<Admin />} />
            </Routes>
          </main>
          <footer className="footer">
            <div className="footer-content">
              <p>{t('footer.copyright')}</p>
              <p>{t('footer.blockchain')}</p>
            </div>
          </footer>
        </div>
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            },
            success: {
              iconTheme: {
                primary: 'var(--success)',
                secondary: 'white',
              },
            },
            error: {
              iconTheme: {
                primary: 'var(--error)',
                secondary: 'white',
              },
            },
          }}
        />
      </AuthProvider>
    </Router>
  );
}

export default App;
