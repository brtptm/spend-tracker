import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { MotionConfig } from 'motion/react';
import { queryClient } from './lib/api.js';
import { router } from './App.jsx';
import { applyTheme } from './lib/theme.js';
import './index.css';
import Starfield from './components/Starfield.jsx';

try { applyTheme(localStorage.getItem('st-theme') || 'dark'); } catch { applyTheme('dark'); }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <Starfield />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
);
