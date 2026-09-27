import { BellOutlined, BookOutlined, CalendarOutlined, DashboardOutlined, FileTextOutlined, FundOutlined, QuestionCircleOutlined, ReadOutlined, SolutionOutlined, TeamOutlined, UserOutlined, WalletOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button, Input, Layout, Menu, Popover, Space } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useUiStore } from '../store';

const items = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台首页' },
  { type: 'group' as const, label: '学生管理', children: [
    { key: '/students', icon: <TeamOutlined />, label: <span className="menu-with-badge">学生管理<Badge count={5}/></span> },
    { key: '/archives', icon: <SolutionOutlined />, label: '学生档案' }, { key: '/plans', icon: <CalendarOutlined />, label: '教学计划' },
    { key: '/scores', icon: <FundOutlined />, label: '学生成绩' }, { key: '/learning-reports', icon: <FileTextOutlined />, label: '学情报告' },
    { key: '/parent-meetings', icon: <TeamOutlined />, label: '家长会记录' },
  ]},
  { type: 'group' as const, label: '教务管理', children: [
    { key: '/courses', icon: <BookOutlined />, label: '课程管理' }, { key: '/renewals', icon: <WalletOutlined />, label: '续费管理' },
    { key: '/business', icon: <SolutionOutlined />, label: '业务办理' }, { key: '/recommendations', icon: <UserOutlined />, label: '每月推荐' },
  ]},
  { type: 'group' as const, label: '培训中心', children: [{ key: '/training', icon: <ReadOutlined />, label: '培训资料' }] },
  { type: 'group' as const, label: '数据中心', children: [{ key: '/reports', icon: <FundOutlined />, label: '数据报表' }, { key: '/profile', icon: <UserOutlined />, label: '个人中心' }] },
];

const pageTitles:Record<string,string>={dashboard:'工作台首页',todos:'待办任务',students:'学生管理',archives:'学生档案',plans:'教学计划',scores:'学生成绩','learning-reports':'学情报告','parent-meetings':'家长会记录',courses:'课程管理',renewals:'续费管理',business:'业务办理',recommendations:'每月推荐',training:'培训中心',reports:'数据报表',profile:'个人中心'};

export function AppShell(){
  const location=useLocation(),navigate=useNavigate(),{collapsed,setCollapsed}=useUiStore(),{user,logout}=useAuth(),page=location.pathname.split('/')[1]||'dashboard';
  return <Layout className="app-layout"><Layout.Sider width={218} collapsedWidth={72} collapsed={collapsed} breakpoint="lg" onBreakpoint={setCollapsed} theme="light" className="sidebar"><div className="brand"><div className="brand-mark">学</div>{!collapsed&&<div><strong>学途教育</strong><span>一对一教培管理系统</span></div>}</div><Menu mode="inline" selectedKeys={[`/${page}`]} items={items} onClick={({key})=>navigate(key)}/><Popover placement="rightBottom" trigger="click" content={<Button type="text" danger onClick={async()=>{await logout();navigate('/login')}}>退出登录</Button>}><button className="sidebar-user"><Avatar>李</Avatar>{!collapsed&&<div><b>{user?.name||'李老师'}</b><span>{user?.role==='ADMIN'?'系统管理员':'资深班主任'}</span></div>}</button></Popover></Layout.Sider><Layout><Layout.Header className="topbar"><div className="breadcrumb"><span>学途教育</span><i>/</i><b>{pageTitles[page]||'工作台首页'}</b></div><Space size={18}><Input.Search className="global-search" placeholder="搜索学生、课程..." onSearch={value=>value&&navigate(`/students?search=${encodeURIComponent(value)}`)}/><Badge dot><BellOutlined className="header-icon"/></Badge><QuestionCircleOutlined className="header-icon"/></Space></Layout.Header><Layout.Content className="content"><Outlet/></Layout.Content></Layout></Layout>;
}
