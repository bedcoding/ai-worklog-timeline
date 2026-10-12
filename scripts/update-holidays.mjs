// 공휴일 자료를 받아 src/lib/holidays-kr.json 을 다시 씁니다.
// 자료는 우주항공청 월력요항을 해마다 정리해 올리는 공개 저장소(github.com/hyunbinseo/holidays-kr, MIT)에서 받습니다.
// 대체공휴일과 임시공휴일, 선거일까지 들어 있습니다.
// 실행은 npm run holidays 로 하고, 작년부터 내년까지 받습니다.
// 해를 주면 그 해만 받습니다(npm run holidays -- 2028).
// 받은 해만 바꾸고 파일에 있던 다른 해는 그대로 둡니다.
// 아직 발표되지 않은 해는 건너뜁니다.
import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

const SOURCE = 'https://holidays.hyunbin.page';
const file = path.resolve(import.meta.dirname, '../src/lib/holidays-kr.json');

const thisYear = new Date().getFullYear();
const asked = process.argv.slice(2).map(Number);
if (asked.some((y) => !Number.isInteger(y) || y < 1900 || y > 2999)) {
  console.error('사용법: npm run holidays [-- 해 ...]');
  process.exit(1);
}
const years = asked.length ? asked : [thisYear - 1, thisYear, thisYear + 1];

const data = JSON.parse(await readFile(file, 'utf8').catch(() => '{}'));
for (const year of years) {
  const res = await fetch(`${SOURCE}/${year}.json`);
  if (res.status === 404) {
    console.log(`${year}년: 아직 자료가 없어 건너뜁니다.`);
    continue;
  }
  if (!res.ok) throw new Error(`${year}년 자료를 받지 못했습니다(HTTP ${res.status}).`);
  const days = await res.json();
  // 받은 자료 모양이 바뀌었으면 파일을 망가뜨리지 않고 멈춥니다
  const valid = Object.entries(days).every(
    ([date, names]) =>
      date.startsWith(`${year}-`) &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Array.isArray(names) &&
      names.length > 0 &&
      names.every((n) => typeof n === 'string' && n.trim()),
  );
  if (!valid) throw new Error(`${year}년 자료 모양이 예상과 다릅니다. 파일은 그대로 둡니다.`);
  data[year] = days;
  console.log(`${year}년: 공휴일 ${Object.keys(days).length}일`);
}

// 해와 날짜 순서로, 날짜마다 한 줄씩 씁니다(Prettier 모양과 같음)
const yearBlocks = Object.keys(data)
  .sort()
  .map((year) => {
    const lines = Object.keys(data[year])
      .sort()
      .map((date) => `    ${JSON.stringify(date)}: [${data[year][date].map((n) => JSON.stringify(n)).join(', ')}]`);
    return `  ${JSON.stringify(year)}: {\n${lines.join(',\n')}\n  }`;
  });
await writeFile(file, `{\n${yearBlocks.join(',\n')}\n}\n`);
console.log(`${path.relative(process.cwd(), file)}에 썼습니다.`);
