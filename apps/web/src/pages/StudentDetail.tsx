import { ArrowLeftOutlined, DeleteOutlined } from "@ant-design/icons";
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { ApiResponse, HourLedger, Student } from "../types";
import { ScoreSummary } from "../components/ScoreWorkspace";

export function StudentDetail() {
  const { id } = useParams(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams(),
    client = useQueryClient();
  const [visitOpen, setVisitOpen] = useState(false),
    [visitForm] = Form.useForm();
  const studentQuery = useQuery({
    queryKey: ["student", id],
    queryFn: async () =>
      (await api.get<ApiResponse<Student>>(`/students/${id}`)).data.data,
    enabled: !!id,
  });
  const lessonsQuery = useQuery({
    queryKey: ["lessons", id],
    queryFn: async () =>
      (await api.get("/lessons", { params: { studentId: id } })).data.data,
    enabled: !!id,
  });
  const ledgersQuery = useQuery({
    queryKey: ["hour-ledgers", id],
    queryFn: async () =>
      (await api.get<ApiResponse<HourLedger[]>>(`/students/${id}/hour-ledgers`)).data.data,
    enabled: !!id,
  });
  const student = studentQuery.data;
  const saveVisit = useMutation({
    mutationFn: async (values: Record<string, string>) => {
      if (!student) throw new Error("学生尚未加载");
      return api.patch(`/students/${student.id}/archive`, {
        learningProfile: {
          guardianName: student.guardianName,
          gender: student.gender,
          address: student.address,
          schedule: student.schedule,
          teachers: student.teachers,
          weakPoints: student.weakPoints,
        },
        familyNotes: student.familyNotes,
        communicationNotes: [
          ...student.communicationNotes,
          { ...values, date: new Date().toLocaleDateString("zh-CN") },
        ],
      });
    },
    onSuccess: () => {
      message.success("回访记录已保存");
      setVisitOpen(false);
      visitForm.resetFields();
      client.invalidateQueries({ queryKey: ["student", id] });
    },
  });
  const removeVisit = useMutation({
    mutationFn: async (index: number) => {
      if (!student) throw new Error("学生尚未加载");
      return api.patch(`/students/${student.id}/archive`, {
        learningProfile: {
          guardianName: student.guardianName,
          gender: student.gender,
          address: student.address,
          schedule: student.schedule,
          teachers: student.teachers,
          weakPoints: student.weakPoints,
        },
        familyNotes: student.familyNotes,
        communicationNotes: student.communicationNotes.filter(
          (_, itemIndex) => itemIndex !== index,
        ),
      });
    },
    onSuccess: () => {
      message.success("回访记录已删除");
      client.invalidateQueries({ queryKey: ["student", id] });
    },
    onError: () => message.error("回访记录删除失败"),
  });
  if (studentQuery.isLoading)
    return <div className="panel">正在加载学生档案...</div>;
  if (!student) return <Empty description="学生不存在" />;
  const overview = (
    <>
      <div className="detail-grid">
        <div className="info-block score-overview-block"><b>各科最新成绩</b><ScoreSummary student={student} /><p>薄弱知识点：{student.weakPoints || "暂无"}</p></div>
        <div className="info-block">
          <b>课时进度</b>
          <Progress
            percent={Math.round(
              ((student.totalHours - student.remainingHours) /
                Math.max(student.totalHours, 1)) *
                100,
            )}
          />
          <p>已消耗 {student.totalHours - student.remainingHours} 课时</p>
        </div>
      </div>
      <section className="panel inner-panel">
        <div className="panel-title">
          <strong>近期上课记录</strong>
          <Button type="link" onClick={() => setParams({ tab: "lessons" })}>
            全部
          </Button>
        </div>
        {(lessonsQuery.data || []).slice(0, 3).map((row: any) => (
          <div className="lesson-note" key={row.id}>
            <b>
              {new Date(row.startsAt).toLocaleDateString("zh-CN")} ·{" "}
              {row.course.subject}
            </b>
            <p>
              {row.course.name}，本次消耗 {Number(row.consumedHours)} 课时。
            </p>
          </div>
        ))}
      </section>
    </>
  );
  const lessons = (
    <Table
      rowKey="id"
      dataSource={lessonsQuery.data || []}
      pagination={false}
      columns={[
        {
          title: "日期",
          dataIndex: "startsAt",
          render: (value: string) => new Date(value).toLocaleString("zh-CN"),
        },
        { title: "科目", render: (_: unknown, row: any) => row.course.subject },
        {
          title: "教师",
          render: (_: unknown, row: any) => row.course.teacherName || row.course.teacher?.name || "-",
        },
        {
          title: "消耗",
          dataIndex: "consumedHours",
          render: (value: number) => `${Number(value)} 课时`,
        },
        {
          title: "状态",
          dataIndex: "status",
          render: (value: string) => (
            <Tag color="success">
              {value === "COMPLETED" ? "已完成" : value}
            </Tag>
          ),
        },
      ]}
    />
  );
  const hours = (
    <>
      <div className="hour-summary">
        <div><strong>{student.totalHours}</strong><span>报读总课时</span></div>
        <div><strong>{student.totalHours - student.remainingHours}</strong><span>已消耗课时</span></div>
        <div><strong>{student.remainingHours}</strong><span>剩余课时</span></div>
      </div>
      <Progress
        percent={Math.round(
          ((student.totalHours - student.remainingHours) / Math.max(student.totalHours, 1)) * 100,
        )}
      />
      <Typography.Paragraph type="secondary">
        所有辅导科目共享此课时余额，任一科目完成课程都会从这里扣减。
      </Typography.Paragraph>
      <Table
        size="small"
        rowKey="id"
        loading={ledgersQuery.isLoading}
        dataSource={ledgersQuery.data || []}
        pagination={{ pageSize: 8 }}
        locale={{ emptyText: "暂无课时变动" }}
        columns={[
          { title: "时间", dataIndex: "createdAt", render: (value: string) => new Date(value).toLocaleString("zh-CN") },
          { title: "类型", dataIndex: "type", render: (value: HourLedger["type"]) => value === "FIRST_ENROLLMENT_ADD" ? "首次报读" : value === "RENEWAL_ADD" ? "续费增加" : value === "LESSON_REFUND" ? "课时退回" : "上课扣减" },
          { title: "变动", dataIndex: "amount", render: (value: number) => `${Number(value) > 0 ? "+" : ""}${Number(value)}` },
          { title: "余额", dataIndex: "balanceAfter", render: (value: number) => Number(value) },
          { title: "说明", dataIndex: "note" },
        ]}
      />
      <Button
        type="primary"
        style={{ marginTop: 16 }}
        onClick={() => navigate(`/renewals?studentId=${student.id}`)}
      >
        报名续费
      </Button>
    </>
  );
  const communication = (
    <div>
      {student.communicationNotes.length ? (
        student.communicationNotes.map((item, index) => (
          <div
            className="communication-item"
            key={`${item.date}-${item.title}-${index}`}
          >
            <b>
              {item.date} · {item.type}
            </b>
            <h4>{item.title}</h4>
            <p>{item.content}</p>
            <Popconfirm
              title="确认删除这条回访记录？"
              description="删除后无法恢复。"
              okText="确认删除"
              cancelText="取消"
              onConfirm={() => removeVisit.mutate(index)}
            >
              <Button danger type="link" size="small" icon={<DeleteOutlined />}>
                删除记录
              </Button>
            </Popconfirm>
          </div>
        ))
      ) : (
        <Empty description="暂无沟通记录" />
      )}
      <Button type="primary" onClick={() => setVisitOpen(true)}>
        新增回访
      </Button>
    </div>
  );
  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate("/students")}
        className="back-button"
      >
        返回学生列表
      </Button>
      <section className="student-profile-card">
        <div className="detail-avatar">{student.name[0]}</div>
        <div className="profile-copy">
          <Typography.Title level={2}>{student.name}</Typography.Title>
          <div>
            <Tag>{student.grade}</Tag>
            {student.subjects.map((subject) => (
              <Tag color="blue" key={subject}>
                {subject}
              </Tag>
            ))}
            <Tag color="success">在读</Tag>
          </div>
          <p>
            授课老师：{student.teachers.join(" / ")}　上课时间：
            {student.schedule}
          </p>
          <p>
            家长：{student.guardianName}　联系电话：{student.phone}
          </p>
        </div>
        <div className="remaining-summary">
          <strong>{student.remainingHours}</strong>
          <span>剩余课时 / 共 {student.totalHours} 课时</span>
        </div>
      </section>
      <section className="panel detail-tabs">
        <Tabs
          activeKey={params.get("tab") || "overview"}
          onChange={(tab) => setParams({ tab })}
          items={[
            { key: "overview", label: "学情概览", children: overview },
            { key: "lessons", label: "上课记录", children: lessons },
            { key: "hours", label: "课时管理", children: hours },
            {
              key: "communication",
              label: "沟通记录",
              children: communication,
            },
          ]}
        />
      </section>
      <Modal
        title="新增家校回访"
        open={visitOpen}
        onCancel={() => setVisitOpen(false)}
        onOk={() => visitForm.submit()}
        confirmLoading={saveVisit.isPending}
      >
        <Form
          form={visitForm}
          layout="vertical"
          initialValues={{ type: "电话回访" }}
          onFinish={(values) => saveVisit.mutate(values)}
        >
          <Form.Item name="type" label="沟通方式" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="title" label="回访主题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="content"
            label="沟通内容"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
