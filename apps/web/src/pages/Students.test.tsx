import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { Students } from "./Students";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const student = {
  id: "student-1",
  name: "待删除学生",
  grade: "初一",
  school: "示例中学",
  subjects: ["数学"],
  remainingHours: 0,
  totalHours: 0,
  status: "ACTIVE",
  headTeacher: "-",
  guardianName: "家长甲",
  phone: "13800000000",
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

beforeEach(() => {
  vi.clearAllMocks();
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
  vi.mocked(api.get).mockResolvedValue({
    data: { data: [student], meta: { page: 1, pageSize: 10, total: 1 } },
  } as never);
  vi.mocked(api.delete).mockResolvedValue({ data: { data: { success: true } } } as never);
});

describe("Students deletion", () => {
  it("requires confirmation, deletes the row and refreshes the list", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter initialEntries={["/students"]}>
        <QueryClientProvider client={client}>
          <Students />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("待删除学生")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /删除/ }));
    expect(await screen.findByText("确认删除这个学生？")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/students/student-1"));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it("shows graduated status, uses the archive-delete copy, and exposes page sizes", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        data: [{ ...student, status: "GRADUATED", name: "已结业学生" }],
        meta: { page: 1, pageSize: 10, total: 31 },
      },
    } as never);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter initialEntries={["/students"]}>
        <QueryClientProvider client={client}>
          <Students />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("已结业学生")).toBeTruthy();
    expect(screen.getByText("结业")).toBeTruthy();
    expect(screen.getByRole("button", { name: /删档/ })).toBeTruthy();
    expect(screen.getByText("共 31 名学生")).toBeTruthy();
    expect(document.querySelector(".ant-pagination-options-size-changer")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /删档/ }));
    expect(await screen.findByText("确认删除这个结业档案？")).toBeTruthy();
    expect(
      screen.getByText("结业学生的课程、成绩、课时和业务历史将一并永久删除。"),
    ).toBeTruthy();
  });
});
