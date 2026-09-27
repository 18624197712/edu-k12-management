import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders the business metric and note', () => {
    render(<StatCard label="在读学生" value={128} suffix="人" note="较上月增加 6 人" icon={<span>图标</span>} />);
    expect(screen.getByText('在读学生')).toBeTruthy();
    expect(screen.getByText('128')).toBeTruthy();
    expect(screen.getByText(/较上月增加 6 人/)).toBeTruthy();
  });
});
