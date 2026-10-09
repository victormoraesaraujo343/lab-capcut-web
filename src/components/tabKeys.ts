// Teclado de listas de abas (WAI-ARIA): setas, Home e End movem o foco e ativam a aba vizinha.
import type { KeyboardEvent } from 'react';

/** Move para a aba vizinha ao apertar setas/Home/End dentro de um role="tablist" e a ativa clicando nela. */
export function handleTablistKeyDown(event: KeyboardEvent<HTMLElement>): void {
  const list = event.currentTarget.closest('[role="tablist"]');
  if (list === null) return;
  const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'));
  const index = tabs.indexOf(event.currentTarget);
  if (index < 0) return;
  let next = -1;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  if (next < 0) return;
  event.preventDefault();
  const target = tabs[next];
  target?.focus();
  target?.click();
}
