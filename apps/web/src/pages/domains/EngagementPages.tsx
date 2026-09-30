import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  PrinterOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Tag,
  Upload,
  message,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useState } from "react";
import { api } from "../../api";
import { Heading, useStudents } from "./shared";

const feedbackFields = [
  ["progress", "学生进步点"],
  ["problems", "目前还存在的问题"],
  ["solutions", "问题如何解决"],
  ["plan", "落地方案"],
  ["futureIssues", "后期可能发生的问题"],
  ["prevention", "提前避免措施"],
];

export function ParentMeetingsPage() {
  const students = useStudents(),
    [search, setSearch] = useState(""),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<any>(),
    [form] = Form.useForm(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["parent-meetings"],
    queryFn: async () => (await api.get("/parent-meetings")).data.data as any[],
  });
  const save = useMutation({
    mutationFn: (values: any) => {
      const payload = {
        ...values,
        meetingDate: values.meetingDate.toISOString(),
        feedback: Object.fromEntries(
          feedbackFields.map(([key]) => [key, values[key]]),
        ),
      };
      return editing
        ? api.patch(`/parent-meetings/${editing.id}`, payload)
        : api.post("/parent-meetings", payload);
    },
    onSuccess: () => {
      message.success("家长会记录已保存");
      setOpen(false);
      setEditing(undefined);
      form.resetFields();
      client.invalidateQueries({ queryKey: ["parent-meetings"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/parent-meetings/${id}`),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["parent-meetings"] }),
  });
  const rows = (query.data || []).filter((row) =>
    row.student.name.includes(search),
  );
  const edit = (row: any) => {
    setEditing(row);
    form.setFieldsValue({
      studentId: row.studentId,
      meetingDate: dayjs(row.meetingDate),
      recorder: row.recorder,
      parentSuggestion: row.parentSuggestion,
      ...row.feedback,
    });
    setOpen(true);
  };
  return (
    <>
      <Heading
        title="家长会记录"
        desc="记录每次家长会沟通内容，包含教师反馈、问题解决方案与家长建议，支持导出打印"
        extra={
          <Space>
            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
              打印全部
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(undefined);
                form.resetFields();
                setOpen(true);
              }}
            >
              新增记录
            </Button>
          </Space>
        }
      />
      <section className="panel">
        <div className="panel-title">
          <strong>家长会记录列表</strong>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索学生姓名..."
            style={{ width: 220 }}
          />
        </div>
        {rows.length ? (
          <div className="meeting-list">
            {rows.map((row) => (
              <article className="meeting-card" key={row.id}>
                <span className="avatar-sm">{row.student.name[0]}</span>
                <div>
                  <h3>{row.student.name}</h3>
                  <p>
                    年级：{row.student.grade}　任课老师：
                    {row.teacher?.name || "-"}　日期：
                    {dayjs(row.meetingDate).format("YYYY-MM-DD")}
                  </p>
                  <small>{row.feedback?.progress || "暂无反馈摘要"}</small>
                </div>
                <Space>
                  <Button
                    type="link"
                    icon={<EditOutlined />}
                    onClick={() => edit(row)}
                  >
                    编辑
                  </Button>
                  <Button
                    type="link"
                    icon={<PrinterOutlined />}
                    onClick={() => window.print()}
                  >
                    打印
                  </Button>
                  <Popconfirm
                    title="确认删除这条家长会记录？"
                    onConfirm={() => remove.mutate(row.id)}
                  >
                    <Button danger type="link" icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              </article>
            ))}
          </div>
        ) : (
          <Empty description={'暂无家长会记录，点击"新增记录"开始添加'} />
        )}
      </section>
      <Modal
        width={760}
        title={editing ? "编辑家长会记录" : "新增家长会记录"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => save.mutate(values)}
          initialValues={{ meetingDate: dayjs(), recorder: "李老师" }}
        >
          <div className="form-row">
            <Form.Item
              name="studentId"
              label="学生姓名"
              rules={[{ required: true }]}
            >
              <Select
                options={(students.data || []).map((x) => ({
                  value: x.id,
                  label: `${x.name} · ${x.grade}`,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="meetingDate"
              label="家长会日期"
              rules={[{ required: true }]}
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </div>
          <Form.Item name="recorder" label="记录人">
            <Input />
          </Form.Item>
          <h3>教师反馈</h3>
          {feedbackFields.map(([key, label], index) => (
            <Form.Item key={key} name={key} label={`${index + 1}. ${label}`}>
              <Input.TextArea rows={2} />
            </Form.Item>
          ))}
          <Form.Item name="parentSuggestion" label="家长建议">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

const recStatus = [
  { value: "PENDING", label: "待试课", color: "warning" },
  { value: "IN_PROGRESS", label: "已试课", color: "processing" },
  { value: "COMPLETED", label: "已报名", color: "success" },
  { value: "CANCELLED", label: "已放弃", color: "default" },
];
export function RecommendationsPage() {
  const [month, setMonth] = useState("2026-09"),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<any>(),
    [form] = Form.useForm(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["recommendations", month],
    queryFn: async () =>
      (await api.get("/recommendations", { params: { month } })).data
        .data as any[],
  });
  const save = useMutation({
    mutationFn: (values: any) => {
      const payload = {
        ...values,
        studentName: values.studentName,
        trialAt: values.trialAt?.toISOString(),
        month,
      };
      return editing
        ? api.patch(`/recommendations/${editing.id}`, payload)
        : api.post("/recommendations", payload);
    },
    onSuccess: () => {
      message.success("推荐记录已保存");
      setOpen(false);
      setEditing(undefined);
      form.resetFields();
      client.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/recommendations/${id}`),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["recommendations"] }),
  });
  const rows = query.data || [],
    count = (status: string) =>
      rows.filter((row) => row.status === status).length;
  const edit = (row: any) => {
    setEditing(row);
    form.setFieldsValue({
      ...row,
      trialAt: row.trialAt ? dayjs(row.trialAt) : undefined,
    });
    setOpen(true);
  };
  return (
    <>
      <Heading
        title="每月推荐"
        desc="家长会推荐学生追踪管理，记录试课信息与转化状态"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(undefined);
              form.resetFields();
              setOpen(true);
            }}
          >
            新增推荐
          </Button>
        }
      />
      <div className="stats-grid rec-stats">
        {[
          ["本月推荐总数", rows.length],
          ["待试课", count("PENDING")],
          ["已试课", count("IN_PROGRESS")],
          ["已报名", count("COMPLETED")],
        ].map((item) => (
          <div className="mini-stat" key={item[0]}>
            <span>{item[0]}</span>
            <b>
              {item[1]}
              <small>人</small>
            </b>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="toolbar">
          <b>月份：</b>
          <Select
            value={month}
            onChange={setMonth}
            options={["2026-09", "2026-10", "2026-11", "2026-12"].map(
              (value) => ({ value, label: value.replace("-", "年") + "月" }),
            )}
          />
        </div>
        {rows.length ? (
          <div className="rec-grid">
            {rows.map((row) => {
              const status = recStatus.find((x) => x.value === row.status)!;
              return (
                <Card
                  key={row.id}
                  title={row.studentName}
                  extra={<Tag color={status.color}>{status.label}</Tag>}
                >
                  <p>年级：{row.grade}</p>
                  <p>科目：{row.subject}</p>
                  <p>联系方式：{row.hasContact || "-"}</p>
                  <p>
                    试课时间：
                    {row.trialAt
                      ? dayjs(row.trialAt).format("YYYY-MM-DD HH:mm")
                      : "-"}
                  </p>
                  <p>试课科目：{row.trialSubjects || "-"}</p>
                  <p>试课老师：{row.trialTeachers || "-"}</p>
                  <p>推荐人：{row.referrer}</p>
                  <Space>
                    <Button type="link" onClick={() => edit(row)}>
                      编辑
                    </Button>
                    <Popconfirm
                      title="确认删除这条推荐记录？"
                      onConfirm={() => remove.mutate(row.id)}
                    >
                      <Button danger type="link">
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                </Card>
              );
            })}
          </div>
        ) : (
          <Empty description="本月暂无推荐记录，点击新增推荐开始添加" />
        )}
      </section>
      <Modal
        title={editing ? "编辑推荐记录" : "新增推荐记录"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => save.mutate(values)}
          initialValues={{ hasContact: "是", status: "PENDING" }}
        >
          <Form.Item
            name="studentName"
            label="学生姓名"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <div className="form-row">
            <Form.Item name="grade" label="年级">
              <Input />
            </Form.Item>
            <Form.Item name="subject" label="推荐科目">
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="hasContact" label="是否有联系方式">
            <Radio.Group options={["是", "否"]} />
          </Form.Item>
          <Form.Item name="trialAt" label="试课时间">
            <DatePicker showTime style={{ width: "100%" }} />
          </Form.Item>
          <div className="form-row">
            <Form.Item name="trialSubjects" label="试课科目">
              <Input />
            </Form.Item>
            <Form.Item name="trialTeachers" label="试课老师">
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="referrer" label="推荐人">
            <Input />
          </Form.Item>
          <Form.Item name="status" label="当前状态">
            <Select
              options={recStatus.map((x) => ({
                value: x.value,
                label: x.label,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function TrainingPage() {
  const [current, setCurrent] = useState<string>(),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<any>(),
    [form] = Form.useForm(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["training"],
    queryFn: async () =>
      (await api.get("/training/modules")).data.data as any[],
  });
  const module = query.data?.find((x) => x.id === current);
  const save = useMutation({
    mutationFn: (values: any) =>
      editing
        ? api.patch(`/training/modules/${editing.id}`, values)
        : api.post("/training/modules", values),
    onSuccess: () => {
      message.success("培训模块已保存");
      setOpen(false);
      setEditing(undefined);
      form.resetFields();
      client.invalidateQueries({ queryKey: ["training"] });
    },
  });
  const removeModule = useMutation({
    mutationFn: (id: string) => api.delete(`/training/modules/${id}`),
    onSuccess: () => {
      setCurrent(undefined);
      client.invalidateQueries({ queryKey: ["training"] });
    },
  });
  const removeFile = useMutation({
    mutationFn: (id: string) => api.delete(`/files/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["training"] }),
  });
  const upload = async (file: File) => {
    if (!module) return false;
    if (file.size > 10 * 1024 * 1024) {
      message.error("单个文件不能超过10MB");
      return false;
    }
    const signed = (
      await api.post("/files/upload-url", { name: file.name, type: file.type })
    ).data.data;
    await fetch(signed.url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    await api.post("/files/complete", {
      moduleId: module.id,
      name: file.name,
      key: signed.key,
      mimeType: file.type,
      size: file.size,
    });
    message.success("资料上传成功");
    client.invalidateQueries({ queryKey: ["training"] });
    return false;
  };
  const download = async (material: any) => {
    const { url } = (
      await api.get("/files/download-url", {
        params: { key: material.objectKey },
      })
    ).data.data;
    window.open(url, "_blank");
  };
  if (module)
    return (
      <>
        <Heading
          title={module.name}
          desc={module.description}
          extra={
            <Space>
              <Button onClick={() => setCurrent(undefined)}>
                返回模块列表
              </Button>
              <Popconfirm
                title="确认删除整个培训模块？"
                description="模块内资料记录也会一并删除。"
                onConfirm={() => removeModule.mutate(module.id)}
              >
                <Button danger>删除模块</Button>
              </Popconfirm>
            </Space>
          }
        />
        <section className="panel">
          <Upload.Dragger multiple showUploadList={false} beforeUpload={upload}>
            <UploadOutlined />
            <p>点击或拖拽文件到此处上传</p>
            <span>
              支持 PDF、Word、Excel、PPT、图片等格式，单个文件不超过 10MB
            </span>
          </Upload.Dragger>
          <div className="panel-title material-title">
            <strong>资料列表</strong>
            <span>{module.materials.length} 个文件</span>
          </div>
          {module.materials.length ? (
            <List
              dataSource={module.materials}
              renderItem={(material: any) => (
                <List.Item
                  actions={[
                    <Button
                      type="link"
                      icon={<DownloadOutlined />}
                      onClick={() => download(material)}
                    >
                      下载
                    </Button>,
                    <Popconfirm
                      title="确认删除这份培训资料？"
                      onConfirm={() => removeFile.mutate(material.id)}
                    >
                      <Button danger type="link" icon={<DeleteOutlined />}>
                        删除
                      </Button>
                    </Popconfirm>,
                  ]}
                >
                  <span className="file-icon">
                    {material.name.split(".").pop()?.toUpperCase()}
                  </span>
                  <List.Item.Meta
                    title={material.name}
                    description={`${Math.round(material.size / 1024)} KB · 上传于 ${dayjs(material.createdAt).format("YYYY-MM-DD HH:mm")}`}
                  />
                </List.Item>
              )}
            />
          ) : (
            <Empty description="暂无资料，上传后将显示在这里" />
          )}
        </section>
      </>
    );
  return (
    <>
      <Heading
        title="培训中心"
        desc="管理各培训模块资料，支持自定义模块名称与上传对应学习资料"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(undefined);
              form.resetFields();
              setOpen(true);
            }}
          >
            新建模块
          </Button>
        }
      />
      <p className="module-count">共 {query.data?.length || 0} 个培训模块</p>
      <div className="training-grid">
        {(query.data || []).map((item) => (
          <Card key={item.id} className="training-card">
            <div className="training-module-actions">
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                onClick={() => {
                  setEditing(item);
                  form.setFieldsValue(item);
                  setOpen(true);
                }}
              />
              <Popconfirm
                title="确认删除培训模块？"
                description="模块内资料记录也会一并删除。"
                onConfirm={() => removeModule.mutate(item.id)}
              >
                <Button
                  size="small"
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                />
              </Popconfirm>
            </div>
            <div onClick={() => setCurrent(item.id)}>
              <span className={`training-icon ${item.color}`}>培</span>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <footer>
                <span>{item.materials.length} 个资料</span>
                <b>查看详情 →</b>
              </footer>
            </div>
          </Card>
        ))}
      </div>
      <Modal
        title={editing ? "编辑培训模块" : "新建培训模块"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => save.mutate(values)}
          initialValues={{ color: "blue" }}
        >
          <Form.Item name="name" label="模块名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="模块描述">
            <Input.TextArea />
          </Form.Item>
          <Form.Item name="color" label="图标颜色">
            <Radio.Group
              options={[
                { value: "blue", label: "蓝色" },
                { value: "green", label: "绿色" },
                { value: "orange", label: "橙色" },
                { value: "purple", label: "紫色" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
