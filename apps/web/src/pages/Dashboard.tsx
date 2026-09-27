import { CalendarOutlined, CheckSquareOutlined, ClockCircleOutlined, FileTextOutlined, MessageOutlined, PlusOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons';
import { Avatar, Button, Checkbox, Empty, Progress, Space, Tag, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { StatCard } from '../components/StatCard';
import { TodoModal, type TodoValues } from '../components/TodoModal';
import type { Student } from '../types';

const priorityClass: Record<string, string> = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };
const avatarColors = ['#3b6fb6', '#17a673', '#7652b5', '#d97706', '#d04b5b'];
function studentAvatar(name: string) {
  const value = name.trim();
  const text = /^[A-Za-z]/.test(value) ? value.slice(0, 2).toUpperCase() : value.slice(-1) || '生';
  const color = avatarColors[Array.from(value).reduce((sum, char) => sum + (char.codePointAt(0) || 0), 0) % avatarColors.length];
  return { text, color };
}
export function Dashboard() {
  const navigate = useNavigate(), { user } = useAuth(), client = useQueryClient(), [todoOpen, setTodoOpen] = useState(false);
  const summary = useQuery({ queryKey: ['dashboard'], queryFn: async () => (await api.get('/dashboard/summary')).data.data });
  const students = useQuery({ queryKey: ['students', 'warnings'], queryFn: async () => (await api.get('/students', { params: { pageSize: 100 } })).data.data as Student[] });
  const lessons = useQuery({ queryKey: ['lessons', 'dashboard'], queryFn: async () => (await api.get('/lessons')).data.data as any[] });
  const todos = useQuery({ queryKey: ['todos', 'dashboard'], queryFn: async () => (await api.get('/todos', { params: { status: 'pending', scope: 'today', pageSize: 5 } })).data.data as any[] });
  const refreshTodos = () => { client.invalidateQueries({ queryKey: ['todos'] }); client.invalidateQueries({ queryKey: ['dashboard'] }); };
  const saveTodo = useMutation({ mutationFn: (values: TodoValues) => api.post('/todos', values), onSuccess: () => { message.success('待办已创建'); setTodoOpen(false); refreshTodos(); } });
  const completeTodo = useMutation({ mutationFn: (id: string) => api.patch(`/todos/${id}/completed`, { completed: true }), onSuccess: refreshTodos });
  const today = (lessons.data || []).filter(row => dayjs(row.startsAt).isSame(dayjs(), 'day')).slice(0, 5);
  const warnings = (students.data || []).filter(student => student.remainingHours <= 10).sort((a, b) => a.remainingHours - b.remainingHours).slice(0, 5);
  const s = summary.data || {}, pending = todos.data || [];
  const stats = [
    ['今日上课课时', s.lessonsToday ?? 0, '节', '今天已安排课程', <ClockCircleOutlined />], ['在读学生数', s.students ?? 0, '人', '当前负责学生', <TeamOutlined />],
    ['今日家校沟通', s.familyContactsToday ?? 0, '次', '来自家长会与回访记录', <MessageOutlined />], ['待处理事项', s.pendingTodos ?? pending.length, '项', '按优先级及时处理', <CheckSquareOutlined />],
    ['本月累计课时', s.lessonsThisMonth ?? 0, '节', '来自课程消耗记录', <CalendarOutlined />], ['本月新增学生', s.newStudentsThisMonth ?? 0, '人', '当前负责范围', <UserAddOutlined />],
    ['待填写反馈', s.pendingFeedback ?? 0, '项', '已结束但尚未反馈', <FileTextOutlined />], ['待跟进续费', s.pendingRenewals ?? 0, '项', '剩余课时与续费记录', <TeamOutlined />],
  ] as const;
  const processTask = (task: any) => { const path = task.relatedPath || '/dashboard'; navigate(`${path}${task.studentId ? `${path.includes('?') ? '&' : '?'}studentId=${task.studentId}` : ''}`); };
  return <div><div className="page-heading"><div><Typography.Title level={3}>工作台</Typography.Title><Typography.Text type="secondary">早上好，{user?.name || '老师'}！今天有 {s.lessonsToday ?? 0} 节课，{s.pendingTodos ?? pending.length} 项待办需要处理。</Typography.Text></div><Button type="primary" icon={<PlusOutlined />} onClick={() => setTodoOpen(true)}>新增待办</Button></div>
    <div className="stats-grid prototype-stats">{stats.map((item, index) => <StatCard key={index} label={item[0]} value={item[1]} suffix={item[2]} note={item[3]} icon={item[4]} />)}</div>
    <div className="dashboard-grid workbench-primary"><section className="panel"><div className="panel-title"><strong>今日待办</strong><Space><Button size="small" icon={<PlusOutlined />} onClick={() => setTodoOpen(true)}>新增</Button><Button type="link" size="small" onClick={() => navigate('/todos')}>查看全部</Button></Space></div><div className="todo-list">{pending.length ? pending.map(task => <div className="todo-row" key={task.id}><i className={`priority-dot ${priorityClass[task.priority]}`} /><Checkbox checked={false} onChange={() => completeTodo.mutate(task.id)} /><div><b>{task.title}</b><span><Tag>{task.category}</Tag>{dayjs(task.dueAt).isSame(dayjs(), 'day') ? dayjs(task.dueAt).format('今天 HH:mm 前') : dayjs(task.dueAt).format('MM-DD HH:mm')}{task.student && ` · ${task.student.name}`}</span></div><Button type="link" size="small" onClick={() => processTask(task)}>处理</Button></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今天的待办已处理完" />}</div></section>
      <section className="panel"><div className="panel-title"><strong>今日课程</strong><Button type="link" size="small" onClick={() => navigate('/courses')}>全部课表</Button></div><div className="course-list">{today.length ? today.map(row => <div className="course-row" key={row.id}><div className="course-time">{dayjs(row.startsAt).format('HH:mm')}</div><div><b>{row.student.name} · {row.course.subject}</b><span>{row.course.teacherName || row.course.teacher?.name || '-'} · {row.course.name}</span></div><Tag color={row.status === 'COMPLETED' ? 'success' : 'processing'}>{row.status === 'COMPLETED' ? '已结束' : '待上课'}</Tag></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今日暂无课程" />}</div></section></div>
    <div className="dashboard-grid lower"><section className="panel"><div className="panel-title"><strong>快捷操作</strong></div><div className="quick-grid">{[[<UserAddOutlined />, '新增学生', '/students?create=1'], [<FileTextOutlined />, '课后反馈', '/courses?focus=feedback'], [<MessageOutlined />, '家校回访', '/parent-meetings'], [<FileTextOutlined />, '学情报告', '/learning-reports']].map(item => <button key={item[1] as string} onClick={() => navigate(item[2] as string)}>{item[0]}<span>{item[1]}</span></button>)}</div></section>
      <section className="panel"><div className="panel-title"><strong>课时预警</strong><Tag color="warning">{warnings.length} 人不足 10 课时</Tag></div>{warnings.length ? warnings.map(student => { const avatar = studentAvatar(student.name); return <div className="warning-row" key={student.id}><Avatar className="warning-avatar" style={{ backgroundColor: avatar.color }}>{avatar.text}</Avatar><div><b>{student.name} · {student.grade}</b><span>{student.subjects.join('、') || '暂未配置科目'} · 剩余 {student.remainingHours} 课时</span></div><div><Progress percent={Math.round(student.remainingHours / Math.max(student.totalHours, 1) * 100)} showInfo={false} size="small" strokeColor="#f0a43c" /><Button type="link" size="small" onClick={() => navigate(`/renewals?studentId=${student.id}`)}>续课</Button></div></div>; }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无课时预警" />}</section></div>
    <TodoModal open={todoOpen} students={students.data || []} loading={saveTodo.isPending} onCancel={() => setTodoOpen(false)} onSubmit={values => saveTodo.mutate(values)} />
  </div>;
}
