import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { audio, installAudio } from './audio/engine';
import { LOOPS, SFX } from './audio/sfx';
import { I18nProvider } from './i18n/I18n';
import './styles.css';

// Touch devices get 44px targets even when the browser does not report a coarse pointer
// (e.g. tablets/phones in landscape, hybrid laptops). Set early, and again on the first real touch.
const markTouch = () => document.documentElement.classList.add('touch');
if (window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints ?? 0) > 0) markTouch();
window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') markTouch(); }, { passive: true });

// Sound starts only after the first click, tap or key press (browser autoplay rules).
installAudio();
// Development-only QA hook (signal checks in the browser); stripped from production builds.
if (import.meta.env.DEV) Object.assign(window, { __audio: audio, __sfx: SFX, __loops: LOOPS });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
