export type Role = 'ADMIN' | 'HEAD_TEACHER' | 'SUBJECT_TEACHER';
export type User = { id: string; name: string; role: Role };
export type Student = {
  id: string; name: string; grade: string; school: string; subjects: string[]; remainingHours: number;
  status: 'ACTIVE' | 'PAUSED' | 'GRADUATED'; headTeacher: string; phone?: string; guardianName: string;
  gender: string; address: string; schedule: string; totalHours: number; teachers: string[];
  subjectTeachers: Array<{ subject: string; teacherName?: string }>;
  weakPoints: string; completedLessons: number; familyNotes: string; communicationNotes: Array<Record<string, string>>;
};
export type PageMeta = { page: number; pageSize: number; total: number };
export type ApiResponse<T> = { data: T; meta?: PageMeta };
export type HourLedger = {
  id: string;
  type: 'LESSON_CONSUME' | 'LESSON_REFUND' | 'FIRST_ENROLLMENT_ADD' | 'RENEWAL_ADD';
  amount: number;
  balanceAfter: number;
  note?: string;
  operatorName: string;
  createdAt: string;
};
