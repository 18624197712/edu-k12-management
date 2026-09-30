export type Role = "ADMIN" | "HEAD_TEACHER" | "SUBJECT_TEACHER";
export type EnrollmentType = "FIRST_ENROLLMENT" | "RENEWAL";
export type EnrollmentStatus = "PENDING" | "COMPLETED" | "CANCELLED";

export interface EnrollmentActivity {
  amount: number;
  hours: number;
}

export interface EnrollmentQuoteInput {
  type: EnrollmentType;
  studentId?: string;
  prospectName?: string;
  prospectPhone?: string;
  price: number;
  normalHours: number;
  halfHours: number;
  giftHours: number;
  giftType?: string;
  activities: EnrollmentActivity[];
  weeklyFrequency: number;
  sessionHours: number;
  projectionStart: string;
  followUpAt?: string;
}

export interface EnrollmentCalculation {
  originalAmount: number;
  paid: number;
  savedAmount: number;
  discountRate: number;
  totalHours: number;
  averagePrice: number;
  balanceBefore: number;
  balanceAfter: number;
  weeklyConsumption: number;
  currentWeeks: number;
  projectedWeeks: number;
  currentEstimatedEndAt: string | null;
  estimatedEndAt: string | null;
}

export interface EnrollmentRecord extends EnrollmentCalculation {
  id: string;
  type: EnrollmentType;
  status: EnrollmentStatus;
  studentId?: string;
  student?: { id: string; name: string; grade: string };
  prospectName?: string;
  prospectPhone?: string;
  unitPrice: number;
  normalHours: number;
  halfHours: number;
  giftHours: number;
  giftType?: string;
  activities: EnrollmentActivity[];
  weeklyFrequency: number;
  sessionHours: number;
  projectionStart: string;
  followUpAt?: string;
  confirmedAt?: string;
  createdByName?: string;
  createdAt: string;
}

export interface ApiResponse<T> {
  data: T;
  meta?: { page: number; pageSize: number; total: number };
}

export interface Student {
  id: string;
  name: string;
  grade: string;
  school: string;
  subjects: string[];
  headTeacher: string;
  remainingHours: number;
  status: "ACTIVE" | "PAUSED" | "GRADUATED";
  phone?: string;
}

export interface DashboardSummary {
  students: number;
  teachers: number;
  lessonsThisMonth: number;
  pendingRenewals: number;
  lessonTrend: Array<{ month: string; value: number }>;
  subjectDistribution: Array<{ name: string; value: number }>;
}

export const gradeOptions = [
  "小学一年级",
  "小学二年级",
  "小学三年级",
  "小学四年级",
  "小学五年级",
  "小学六年级",
  "初一",
  "初二",
  "初三",
  "高一",
  "高二",
  "高三",
] as const;

export const subjectOptions = [
  "语文",
  "数学",
  "英语",
  "物理",
  "化学",
  "生物",
  "道德与法治",
  "政治",
  "历史",
  "地理",
  "科学",
  "信息技术",
  "体育",
  "音乐",
  "美术",
] as const;

export const scoreSubjects: Record<string, string[]> = {
  小学: ["语文", "数学", "英语", "科学"],
  初中: ["语文", "数学", "英语", "物理", "化学", "道德与法治", "历史"],
  高中: [
    "语文",
    "数学",
    "英语",
    "物理",
    "化学",
    "生物",
    "政治",
    "历史",
    "地理",
  ],
};

export function subjectsForGrade(grade: string) {
  const key = grade.includes("小学")
    ? "小学"
    : grade.includes("初")
      ? "初中"
      : "高中";
  return [...scoreSubjects[key]];
}
