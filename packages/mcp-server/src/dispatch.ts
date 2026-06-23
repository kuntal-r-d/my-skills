/** In-process dispatch: invoke @stock-buddy/skills handlers directly.
 *
 * Kept independent of the MCP SDK so it can be unit-tested without a transport.
 * No skill logic is duplicated here (TAD ADR-003).
 */
import { skills } from '@stock-buddy/skills';

import { SKILLS } from './registry.js';

export class SkillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillError';
  }
}

type SkillHandler = (data: Record<string, unknown>) => Record<string, unknown>;

function resolveHandler(skillKey: string): SkillHandler {
  const mod = skills[skillKey as keyof typeof skills];
  if (!mod) {
    throw new SkillError(`skill not found: ${skillKey}`);
  }
  const fn = Object.values(mod)[0];
  if (typeof fn !== 'function') {
    throw new SkillError(`no handler for skill: ${skillKey}`);
  }
  return fn as SkillHandler;
}

/** Invoke a skill with `payload`; return the result object.
 *
 * Raises SkillError on unknown tool or handler failure.
 * Skills signal bad input with {"error": ...} — surfaced as-is.
 */
export function runSkill(
  toolName: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const spec = SKILLS[toolName];
  if (!spec) {
    throw new SkillError(`unknown tool: ${toolName}`);
  }

  const fn = resolveHandler(spec.skill);
  try {
    return fn(payload);
  } catch (err) {
    throw new SkillError(
      `${toolName} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
