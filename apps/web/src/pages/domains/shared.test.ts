import { describe, expect, it } from 'vitest';
import { subjectsForGrade } from './shared';

describe('grade subject mapping', () => {
  it('uses primary, middle and high school subject sets', () => {
    expect(subjectsForGrade('小学六年级')).toContain('科学');
    expect(subjectsForGrade('初三')).toContain('道德与法治');
    expect(subjectsForGrade('高二')).toContain('生物');
  });
});
