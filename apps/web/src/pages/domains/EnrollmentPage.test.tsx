import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api';
import { RenewalPage } from './EnrollmentPage';

vi.mock('../../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: { data: url === '/students' ? [] : [] },
  }) as never);
  vi.mocked(api.post).mockImplementation(async (url) => {
    if (url === '/renewals/calculate') return {
      data: { data: {
        originalAmount: 2500,
        paid: 2000,
        savedAmount: 500,
        discountRate: 8,
        totalHours: 10,
        averagePrice: 200,
        balanceBefore: 0,
        balanceAfter: 10,
        weeklyConsumption: 4,
        currentWeeks: 0,
        projectedWeeks: 3,
        currentEstimatedEndAt: null,
        estimatedEndAt: '2026-10-20T00:00:00.000Z',
      } },
    } as never;
    throw new Error(`Unexpected POST ${url}`);
  });
});

describe('EnrollmentPage', () => {
  it('calculates a first-enrollment quote and switches to renewal mode', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={['/renewals']}>
        <QueryClientProvider client={client}>
          <RenewalPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('学生姓名'), { target: { value: '报价测试学生' } });
    fireEvent.change(screen.getByLabelText('原价单价（元/课时）'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('正价课时'), { target: { value: '10' } });

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/renewals/calculate', expect.objectContaining({ type: 'FIRST_ENROLLMENT', normalHours: 10 })));
    expect(await screen.findByText('+10 课时')).toBeTruthy();
    expect(screen.getByText('折前原价', { exact: true })).toBeTruthy();
    expect(screen.getByText('¥2,500')).toBeTruthy();
    expect(screen.getByText('优惠后实付', { exact: true })).toBeTruthy();
    expect(screen.getByText('¥2,000')).toBeTruthy();
    expect(screen.getByText('8 折', { exact: true })).toBeTruthy();
    expect(screen.getByText('比原价节省 ¥500')).toBeTruthy();
    expect(screen.getByText('2026年10月20日')).toBeTruthy();

    fireEvent.click(screen.getByText('续费补充', { exact: true }));
    expect(await screen.findByText('选择学生', { exact: true })).toBeTruthy();
    expect(screen.getByText('全科共享课时', { exact: true })).toBeTruthy();
  });
});
