import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { shortDate, weekdayKo } from './dates';
import { buildDocxExport, type DocxOptions } from './exportDocx';
import type { ImageEntry, Settings, WorkRecord } from './types';

const settings: Settings = {
  team: '기획팀',
  author: '홍길동',
  tools: [{ id: 'claude', name: 'Claude Team Premium', seat: 'Premium', note: '' }],
};

function rec(id: string, date: string, title: string, patch: Partial<WorkRecord> = {}): WorkRecord {
  return {
    id,
    date,
    type: 'doc',
    toolIds: ['claude'],
    title,
    description: `${title} 설명`,
    effect: '',
    images: [],
    sample: false,
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

const records = [
  rec('a', '2026-07-14', '목록 화면 개선', { images: [{ id: 'img1', label: '화면 캡처', name: 'shot.png' }] }),
  rec('b', '2026-08-07', '날짜 입력 버그 수정'),
];
const images = new Map<string, ImageEntry>(['img1', 'img2', 'img3'].map((id) => [id, { id, name: `${id}.png`, url: `/api/images/${id}` }]));
// 1x1 PNG. 브라우저 없이 만들 수 있게 이미지 변환은 건너뜁니다.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
const toPng = async () => ({ data: PNG.buffer, width: 1, height: 1 });

/** 만든 Word 파일에서 본문과 문서 정보(제목)를 꺼냅니다 */
async function build(options: Partial<DocxOptions> = {}, list: WorkRecord[] = records) {
  const blob = await buildDocxExport(list, settings, images, { generatedOn: '2026-10-06', toPng, ...options });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return { body: await zip.file('word/document.xml')!.async('string'), core: await zip.file('docProps/core.xml')!.async('string') };
}

describe('Word 내보내기', () => {
  it('기본은 첫 쪽 보고서 본문 뒤 새 쪽에 기록 표를 담는다', async () => {
    const { body, core } = await build();
    expect(body).toContain('분기별 업무결과물 보고서');
    expect(body).toContain('1. 보고서 본문');
    expect(body).toContain('w:pageBreakBefore');
    expect(body).toContain('2026년 3분기(7. 1.~9. 30.), 날짜순 2건');
    expect(body).toContain('목록 화면 개선');
    expect(body).toContain('날짜 입력 버그 수정');
    expect(core).toContain('분기별 업무결과물 보고서 (2026년 3분기)');
  });

  it('기록 표 위에 대제목을 따로 달지 않는다', async () => {
    const { body } = await build();
    expect(body).not.toContain('기록과 증빙');
  });

  it('대표 업무 표시는 Word 내용을 바꾸지 않는다', async () => {
    // 그림 개체 번호는 문서를 만들 때마다 늘어나서 비교에서 뺍니다
    const same = (xml: string) => xml.replace(/(<wp:docPr|<pic:cNvPr) id="\d+"/g, '$1 id=""');
    const featured = records.map((r, i) => (i === 0 ? { ...r, featured: true } : r));
    for (const imagesBelow of [false, true]) {
      const plain = await build({ imagesBelow });
      expect(same((await build({ imagesBelow }, featured)).body)).toBe(same(plain.body));
    }
  });

  it('이미지가 없는 기록은 두 칸을 합쳐 내용만 넣는다', async () => {
    const { body } = await build();
    expect(body).not.toContain('이미지 없음');
    expect(body.match(/<w:gridSpan w:val="2"\/>/g)).toHaveLength(1);
  });

  it('증빙 이미지는 아래 설명 없이 이미지만 넣는다', async () => {
    const { body } = await build();
    expect(body).toContain('<w:drawing>');
    expect(body).not.toContain('화면 캡처');
  });

  it('첫 쪽을 빼면 양식 칸 없이 기록 표만 담는다', async () => {
    const { body, core } = await build({ includeForm: false });
    expect(body).not.toContain('분기별 업무결과물 보고서');
    expect(body).not.toContain('1. 보고서 본문');
    expect(body).not.toContain('홍길동');
    expect(body).not.toContain('w:pageBreakBefore');
    expect(body).not.toContain('날짜순');
    expect(body).toContain('목록 화면 개선');
    expect(body).toContain('날짜 입력 버그 수정');
    expect(core).toContain('업무 기록 (2026년 3분기)');
  });

  it('날짜를 빼면 기록마다 맨 위의 날짜 줄을 넣지 않는다', async () => {
    const dateLine = `${shortDate('2026-07-14')} ${weekdayKo('2026-07-14')}`;
    expect((await build({ includeForm: false })).body).toContain(dateLine);
    const { body } = await build({ includeForm: false, hideDates: true });
    expect(body).not.toContain(dateLine);
    expect(body).toContain('목록 화면 개선');
    expect(body).toContain('날짜 입력 버그 수정');
  });

  it('내용의 AI 초안과 담당자 수정 줄은 항목, AI 초안, 담당자 수정본 표로 넣는다', async () => {
    const description = '초안을 받음.\n\n사례 1. 정렬 기준\nAI 초안: 최신순만 지원했음.\n담당자 수정: 인기순을 추가함.';
    for (const imagesBelow of [false, true]) {
      const { body } = await build({ includeForm: false, imagesBelow }, [rec('a', '2026-07-14', '검색 화면 개선', { description })]);
      expect(body).toContain('담당자 수정본');
      expect(body).toContain('정렬 기준');
      expect(body).toContain('인기순을 추가함.');
      expect(body).not.toContain('사례 1.');
      expect(body).not.toContain('AI 초안:');
      expect(body.match(/<w:tbl>/g)).toHaveLength(2);
      // 칸이 표로 끝나면 Word가 문서를 열지 못하므로 표 뒤에는 늘 문단이 온다
      expect(body).not.toMatch(/<\/w:tbl>\s*<\/w:tc>/);
    }
  });

  it('이어 쓴 날짜 줄은 사례 표 뒤에 날짜와 한 일 두 칸 표로 넣는다', async () => {
    const description =
      '메뉴를 옮김.\n\n사례 1. 정렬 기준\nAI 초안: 최신순만 지원했음.\n담당자 수정: 인기순을 추가함.\n\n8. 7. 홈페이지 메뉴 전환\n8. 11.~8. 13. 배너 메뉴 전환';
    const shot = [{ id: 'img1', label: '화면 캡처', name: 'shot.png' }];
    for (const imagesBelow of [false, true]) {
      for (const images of [[], shot]) {
        const { body } = await build({ includeForm: false, imagesBelow }, [rec('a', '2026-07-14', '서버 전환', { description, images })]);
        expect(body.match(/<w:tbl>/g)).toHaveLength(3);
        expect(body).toContain('한 일');
        expect(body).toContain('8. 11.~8. 13.');
        expect(body).toContain('배너 메뉴 전환');
        expect(body).not.toContain('8. 7. 홈페이지');
        expect(body.indexOf('담당자 수정본')).toBeLessThan(body.indexOf('한 일'));
        expect(body).not.toMatch(/<\/w:tbl>\s*<\/w:tc>/);
      }
    }
  });

  it('이미지를 옆 칸에 넣으면 맨 끝 날짜 표는 좁은 칸이 아니라 기록 칸 아래 표 폭 줄에 넣는다', async () => {
    const description = '메뉴를 옮김.\n\n8. 7. 홈페이지 메뉴 전환\n8. 11.~8. 13. 배너 메뉴 전환';
    // 두 칸을 합친 칸이 바로 표로 시작하면 날짜 표만 담은 줄입니다
    const dateRow = /<w:gridSpan w:val="2"\/>(?:(?!<w:tc>)[\s\S])*?<\/w:tcPr>\s*<w:tbl>/;
    const side = await build({ includeForm: false }, [
      rec('a', '2026-07-14', '서버 전환', { description, images: [{ id: 'img1', label: '화면 캡처', name: 'shot.png' }] }),
    ]);
    expect(side.body).toMatch(dateRow);
    // 이미지가 없으면 내용 칸이 이미 표 폭이라 날짜 표를 그 안에 둡니다
    const alone = await build({ includeForm: false }, [rec('a', '2026-07-14', '서버 전환', { description })]);
    expect(alone.body).not.toMatch(dateRow);
    expect(alone.body).toContain('한 일');
  });

  it('이미지를 옆 칸에 넣으면 기록 줄과 날짜 표 줄은 쪽 사이에서 나뉠 수 있고, 날짜와 제목은 다음 문단과 같은 쪽에 붙인다', async () => {
    const description = '메뉴를 옮김.\n\n8. 7. 홈페이지 메뉴 전환\n8. 11.~8. 13. 배너 메뉴 전환';
    const { body } = await build({ includeForm: false }, [
      rec('a', '2026-07-14', '서버 전환', { description, images: [{ id: 'img1', label: '화면 캡처', name: 'shot.png' }] }),
    ]);
    // 칸 이름 줄, 기록 줄, 날짜 표 줄 순서이고, 그 뒤는 날짜 표 안의 줄입니다
    const rows = body.split('<w:tr>').slice(1);
    const props = rows.map((row) => row.split('<w:tc>')[0]);
    expect(props[0]).toContain('<w:tblHeader/>');
    expect(props[0]).toContain('<w:cantSplit/>');
    expect(rows[1]).toContain('<w:drawing>');
    expect(props[1]).not.toContain('<w:cantSplit/>');
    expect(props[2]).not.toContain('<w:cantSplit/>');
    // 날짜 표 안의 줄은 한 줄씩 나뉘지 않게 둡니다
    for (const p of props.slice(3)) expect(p).toContain('<w:cantSplit/>');
    expect(rows[1].match(/<w:keepNext\/>/g)).toHaveLength(2);
  });

  it('이미지를 내용 아래에 넣으면 칸 하나짜리 표에 칸 이름 줄 없이 담는다', async () => {
    const { body } = await build({ includeForm: false, imagesBelow: true });
    expect(body).not.toContain('<w:tblHeader');
    expect(body).toContain('<w:gridCol w:w="9638"/>');
    expect(body).not.toContain('<w:gridCol w:w="5300"/>');
    expect(body).not.toContain('<w:gridSpan');
    expect(body).toContain('목록 화면 개선');
    expect(body).toContain('날짜 입력 버그 수정');
  });

  it('내용 아래에 넣는 이미지는 옆 칸보다 크게 넣는다', async () => {
    // 가로 1400px 화면 캡처는 옆 칸에서 폭 330px, 내용 아래에서 폭 620px로 줄입니다(1px는 9525 EMU)
    const shot = async () => ({ data: PNG.buffer, width: 1400, height: 380 });
    const side = await build({ toPng: shot });
    const below = await build({ toPng: shot, imagesBelow: true });
    expect(side.body).toContain(`cx="${330 * 9525}" cy="${90 * 9525}"`);
    expect(below.body).toContain(`cx="${620 * 9525}" cy="${168 * 9525}"`);
  });

  it('내용 아래에 넣으면 내용은 쪽 사이에서 나뉠 수 있는 줄에, 이미지는 한 장씩 나뉘지 않는 줄에 넣고 줄 사이에 선을 긋지 않는다', async () => {
    const shots = ['img1', 'img2', 'img3'].map((id) => ({ id, label: '화면 캡처', name: `${id}.png` }));
    const list = [rec('a', '2026-07-14', '목록 화면 개선', { images: shots }), rec('b', '2026-08-07', '날짜 입력 버그 수정')];
    const { body } = await build({ includeForm: false, imagesBelow: true }, list);
    // 기록 a는 제목, 내용, 이미지 세 줄이고, 기록 b는 제목과 내용 줄입니다
    const rows = body.split('<w:tr>').slice(1);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toContain('목록 화면 개선');
    expect(rows[0]).not.toContain('<w:drawing>');
    // 내용이 길어져도 제목 바로 아래부터 이어 쓰도록 내용 줄은 쪽 사이에서 나뉠 수 있습니다
    expect(rows[1]).toContain('목록 화면 개선 설명');
    expect(rows[1]).not.toContain('<w:drawing>');
    expect(rows[1]).not.toContain('<w:cantSplit/>');
    // 이미지는 한 장씩 쪽 사이에서 잘리지 않는 줄에 넣습니다
    for (const row of rows.slice(2, 5)) {
      expect(row).toContain('<w:drawing>');
      expect(row).toContain('<w:cantSplit/>');
    }
    expect(rows[5]).toContain('날짜 입력 버그 수정');
    // 기록 a의 내용과 이미지 줄 사이 세 곳만 선을 지웁니다
    expect(body.match(/<w:bottom w:val="nil"/g)).toHaveLength(3);
    expect(body.match(/<w:top w:val="nil"/g)).toHaveLength(3);
    expect(rows[5] + rows[6]).not.toContain('w:val="nil"');
  });

  it('이미지를 내용 아래에 넣으면 날짜와 제목을 회색 제목 줄로 따로 두고, 다음 줄과 같은 쪽에 붙인다', async () => {
    const day = `${shortDate('2026-07-14')} ${weekdayKo('2026-07-14')}`;
    const { body } = await build({ includeForm: false, imagesBelow: true });
    const head = body.split('<w:tr>').slice(1)[0];
    expect(head).toContain('목록 화면 개선');
    expect(head).toContain(day);
    expect(head).not.toContain('목록 화면 개선 설명');
    expect(head).toContain('w:fill="D9D9D9"');
    expect(head).toContain('<w:keepNext/>');
    // 날짜를 빼면 제목 줄에도 날짜가 없다
    expect((await build({ includeForm: false, imagesBelow: true, hideDates: true })).body).not.toContain(day);
  });
});
