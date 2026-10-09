// Página de testes de render (só dev): roda todos os casos ao carregar e mostra tabela com miniaturas.
import { runRenderTests, type CaseImages, type RenderStatus, type RenderTestResult } from './runner';

/** Rótulo em português de cada situação. */
const STATUS_LABEL: Record<RenderStatus, string> = {
  pass: 'passou',
  fail: 'falhou',
  created: 'referência',
  error: 'erro',
};

/** URLs de objeto criadas para as miniaturas, liberadas a cada rodada. */
let objectUrls: string[] = [];

/** Busca um elemento obrigatório da página; lança erro se o marcado estiver faltando. */
function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`render-tests-markup-missing:${selector}`);
  return element;
}

/** Cria uma miniatura a partir de um PNG, ou um traço quando não há imagem. */
function thumb(blob: Blob | null, label: string): HTMLElement {
  if (!blob) {
    const dash = document.createElement('span');
    dash.className = 'empty';
    dash.textContent = '—';
    return dash;
  }
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  const img = document.createElement('img');
  img.src = url;
  img.alt = label;
  img.width = 160;
  img.height = 90;
  return img;
}

/** Adiciona uma linha da tabela para um caso concluído. */
function appendRow(body: HTMLTableSectionElement, result: RenderTestResult, images: CaseImages): void {
  const row = document.createElement('tr');
  const cells: HTMLElement[] = [];

  const idCell = document.createElement('td');
  idCell.textContent = result.id;
  cells.push(idCell);

  const statusCell = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `status ${result.status}`;
  badge.textContent = STATUS_LABEL[result.status];
  statusCell.append(badge);
  cells.push(statusCell);

  const ratioCell = document.createElement('td');
  ratioCell.textContent = `${(result.badRatio * 100).toFixed(2)}%`;
  cells.push(ratioCell);

  const deltaCell = document.createElement('td');
  deltaCell.textContent = String(result.maxDelta);
  cells.push(deltaCell);

  const currentCell = document.createElement('td');
  currentCell.append(thumb(images.current, `${result.id} atual`));
  cells.push(currentCell);

  const referenceCell = document.createElement('td');
  referenceCell.append(thumb(images.reference, `${result.id} referência`));
  cells.push(referenceCell);

  const messageCell = document.createElement('td');
  messageCell.textContent = result.message ?? '';
  cells.push(messageCell);

  row.append(...cells);
  body.append(row);
}

/** Atualiza o resumo com a contagem por situação. */
function renderSummary(results: RenderTestResult[], total: number, done: boolean): void {
  const count = (status: RenderStatus): number => results.filter((r) => r.status === status).length;
  required<HTMLParagraphElement>('#summary').textContent =
    `${results.length}/${total} casos${done ? ' (concluído)' : ' (rodando…)'} · ` +
    `${count('pass')} passaram · ${count('fail')} falharam · ${count('created')} referências · ${count('error')} erros`;
}

/** Roda a bateria inteira e preenche a tabela; update vem de ?update=1 na URL. */
async function runPage(): Promise<void> {
  const body = required<HTMLTableSectionElement>('#rows');
  const button = required<HTMLButtonElement>('#rerun');
  const update = new URLSearchParams(window.location.search).get('update') === '1';

  button.disabled = true;
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
  body.replaceChildren();

  const seen: RenderTestResult[] = [];
  renderSummary(seen, 0, false);
  try {
    await runRenderTests({
      update,
      onCase: (result, images) => {
        seen.push(result);
        appendRow(body, result, images);
        renderSummary(seen, window.__renderTests?.total ?? seen.length, false);
      },
    });
    renderSummary(seen, window.__renderTests?.total ?? seen.length, true);
  } finally {
    button.disabled = false;
  }
}

required<HTMLButtonElement>('#rerun').addEventListener('click', () => {
  void runPage();
});
void runPage();
