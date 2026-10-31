import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);

// 안드로이드 크롬의 '앱 설치' 창을 나중에 버튼으로 띄울 수 있게 잡아 둔다
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.tcInstallPrompt = e; window.dispatchEvent(new Event('tc-installable')); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
