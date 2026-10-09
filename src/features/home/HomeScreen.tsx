import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { t } from '../../i18n/pt-BR';
import { runWithToast, useProjectStore, useUiStore } from '../../stores';
import { TopBar } from '../layout/TopBar';
import { ProjectCard } from './ProjectCard';
import styles from './HomeScreen.module.css';

/** Tela inicial: barra superior, botão "Novo projeto" e a grade de projetos existentes. */
export function HomeScreen() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const projects = useProjectStore((s) => s.projects);
  const projectsLoaded = useProjectStore((s) => s.projectsLoaded);
  const createNewProject = useProjectStore((s) => s.createNewProject);
  const openProject = useProjectStore((s) => s.openProject);
  const renameProjectById = useProjectStore((s) => s.renameProjectById);
  const duplicateProjectById = useProjectStore((s) => s.duplicateProjectById);
  const deleteProjectById = useProjectStore((s) => s.deleteProjectById);

  let content: ReactNode;
  if (!projectsLoaded) {
    content = <p className={styles.message}>{t.home.loading}</p>;
  } else if (projects.length === 0) {
    content = <p className={styles.message}>{t.home.empty}</p>;
  } else {
    content = (
      <div className={styles.grid}>
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onOpen={(id) => void runWithToast(openProject(id), t.errors.projectOpen)}
            onRename={(id, name) => void runWithToast(renameProjectById(id, name), t.errors.projectRename)}
            onDuplicate={(id) => void runWithToast(duplicateProjectById(id), t.errors.projectDuplicate)}
            onDelete={(id) => void runWithToast(deleteProjectById(id), t.errors.projectDelete)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <TopBar theme={theme} onToggleTheme={toggleTheme} />
      <main className={styles.main}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t.home.title}</h2>
          <button
            type="button"
            className={styles.newButton}
            onClick={() => void runWithToast(createNewProject(), t.errors.projectCreate)}
          >
            <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>{t.home.newProject}</span>
          </button>
        </div>
        {content}
      </main>
    </div>
  );
}
