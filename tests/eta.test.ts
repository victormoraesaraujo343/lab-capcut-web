// Testes do estimador de tempo restante da exportação.
import { describe, expect, it } from 'vitest';
import { createEtaEstimator } from '../src/features/export/eta';

describe('createEtaEstimator', () => {
  it('não estima antes de 2 s de amostra nem abaixo de 2% de progresso', () => {
    const eta = createEtaEstimator();
    expect(eta.update(0.01, 0)).toBeNull();
    expect(eta.update(0.02, 0)).toBeNull();
    expect(eta.update(0.12, 1000)).toBeNull();
  });

  it('estima o restante com a velocidade média depois de 2 s', () => {
    const eta = createEtaEstimator();
    eta.update(0.02, 0);
    eta.update(0.12, 1000);
    const remaining = eta.update(0.22, 2000);
    expect(remaining).not.toBeNull();
    expect(remaining).toBeGreaterThan(7700);
    expect(remaining).toBeLessThan(7900);
  });

  it('chega a zero quando o progresso está completo', () => {
    const eta = createEtaEstimator();
    eta.update(0.5, 0);
    eta.update(0.75, 1000);
    expect(eta.update(1, 2000)).toBe(0);
  });

  it('continua nulo quando o progresso para de andar', () => {
    const eta = createEtaEstimator();
    eta.update(0.1, 0);
    expect(eta.update(0.1, 5000)).toBeNull();
  });

  it('ignora valores inválidos', () => {
    const eta = createEtaEstimator();
    expect(eta.update(Number.NaN, 0)).toBeNull();
    expect(eta.update(0.5, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
