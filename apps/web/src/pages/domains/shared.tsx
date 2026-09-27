import { SearchOutlined } from '@ant-design/icons';
import { Input, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { api } from '../../api';
import type { Student } from '../../types';
export { gradeOptions, scoreSubjects, subjectOptions, subjectsForGrade } from '@edu/shared';

export function Heading({title,desc,extra}:{title:string;desc:string;extra?:ReactNode}){return <div className="page-heading"><div><Typography.Title level={3}>{title}</Typography.Title><Typography.Text type="secondary">{desc}</Typography.Text></div>{extra}</div>}
export function useStudents(){return useQuery({queryKey:['students','all'],queryFn:async()=>(await api.get('/students',{params:{pageSize:100}})).data.data as Student[]})}
export function StudentRail({students,value,onChange}:{students:Student[];value?:string;onChange:(id:string)=>void}){const[search,setSearch]=useState('');const rows=useMemo(()=>students.filter(x=>x.name.includes(search)),[students,search]);return <aside className="student-rail"><b>学生列表</b><Input prefix={<SearchOutlined/>} value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索学生" size="small"/><div>{rows.map(student=><button className={value===student.id?'active':''} onClick={()=>onChange(student.id)} key={student.id}><span>{student.name[0]}</span><div><b>{student.name}</b><small>{student.grade} · {student.subjects.join('、')}</small></div></button>)}</div></aside>}
export function StudentWorkspace({students,value,onChange,children}:{students:Student[];value?:string;onChange:(id:string)=>void;children:ReactNode}){return <div className="student-workspace"><StudentRail students={students} value={value} onChange={onChange}/><div className="student-work-main">{children}</div></div>}
export function downloadText(name:string,content:string){const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();URL.revokeObjectURL(url)}
