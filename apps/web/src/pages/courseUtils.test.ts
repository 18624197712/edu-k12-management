import { describe, expect, it } from 'vitest';
import { groupLessonsByDay } from './courseUtils';

describe('course grouping', () => {
  it('does not retain or duplicate lessons between renders', () => {
    const lessons = [{ id: '1', startsAt: '2026-09-21T09:00:00.000Z' }];
    const first = groupLessonsByDay(lessons);
    const second = groupLessonsByDay(lessons);
    expect(Object.values(first).flat()).toHaveLength(1);
    expect(Object.values(second).flat()).toHaveLength(1);
    expect(first).not.toBe(second);
  });
});
