import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

// Pede ao navegador armazenamento persistente, uma vez e sem bloquear: evita que ele apague os projetos sob pressão de espaço.
const storage: StorageManager | undefined = typeof navigator !== 'undefined' ? navigator.storage : undefined;
storage?.persist?.().catch(() => undefined);

const container = document.getElementById('root');
if (!container) {
  throw new Error('Elemento #root não encontrado');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
