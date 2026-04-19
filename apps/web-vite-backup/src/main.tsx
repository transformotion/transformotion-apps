import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// Amplify must be configured before any auth calls
import './lib/amplify';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ModeProvider } from './contexts/ModeContext';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ModeProvider>
          <App />
        </ModeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
