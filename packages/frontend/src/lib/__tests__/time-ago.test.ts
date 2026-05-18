import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime } from '../time-ago';

describe('formatRelativeTime', () => {
  const NOW = new Date('2026-05-17T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "刚刚" for very recent dates', () => {
    const past = NOW - 30 * 1000; // 30s ago
    expect(formatRelativeTime(past)).toBe('刚刚');
  });

  it('returns minutes ago', () => {
    const past = NOW - 5 * 60 * 1000; // 5m ago
    expect(formatRelativeTime(past)).toBe('5 分钟前');
  });

  it('returns hours ago', () => {
    const past = NOW - 3 * 60 * 60 * 1000; // 3h ago
    expect(formatRelativeTime(past)).toBe('3 小时前');
  });

  it('returns days ago', () => {
    const past = NOW - 2 * 24 * 60 * 60 * 1000; // 2d ago
    expect(formatRelativeTime(past)).toBe('2 天前');
  });

  it('returns date string for older dates', () => {
    const past = new Date('2026-05-01').getTime();
    // toLocaleDateString depends on environment, but it shouldn't be "刚刚" or "X days ago"
    const result = formatRelativeTime(past);
    expect(result).not.toContain('前');
    expect(result).not.toBe('刚刚');
  });
});
