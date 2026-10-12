import { describe, expect, it } from 'vitest';
import {
  hasCases,
  hasDates,
  joinDescription,
  plainRecord,
  splitCases,
  splitContent,
  splitDates,
  splitDescription,
  splitTrailingDates,
  withoutCases,
  withoutDates,
  workSpan,
} from './cases';
import { fromDay } from './dates';
import type { WorkRecord } from './types';

describe('사례 나누기', () => {
  it('사례가 없으면 글 하나로 돌려준다', () => {
    expect(splitCases('화면을 새로 만듦.\n테스트로 확인함.')).toEqual([{ kind: 'text', text: '화면을 새로 만듦.\n테스트로 확인함.' }]);
  });

  it('AI 초안과 담당자 수정 줄을 사례로 묶고, 앞줄의 사례 번호를 떼어 항목으로 쓴다', () => {
    const text = [
      '기획 화면으로 초안을 받음.',
      '',
      '사례 1. 정렬 기준',
      'AI 초안: 최신순만 지원했음.',
      '담당자 수정: 인기순을 추가함.',
      '',
      '사례 2. 빈 결과',
      'AI 초안: 빈 화면만 보였음.',
      '담당자 수정: 안내 문구를 넣음.',
    ].join('\n');
    expect(splitCases(text)).toEqual([
      { kind: 'text', text: '기획 화면으로 초안을 받음.' },
      {
        kind: 'cases',
        rows: [
          { item: '정렬 기준', draft: '최신순만 지원했음.', revised: '인기순을 추가함.' },
          { item: '빈 결과', draft: '빈 화면만 보였음.', revised: '안내 문구를 넣음.' },
        ],
      },
    ]);
  });

  it('사례 앞줄이 온점으로 끝나는 문장이면 항목으로 가져오지 않는다', () => {
    expect(splitCases('초안을 받음.\nAI 초안: 가\n담당자 수정본: 나')).toEqual([
      { kind: 'text', text: '초안을 받음.' },
      { kind: 'cases', rows: [{ item: '', draft: '가', revised: '나' }] },
    ]);
  });

  it('사례 사이에 글이 있으면 표를 나눈다', () => {
    const parts = splitCases('가\nAI 초안: 1\n담당자 수정: 2\n중간 설명.\n나\nAI 초안: 3\n담당자 수정: 4');
    expect(parts.map((p) => p.kind)).toEqual(['cases', 'text', 'cases']);
  });

  it('담당자 수정 줄이 바로 뒤에 없으면 글로 둔다', () => {
    expect(splitCases('AI 초안: 혼자 있는 줄')).toEqual([{ kind: 'text', text: 'AI 초안: 혼자 있는 줄' }]);
  });
});

describe('날짜 표', () => {
  it('날짜나 기간으로 시작하는 줄이 두 줄 이상 이어지면 날짜 표로 꺼낸다', () => {
    const text = ['메뉴를 차례로 옮김.', '8. 7. 홈페이지 메뉴 전환', '8. 11.~8. 13. 배너 메뉴 전환', '마지막 설명.'].join('\n');
    expect(splitDates(text)).toEqual([
      { kind: 'text', text: '메뉴를 차례로 옮김.' },
      {
        kind: 'dates',
        rows: [
          { date: '8. 7.', text: '홈페이지 메뉴 전환' },
          { date: '8. 11.~8. 13.', text: '배너 메뉴 전환' },
        ],
      },
      { kind: 'text', text: '마지막 설명.' },
    ]);
  });

  it('표 없는 버전의 8/7, 8/11 ~ 8/13 꼴 날짜도 알아본다', () => {
    expect(splitDates('8/7 홈페이지 전환\n8/11 ~ 8/13 배너 전환')).toEqual([
      {
        kind: 'dates',
        rows: [
          { date: '8/7', text: '홈페이지 전환' },
          { date: '8/11 ~ 8/13', text: '배너 전환' },
        ],
      },
    ]);
  });

  it('날짜 줄이 한 줄뿐이거나 날짜 뒤에 글자가 바로 붙으면 글로 둔다', () => {
    expect(splitDates('개요.\n9. 16. 배포함.')).toEqual([{ kind: 'text', text: '개요.\n9. 16. 배포함.' }]);
    expect(splitDates('4. 6.에 만듦.\n4. 7.에 고침.')).toEqual([{ kind: 'text', text: '4. 6.에 만듦.\n4. 7.에 고침.' }]);
  });

  it('사례 표와 날짜 표를 쓴 순서대로 나눈다', () => {
    const text = joinDescription('개요.', [{ item: '정렬 기준', draft: '가', revised: '나' }], '8. 7. 시작\n8. 8. 마침');
    expect(splitContent(text).map((p) => p.kind)).toEqual(['text', 'cases', 'dates']);
  });

  it('날짜별로 한 일을 빼면 날짜 표가 될 줄만 빼고 글과 사례 줄은 남긴다', () => {
    const cases = [{ item: '정렬 기준', draft: '가', revised: '나' }];
    const text = joinDescription('개요.', cases, '8. 7. 시작\n8. 8. 마침');
    expect(hasDates(text)).toBe(true);
    expect(withoutDates(text)).toBe(joinDescription('개요.', cases));
    expect(hasDates(withoutDates(text))).toBe(false);
    // 한 줄뿐인 날짜 줄은 표가 아니라 글이라서 남긴다
    expect(withoutDates('개요.\n9. 16. 배포함.')).toBe('개요.\n9. 16. 배포함.');
  });
});

