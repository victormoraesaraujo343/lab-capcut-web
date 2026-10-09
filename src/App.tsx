import { useEffect } from 'react';
import { runWithToast, useProjectStore, useUiStore } from './stores';
import { HomeScreen } from './features/home/HomeScreen';
import { EditorScreen } from './features/editor/EditorScreen';
import { Toaster } from './components/Toaster';
import { t } from './i18n/pt-BR';
import styles from './App.module.css';

/** Raiz da aplicação: aplica o tema, carrega os projetos e alterna entre tela inicial e editor. */
export default function App() {
  const theme = useUiStore((s) => s.theme);
  const project = useProjectStore((s) => s.project);
  const loadProjects = useProjectStore((s) => s.loadProjects);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    // Sem armazenamento disponível a lista fica vazia, em vez de carregando para sempre.
    void runWithToast(loadProjects(), t.errors.projectsLoad).then(() => {
      if (!useProjectStore.getState().projectsLoaded) {
        useProjectStore.setState({ projectsLoaded: true });
      }
    });
  }, [loadProjects]);

  useEffect(() => {
    /** Impede que soltar arquivos fora do painel de mídia faça o navegador abri-los. */
    const preventFileDrop = (event: DragEvent): void => {
      if (event.dataTransfer?.types.includes('Files')) {
        event.preventDefault();
      }
    };
    window.addEventListener('dragover', preventFileDrop);
    window.addEventListener('drop', preventFileDrop);
    return () => {
      window.removeEventListener('dragover', preventFileDrop);
      window.removeEventListener('drop', preventFileDrop);
    };
  }, []);

  return (
    <div className={styles.app}>
      {project === null ? <HomeScreen /> : <EditorScreen />}
      <Toaster />
    </div>
  );
}
