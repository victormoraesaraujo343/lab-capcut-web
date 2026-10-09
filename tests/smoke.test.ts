import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../src/App';

describe('App', () => {
  it('mostra o título do editor', () => {
    render(createElement(App));
    expect(screen.getByText('Editor de Vídeo')).toBeInTheDocument();
  });
});
