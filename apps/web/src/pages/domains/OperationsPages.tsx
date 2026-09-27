import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  message,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { Heading, useStudents } from "./shared";

const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function CoursesPage() {
  const [week, setWeek] = useState("本周"),
    [editing, setEditing] = useState<any>(),
    [feedback, setFeedback] = useState<any>(),
    [form] = Form.useForm(),
    [feedbackForm] = Form.useForm(),
    client = useQueryClient();
  const lessons = useQuery({
    queryKey: ["lessons"],
    queryFn: async () => (await api.get("/lessons")).data.data as any[],
  });
  const grouped = useMemo(
    () => Object.fromEntries(days.map((day) => [day, [] as any[]])),
    [],
  );
  (lessons.data || []).forEach((row) => {
    const day = days[(new Date(row.startsAt).getDay() + 6) % 7];
    grouped[day].push(row);
  });
  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: any }) =>
      api.patch(`/lessons/${id}`, values),
    onSuccess: () => {
      message.success("课程记录已保存");
      setEditing(undefined);
      setFeedback(undefined);
      client.invalidateQueries({ queryKey: ["lessons"] });
    },
  });
  return (
    <>
      <Heading title="课程管理" desc="查看一对一课程安排、课后反馈与调课管理" />
      <section className="panel">
        <div className="panel-title">
          <strong>{week}课程表</strong>
          <Space>
            {["上周", "本周", "下周"].map((value) => (
              <Button
                type={week === value ? "primary" : "default"}
                onClick={() => setWeek(value)}
                key={value}
              >
                {value}
              </Button>
            ))}
          </Space>
        </div>
        <div className="week-grid">
          {days.map((day) => (
            <div className="day-column" key={day}>
              <div>
                <b>{day}</b>
                <span>
                  {day === days[(new Date().getDay() + 6) % 7] ? "今天" : ""}
                </span>
              </div>
              <small>{grouped[day].length} 节课</small>
              {grouped[day].map((row) => (
                <article className="course-card" key={row.id}>
                  <small>
                    {dayjs(row.startsAt).format("HH:mm")} -{" "}
                    {dayjs(row.startsAt)
                      .add(row.durationMinutes, "minute")
                      .format("HH:mm")}
                  </small>
                  <b>
                    {row.student.name} · {row.course.subject}
                  </b>
                  <span>
                    {row.course.teacherName || row.course.teacher?.name || "-"} · 本月共上{" "}
                    {Number(row.consumedHours) * 3} 小时
                  </span>
                  <Tag
                    color={
                      row.status === "COMPLETED" ? "success" : "processing"
                    }
                  >
                    {row.status === "COMPLETED" ? "已结束" : "待上课"}
                  </Tag>
                  <Space>
                    <Button
                      type="link"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditing(row);
                        form.setFieldsValue({
                          startsAt: dayjs(row.startsAt),
                          reason: "",
                        });
                      }}
                    >
                      编辑
                    </Button>
                    {row.status === "COMPLETED" && (
                      <Button
                        type="link"
                        size="small"
                        onClick={() =>
                          row.feedback
                            ? setFeedback({ ...row, view: true })
                            : setFeedback(row)
                        }
                      >
                        {row.feedback ? "查看反馈" : "填写反馈"}
                      </Button>
                    )}
                  </Space>
                </article>
              ))}
            </div>
          ))}
        </div>
      </section>
      <div className="dashboard-grid lower">
        <section className="panel">
          <div className="panel-title">
            <strong>待提交课后反馈</strong>
            <Tag color="warning">
              {
                (lessons.data || []).filter(
                  (x) => x.status === "COMPLETED" && !x.feedback,
                ).length
              }{" "}
              条待处理
            </Tag>
          </div>
          {(lessons.data || [])
            .filter((x) => x.status === "COMPLETED" && !x.feedback)
            .slice(0, 4)
            .map((row) => (
              <div className="action-row" key={row.id}>
                <div>
                  <b>
                    {row.student.name} · {row.course.subject}
                  </b>
                  <span>
                    {dayjs(row.startsAt).format("MM-DD HH:mm")} ·{" "}
                    {row.course.teacherName || row.course.teacher?.name || "-"}
                  </span>
                </div>
                <Button size="small" onClick={() => setFeedback(row)}>
                  填写反馈
                </Button>
              </div>
            ))}
        </section>
        <section className="panel">
          <div className="panel-title">
            <strong>调课申请</strong>
            <Tag color="processing">2 条待审核</Tag>
          </div>
          {(lessons.data || []).slice(0, 2).map((row) => (
            <div className="action-row" key={row.id}>
              <div>
                <b>{row.student.name}</b>
                <span>申请调整本周课程 · 家长时间冲突</span>
              </div>
              <Space>
                <Button
                  size="small"
                  onClick={() =>
                    update.mutate({ id: row.id, values: { status: 'CANCELLED' } })
                  }
                >
                  拒绝
                </Button>
                <Button
                  size="small"
                  type="primary"
                  onClick={() => setEditing(row)}
                >
                  同意
                </Button>
              </Space>
            </div>
          ))}
        </section>
      </div>
      <Modal
        title={`调整课程 · ${editing?.student?.name || ""}`}
        open={!!editing}
        onCancel={() => setEditing(undefined)}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) =>
            update.mutate({
              id: editing.id,
              values: { startsAt: values.startsAt.toISOString() },
            })
          }
        >
          <Form.Item
            name="startsAt"
            label="新的上课时间"
            rules={[{ required: true }]}
          >
            <DatePicker showTime style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="reason" label="调整原因">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`课后反馈 · ${feedback?.student?.name || ""}`}
        open={!!feedback}
        onCancel={() => setFeedback(undefined)}
        footer={
          feedback?.view ? (
            <Button onClick={() => setFeedback(undefined)}>关闭</Button>
          ) : undefined
        }
        onOk={feedback?.view ? undefined : () => feedbackForm.submit()}
      >
        {feedback?.view ? (
          <div className="feedback-paper">
            <p>
              <b>上课内容：</b>
              {feedback.feedback?.content}
            </p>
            <p>
              <b>课堂表现：</b>
              {feedback.feedback?.performance}
            </p>
            <p>
              <b>存在问题：</b>
              {feedback.feedback?.problems}
            </p>
            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
              打印反馈
            </Button>
          </div>
        ) : (
          <Form
            form={feedbackForm}
            layout="vertical"
            onFinish={(values) =>
              update.mutate({ id: feedback.id, values: { feedback: values } })
            }
          >
            <Form.Item
              name="content"
              label="上课内容"
              rules={[{ required: true }]}
            >
              <Input.TextArea />
            </Form.Item>
            <Form.Item name="performance" label="课堂表现">
              <Input.TextArea />
            </Form.Item>
            <Form.Item name="problems" label="存在问题与课后建议">
              <Input.TextArea />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </>
  );
}

