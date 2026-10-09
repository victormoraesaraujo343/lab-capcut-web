import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import styles from './IconButton.module.css';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Ícone lucide exibido no botão. */
  icon: LucideIcon;
  /** Texto acessível e dica de tela (aria-label e title). */
  label: string;
}

/** Botão quadrado de 32px só com ícone. */
export function IconButton({ icon: Icon, label, className, type = 'button', ...rest }: IconButtonProps) {
  const classes = className ? `${styles.button} ${className}` : styles.button;
  return (
    <button type={type} className={classes} aria-label={label} title={label} {...rest}>
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
