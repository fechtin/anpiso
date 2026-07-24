// Sinh trang meta tĩnh /en/ và /ko/ từ dist/index.html sau khi build.
// Crawler không chạy JS nên mỗi ngôn ngữ cần một URL với meta/OG riêng;
// app bên trong vẫn là cùng một SPA bundle.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'https://anpiso.fechtin.com';

const LANGS = {
  en: {
    htmlLang: 'en',
    url: `${BASE}/en/`,
    ogLocale: 'en_US',
    // og:locale:alternate: en_US nhường chỗ cho vi_VN
    localeSwap: ['en_US', 'vi_VN'],
    ogImage: `${BASE}/og-image-en.png`,
    title: 'Anpiso — AI Meeting Assistant | Record, summarize & translate meetings',
    description: 'Anpiso records your meeting and lets AI write the minutes: live transcript, smart summary, action items with deadlines and bilingual translation in 5 languages. Runs in your browser, free with your own Gemini API key.',
    ogTitle: 'Anpiso — Record the meeting, AI writes the minutes',
    ogDescription: 'Live transcript, smart summaries, action items and bilingual translation — all automatic the moment your meeting ends.',
  },
  ko: {
    htmlLang: 'ko',
    url: `${BASE}/ko/`,
    ogLocale: 'ko_KR',
    localeSwap: ['ko_KR', 'vi_VN'],
    ogImage: `${BASE}/og-image-ko.png`,
    title: 'Anpiso — AI 회의 어시스턴트 | 회의 녹음·요약·번역',
    description: 'Anpiso가 회의를 녹음하고 AI가 회의록을 작성합니다: 실시간 자막, 스마트 요약, 마감일이 포함된 액션 아이템, 5개 언어 이중 번역. 브라우저에서 바로, 본인의 Gemini API 키로 무료.',
    ogTitle: 'Anpiso — 회의는 녹음만, 회의록은 AI가 씁니다',
    ogDescription: '실시간 자막, 스마트 요약, 액션 아이템, 이중 언어 번역 — 회의가 끝나는 순간 모두 자동으로.',
  },
};

const src = readFileSync('dist/index.html', 'utf8');

const replaceOnce = (html, pattern, replacement, label) => {
  if (!pattern.test(html)) throw new Error(`postbuild-i18n: không tìm thấy ${label}`);
  return html.replace(pattern, replacement);
};

for (const [lang, L] of Object.entries(LANGS)) {
  let html = src;
  html = replaceOnce(html, /<html lang="vi">/, `<html lang="${L.htmlLang}">`, 'html lang');
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${L.title}</title>`, 'title');
  html = replaceOnce(html, /(<meta name="description" content=")[^"]*(">)/, `$1${L.description}$2`, 'description');
  html = replaceOnce(html, /(<link rel="canonical" href=")[^"]*(">)/, `$1${L.url}$2`, 'canonical');
  html = replaceOnce(html, /(<meta property="og:url" content=")[^"]*(">)/, `$1${L.url}$2`, 'og:url');
  html = replaceOnce(html, /(<meta property="og:title" content=")[^"]*(">)/, `$1${L.ogTitle}$2`, 'og:title');
  html = replaceOnce(html, /(<meta property="og:description" content=")[^"]*(">)/, `$1${L.ogDescription}$2`, 'og:description');
  html = replaceOnce(html, /(<meta property="og:image" content=")[^"]*(">)/, `$1${L.ogImage}$2`, 'og:image');
  html = replaceOnce(html, /(<meta property="og:locale" content=")[^"]*(">)/, `$1${L.ogLocale}$2`, 'og:locale');
  // Hoán đổi alternate: ngôn ngữ chính của trang này rời khỏi danh sách alternate, vi_VN thế chỗ
  html = replaceOnce(html, new RegExp(`(<meta property="og:locale:alternate" content=")${L.localeSwap[0]}(">)`), `$1${L.localeSwap[1]}$2`, 'og:locale:alternate');
  html = replaceOnce(html, /(<meta name="twitter:title" content=")[^"]*(">)/, `$1${L.ogTitle}$2`, 'twitter:title');
  html = replaceOnce(html, /(<meta name="twitter:description" content=")[^"]*(">)/, `$1${L.ogDescription}$2`, 'twitter:description');
  html = replaceOnce(html, /(<meta name="twitter:image" content=")[^"]*(">)/, `$1${L.ogImage}$2`, 'twitter:image');

  mkdirSync(`dist/${lang}`, { recursive: true });
  writeFileSync(`dist/${lang}/index.html`, html);
  console.log(`postbuild-i18n: dist/${lang}/index.html ✓`);
}
