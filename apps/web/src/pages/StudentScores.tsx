import { Empty } from 'antd';
import { useState } from 'react';
import { ScoreWorkspace } from '../components/ScoreWorkspace';
import { Heading, StudentWorkspace, useStudents } from './domains/shared';

export function ScoresPage() {
  const students = useStudents(), [id, setId] = useState<string>(), student = students.data?.find(item => item.id === id);
  return <><Heading title="学生成绩" desc="按考试批次维护成绩；辅导科目与学生档案保持一致" /><section className="panel no-pad"><StudentWorkspace students={students.data || []} value={id} onChange={setId}>{student ? <div className="record-page"><div className="record-head"><div><h2>{student.name} · {student.grade}</h2><span>档案与成绩台账使用同一数据源</span></div></div><ScoreWorkspace student={student} /></div> : <div className="select-empty"><Empty description="请从左侧选择学生查看成绩" /></div>}</StudentWorkspace></section></>;
}
