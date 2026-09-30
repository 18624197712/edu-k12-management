import {
  CheckCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import type {
  EnrollmentCalculation,
  EnrollmentQuoteInput,
  EnrollmentRecord,
  EnrollmentType,
} from "@edu/shared";
import { gradeOptions } from "@edu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  message,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { Heading, useStudents } from "./shared";

type QuoteFormValues = Omit<
  EnrollmentQuoteInput,
  "projectionStart" | "followUpAt"
> & {
  projectionStart: Dayjs;
  followUpAt?: Dayjs;
};

type ConfirmValues = {
  bindingMode?: "create" | "existing";
  studentId?: string;
  name?: string;
  grade?: string;
  phone?: string;
  school?: string;
};

type ConfirmTarget =
  | {
      kind: "draft";
      values: QuoteFormValues;
      calculation: EnrollmentCalculation;
    }
  | { kind: "record"; record: EnrollmentRecord };

const emptyActivities = () =>
  Array.from({ length: 3 }, () => ({ amount: 0, hours: 0 }));

const statusLabels: Record<string, { text: string; color: string }> = {
  PENDING: { text: "待确认", color: "warning" },
  COMPLETED: { text: "已入账", color: "success" },
  CANCELLED: { text: "已取消", color: "default" },
};

function toPayload(values: QuoteFormValues): EnrollmentQuoteInput {
  return {
    ...values,
    prospectName: values.prospectName?.trim(),
    prospectPhone: values.prospectPhone?.trim(),
    price: Number(values.price || 0),
    normalHours: Number(values.normalHours || 0),
    halfHours: Number(values.halfHours || 0),
    giftHours: Number(values.giftHours || 0),
    activities: (values.activities || []).map((row) => ({
      amount: Number(row.amount || 0),
      hours: Number(row.hours || 0),
    })),
    weeklyFrequency: Number(values.weeklyFrequency || 0),
    sessionHours: Number(values.sessionHours || 0),
    projectionStart: values.projectionStart.format("YYYY-MM-DD"),
    followUpAt: values.followUpAt?.toISOString(),
  };
}

function errorMessage(error: any) {
  const value = error?.response?.data?.error?.message;
  return Array.isArray(value)
    ? value.join("；")
    : value || "操作失败，请稍后重试";
}

function dateText(value?: string | null) {
  return value ? dayjs(value).format("YYYY年MM月DD日") : "--";
}

export function RenewalPage() {
  const [params] = useSearchParams();
  const initialStudentId = params.get("studentId") || undefined;
  const initialType: EnrollmentType = initialStudentId
    ? "RENEWAL"
    : "FIRST_ENROLLMENT";
  const [form] = Form.useForm<QuoteFormValues>();
  const [confirmForm] = Form.useForm<ConfirmValues>();
  const [editingId, setEditingId] = useState<string>();
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>();
  const [recordType, setRecordType] = useState<EnrollmentType>();
  const [recordStatus, setRecordStatus] = useState<string>();
  const [recordSearch, setRecordSearch] = useState("");
  const client = useQueryClient();
  const students = useStudents();
  const watched = Form.useWatch([], form) as QuoteFormValues | undefined;
  const type = Form.useWatch("type", form) || initialType;
  const selectedStudentId = Form.useWatch("studentId", form);
  const selectedStudent = students.data?.find(
    (student) => student.id === selectedStudentId,
  );

  const draftPayload = useMemo(() => {
    if (!watched?.projectionStart) return undefined;
    return toPayload(watched);
  }, [watched]);
  const draftHours = draftPayload
    ? draftPayload.normalHours +
      draftPayload.halfHours +
      draftPayload.giftHours +
      draftPayload.activities.reduce((sum, row) => sum + row.hours, 0)
    : 0;
  const canCalculate = Boolean(
    draftPayload &&
    draftHours > 0 &&
    draftPayload.weeklyFrequency > 0 &&
    draftPayload.sessionHours > 0 &&
    (draftPayload.type === "FIRST_ENROLLMENT"
      ? draftPayload.prospectName
      : draftPayload.studentId),
  );

  const calculation = useQuery({
    queryKey: ["enrollment-calculation", draftPayload],
    queryFn: async () =>
      (await api.post("/renewals/calculate", draftPayload)).data
        .data as EnrollmentCalculation,
    enabled: canCalculate,
    retry: false,
  });
  const records = useQuery({
    queryKey: ["renewals", recordType, recordStatus, recordSearch],
    queryFn: async () =>
      (
        await api.get("/renewals", {
          params: {
            type: recordType,
            status: recordStatus,
            q: recordSearch || undefined,
          },
        })
      ).data.data as EnrollmentRecord[],
  });

  const refreshBusinessData = async (studentId?: string) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["renewals"] }),
      client.invalidateQueries({ queryKey: ["students"] }),
      client.invalidateQueries({ queryKey: ["dashboard"] }),
      studentId
        ? client.invalidateQueries({ queryKey: ["student", studentId] })
        : Promise.resolve(),
      studentId
        ? client.invalidateQueries({ queryKey: ["hour-ledgers", studentId] })
        : Promise.resolve(),
    ]);
  };

  const saveQuote = useMutation({
    mutationFn: async ({
      values,
      id,
    }: {
      values: QuoteFormValues;
      id?: string;
    }) => {
      const payload = toPayload(values);
      return id
        ? ((await api.patch(`/renewals/${id}`, payload)).data
            .data as EnrollmentRecord)
        : ((await api.post("/renewals", payload)).data
            .data as EnrollmentRecord);
    },
    onSuccess: async () => {
      message.success(editingId ? "报价已更新" : "待确认报价已保存");
      setEditingId(undefined);
      await client.invalidateQueries({ queryKey: ["renewals"] });
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const cancelQuote = useMutation({
    mutationFn: (id: string) => api.post(`/renewals/${id}/cancel`),
    onSuccess: async () => {
      message.success("报价已取消");
      await client.invalidateQueries({ queryKey: ["renewals"] });
    },
    onError: (error) => message.error(errorMessage(error)),
  });
  const deleteQuote = useMutation({
    mutationFn: (id: string) => api.delete(`/renewals/${id}`),
    onSuccess: async () => {
      message.success("报价记录已删除");
      await client.invalidateQueries({ queryKey: ["renewals"] });
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const resetForm = (nextType: EnrollmentType = type) => {
    setEditingId(undefined);
    form.resetFields();
    form.setFieldsValue({
      type: nextType,
      studentId: nextType === "RENEWAL" ? initialStudentId : undefined,
      prospectName: undefined,
      prospectPhone: undefined,
      price: 0,
      normalHours: 0,
      halfHours: 0,
      giftHours: 0,
      giftType: "首到首签赠课",
      activities: emptyActivities(),
      weeklyFrequency: 2,
      sessionHours: 2,
      projectionStart: dayjs(),
      followUpAt: undefined,
    });
  };

  const openConfirmation = async () => {
    try {
      const values = await form.validateFields();
      if (!calculation.data?.totalHours)
        return message.warning("请先填写有效的新增课时方案");
      setConfirmTarget({
        kind: "draft",
        values,
        calculation: calculation.data,
      });
      confirmForm.resetFields();
      if (values.type === "FIRST_ENROLLMENT")
        confirmForm.setFieldsValue({
          bindingMode: "create",
          name: values.prospectName,
          phone: values.prospectPhone,
        });
    } catch {
      // Ant Design highlights the fields that still need attention.
    }
  };

  const openRecordConfirmation = (record: EnrollmentRecord) => {
    setConfirmTarget({ kind: "record", record });
    confirmForm.resetFields();
    if (record.type === "FIRST_ENROLLMENT" && !record.studentId)
      confirmForm.setFieldsValue({
        bindingMode: "create",
        name: record.prospectName,
        phone: record.prospectPhone,
      });
  };

  const confirmPayment = useMutation({
    mutationFn: async (values: ConfirmValues) => {
      if (!confirmTarget) throw new Error("未选择报价");
      let record: EnrollmentRecord;
      if (confirmTarget.kind === "draft") {
        record = editingId
          ? (
              await api.patch(
                `/renewals/${editingId}`,
                toPayload(confirmTarget.values),
              )
            ).data.data
          : (await api.post("/renewals", toPayload(confirmTarget.values))).data
              .data;
      } else {
        record = confirmTarget.record;
      }
      const requiresStudentBinding =
        record.type === "FIRST_ENROLLMENT" && !record.studentId;
      const body = !requiresStudentBinding
        ? {}
        : values.bindingMode === "existing"
          ? { studentId: values.studentId }
          : {
              createStudent: {
                name: values.name,
                grade: values.grade,
                phone: values.phone,
                school: values.school,
              },
            };
      return (await api.post(`/renewals/${record.id}/confirm`, body)).data
        .data as EnrollmentRecord;
    },
    onSuccess: async (record) => {
      message.success(
        `${record.type === "FIRST_ENROLLMENT" ? "首次报读" : "续费"}已入账，增加 ${record.totalHours} 课时`,
      );
      setConfirmTarget(undefined);
      confirmForm.resetFields();
      resetForm(type);
      await refreshBusinessData(record.studentId);
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const editRecord = (record: EnrollmentRecord) => {
    setEditingId(record.id);
    form.setFieldsValue({
      type: record.type,
      studentId: record.studentId,
      prospectName: record.prospectName,
      prospectPhone: record.prospectPhone,
      price: record.unitPrice,
      normalHours: record.normalHours,
      halfHours: record.halfHours,
      giftHours: record.giftHours,
      giftType: record.giftType,
      activities: [...record.activities, ...emptyActivities()].slice(0, 3),
      weeklyFrequency: record.weeklyFrequency,
      sessionHours: record.sessionHours,
      projectionStart: dayjs(record.projectionStart),
      followUpAt: record.followUpAt ? dayjs(record.followUpAt) : undefined,
    });
    document
      .querySelector(".page-heading")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  const targetRecord =
    confirmTarget?.kind === "record" ? confirmTarget.record : undefined;
  const targetType =
    confirmTarget?.kind === "draft"
      ? confirmTarget.values.type
      : targetRecord?.type;
  const targetCalculation =
    confirmTarget?.kind === "draft" ? confirmTarget.calculation : targetRecord;
  const needsBinding =
    targetType === "FIRST_ENROLLMENT" &&
    !(confirmTarget?.kind === "draft"
      ? confirmTarget.values.studentId
      : targetRecord?.studentId);
  const bindingMode = Form.useWatch("bindingMode", confirmForm) || "create";

  return (
    <>
      <Heading
        title="报名与续费"
        desc="首次报读估价、续费报价、共享课时入账与使用周期规划"
        extra={
          <Button icon={<PlusOutlined />} onClick={() => resetForm(type)}>
            新建报价
          </Button>
        }
      />
      <section className="panel enrollment-mode-panel">
        <div>
          <strong>{editingId ? "编辑待确认报价" : "创建报价方案"}</strong>
          <span>估价和保存报价不会改变学生课时，确认收款后才正式入账。</span>
        </div>
        <Segmented<EnrollmentType>
          value={type}
          options={[
            { label: "首次报读", value: "FIRST_ENROLLMENT" },
            { label: "续费补充", value: "RENEWAL" },
          ]}
          onChange={(value) => resetForm(value)}
        />
      </section>

      <Form<QuoteFormValues>
        form={form}
        layout="vertical"
        className="enrollment-workspace"
        initialValues={{
          type: initialType,
          studentId: initialStudentId,
          price: 0,
          normalHours: 0,
          halfHours: 0,
          giftHours: 0,
          giftType: "首到首签赠课",
          activities: emptyActivities(),
          weeklyFrequency: 2,
          sessionHours: 2,
          projectionStart: dayjs(),
        }}
        onFinish={(values) => saveQuote.mutate({ values, id: editingId })}
      >
        <Form.Item name="type" hidden>
          <Input />
        </Form.Item>
        <section className="panel enrollment-form-panel">
          <div className="panel-title">
            <strong>
              {type === "FIRST_ENROLLMENT"
                ? "首次报读信息"
                : "续费学生与价格方案"}
            </strong>
          </div>
          {type === "FIRST_ENROLLMENT" ? (
            <div className="form-row">
              <Form.Item
                name="prospectName"
                label="学生姓名"
                rules={[{ required: true, message: "请输入学生姓名" }]}
              >
                <Input placeholder="尚未建档也可以先估价" />
              </Form.Item>
              <Form.Item name="prospectPhone" label="联系电话">
                <Input placeholder="家长或联系人电话" />
              </Form.Item>
            </div>
          ) : (
            <Form.Item
              name="studentId"
              label="选择学生"
              rules={[{ required: true, message: "请选择续费学生" }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="搜索并选择学生"
                options={(students.data || []).map((student) => ({
                  value: student.id,
                  label: `${student.name}（${student.grade}，剩余 ${student.remainingHours} 课时）`,
                }))}
              />
            </Form.Item>
          )}

          <Form.Item
            name="price"
            label="原价单价（元/课时）"
            rules={[
              { required: true, message: "请输入原价单价" },
              { type: "number", min: 0 },
            ]}
          >
            <InputNumber
              prefix="¥"
              precision={2}
              min={0}
              style={{ width: "100%" }}
              placeholder="例如 185"
            />
          </Form.Item>
          <div className="quote-section-title">课时构成</div>
          <div className="form-row three">
            <Form.Item
              name="normalHours"
              label="正价课时"
              rules={[{ type: "number", min: 0 }]}
            >
              <InputNumber
                min={0}
                precision={2}
                suffix="课时"
                style={{ width: "100%" }}
              />
            </Form.Item>
            <Form.Item
              name="halfHours"
              label="半价课时"
              rules={[{ type: "number", min: 0 }]}
            >
              <InputNumber
                min={0}
                precision={2}
                suffix="课时"
                style={{ width: "100%" }}
              />
            </Form.Item>
            <Form.Item
              name="giftHours"
              label="赠送课时"
              rules={[{ type: "number", min: 0 }]}
            >
              <InputNumber
                min={0}
                precision={2}
                suffix="课时"
                style={{ width: "100%" }}
              />
            </Form.Item>
          </div>
          <Form.Item name="giftType" label="赠课类型">
            <Select
              allowClear
              options={["首到首签赠课", "推荐学生赠课", "活动赠课", "其他"].map(
                (value) => ({ value, label: value }),
              )}
            />
          </Form.Item>
          <div className="quote-section-title">活动课</div>
          <Form.List name="activities">
            {(fields) =>
              fields.map((field, index) => (
                <div className="activity-row" key={field.key}>
                  <span>活动{["一", "二", "三"][index]}</span>
                  <Form.Item name={[field.name, "amount"]} noStyle>
                    <InputNumber
                      min={0}
                      precision={2}
                      prefix="¥"
                      placeholder="活动金额"
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                  <Form.Item name={[field.name, "hours"]} noStyle>
                    <InputNumber
                      min={0}
                      precision={2}
                      suffix="课时"
                      placeholder="包含课时"
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                </div>
              ))
            }
          </Form.List>
          <div className="quote-section-title">课时周期预测</div>
          <div className="form-row three">
            <Form.Item
              name="projectionStart"
              label="起算日期"
              rules={[{ required: true }]}
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              name="weeklyFrequency"
              label="每周上课次数"
              rules={[{ required: true }, { type: "integer", min: 1 }]}
            >
              <InputNumber
                min={1}
                precision={0}
                suffix="次/周"
                style={{ width: "100%" }}
              />
            </Form.Item>
            <Form.Item
              name="sessionHours"
              label="每次消耗课时"
              rules={[{ required: true }, { type: "number", min: 0.25 }]}
            >
              <InputNumber
                min={0.25}
                step={0.5}
                precision={2}
                suffix="课时"
                style={{ width: "100%" }}
              />
            </Form.Item>
          </div>
          <Form.Item name="followUpAt" label="跟进时间（选填）">
            <DatePicker showTime style={{ width: "100%" }} />
          </Form.Item>
          <Space wrap className="quote-actions">
            <Button
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={saveQuote.isPending}
            >
              {editingId ? "保存修改" : "保存待确认报价"}
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              disabled={!calculation.data?.totalHours}
              onClick={openConfirmation}
            >
              确认收款并入账
            </Button>
            {editingId && (
              <Button icon={<CloseOutlined />} onClick={() => resetForm(type)}>
                退出编辑
              </Button>
            )}
          </Space>
        </section>

        <section className="panel enrollment-result-panel">
          <div className="panel-title">
            <strong>价格与课时预估</strong>
            <Tag color="blue">全科共享课时</Tag>
          </div>
          {selectedStudent && type === "RENEWAL" && (
            <div className="selected-student-summary">
              <div>
                <b>{selectedStudent.name}</b>
                <span>
                  {selectedStudent.grade} ·{" "}
                  {selectedStudent.subjects.join("、") || "暂未配置科目"}
                </span>
              </div>
              <strong>
                {selectedStudent.remainingHours}
                <small> 剩余课时</small>
              </strong>
            </div>
          )}
          {calculation.isError && (
            <Alert
              type="error"
              showIcon
              message={errorMessage(calculation.error)}
            />
          )}
          {calculation.data ? (
            <>
              <div className="discount-comparison">
                <div>
                  <span>折前原价</span>
                  <del>¥{calculation.data.originalAmount.toLocaleString()}</del>
                </div>
                <i>→</i>
                <div>
                  <span>优惠后实付</span>
                  <b>¥{calculation.data.paid.toLocaleString()}</b>
                </div>
                <div className="discount-saving">
                  <strong>{calculation.data.discountRate} 折</strong>
                  <small>
                    {calculation.data.savedAmount >= 0
                      ? `比原价节省 ¥${calculation.data.savedAmount.toLocaleString()}`
                      : `比原价高 ¥${Math.abs(calculation.data.savedAmount).toLocaleString()}`}
                  </small>
                </div>
              </div>
              <div className="price-summary compact">
                <div>
                  <span>本次新增</span>
                  <b>+{calculation.data.totalHours} 课时</b>
                </div>
                <div>
                  <span>平均单价</span>
                  <b>¥{calculation.data.averagePrice}</b>
                </div>
              </div>
              <div className="balance-flow">
                <div>
                  <span>当前剩余</span>
                  <b>{calculation.data.balanceBefore}</b>
                  <small>课时</small>
                </div>
                <i>+</i>
                <div>
                  <span>本次增加</span>
                  <b>{calculation.data.totalHours}</b>
                  <small>课时</small>
                </div>
                <i>=</i>
                <div className="highlight">
                  <span>入账后剩余</span>
                  <b>{calculation.data.balanceAfter}</b>
                  <small>课时</small>
                </div>
              </div>
              <div className="projection-list">
                <div>
                  <span>每周预计消耗</span>
                  <b>{calculation.data.weeklyConsumption} 课时</b>
                </div>
                <div>
                  <span>当前余额预计使用</span>
                  <b>{calculation.data.currentWeeks} 周</b>
                </div>
                <div>
                  <span>当前预计结束日期</span>
                  <b>{dateText(calculation.data.currentEstimatedEndAt)}</b>
                </div>
                <div className="emphasis">
                  <span>补充后预计使用</span>
                  <b>{calculation.data.projectedWeeks} 周</b>
                </div>
                <div className="emphasis">
                  <span>补充后预计结束日期</span>
                  <b>{dateText(calculation.data.estimatedEndAt)}</b>
                </div>
              </div>
              <Alert
                type="info"
                showIcon
                message="预计日期仅用于课时规划，不会自动生成未来课程。"
              />
            </>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                type === "RENEWAL"
                  ? "选择学生并填写课时方案后显示预测结果"
                  : "填写学生姓名和课时方案后显示预测结果"
              }
            />
          )}
        </section>
      </Form>

      <section className="panel enrollment-records">
        <div className="panel-title">
          <strong>报价与入账记录</strong>
          <span>待确认报价可以继续编辑、取消或确认收款</span>
        </div>
        <div className="toolbar">
          <Select
            allowClear
            value={recordType}
            onChange={setRecordType}
            placeholder="全部业务类型"
            options={[
              { value: "FIRST_ENROLLMENT", label: "首次报读" },
              { value: "RENEWAL", label: "续费补充" },
            ]}
          />
          <Select
            allowClear
            value={recordStatus}
            onChange={setRecordStatus}
            placeholder="全部状态"
            options={[
              { value: "PENDING", label: "待确认" },
              { value: "COMPLETED", label: "已入账" },
              { value: "CANCELLED", label: "已取消" },
            ]}
          />
          <Input.Search
            allowClear
            placeholder="搜索学生姓名或电话"
            onSearch={setRecordSearch}
            style={{ width: 240 }}
          />
        </div>
        <Table<EnrollmentRecord>
          rowKey="id"
          loading={records.isLoading}
          dataSource={records.data || []}
          scroll={{ x: 980 }}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: "暂无报价或入账记录" }}
          columns={[
            {
              title: "业务类型",
              dataIndex: "type",
              width: 105,
              render: (value) => (
                <Tag color={value === "FIRST_ENROLLMENT" ? "blue" : "purple"}>
                  {value === "FIRST_ENROLLMENT" ? "首次报读" : "续费补充"}
                </Tag>
              ),
            },
            {
              title: "学生/意向学生",
              width: 155,
              render: (_, row) => (
                <div>
                  <b>{row.student?.name || row.prospectName || "-"}</b>
                  <div className="table-secondary">
                    {row.student?.grade || row.prospectPhone || "未建档"}
                  </div>
                </div>
              ),
            },
            {
              title: "报价方案",
              width: 175,
              render: (_, row) => (
                <div>
                  <b>
                    ¥{row.originalAmount.toLocaleString()} → ¥
                    {row.paid.toLocaleString()}
                  </b>
                  <div className="table-secondary">
                    {row.discountRate} 折 · 增加 {row.totalHours} 课时
                  </div>
                </div>
              ),
            },
            {
              title: "课时余额",
              width: 145,
              render: (_, row) =>
                `${row.balanceBefore} → ${row.balanceAfter} 课时`,
            },
            {
              title: "补充后预计结束",
              dataIndex: "estimatedEndAt",
              width: 150,
              render: dateText,
            },
            {
              title: "状态",
              dataIndex: "status",
              width: 90,
              render: (value) => (
                <Tag color={statusLabels[value]?.color}>
                  {statusLabels[value]?.text || value}
                </Tag>
              ),
            },
            {
              title: "创建时间",
              dataIndex: "createdAt",
              width: 145,
              render: (value) => dayjs(value).format("YYYY-MM-DD HH:mm"),
            },
            {
              title: "操作",
              fixed: "right",
              width: 260,
              render: (_, row) =>
                row.status === "PENDING" ? (
                  <Space size={4}>
                    <Button
                      type="link"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => editRecord(row)}
                    >
                      编辑
                    </Button>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => openRecordConfirmation(row)}
                    >
                      确认收款
                    </Button>
                    <Popconfirm
                      title="确认取消这份报价？"
                      onConfirm={() => cancelQuote.mutate(row.id)}
                    >
                      <Button type="link" danger size="small">
                        取消
                      </Button>
                    </Popconfirm>
                    <Popconfirm
                      title="确认彻底删除这份报价？"
                      description="删除后无法恢复；已入账记录不允许删除。"
                      onConfirm={() => deleteQuote.mutate(row.id)}
                    >
                      <Button
                        type="link"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                      >
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                ) : row.status === "CANCELLED" ? (
                  <Popconfirm
                    title="确认删除已取消报价？"
                    onConfirm={() => deleteQuote.mutate(row.id)}
                  >
                    <Button
                      type="link"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                    >
                      删除
                    </Button>
                  </Popconfirm>
                ) : (
                  <span className="table-secondary">
                    {row.confirmedAt
                      ? `确认于 ${dayjs(row.confirmedAt).format("MM-DD HH:mm")}`
                      : "-"}
                  </span>
                ),
            },
          ]}
        />
      </section>

      <Modal
        title="确认收款并增加共享课时"
        open={!!confirmTarget}
        onCancel={() => setConfirmTarget(undefined)}
        onOk={() => confirmForm.submit()}
        okText="确认收款并入账"
        confirmLoading={confirmPayment.isPending}
        width={620}
      >
        {targetCalculation && (
          <>
            <div className="confirm-summary">
              <div>
                <span>折前原价</span>
                <b>¥{targetCalculation.originalAmount.toLocaleString()}</b>
              </div>
              <div>
                <span>优惠后实付</span>
                <b>¥{targetCalculation.paid.toLocaleString()}</b>
              </div>
              <div>
                <span>综合折扣</span>
                <b>{targetCalculation.discountRate} 折</b>
              </div>
            </div>
            <div className="confirm-inline-hours">
              本次增加 {targetCalculation.totalHours} 课时，入账后余额{" "}
              {targetCalculation.balanceAfter} 课时
            </div>
          </>
        )}
        <Alert
          className="confirm-warning"
          type="warning"
          showIcon
          message="确认后将立即增加学生的报读总课时和剩余课时，不能重复确认。"
        />
        <Form<ConfirmValues>
          form={confirmForm}
          layout="vertical"
          onFinish={(values) => confirmPayment.mutate(values)}
        >
          {needsBinding && (
            <>
              <Form.Item
                name="bindingMode"
                label="学生处理方式"
                initialValue="create"
              >
                <Segmented
                  block
                  options={[
                    { label: "创建新学生", value: "create" },
                    { label: "绑定已有学生", value: "existing" },
                  ]}
                />
              </Form.Item>
              {bindingMode === "existing" ? (
                <Form.Item
                  name="studentId"
                  label="选择已有学生"
                  rules={[{ required: true, message: "请选择学生" }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={(students.data || []).map((student) => ({
                      value: student.id,
                      label: `${student.name}（${student.grade}）`,
                    }))}
                  />
                </Form.Item>
              ) : (
                <>
                  <div className="form-row">
                    <Form.Item
                      name="name"
                      label="学生姓名"
                      rules={[{ required: true, message: "请输入学生姓名" }]}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="grade"
                      label="年级"
                      rules={[{ required: true, message: "请选择年级" }]}
                    >
                      <Select
                        showSearch
                        options={gradeOptions.map((value) => ({
                          value,
                          label: value,
                        }))}
                      />
                    </Form.Item>
                  </div>
                  <div className="form-row">
                    <Form.Item name="phone" label="联系电话">
                      <Input />
                    </Form.Item>
                    <Form.Item name="school" label="就读学校">
                      <Input placeholder="可稍后在档案中补充" />
                    </Form.Item>
                  </div>
                </>
              )}
            </>
          )}
        </Form>
      </Modal>
    </>
  );
}
