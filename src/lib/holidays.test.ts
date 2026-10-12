import { describe, expect, it } from 'vitest';
import { fromDay, toDay } from './dates';
import { restSpans, shortHolidayName, type RestSpan } from './holidays';

const range = (start: string, end: string) => ({ start: toDay(start), end: toDay(end) });
const readable = (spans: RestSpan[]) => spans.map((s) => [fromDay(s.start), fromDay(s.end), s.names.join(', ')]);

describe('holidays', () => {
  it('토요일과 일요일을 띠 하나로 묶는다', () => {
    // 2026-10-12 월요일부터 한 주
    expect(readable(restSpans(range('2026-10-12', '2026-10-18'), {}))).toEqual([['2026-10-17', '2026-10-18', '']]);
  });

  it('주말과 이어진 공휴일을 한 구간으로 묶고 연휴 이름은 한 번만 쓴다', () => {
    const holidays = { '2026-09-24': ['추석 전날'], '2026-09-25': ['추석'], '2026-09-26': ['추석 다음 날'] };
    // 목, 금, 토가 추석 연휴이고 일요일까지 이어집니다
    expect(readable(restSpans(range('2026-09-21', '2026-09-30'), holidays))).toEqual([['2026-09-24', '2026-09-27', '추석']]);
  });

  it('평일 사이 하루짜리 공휴일도 구간이 되고, 이름이 다른 공휴일은 모두 적는다', () => {
    const holidays = { '2025-05-05': ['어린이날', '부처님 오신 날'], '2025-05-06': ['대체공휴일(부처님 오신 날)'], '2025-06-03': ['임시공휴일(대통령선거)'] };
    expect(readable(restSpans(range('2025-05-03', '2025-06-04'), holidays))).toEqual([
      ['2025-05-03', '2025-05-06', '어린이날, 부처님 오신 날'],
      ['2025-05-10', '2025-05-11', ''],
      ['2025-05-17', '2025-05-18', ''],
      ['2025-05-24', '2025-05-25', ''],
      ['2025-05-31', '2025-06-01', ''],
      ['2025-06-03', '2025-06-03', '대통령선거'],
    ]);
  });

  it('기간 끝에 걸친 구간은 기간 안쪽만 남긴다', () => {
    // 2026-10-04 일요일에 시작해서 10-10 토요일에 끝나는 기간
    expect(readable(restSpans(range('2026-10-04', '2026-10-10'), {}))).toEqual([
      ['2026-10-04', '2026-10-04', ''],
      ['2026-10-10', '2026-10-10', ''],
    ]);
  });

  it('공휴일 이름을 띠에 적을 짧은 이름으로 바꾼다', () => {
    expect(shortHolidayName('대체공휴일(추석)')).toBe('추석');
    expect(shortHolidayName('대체공휴일(3ㆍ1절)')).toBe('삼일절');
    expect(shortHolidayName('임시공휴일(대통령선거)')).toBe('대통령선거');
    expect(shortHolidayName('임시공휴일')).toBe('임시공휴일');
    expect(shortHolidayName('설날 다음 날')).toBe('설날');
    expect(shortHolidayName('기독탄신일')).toBe('성탄절');
    expect(shortHolidayName('한글날')).toBe('한글날');
  });

  it('이름 없는 임시공휴일이 연휴에 붙으면 연휴 이름만 남긴다', () => {
    const holidays = { '2025-01-27': ['임시공휴일'], '2025-01-28': ['설날 전날'], '2025-01-29': ['설날'], '2025-01-30': ['설날 다음 날'] };
    expect(readable(restSpans(range('2025-01-24', '2025-01-31'), holidays))).toEqual([['2025-01-25', '2025-01-30', '설날']]);
    // 혼자 있으면 그대로 둡니다
    expect(readable(restSpans(range('2025-01-27', '2025-01-27'), holidays))).toEqual([['2025-01-27', '2025-01-27', '임시공휴일']]);
  });

  it('저장소에 넣어 둔 자료로 2026년 3분기 연휴를 찾는다', () => {
    const holidays = restSpans(range('2026-07-01', '2026-09-30')).filter((s) => s.names.length);
    expect(readable(holidays)).toEqual([
      ['2026-07-17', '2026-07-19', '제헌절'],
      ['2026-08-15', '2026-08-17', '광복절'],
      ['2026-09-24', '2026-09-27', '추석'],
    ]);
  });
});
