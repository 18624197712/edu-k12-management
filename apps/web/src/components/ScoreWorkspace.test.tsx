import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { ScoreWorkspace } from "./ScoreWorkspace";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const student = {
  id: "student-1",
  name: "学生甲",
  grade: "初一",
  school: "",
  subjects: ["数学"],
  remainingHours: 10,
  totalHours: 20,
  status: "ACTIVE" as const,
  headTeacher: "-",
  guardianName: "-",
  gender: "-",
  address: "-",
  schedule: "-",
  teachers: [],
  subjectTeachers: [],
  weakPoints: "",
  completedLessons: 0,
  familyNotes: "",
  communicationNotes: [],
};

let batches: Array<Record<string, unknown>>;

beforeEach(() => {
  vi.clearAllMocks();
  batches = [
    { id: "batch-new", name: "9月月考", examDate: "2026-09-29", scores: [] },
    { id: "batch-old", name: "8月月考", examDate: "2026-08-29", scores: [] },
  ];
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  vi.mocked(api.get).mockImplementation(async () => ({ data: { data: batches } }) as never);
  vi.mocked(api.delete).mockImplementation(async (url) => {
    batches = batches.filter((item) => url !== "/score-batches/" + item.id);
    return { data: { data: { success: true } } } as never;
  });
});

describe("ScoreWorkspace deletion", () => {
  it("deletes the current batch and selects the next remaining batch", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ScoreWorkspace student={student} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/9月月考/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /删除批次/ }));
    expect(await screen.findByText("删除当前成绩批次？")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/score-batches/batch-new"));
    await waitFor(() => expect(screen.getByText(/8月月考/)).toBeTruthy());
  });
});
