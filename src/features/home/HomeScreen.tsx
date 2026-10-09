import { useRef, useState, type ReactNode } from 'react';
import { Plus, Upload } from 'lucide-react';
import { t } from '../../i18n/pt-BR';
import { ArchiveError } from '../../engine/archive/zipReader';
import { importProjectArchive } from '../../engine/archive/projectArchive';
import { runWithToast, useProjectStore, useToastStore, useUiStore } from '../../stores';
import { TopBar } from '../layout/TopBar';
import { ProjectCard } from './ProjectCard';
import { TemplatePicker } from './TemplatePicker';
import styles from './HomeScreen.module.css';

/** Tela inicial: barra superior, botões "Importar projeto" e "Novo projeto" e a grade de projetos existentes. */
export function HomeScreen() {
  const theme = useUiStore((s) => s.theme);
  const pushToast = useToastStore((s) => s.pushToast);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const projects = useProjectStore((s) => s.projects);
  const projectsLoaded = useProjectStore((s) => s.projectsLoaded);
  const [pickerOpen, setPickerOpen] = useState(false);
  const openProject = useProjectStore((s) => s.openProject);
  const renameProjectById = useProjectStore((s) => s.renameProjectById);
  const duplicateProjectById = useProjectStore((s) => s.duplicateProjectById);
  const deleteProjectById = useProjectStore((s) => s.deleteProjectById);
  const loadProjects = useProjectStore((s) => s.loadProjects);

  /** Importa o .zip escolhido, atualiza a lista e avisa o resultado. */
  const handleImportFile = async (file: File): Promise<void> => {
    setImporting(true);
    try {
      await importProjectArchive(file);
      await loadProjects();
      pushToast(t.archive.done, 'info');
    } catch (error) {
      pushToast(error instanceof ArchiveError ? t.archive.invalid : t.errors.generic, 'error');
    } finally {
      setImporting(false);
    }
  };

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
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.importButton}
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>{importing ? t.archive.importing : t.archive.import}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file !== undefined) void handleImportFile(file);
              }}
            />
            <button
              type="button"
              className={styles.newButton}
              onClick={() => setPickerOpen(true)}
            >
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>{t.home.newProject}</span>
            </button>
          </div>
        </div>
        {content}
      </main>
      <TemplatePicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}