export function RenewalPage() {
  const students = useStudents(),
    client = useQueryClient(),
    [params] = useSearchParams(),
    [id, setId] = useState(params.get("studentId") || ""),
    [price, setPrice] = useState<number>(),
    [normal, setNormal] = useState(0),
    [half, setHalf] = useState(0),
    [gift, setGift] = useState(0),
    [giftType, setGiftType] = useState("推荐学生赠课"),
    [activities, setActivities] = useState([
      { amount: 0, hours: 0 },
      { amount: 0, hours: 0 },
      { amount: 0, hours: 0 },
    ]),
    [weekly, setWeekly] = useState(2),
    [duration, setDuration] = useState(2),
    [renew, setRenew] = useState<number>(),
    [renewPrice, setRenewPrice] = useState<number>();
  const student = students.data?.find((x) => x.id === id);
  const paid =
      (price || 0) * normal +
      (price || 0) * 0.5 * half +
      activities.reduce((n, x) => n + x.amount, 0),
    total = normal + half + gift + activities.reduce((n, x) => n + x.hours, 0),
    average = total ? Math.round(paid / total) : 0,
    weeks = student
      ? Math.floor(student.remainingHours / Math.max(weekly * duration, 1))
      : 0,
    renewWeeks = student
      ? Math.floor(
          (student.remainingHours + (renew || 0)) /
            Math.max(weekly * duration, 1),
        )
      : 0;
  const save = useMutation({
    mutationFn: () =>
      api.post("/renewals", {
        studentId: id,
        price,
        normalHours: normal,
        halfHours: half,
        giftHours: gift,
        giftType,
        activities,
        status: "COMPLETED",
      }),
    onSuccess: () => {
      message.success(`续费已完成，${total} 课时已加入学生账户`);
      client.invalidateQueries({ queryKey: ["students"] });
      client.invalidateQueries({ queryKey: ["student", id] });
      client.invalidateQueries({ queryKey: ["hour-ledgers", id] });
      client.invalidateQueries({ queryKey: ["renewals"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  return (
    <>
      <Heading
        title="续费管理"
        desc="课时费用快速计算、剩余课时规划、续报方案制定"
      />
      <div className="renew-select">
        <b>选择学生：</b>
        <Select
          value={id || undefined}
          placeholder="请选择学生"
          onChange={setId}
          options={(students.data || []).map((x) => ({
            value: x.id,
            label: `${x.name}（${x.grade}）`,
          }))}
        />
      </div>
      <div className="renew-grid">
        <Card title="续费费用计算器">
          <Form layout="vertical">
            <Form.Item label="原价单价（元/课时）">
              <InputNumber
                value={price}
                onChange={(value) => setPrice(value || undefined)}
                placeholder="请输入原价单价，如 185"
                style={{ width: "100%" }}
              />
            </Form.Item>
            <h4>课时构成</h4>
            <div className="form-row three">
              <label>
                正价课时
                <InputNumber
                  value={normal}
                  onChange={(value) => setNormal(value || 0)}
                />
              </label>
              <label>
                赠送课时
                <InputNumber
                  value={gift}
                  onChange={(value) => setGift(value || 0)}
                />
              </label>
              <label>
                半价课时
                <InputNumber
                  value={half}
                  onChange={(value) => setHalf(value || 0)}
                />
              </label>
            </div>
            <h4>活动课（金额 + 课时数，不填视为0）</h4>
            {activities.map((row, index) => (
              <div className="activity-row" key={index}>
                <span>活动{["一", "二", "三"][index]}</span>
                <InputNumber
                  value={row.amount}
                  prefix="¥"
                  onChange={(value) =>
                    setActivities(
                      activities.map((x, i) =>
                        i === index ? { ...x, amount: value || 0 } : x,
                      ),
                    )
                  }
                />
                <InputNumber
                  value={row.hours}
                  suffix="课时"
                  onChange={(value) =>
                    setActivities(
                      activities.map((x, i) =>
                        i === index ? { ...x, hours: value || 0 } : x,
                      ),
                    )
                  }
                />
              </div>
            ))}
            <div className="form-row">
              <label>
                赠课类型
                <Select
                  value={giftType}
                  onChange={setGiftType}
                  options={["推荐学生赠课", "首到首签赠课"].map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              </label>
              <label>
                赠课课时数
                <InputNumber
                  value={gift}
                  onChange={(value) => setGift(value || 0)}
                />
              </label>
            </div>
          </Form>
          {id && price ? (
            <div className="calc-result">
              <div>
                <span>实付金额</span>
                <b>¥{paid.toLocaleString()}</b>
              </div>
              <div>
                <span>合计课时</span>
                <b>{total}</b>
              </div>
              <div>
                <span>平均单价</span>
                <b>¥{average}</b>
              </div>
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="请先选择学生，并填写原价单价和课时数"
            />
          )}
          <Button
            type="primary"
            block
            disabled={!id || !total}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            确认续费并增加课时
          </Button>
        </Card>
        <Card title="剩余课时规划">
          {student ? (
            <>
              <div className="hour-summary">
                <div>
                  <strong>{student.remainingHours}</strong>
                  <span>剩余课时</span>
                </div>
                <div>
                  <strong>{student.completedLessons}</strong>
                  <span>已上课次数</span>
                </div>
              </div>
              <div className="form-row">
                <label>
                  每周上课频次
                  <InputNumber
                    value={weekly}
                    suffix="次/周"
                    onChange={(value) => setWeekly(value || 1)}
                  />
                </label>
                <label>
                  每次时长
                  <InputNumber
                    value={duration}
                    suffix="小时"
                    onChange={(value) => setDuration(value || 1)}
                  />
                </label>
              </div>
              <div className="calc-result vertical">
                <div>
                  <span>每周消耗</span>
                  <b>{weekly * duration} 课时</b>
                </div>
                <div>
                  <span>可用周数</span>
                  <b>{weeks} 周</b>
                </div>
                <div>
                  <span>预计可用到</span>
                  <b>{dayjs().add(weeks, "week").format("YYYY年MM月DD日")}</b>
                </div>
              </div>
            </>
          ) : (
            <Empty description="请先选择学生" />
          )}
        </Card>
      </div>
      <Card title="续报方案规划">
        <div className="form-row">
          <label>
            续报课时数
            <InputNumber
              value={renew}
              onChange={(value) => setRenew(value || undefined)}
              placeholder="如 40"
            />
          </label>
          <label>
            续报单价（元/课时，选填）
            <InputNumber
              value={renewPrice}
              onChange={(value) => setRenewPrice(value || undefined)}
              placeholder="如 185"
            />
          </label>
        </div>
        {student && renew ? (
          <div className="calc-result wide">
            <div>
              <span>当前剩余</span>
              <b>{student.remainingHours} 课时</b>
            </div>
            <div>
              <span>本次续报</span>
              <b>+{renew} 课时</b>
            </div>
            <div>
              <span>续报费用</span>
              <b>¥{(renew * (renewPrice || price || 0)).toLocaleString()}</b>
            </div>
            <div>
              <span>续报后可用</span>
              <b>{renewWeeks} 周</b>
            </div>
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="请先选择学生，并填写续报课时数"
          />
        )}
      </Card>
    </>
  );
}

const bizTabs = [
  { key: "FINISH", label: "结课管理" },
  { key: "REFUND", label: "退费管理" },
  { key: "SUSPEND", label: "停课管理" },
];
export function BusinessPage() {
  const students = useStudents(),
    [tab, setTab] = useState("FINISH"),
    [open, setOpen] = useState(false),
    [form] = Form.useForm(),
    client = useQueryClient();
  const rows = useQuery({
    queryKey: ["business", tab],
    queryFn: async () =>
      (await api.get("/business-applications", { params: { type: tab } })).data
        .data as any[],
  });
  const save = useMutation({
    mutationFn: (values: any) =>
      api.post("/business-applications", {
        ...values,
        type: tab,
        status: "COMPLETED",
      }),
    onSuccess: () => {
      message.success("业务记录已保存");
      setOpen(false);
      form.resetFields();
      client.invalidateQueries({ queryKey: ["business"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/business-applications/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["business"] }),
  });
  const refunds = tab === "REFUND" ? rows.data || [] : [],
    refundTotal = refunds.reduce((n, x) => n + Number(x.amount || 0), 0);
  return (
    <>
      <Heading
        title="业务办理"
        desc="结课、退费、停课等教务流程管理"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setOpen(true)}
          >
            新增记录
          </Button>
        }
      />
      <section className="panel">
        <Tabs activeKey={tab} onChange={setTab} items={bizTabs} />
        <Table
          rowKey="id"
          loading={rows.isLoading}
          pagination={false}
          dataSource={rows.data || []}
          columns={[
            {
              title: "学生姓名",
              render: (_: unknown, row: any) => row.student.name,
            },
            {
              title: "年级",
              render: (_: unknown, row: any) => row.student.grade,
            },
            {
              title: `${bizTabs.find((x) => x.key === tab)?.label.slice(0, 2)}时间`,
              dataIndex: "createdAt",
              render: (value: string) => dayjs(value).format("YYYY-MM-DD"),
            },
            ...(tab === "REFUND"
              ? [
                  {
                    title: "退费金额",
                    dataIndex: "amount",
                    render: (value: number) =>
                      `¥${Number(value).toLocaleString()}`,
                  },
                ]
              : []),
            {
              title: `${bizTabs.find((x) => x.key === tab)?.label.slice(0, 2)}原因`,
              dataIndex: "reason",
            },
            {
              title: "操作",
              render: (_: unknown, row: any) => (
                <Button
                  danger
                  type="link"
                  icon={<DeleteOutlined />}
                  onClick={() => remove.mutate(row.id)}
                >
                  删除
                </Button>
              ),
            },
          ]}
        />
        {tab === "REFUND" && (
          <>
            <div className="refund-summary">
              <div>
                <span>退费记录数</span>
                <b>{refunds.length} 条</b>
              </div>
              <div>
                <span>累计退费金额</span>
                <b>¥{refundTotal.toLocaleString()}</b>
              </div>
            </div>
            <h3>按月累计统计</h3>
            <Table
              size="small"
              pagination={false}
              dataSource={Object.entries(
                refunds.reduce((acc: any, row: any) => {
                  const month = dayjs(row.createdAt).format("YYYY年MM月");
                  acc[month] = (acc[month] || 0) + Number(row.amount || 0);
                  return acc;
                }, {}),
              ).map(([month, amount]) => ({ month, amount }))}
              columns={[
                { title: "月份", dataIndex: "month" },
                { title: "退费笔数", render: () => "1 笔" },
                {
                  title: "退费金额",
                  dataIndex: "amount",
                  render: (value) => `¥${Number(value).toLocaleString()}`,
                },
                {
                  title: "占比",
                  dataIndex: "amount",
                  render: (value) =>
                    `${refundTotal ? Math.round((Number(value) / refundTotal) * 100) : 0}%`,
                },
              ]}
            />
          </>
        )}
      </section>
      <Modal
        title={`新增${bizTabs.find((x) => x.key === tab)?.label.slice(0, 2)}记录`}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => save.mutate(values)}
        >
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
          {tab === "REFUND" && (
            <Form.Item
              name="amount"
              label="退费金额（元）"
              rules={[{ required: true }]}
            >
              <InputNumber style={{ width: "100%" }} />
            </Form.Item>
          )}
          <Form.Item name="reason" label="原因" rules={[{ required: true }]}>
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
