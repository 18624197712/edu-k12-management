import dayjs from 'dayjs';

export const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function groupLessonsByDay(lessons: any[]) {
  const grouped: Record<string, any[]> = Object.fromEntries(weekDays.map(day => [day, []]));
  for (const lesson of lessons) grouped[weekDays[(dayjs(lesson.startsAt).day() + 6) % 7]].push(lesson);
  return grouped;
}
