import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import '@/shared/ui/tokens.css';
import '@/shared/ui/controls.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