describe('기록이 걸친 기간', () => {
  const span = (date: string, description: string) => {
    const r = workSpan({ date, description });
    return [fromDay(r.start), fromDay(r.end)];
  };

  it('날짜 줄의 첫날부터 마지막 날까지이고, 기간으로 쓴 줄은 끝날까지 넣는다', () => {
    expect(span('2026-08-07', '화면을 고침.\n\n8. 7. 첫 화면\n8/11~8/13 목록 정리\n9. 2. 배포')).toEqual(['2026-08-07', '2026-09-02']);
  });

  it('기록 날짜가 날짜 줄 뒤에 있으면 기록 날짜까지 늘린다', () => {
    expect(span('2026-09-30', '자잘한 요청을 고침.\n\n9. 3. 버튼 수정\n9. 15. 문구 수정')).toEqual(['2026-09-03', '2026-09-30']);
  });

  it('한 줄뿐인 날짜 줄도 그날 한 일로 보고, 날짜 줄이 없으면 기록 날짜 하루다', () => {
    expect(span('2026-09-22', '화면을 고침.\n9. 29. 배포')).toEqual(['2026-09-22', '2026-09-29']);
    expect(span('2026-09-22', '화면을 고침.')).toEqual(['2026-09-22', '2026-09-22']);
  });

  it('연도 없이 쓴 날짜는 기록 날짜에서 가장 가까운 해로 본다', () => {
    expect(span('2025-12-29', '12. 22. 시작\n1. 5. 마무리')).toEqual(['2025-12-22', '2026-01-05']);
    expect(span('2026-01-05', '12. 29. 시작\n1. 5. 마무리')).toEqual(['2025-12-29', '2026-01-05']);
  });

  it('없는 날짜는 건너뛴다', () => {
    expect(span('2026-02-10', '2. 30. 잘못 쓴 날\n2. 12. 마무리')).toEqual(['2026-02-10', '2026-02-12']);
  });
});

describe('입력 화면의 내용 칸과 사례 칸', () => {
  const saved = [
    '기획 화면으로 초안을 받음.',
    '',
    '사례 1. 정렬 기준',
    'AI 초안: 최신순만 지원했음.',
    '담당자 수정: 인기순을 추가함.',
    '',
    '사례 2. 빈 결과',
    'AI 초안: 빈 화면만 보였음.',
    '담당자 수정: 안내 문구를 넣음.',
  ].join('\n');

  it('맨 끝의 사례 묶음을 사례 칸으로 나누고, 다시 합치면 저장된 글과 같다', () => {
    const { body, cases } = splitDescription(saved);
    expect(body).toBe('기획 화면으로 초안을 받음.');
    expect(cases.map((c) => c.item)).toEqual(['정렬 기준', '빈 결과']);
    expect(joinDescription(body, cases)).toBe(saved);
  });

  it('사례 뒤에 글이 더 있으면 나누지 않고 쓴 글을 그대로 내용 칸에 둔다', () => {
    const text = `${saved}\n\n마지막 설명.`;
    expect(splitDescription(text)).toEqual({ body: text, cases: [], dates: '' });
  });

  it('사례 뒤에 이어 쓴 날짜 줄은 날짜 칸으로 나누고, 다시 합치면 저장된 글과 같다', () => {
    const text = `${saved}\n\n8. 7. 홈페이지 메뉴 전환\n8. 11.~8. 13. 배너 메뉴 전환`;
    const { body, cases, dates } = splitDescription(text);
    expect(body).toBe('기획 화면으로 초안을 받음.');
    expect(cases.map((c) => c.item)).toEqual(['정렬 기준', '빈 결과']);
    expect(dates).toBe('8. 7. 홈페이지 메뉴 전환\n8. 11.~8. 13. 배너 메뉴 전환');
    expect(joinDescription(body, cases, dates)).toBe(text);
  });

  it('사례가 없는 글에서도 끝에 이어 쓴 날짜 줄만 떼어 낸다', () => {
    expect(splitTrailingDates('개요.\n8/7 홈페이지 전환\n8/11~8/13 배너 전환')).toEqual({ body: '개요.', dates: '8/7 홈페이지 전환\n8/11~8/13 배너 전환' });
    expect(splitTrailingDates('8. 7.에 시작함.')).toEqual({ body: '8. 7.에 시작함.', dates: '' });
  });

  it('합칠 때 날짜 칸의 빈 줄과 앞뒤 공백은 빼고 내용 맨 끝에 붙인다', () => {
    expect(joinDescription('개요.', [], '8. 7. 시작\n\n  8. 8. 마침  \n')).toBe('개요.\n\n8. 7. 시작\n8. 8. 마침');
  });

  it('합칠 때 빈 사례는 빼고, 항목의 번호와 끝 온점을 떼고, 줄바꿈은 띄어쓰기로 바꾼다', () => {
    const text = joinDescription('개요.', [
      { item: '', draft: '', revised: '' },
      { item: '사례 3. 정렬 기준.', draft: '최신순만\n지원했음.', revised: '인기순 추가' },
    ]);
    expect(text).toBe('개요.\n\n사례 1. 정렬 기준\nAI 초안: 최신순만 지원했음.\n담당자 수정: 인기순 추가');
  });

  it('예시 기록은 모두 사례를 담고 있어서, 처음 쓰는 사람이 내보내 보면 사례 표가 보인다', () => {
    const samples = Object.values(import.meta.glob<WorkRecord>('../../data-sample/records/*/record.json', { eager: true, import: 'default' }));
    expect(samples.length).toBeGreaterThan(0);
    for (const r of samples) expect(splitDescription(r.description).cases.length).toBeGreaterThan(0);
  });

  it('항목이 비면 번호만 써서 표의 항목 칸을 비우고, 앞의 글을 항목으로 가져가지 않는다', () => {
    const text = joinDescription('개요', [{ item: '', draft: '가', revised: '나' }]);
    expect(splitCases(text)).toEqual([
      { kind: 'text', text: '개요' },
      { kind: 'cases', rows: [{ item: '', draft: '가', revised: '나' }] },
    ]);
  });
});

