import { DatePicker, Form, Input, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import type { Student } from '../types';

export type TodoValues = { title: string; category: string; priority: 'LOW' | 'MEDIUM' | 'HIGH'; dueAt: string; studentId?: string; relatedPath?: string };
const categoryPaths: Record<string, string> = { 课程相关: '/courses', 家校工作: '/parent-meetings', 学生管理: '/students', 教务工作: '/learning-reports', 续费跟进: '/renewals', 其他: '/dashboard' };

export function TodoModal({ open, students, initial, loading, onCancel, onSubmit }: { open: boolean; students: Student[]; initial?: any; loading?: boolean; onCancel: () => void; onSubmit: (values: TodoValues) => void }) {
  const [form] = Form.useForm();
  useEffect(() => { if (open) form.setFieldsValue(initial ? { ...initial, dueAt: dayjs(initial.dueAt) } : { title: '', studentId: undefined, category: '课程相关', priority: 'MEDIUM', dueAt: dayjs().hour(18).minute(0).second(0) }); }, [form, initial, open]);
  return <Modal title={initial ? '编辑待办' : '新增待办'} open={open} onCancel={onCancel} onOk={() => form.submit()} confirmLoading={loading} destroyOnHidden>
    <Form form={form} layout="vertical" onFinish={(values) => onSubmit({ ...values, dueAt: values.dueAt.toISOString(), relatedPath: values.relatedPath || categoryPaths[values.category] })}>
      <Form.Item name="title" label="待办事项" rules={[{ required: true, message: '请输入待办事项' }]}><Input maxLength={80} placeholder="例如：回复家长的续费咨询" /></Form.Item>
      <div className="form-row"><Form.Item name="category" label="分类" rules={[{ required: true }]}><Select options={Object.keys(categoryPaths).map(value => ({ value, label: value }))} /></Form.Item><Form.Item name="priority" label="优先级" rules={[{ required: true }]}><Select options={[{ value: 'HIGH', label: '高' }, { value: 'MEDIUM', label: '中' }, { value: 'LOW', label: '低' }]} /></Form.Item></div>
      <Form.Item name="studentId" label="关联学生（选填）"><Select allowClear showSearch optionFilterProp="label" options={students.map(student => ({ value: student.id, label: `${student.name} · ${student.grade}` }))} /></Form.Item>
      <Form.Item name="dueAt" label="截止时间" rules={[{ required: true }]}><DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} /></Form.Item>
    </Form>
  </Modal>;
}
