import { DeleteOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { Button, DatePicker, Empty, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { subjectOptions, subjectsForGrade } from '@edu/shared';
import { api } from '../api';
import type { Student } from '../types';

export function useScoreBatches(studentId?: string) {
  return useQuery({ queryKey: ['score-batches', studentId], queryFn: async () => (await api.get('/score-batches', { params: { studentId } })).data.data as any[], enabled: !!studentId });
}

export function ScoreSummary({ student, editable = false }: { student: Student; editable?: boolean }) {
  const batches = useScoreBatches(student.id), [open, setOpen] = useState(false);
  const rows = useMemo(() => student.subjects.map(subject => {
    const scores = (batches.data || []).flatMap(batch => batch.scores.map((score: any) => ({ ...score, batch }))).filter((score: any) => score.subject === subject).sort((a: any, b: any) => +new Date(a.batch.examDate) - +new Date(b.batch.examDate));
    const entrance = scores.find((score: any) => score.batch.type === 'ENTRANCE') || scores[0], latest = scores.at(-1);
    return { subject, entrance: entrance ? Number(entrance.score) : undefined, latest: latest ? Number(latest.score) : undefined, delta: entrance && latest ? Number(latest.score) - Number(entrance.score) : undefined };
  }), [batches.data, student.subjects]);
  return <><div className="score-summary-head"><span>成绩来自学生成绩台账，修改后自动同步</span>{editable && <Button size="small" type="primary" onClick={() => setOpen(true)}>编辑成绩</Button>}</div>{rows.length ? <div className="score-strip synced">{rows.map(row => <div key={row.subject}><span>{row.subject}</span><b>{row.latest ?? '—'}</b><small>入学 {row.entrance ?? '—'} {row.delta !== undefined && <em className={row.delta >= 0 ? 'up' : 'down'}>{row.delta >= 0 ? '+' : ''}{row.delta}</em>}</small></div>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂未配置科目，可在编辑档案中添加" />}{editable && <Modal width={860} title={`${student.name} · 编辑成绩`} open={open} onCancel={() => setOpen(false)} footer={null} destroyOnHidden><ScoreWorkspace student={student} /></Modal>}</>;
}

export function ScoreWorkspace({ student }: { student: Student }) {
  const batches = useScoreBatches(student.id), client = useQueryClient(), [batchId, setBatchId] = useState<string>(), [values, setValues] = useState<Record<string, number>>({}), [batchOpen, setBatchOpen] = useState(false), [batchForm] = Form.useForm(), [custom, setCustom] = useState('');
  useEffect(() => { if (!batchId && batches.data?.length) setBatchId(batches.data[0].id); }, [batchId, batches.data]);
  const batch = batches.data?.find(item => item.id === batchId), current = useMemo(() => Object.fromEntries((batch?.scores || []).map((score: any) => [score.subject, Number(score.score)])), [batch]);
  useEffect(() => setValues({}), [batchId]);
  const refresh = () => { client.invalidateQueries({ queryKey: ['score-batches', student.id] }); client.invalidateQueries({ queryKey: ['scores', student.id] }); };
  const createBatch = useMutation({ mutationFn: (form: any) => api.post('/score-batches', { studentId: student.id, type: form.type, name: form.name, examDate: form.examDate.toISOString() }), onSuccess: ({ data }) => { message.success('成绩批次已创建'); setBatchId(data.data.id); setBatchOpen(false); batchForm.resetFields(); refresh(); } });
  const save = useMutation({ mutationFn: async () => { if (!batchId) throw new Error('请先创建成绩批次'); await Promise.all(student.subjects.map(subject => api.post('/scores', { studentId: student.id, batchId, subject, score: values[subject] ?? current[subject] ?? 0, totalScore: 100 }))); }, onSuccess: () => { message.success('成绩已保存，两处档案已同步'); refresh(); } });
  const updateSubjects = useMutation({ mutationFn: (subjects: string[]) => api.patch(`/students/${student.id}`, { subjects, subjectTeachers: student.subjectTeachers.filter(item => subjects.includes(item.subject)) }), onSuccess: () => { client.invalidateQueries({ queryKey: ['students'] }); client.invalidateQueries({ queryKey: ['student', student.id] }); message.success('辅导科目已更新'); } });
  const addSubject = (subject: string) => { const value = subject.trim(); if (value && !student.subjects.includes(value)) updateSubjects.mutate([...student.subjects, value]); setCustom(''); };
  return <div className="score-workspace"><div className="score-toolbar"><Select value={batchId} placeholder="选择成绩批次" onChange={setBatchId} style={{ minWidth: 260 }} options={(batches.data || []).map(item => ({ value: item.id, label: `${item.name} · ${dayjs(item.examDate).format('YYYY-MM-DD')}` }))} /><Button icon={<PlusOutlined />} onClick={() => { batchForm.setFieldsValue({ type: 'WEEKLY', examDate: dayjs(), name: `周测成绩 ${dayjs().format('MM-DD')}` }); setBatchOpen(true); }}>新建批次</Button></div>
    <div className="subject-manager"><div className="subject-manager-title"><b>学生当前辅导科目</b><Button size="small" icon={<ReloadOutlined />} onClick={() => updateSubjects.mutate(subjectsForGrade(student.grade))}>按年级添加推荐科目</Button></div><Space wrap>{subjectOptions.map(subject => <Button size="small" disabled={student.subjects.includes(subject)} onClick={() => addSubject(subject)} key={subject}>{subject}</Button>)}</Space><Space.Compact block><Input value={custom} onChange={event => setCustom(event.target.value)} placeholder="输入自定义科目名称" onPressEnter={() => addSubject(custom)} /><Button type="primary" onClick={() => addSubject(custom)}>添加</Button></Space.Compact></div>
    {student.subjects.length ? <><Table pagination={false} rowKey="subject" dataSource={student.subjects.map(subject => ({ subject }))} columns={[{ title: '科目', dataIndex: 'subject' }, { title: '成绩（分）', render: (_, row: any) => <InputNumber min={0} max={150} placeholder="待填写" value={values[row.subject] ?? current[row.subject]} onChange={value => setValues(previous => ({ ...previous, [row.subject]: value ?? 0 }))} /> }, { title: '等级', render: (_, row: any) => { const score = values[row.subject] ?? current[row.subject]; return score === undefined ? '—' : <Tag color={score >= 90 ? 'success' : score >= 60 ? 'processing' : 'warning'}>{score >= 90 ? '优秀' : score >= 80 ? '良好' : score >= 60 ? '及格' : '待提升'}</Tag>; } }, { title: '科目配置', width: 120, render: (_, row: any) => <Button danger type="link" icon={<DeleteOutlined />} onClick={() => updateSubjects.mutate(student.subjects.filter(subject => subject !== row.subject))}>移除科目</Button> }]} /><Button type="primary" icon={<SaveOutlined />} disabled={!batchId} loading={save.isPending} onClick={() => save.mutate()}>保存成绩</Button></> : <Empty description="当前没有辅导科目。可手动添加，或点击上方按钮添加年级推荐科目。" />}
    <Modal title="新建成绩批次" open={batchOpen} onCancel={() => setBatchOpen(false)} onOk={() => batchForm.submit()} confirmLoading={createBatch.isPending}><Form form={batchForm} layout="vertical" onFinish={values => createBatch.mutate(values)}><Form.Item name="type" label="考试类型" rules={[{ required: true }]}><Select options={[['ENTRANCE', '入学成绩'], ['WEEKLY', '周测成绩'], ['MONTHLY', '月考成绩'], ['MIDTERM', '期中成绩'], ['FINAL', '期末成绩'], ['OTHER', '其他']].map(([value, label]) => ({ value, label }))} /></Form.Item><Form.Item name="name" label="批次名称" rules={[{ required: true }]}><Input placeholder="例如：9月第二周周测" /></Form.Item><Form.Item name="examDate" label="考试日期" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Form></Modal>
  </div>;
}
