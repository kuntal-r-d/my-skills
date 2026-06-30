import { describe, expect, it } from 'vitest';
import { mergeSkill, parseSkillMd, validateSkillSlug } from '../packages/core/src/skill-store.js';

const SAMPLE = `---
name: demo-skill
description: A demo skill for tests.
---

# Demo

Body here.
`;

describe('skill-store', () => {
  it('parses SKILL.md frontmatter', () => {
    const parsed = parseSkillMd(SAMPLE);
    expect(parsed.name).toBe('demo-skill');
    expect(parsed.description).toContain('demo skill');
    expect(parsed.body).toContain('# Demo');
  });

  it('validates skill slugs', () => {
    expect(() => validateSkillSlug('technical-analysis')).not.toThrow();
    expect(() => validateSkillSlug('Bad_Slug')).toThrow();
  });

  it('prefers active DB override over disk', () => {
    const override = {
      id: 1,
      slug: 'demo-skill',
      toolName: null,
      name: 'db-name',
      description: 'db-desc',
      skillMd: '---\nname: db\n---\n\nDB body',
      metadataJson: null,
      isActive: true,
      clientId: null,
      version: 2,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-06-01'),
    };
    const merged = mergeSkill('demo-skill', SAMPLE, override);
    expect(merged?.source).toBe('merged');
    expect(merged?.skill_md).toContain('DB body');
    expect(merged?.version).toBe(2);
  });
});
