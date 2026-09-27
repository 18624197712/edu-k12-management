import React from 'react';
import ReactDOM from 'react-dom/client';
import '@ant-design/v5-patch-for-react-19';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#3b6fb6', borderRadius: 8, fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif', colorBgLayout: '#f5f7fa' }, components: { Card: { headerFontSize: 15 }, Table: { headerBg: '#f7f9fc', cellPaddingBlock: 11 }, Menu: { itemSelectedBg: '#eaf1fb', itemBorderRadius: 5 } } }}>
      <QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></QueryClientProvider>
    </ConfigProvider>
  </React.StrictMode>,
);
