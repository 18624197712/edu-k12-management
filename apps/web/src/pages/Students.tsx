import {
  DeleteOutlined,
  DownloadOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { gradeOptions, subjectOptions } from "@edu/shared";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { ApiResponse, Student } from "../types";

type StudentForm = {
  name: string;
  grade: string;
  school?: string;
  subjects?: string[];
  teacherBySubject?: Record<string, string>;
  guardianName?: string;
  phone?: string;
  totalHours: number;
  schedule?: string;
  weakPoints?: string;
};

const statusText = {
  ACTIVE: "在读",
  PAUSED: "停课",
  GRADUATED: "结业",
} as const;
const gradeGroups = ["小学", "初中", "高中"];

export function Students() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importKind, setImportKind] = useState("students");
  const [form] = Form.useForm<StudentForm>();
  const selectedSubjects = Form.useWatch("subjects", form) || [];

  const query = useQuery({
    queryKey: ["students", { status, grade, subject, search, page, pageSize }],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Student[]>>("/students", {
          params: {
            status: status || undefined,
            grade: grade || undefined,
            subject: subject || undefined,
            search: search || undefined,
            page,
            pageSize,
          },
        })
      ).data,
  });
  const create = useMutation({
    mutationFn: async (values: StudentForm) => {
      const subjects = values.subjects || [];
      return (
        await api.post("/students", {
          ...values,
          subjects,
          subjectTeachers: subjects.map((item) => ({
            subject: item,
            teacherName: values.teacherBySubject?.[item]?.trim() || null,
          })),
          remainingHours: values.totalHours,
          profile: {
            guardianName: values.guardianName,
            schedule: values.schedule,
            totalHours: values.totalHours,
            weakPoints: values.weakPoints,
            recentScore: 0,
          },
        })
      ).data;
    },
    onSuccess: () => {
      message.success("学生已创建");
      setOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/students/${id}`),
    onSuccess: () => {
      message.success("学生已删除");
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: any) =>
      message.error(error?.response?.data?.error?.message || "学生删除失败"),
  });

  const downloadTemplate = async () => {
    const response = await api.get(`/imports/${importKind}/template`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${importKind}-template.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importFile = async (file: File) => {
    const data = new FormData();
    data.append("file", file);
    const response = await api.post(`/imports/${importKind}`, data);
    const result = response.data.data;
    if (result.errors?.length) message.error(result.errors.join("；"));
    else {
      message.success(`成功导入 ${result.imported} 条记录`);
      setImportOpen(false);
      queryClient.invalidateQueries({ queryKey: ["students"] });
    }
    return false;
  };

  const columns = [
    {
      title: "学生",
      dataIndex: "name",
      width: 160,
      render: (value: string, row: Student) => (
        <div className="person">
          <span>{value[0]}</span>
          <div>
            <b>{value}</b>
            <small>
              {row.guardianName} · {row.phone}
            </small>
          </div>
        </div>
      ),
    },
    { title: "年级", dataIndex: "grade", width: 90 },
    {
      title: "辅导学科",
      dataIndex: "subjects",
      width: 150,
      render: (values: string[]) => (
        <Space size={4} wrap>
          {values.map((value, index) => (
            <Tag color={index % 2 ? "green" : "blue"} key={value}>
              {value}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "授课老师",
      dataIndex: "teachers",
      width: 130,
      render: (values: string[]) =>
        values.length ? (
          <>
            {[...new Set(values)].map((value) => (
              <div key={value}>{value}</div>
            ))}
          </>
        ) : (
          <span className="muted-text">未分配</span>
        ),
    },
    {
      title: "已上课次数",
      dataIndex: "completedLessons",
      width: 110,
      render: (value: number) => `${value} 次`,
    },
    {
      title: "剩余课时",
      dataIndex: "remainingHours",
      width: 170,
      render: (value: number, row: Student) => (
        <div className="hours-cell">
          <Progress
            percent={Math.round((value / Math.max(row.totalHours, 1)) * 100)}
            showInfo={false}
            size="small"
            strokeColor={
              value < 10 ? "#f5222d" : value < 20 ? "#f0a43c" : "#3b6fb6"
            }
          />
          <b className={value < 10 ? "danger" : ""}>
            {value} / {row.totalHours} 课时
          </b>
        </div>
      ),
    },
    { title: "上课时间", dataIndex: "schedule", width: 150 },
    {
      title: "状态",
      dataIndex: "status",
      width: 80,
      render: (value: keyof typeof statusText) => (
        <Tag
          color={
            value === "ACTIVE"
              ? "success"
              : value === "PAUSED"
                ? "warning"
                : "default"
          }
        >
          {statusText[value]}
        </Tag>
      ),
    },
    {
      title: "操作",
      fixed: "right" as const,
      width: 220,
      render: (_: unknown, row: Student) => (
        <Space size={0} className="student-actions" wrap={false}>
          <Button type="link" onClick={() => navigate(`/students/${row.id}`)}>
            详情
          </Button>
          <Button
            type="link"
            onClick={() => navigate(`/students/${row.id}?tab=communication`)}
          >
            跟进
          </Button>
          <Popconfirm
            title={row.status === "GRADUATED" ? "确认删除这个结业档案？" : "确认删除这个学生？"}
            description={
              row.status === "GRADUATED"
                ? "结业学生的课程、成绩、课时和业务历史将一并永久删除。"
                : "仅无课程、成绩、课时及业务历史的学生可删除；有历史记录请先结课。"
            }
            okText="确认删除"
            cancelText="取消"
            onConfirm={() => remove.mutate(row.id)}
          >
            <Button danger type="link" icon={<DeleteOutlined />} className="student-delete-button">
              {row.status === "GRADUATED" ? "删档" : "删除"}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-heading">
        <div>
          <Typography.Title level={3}>学生管理</Typography.Title>
          <Typography.Text type="secondary">
            管理学生、辅导科目及授课教师关系
          </Typography.Text>
        </div>
      </div>
      <section className="panel student-list-panel">
        <div className="panel-title">
          <strong>学生列表</strong>
          <Space wrap>
            <Button
              size="small"
              icon={<UploadOutlined />}
              onClick={() => setImportOpen(true)}
            >
              Excel 导入
            </Button>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setOpen(true)}
            >
              新增学生
            </Button>
          </Space>
        </div>
        <div className="toolbar">
          <Select
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={[
              { value: "", label: "全部状态" },
              { value: "ACTIVE", label: "在读" },
              { value: "PAUSED", label: "停课" },
              { value: "GRADUATED", label: "结业" },
            ]}
          />
          <Select
            value={grade}
            onChange={(value) => {
              setGrade(value);
              setPage(1);
            }}
            options={[
              { value: "", label: "全部年级" },
              ...gradeGroups.map((value) => ({ value, label: value })),
            ]}
          />
          <Select
            value={subject}
            onChange={(value) => {
              setSubject(value);
              setPage(1);
            }}
            options={[
              { value: "", label: "全部学科" },
              ...subjectOptions.map((value) => ({ value, label: value })),
            ]}
          />
          <span className="toolbar-spacer" />
          <Input
            prefix={<SearchOutlined />}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="搜索学生姓名..."
            style={{ width: 240 }}
          />
        </div>
        <Table
          rowKey="id"
          loading={query.isLoading}
          dataSource={query.data?.data || []}
          columns={columns}
          scroll={{ x: 1250 }}
          sticky={{ offsetHeader: 56, offsetScroll: 12 }}
          pagination={{
            current: page,
            pageSize,
            pageSizeOptions: [10, 30, 50],
            showSizeChanger: true,
            showQuickJumper: true,
            total: query.data?.meta?.total,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              if (nextPageSize !== pageSize) {
                setPageSize(nextPageSize);
                setPage(1);
              }
            },
            showTotal: (total) => "共 " + total + " 名学生",
          }}
        />
      </section>

      <Modal
        title="新增学生"
        width={760}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={create.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => create.mutate(values)}
        >
          <div className="form-row">
            <Form.Item
              label="学生姓名"
              name="name"
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item label="年级" name="grade" rules={[{ required: true }]}>
              <Select
                showSearch
                options={gradeOptions.map((value) => ({ value, label: value }))}
              />
            </Form.Item>
          </div>
          <div className="form-row">
            <Form.Item label="学校" name="school">
              <Input />
            </Form.Item>
            <Form.Item
              label="辅导科目"
              name="subjects"
              rules={[{ required: true, message: "请至少选择一个科目" }]}
            >
              <Select
                mode="tags"
                tokenSeparators={["、", ","]}
                options={subjectOptions.map((value) => ({
                  value,
                  label: value,
                }))}
                placeholder="可选择多个科目或输入自定义科目"
              />
            </Form.Item>
          </div>
          {selectedSubjects.length > 0 && (
            <div className="subject-assignment-list">
              <div className="subject-form-head">
                <b>按科目填写授课教师</b>
                <span>由业务人员直接填写，可为不同科目填写不同教师</span>
              </div>
              {selectedSubjects.map((item: string) => (
                <Form.Item
                  key={item}
                  name={["teacherBySubject", item]}
                  label={`${item}授课教师`}
                >
                  <Input allowClear placeholder="请输入教师姓名" />
                </Form.Item>
              ))}
            </div>
          )}
          <div className="form-row">
            <Form.Item label="家长姓名" name="guardianName">
              <Input />
            </Form.Item>
            <Form.Item label="联系电话" name="phone">
              <Input />
            </Form.Item>
          </div>
          <div className="form-row">
            <Form.Item
              label="报读总课时"
              name="totalHours"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="固定上课时间" name="schedule">
              <Input placeholder="周六 09:00-11:00" />
            </Form.Item>
          </div>
          <Form.Item label="薄弱知识点" name="weakPoints">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Excel 台账导入"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        footer={null}
      >
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          <Select
            value={importKind}
            onChange={setImportKind}
            style={{ width: "100%" }}
            options={[
              ["students", "学生"],
              ["courses", "课程"],
              ["scores", "成绩"],
              ["renewals", "续费"],
            ].map(([value, label]) => ({ value, label: `${label}台账` }))}
          />
          <Button block icon={<DownloadOutlined />} onClick={downloadTemplate}>
            下载标准模板
          </Button>
          <Upload.Dragger
            maxCount={1}
            showUploadList={false}
            beforeUpload={importFile}
            accept=".xlsx,.xls"
          >
            <UploadOutlined />
            <p>点击或拖拽填写后的模板到此处</p>
          </Upload.Dragger>
        </Space>
      </Modal>
    </div>
  );
}
