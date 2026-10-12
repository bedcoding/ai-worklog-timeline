import { fromDay, isValidISO, pad2, toDay, yearOf, type DayRange } from './dates';
import type { WorkRecord } from './types';

/** 기록 내용 안의 "AI 초안 → 담당자 수정" 사례 하나 */
export interface CaseRow {
  /**
   * 무엇에 관한 사례인지 적는 칸입니다.
   * 사례 앞줄에서 "사례 1" 같은 번호를 떼고 씁니다.
   */
  item: string;
  draft: string;
  revised: string;
}

export type DescriptionPart = { kind: 'text'; text: string } | { kind: 'cases'; rows: CaseRow[] };

/** 기록 내용 안의 "날짜 | 한 일" 표 한 줄 */
export interface DateRow {
  /** 쓴 그대로의 날짜나 기간입니다(예: 8. 11.~8. 13., 8/11~8/13) */
  date: string;
  text: string;
}

/** 화면과 문서에 그릴 기록 내용 조각. 사례 묶음 말고도 이어 쓴 날짜 줄을 표로 꺼냅니다. */
export type ContentPart = DescriptionPart | { kind: 'dates'; rows: DateRow[] };

const DRAFT = /^AI\s*초안\s*[:：]\s*/;
const REVISED = /^담당자\s*수정본?\s*[:：]\s*/;
const NUMBER = /^사례\s*\d+\s*[.)]?\s*/;
const DAY = String.raw`(?:\d{1,2}\.\s?\d{1,2}\.|\d{1,2}/\d{1,2})`;
/** "8. 7. 한 일"이나 "8/11~8/13 한 일"처럼 날짜나 기간으로 시작하는 줄 */
const DATE_LINE = new RegExp(String.raw`^(${DAY}(?:\s*~\s*${DAY})?)\s+(\S.*)$`);

/** 글 앞뒤의 빈 줄을 버립니다 */
function trimLines(lines: string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start += 1;
  while (end > start && !lines[end - 1].trim()) end -= 1;
  return lines.slice(start, end).join('\n');
}

/**
 * 기록 내용을 일반 글과 사례 묶음으로 나눕니다.
 * "AI 초안:" 줄 바로 다음에 "담당자 수정:" 줄이 오면 사례 하나로 봅니다.
 * 그 앞줄이 온점으로 끝나지 않는 글이면 번호를 뗀 뒤 항목 이름으로 씁니다.
 * 빈 줄만 사이에 둔 사례들은 표 하나로 묶습니다.
 */
export function splitCases(text: string): DescriptionPart[] {
  const lines = text.split(/\r?\n/);
  const parts: DescriptionPart[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const kept = trimLines(buffer);
    if (kept) parts.push({ kind: 'text', text: kept });
    buffer = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const next = (lines[i + 1] ?? '').trim();
    if (!DRAFT.test(line) || !REVISED.test(next)) {
      buffer.push(lines[i]);
      continue;
    }
    const last = buffer.length ? buffer[buffer.length - 1].trim() : '';
    const item = last && !last.endsWith('.') ? (buffer.pop() ?? '').trim().replace(NUMBER, '') : '';
    const row = { item, draft: line.replace(DRAFT, ''), revised: next.replace(REVISED, '') };
    const prev = parts[parts.length - 1];
    // 앞 사례와 사이에 빈 줄만 있으면 같은 표에 잇습니다
    if (prev?.kind === 'cases' && buffer.every((l) => !l.trim())) {
      buffer = [];
      prev.rows.push(row);
    } else {
      flush();
      parts.push({ kind: 'cases', rows: [row] });
    }
    i += 1;
  }
  flush();
  return parts;
}

function dateRow(line: string): DateRow {
  const match = DATE_LINE.exec(line.trim());
  return { date: match?.[1] ?? '', text: match?.[2] ?? line.trim() };
}

/**
 * 글을 일반 글과 날짜 표로 나눕니다.
 * 날짜나 기간으로 시작하는 줄이 두 줄 이상 이어지면 표 하나로 보고, 한 줄뿐이면 글로 둡니다.
 */
