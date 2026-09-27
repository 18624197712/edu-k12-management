import { WorkflowStatus } from '@prisma/client';
import { buildWeeklyLessonDates, DataService, lessonAccountingChange, lessonHours } from './data.service';

describe('DataService business rules', () => {
  const service = new DataService({} as never);

  it('calculates normal, half-price, activity and gift lessons', () => {
    expect(service.calculateRenewal({ price: 200, normalHours: 20, halfHours: 4, giftHours: 3, activities: [{ amount: 300, hours: 2 }] })).toEqual({ paid: 4700, totalHours: 29, averagePrice: 162.07 });
  });

  it('returns a zero average when no lessons are purchased', () => {
    expect(service.calculateRenewal({ price: 200 })).toEqual({ paid: 0, totalHours: 0, averagePrice: 0 });
  });

  it('generates the four supported Excel templates', async () => {
    for (const kind of ['students','courses','scores','renewals']) expect((await service.importTemplate(kind)).byteLength).toBeGreaterThan(100);
  });

  it('creates one-off and weekly lesson dates without exceeding the end date', () => {
    const start = new Date('2026-09-21T09:00:00.000Z');
    expect(buildWeeklyLessonDates(start, new Date('2026-10-12T09:00:00.000Z'), false)).toHaveLength(1);
    expect(buildWeeklyLessonDates(start, new Date('2026-10-12T09:00:00.000Z'), true).map(date => date.toISOString())).toEqual([
      '2026-09-21T09:00:00.000Z', '2026-09-28T09:00:00.000Z', '2026-10-05T09:00:00.000Z', '2026-10-12T09:00:00.000Z',
    ]);
  });

  it('converts lesson duration to billable hours unless an explicit value is provided', () => {
    expect(lessonHours(90)).toBe(1.5);
    expect(lessonHours(120, 1)).toBe(1);
  });

  it('only applies the accounting difference when lesson completion changes', () => {
    expect(lessonAccountingChange(0, WorkflowStatus.COMPLETED, 120)).toEqual({ appliedHours: 2, delta: 2 });
    expect(lessonAccountingChange(2, WorkflowStatus.COMPLETED, 120)).toEqual({ appliedHours: 2, delta: 0 });
    expect(lessonAccountingChange(2, WorkflowStatus.PENDING, 120)).toEqual({ appliedHours: 0, delta: -2 });
    expect(lessonAccountingChange(2, WorkflowStatus.COMPLETED, 180)).toEqual({ appliedHours: 3, delta: 1 });
  });
});
