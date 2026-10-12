import HOLIDAY_DATA from './holidays-kr.json';
import { fromDay, weekdayOfDay, type DayRange } from './dates';

/*
 * 공휴일은 holidays-kr.json 에 해마다 넣어 둔 자료만 씁니다.
 * 우주항공청 월력요항을 정리한 공개 자료를 npm run holidays 로 받아 저장소에 넣습니다(scripts/update-holidays.mjs).
 * 앱이 바깥에 묻지 않아서 인터넷이 막힌 곳이나 읽기 전용 빌드에서도 똑같이 보입니다.
 * 자료가 없는 해는 주말만 쉬는 날로 칠합니다.
 */
export type HolidayMap = Readonly<Record<string, readonly string[]>>;

const HOLIDAYS: HolidayMap = Object.assign({}, ...Object.values(HOLIDAY_DATA));

/** 띠에 적기에 긴 이름을 흔히 부르는 이름으로 바꿉니다. 연휴 앞뒤 날은 연휴 이름으로 모읍니다. */
const SHORT_NAMES: Record<string, string> = {
  '1월 1일': '신정',
  '설날 전날': '설날',
  '설날 다음 날': '설날',
  '3ㆍ1절': '삼일절',
  '추석 전날': '추석',
  '추석 다음 날': '추석',
  기독탄신일: '성탄절',
  전국동시지방선거: '지방선거',
};

/** 대체공휴일(추석)은 추석, 임시공휴일(대통령선거)는 대통령선거처럼 괄호 안 이름으로 줄입니다. */
export function shortHolidayName(name: string): string {
  const base = /^(?:대체공휴일|임시공휴일)\((.+)\)$/.exec(name)?.[1] ?? name;
  return SHORT_NAMES[base] ?? base;
}

/** 주말과 공휴일이 이어진 구간 하나 */
export interface RestSpan {
  /** 첫날과 마지막 날(day number) */
  start: number;
  end: number;
  /** 구간에 든 공휴일의 짧은 이름. 같은 이름은 한 번만 넣고, 주말만 있는 구간은 비어 있습니다. */
  names: string[];
}

/** 기간 안에서 주말과 공휴일이 이어진 구간들. 기간 끝에 걸친 구간은 기간 안쪽만 돌려줍니다. */
export function restSpans(range: DayRange, holidays: HolidayMap = HOLIDAYS): RestSpan[] {
  const spans: RestSpan[] = [];
  let open: RestSpan | null = null;
  for (let day = range.start; day <= range.end; day++) {
    const names = holidays[fromDay(day)];
    const weekday = weekdayOfDay(day);
    if (!names && weekday !== 0 && weekday !== 6) {
      open = null;
      continue;
    }
    if (!open) {
      open = { start: day, end: day, names: [] };
      spans.push(open);
    }
    open.end = day;
    for (const name of names ?? []) {
      const short = shortHolidayName(name);
      if (!open.names.includes(short)) open.names.push(short);
    }
  }
  // 까닭 없이 '임시공휴일'로만 적힌 날이 다른 공휴일과 이어지면 그 공휴일 이름만 남깁니다(2025년 설 연휴 앞 월요일)
  for (const span of spans) if (span.names.length > 1) span.names = span.names.filter((n) => n !== '임시공휴일');
  return spans;
}