export function splitDates(text: string): ContentPart[] {
  const lines = text.split(/\r?\n/);
  const parts: ContentPart[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const kept = trimLines(buffer);
    if (kept) parts.push({ kind: 'text', text: kept });
    buffer = [];
  };
  for (let i = 0; i < lines.length;) {
    let end = i;
    while (end < lines.length && DATE_LINE.test(lines[end].trim())) end += 1;
    if (end - i >= 2) {
      flush();
      parts.push({ kind: 'dates', rows: lines.slice(i, end).map(dateRow) });
      i = end;
    } else {
      buffer.push(lines[i]);
      i += 1;
    }
  }
  flush();
  return parts;
}

/** 날짜 줄 앞머리의 날짜나 기간에서 월과 일을 하나씩 꺼냅니다(8. 11.~8. 13.이면 8월 11일과 8월 13일) */
const MONTH_DAY = /(\d{1,2})(?:\.\s?(\d{1,2})\.|\/(\d{1,2}))/g;

/**
 * 연도 없이 쓴 월과 일을 기준 날에서 가장 가까운 해의 날로 바꿉니다.
 * 12월 기록에 쓴 1. 5.는 다음 해 1월 5일입니다.
 * 없는 날짜(2. 30.)면 null입니다.
 */
function nearestDay(month: number, date: number, base: number): number | null {
  const year = yearOf(fromDay(base));
  let best: number | null = null;
  for (const y of [year - 1, year, year + 1]) {
    const iso = `${y}-${pad2(month)}-${pad2(date)}`;
    if (!isValidISO(iso)) continue;
    const day = toDay(iso);
    if (best === null || Math.abs(day - base) < Math.abs(best - base)) best = day;
  }
  return best;
}

/**
 * 기록이 걸친 기간입니다. 타임라인 트랙에 칠합니다.
 * 내용에서 날짜나 기간으로 시작하는 줄(날짜별로 한 일)의 첫날부터 마지막 날까지이고, 기록 날짜가 그 밖이면 기록 날짜까지 늘립니다.
 * 날짜 표가 되지 않는 한 줄짜리 날짜 줄도 그날 한 일로 봅니다.
 * 날짜 줄이 없으면 기록 날짜 하루입니다.
 */
export function workSpan(record: Pick<WorkRecord, 'date' | 'description'>): DayRange {
  const base = toDay(record.date);
  let start = base;
  let end = base;
  for (const line of record.description.split(/\r?\n/)) {
    const head = DATE_LINE.exec(line.trim())?.[1];
    if (!head) continue;
    for (const m of head.matchAll(MONTH_DAY)) {
      const day = nearestDay(Number(m[1]), Number(m[2] ?? m[3]), base);
      if (day === null) continue;
      start = Math.min(start, day);
      end = Math.max(end, day);
    }
  }
  return { start, end };
}

/** 기록 내용에 날짜 표가 하나라도 있는지 알려 줍니다 */
export function hasDates(text: string): boolean {
  return splitDates(text).some((p) => p.kind === 'dates');
}

/** 기록 내용에서 날짜 표가 되는 줄 묶음만 빼고, 나머지 글과 사례 줄은 그대로 둡니다 */
export function withoutDates(text: string): string {
  const parts = splitDates(text);
  if (!parts.some((p) => p.kind === 'dates')) return text;
  return parts.flatMap((p) => (p.kind === 'text' ? [p.text] : [])).join('\n\n');
}

/** 기록 내용을 화면과 문서에 그릴 조각으로 나눕니다. 사례 묶음은 사례 표로, 이어 쓴 날짜 줄은 날짜 표로 꺼냅니다. */
export function splitContent(text: string): ContentPart[] {
  return splitCases(text).flatMap((part) => (part.kind === 'text' ? splitDates(part.text) : [part]));
}

/**
 * 내용 끝에 이어 쓴 날짜 줄을 떼어 냅니다. 입력 화면은 이 줄들을 날짜 칸에 따로 보여 줍니다.
 * 날짜 줄은 사례 뒤에 오므로, 먼저 떼어 내야 사례 묶음이 내용 끝에 남습니다.
 */
