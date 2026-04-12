import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Amplify must be configured before any auth calls
import './lib/amplify';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
