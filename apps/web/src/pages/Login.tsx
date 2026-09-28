import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input } from 'antd';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function Login() {
  const { login } = useAuth(); const navigate = useNavigate(); const location = useLocation(); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const submit = async (values: { email: string; password: string }) => { setLoading(true); setError(''); try { await login(values.email, values.password); navigate((location.state as { from?: string })?.from || '/dashboard', { replace: true }); } catch { setError('邮箱或密码错误'); } finally { setLoading(false); } };
  return <main className="login-page"><section className="login-panel"><div className="login-brand"><span>小</span><div><h1>小黑助理</h1><p>专属于你的私人教培助理</p></div></div><h2>登录班主任工作台</h2>{error && <Alert type="error" showIcon message={error}/>}<Form layout="vertical" onFinish={submit} initialValues={{ email: '', password: '' }}><Form.Item label="邮箱" name="email" rules={[{ required: true }, { type: 'email' }]}><Input size="large" prefix={<MailOutlined/>}/></Form.Item><Form.Item label="密码" name="password" rules={[{ required: true }]}><Input.Password size="large" prefix={<LockOutlined/>}/></Form.Item><Button htmlType="submit" type="primary" size="large" block loading={loading}>登录</Button></Form></section></main>;
}