export function splitTrailingDates(text: string): { body: string; dates: string } {
  const lines = text.trim().split(/\r?\n/);
  let end = lines.length;
  while (end > 0 && DATE_LINE.test(lines[end - 1].trim())) end -= 1;
  const dates = lines.slice(end).map((line) => line.trim());
  return { body: lines.slice(0, end).join('\n').trim(), dates: dates.join('\n') };
}

/**
 * 기록 내용을 입력 화면의 내용 칸, 사례 칸, 날짜 칸으로 나눕니다.
 * 끝에 이어 쓴 날짜 줄은 날짜 칸으로 꺼내고, 남은 글 끝에 사례 묶음이 하나 있을 때만 사례 칸으로 나눕니다.
 * 그 밖의 모양이면 쓴 글을 그대로 내용 칸에 두어 순서가 바뀌지 않게 합니다.
 */
export function splitDescription(text: string): { body: string; cases: CaseRow[]; dates: string } {
  const { body: rest, dates } = splitTrailingDates(text);
  const parts = splitCases(rest);
  const last = parts[parts.length - 1];
  if (last?.kind !== 'cases' || parts.filter((p) => p.kind === 'cases').length !== 1) return { body: rest, cases: [], dates };
  const body = parts.flatMap((p) => (p.kind === 'text' ? [p.text] : [])).join('\n\n');
  return { body, cases: last.rows, dates };
}

/**
 * 내용 칸, 사례 칸, 날짜 칸을 저장할 기록 내용 한 덩어리로 합칩니다.
 * 사례는 번호와 항목 줄, AI 초안 줄, 담당자 수정 줄의 세 줄로 쓰고 사례 사이는 빈 줄로 띄웁니다.
 * 세 칸이 모두 빈 사례는 빼고, 사례 안의 줄바꿈은 표 한 칸에 들어가도록 띄어쓰기로 바꿉니다.
 * 항목이 비면 "사례 1"처럼 번호만 써서 앞의 글이 항목으로 잘못 들어가지 않게 합니다.
 * 날짜 칸은 빈 줄을 빼고 맨 끝에 붙여, 이어진 줄이 표 하나가 되게 합니다.
 */
export function joinDescription(body: string, cases: readonly CaseRow[], dates = ''): string {
  const oneLine = (value: string) => value.replace(/\s*\n\s*/g, ' ').trim();
  const blocks = cases
    .map((c) => ({ item: oneLine(c.item).replace(NUMBER, '').replace(/[.。]+$/, ''), draft: oneLine(c.draft), revised: oneLine(c.revised) }))
    .filter((c) => c.item || c.draft || c.revised)
    .map((c, i) => [c.item ? `사례 ${i + 1}. ${c.item}` : `사례 ${i + 1}`, `AI 초안: ${c.draft}`, `담당자 수정: ${c.revised}`].join('\n'));
  const dateLines = dates
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  return [body.trim(), ...blocks, dateLines].filter(Boolean).join('\n\n');
}

/**
 * 기록 내용에 사례 표가 하나라도 있는지 알려 줍니다.
 * 표가 없는 기록에는 표 있는 버전과 없는 버전을 고르는 칸을 보여 주지 않습니다.
 */
export function hasCases(text: string): boolean {
  return splitCases(text).some((p) => p.kind === 'cases');
}

/** 기록 내용에서 사례 묶음을 빼고 글만 남깁니다 */
export function withoutCases(text: string): string {
  const parts = splitCases(text);
  if (!parts.some((p) => p.kind === 'cases')) return text;
  return parts.flatMap((p) => (p.kind === 'text' ? [p.text] : [])).join('\n\n');
}

/**
 * 표 없는 버전으로 바꾼 기록. 따로 써 둔 칸은 그 글을 쓰고, 비워 둔 칸은 표 있는 버전의 글을 씁니다.
 * 내용에서는 어느 쪽이든 사례 표를 뺍니다.
 */
export function plainRecord(record: WorkRecord): WorkRecord {
  const plain = record.plain ?? {};
  return {
    ...record,
    title: plain.title || record.title,
    description: withoutCases(plain.description || record.description),
    effect: plain.effect || record.effect,
  };
}
