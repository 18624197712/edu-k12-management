import { CheckCircleOutlined, DeleteOutlined, EditOutlined, PlusOutlined, RollbackOutlined } from '@ant-design/icons';
import { Button, Popconfirm, Segmented, Space, Table, Tag, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api } from '../api';
import { TodoModal, type TodoValues } from '../components/TodoModal';
import { Heading, useStudents } from './domains/shared';

const priorities = { HIGH: ['高', 'error'], MEDIUM: ['中', 'warning'], LOW: ['低', 'default'] } as const;
export function Todos() {
  const [status, setStatus] = useState('pending'), [editing, setEditing] = useState<any>(), [open, setOpen] = useState(false), client = useQueryClient(), students = useStudents();
  const tasks = useQuery({ queryKey: ['todos', status], queryFn: async () => (await api.get('/todos', { params: { status, pageSize: 100 } })).data.data as any[] });
  const refresh = () => { client.invalidateQueries({ queryKey: ['todos'] }); client.invalidateQueries({ queryKey: ['dashboard'] }); };
  const save = useMutation({ mutationFn: (values: TodoValues) => editing ? api.patch(`/todos/${editing.id}`, values) : api.post('/todos', values), onSuccess: () => { message.success(editing ? '待办已更新' : '待办已创建'); setOpen(false); setEditing(undefined); refresh(); } });
  const complete = useMutation({ mutationFn: ({ id, completed }: { id: string; completed: boolean }) => api.patch(`/todos/${id}/completed`, { completed }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/todos/${id}`), onSuccess: () => { message.success('待办已删除'); refresh(); }, onError: () => message.error('待办删除失败') });
  return <><Heading title="待办任务" desc="集中管理今天和后续需要处理的班主任工作" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setOpen(true); }}>新增待办</Button>} /><section className="panel"><div className="panel-title"><strong>我的待办</strong><Segmented value={status} onChange={value => setStatus(String(value))} options={[{ value: 'pending', label: '待处理' }, { value: 'completed', label: '已完成' }, { value: 'all', label: '全部' }]} /></div><Table rowKey="id" loading={tasks.isLoading} dataSource={tasks.data || []} pagination={{ pageSize: 10 }} columns={[
    { title: '事项', dataIndex: 'title', render: (value, row) => <div className={row.completedAt ? 'task-finished' : ''}><b>{value}</b>{row.student && <span className="table-sub">关联：{row.student.name}</span>}</div> },
    { title: '分类', dataIndex: 'category', width: 120, render: value => <Tag>{value}</Tag> },
    { title: '优先级', dataIndex: 'priority', width: 90, render: value => <Tag color={priorities[value as keyof typeof priorities]?.[1]}>{priorities[value as keyof typeof priorities]?.[0]}</Tag> },
    { title: '截止时间', dataIndex: 'dueAt', width: 170, render: value => dayjs(value).format('YYYY-MM-DD HH:mm') },
    { title: '状态', width: 90, render: (_, row) => <Tag color={row.completedAt ? 'success' : 'processing'}>{row.completedAt ? '已完成' : '待处理'}</Tag> },
    { title: '操作', width: 220, render: (_, row) => <Space>{row.completedAt ? <Button type="link" icon={<RollbackOutlined />} onClick={() => complete.mutate({ id: row.id, completed: false })}>恢复</Button> : <Button type="link" icon={<CheckCircleOutlined />} onClick={() => complete.mutate({ id: row.id, completed: true })}>完成</Button>}<Button type="link" icon={<EditOutlined />} onClick={() => { setEditing(row); setOpen(true); }}>编辑</Button><Popconfirm title="确认删除这条待办？" description="删除后无法恢复。" okText="确认删除" cancelText="取消" onConfirm={() => remove.mutate(row.id)}><Button danger type="link" icon={<DeleteOutlined />}>删除</Button></Popconfirm></Space> },
  ]} /></section><TodoModal open={open} students={students.data || []} initial={editing} loading={save.isPending} onCancel={() => { setOpen(false); setEditing(undefined); }} onSubmit={values => save.mutate(values)} /></>;
}