describe('표 없는 버전', () => {
  const withCases = joinDescription('초안을 받아 화면을 만듦.', [{ item: '정렬 기준', draft: '최신순만 지원했음.', revised: '인기순을 추가함.' }]);
  const record = (patch: Partial<WorkRecord> = {}): WorkRecord => ({
    id: 'a1',
    date: '2026-09-03',
    type: 'dev',
    toolIds: [],
    title: '정렬 화면',
    description: withCases,
    effect: '초안을 하루 만에 받음.',
    images: [],
    sample: false,
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  });

  it('AI 초안 줄과 담당자 수정 줄이 짝을 이뤄야 사례 표가 있다고 본다', () => {
    expect(hasCases(withCases)).toBe(true);
    expect(hasCases('사례 없는 글.\n둘째 줄.')).toBe(false);
    expect(hasCases('AI 초안: 짝이 없는 줄.')).toBe(false);
    expect(hasCases('')).toBe(false);
  });

  it('사례 묶음을 빼고 글만 남긴다', () => {
    expect(withoutCases(withCases)).toBe('초안을 받아 화면을 만듦.');
    expect(withoutCases('사례 없는 글.\n둘째 줄.')).toBe('사례 없는 글.\n둘째 줄.');
  });

  it('사례 표를 빼도 날짜 줄은 남겨서 표 없는 버전에도 날짜 표가 들어간다', () => {
    const text = joinDescription('개요.', [{ item: '정렬 기준', draft: '가', revised: '나' }], '8. 7. 시작\n8. 8. 마침');
    expect(withoutCases(text)).toBe('개요.\n\n8. 7. 시작\n8. 8. 마침');
  });

  it('따로 쓴 제목, 내용, 효과가 있으면 그 글을 쓴다', () => {
    const plain = plainRecord(record({ plain: { title: '정렬 화면 (관리자)', description: '인기순 정렬을 더함.', effect: '원하는 순서로 볼 수 있게 됨.' } }));
    expect([plain.title, plain.description, plain.effect]).toEqual(['정렬 화면 (관리자)', '인기순 정렬을 더함.', '원하는 순서로 볼 수 있게 됨.']);
  });

  it('비워 둔 칸은 표 있는 버전의 글을 쓰고, 내용에서는 사례 표를 뺀다', () => {
    const plain = plainRecord(record({ plain: { effect: '원하는 순서로 볼 수 있게 됨.' } }));
    expect([plain.title, plain.description, plain.effect]).toEqual(['정렬 화면', '초안을 받아 화면을 만듦.', '원하는 순서로 볼 수 있게 됨.']);
    expect(plainRecord(record()).description).toBe('초안을 받아 화면을 만듦.');
  });

  it('따로 쓴 내용에 사례 줄이 들어 있어도 표로 만들지 않는다', () => {
    expect(splitCases(plainRecord(record({ plain: { description: withCases } })).description).every((p) => p.kind === 'text')).toBe(true);
  });
});
