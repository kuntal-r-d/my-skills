import { screen as minerviniScreen } from '../minervini-sepa/screen.js';

/** @deprecated Use minervini-sepa, can-slim, darvas-box, livermore-pivot via momentum_trading. */
export function screen(data: Record<string, unknown>): Record<string, unknown> {
  const result = minerviniScreen(data);
  return {
    ...result,
    skill: 'momentum-screen',
    deprecated: true,
    redirect: 'minervini-sepa',
    notice: 'momentum-screen is deprecated; use momentum_trading coordinator for all four master strategies.',
  };
}
