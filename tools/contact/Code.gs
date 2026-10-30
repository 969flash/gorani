/**
 * 문의 받기 — 여러 앱의 문의를 구글 시트 하나에 모으고 메일로 알린다.
 *
 * 시트(확장 프로그램 > Apps Script)에 붙여 웹 앱으로 배포한다. 절차·관리는 README.md.
 * 앱마다 탭이 하나씩 생기고, 모든 탭은 같은 칸을 쓴다(앱 칸으로도 구분된다).
 * 새 앱을 받으려면 APPS에 한 줄을 더하고 다시 배포한다 — 목록에 없는 앱은 받지 않는다.
 */

// 받을 앱: id(웹 폼이 보내는 app) → [탭 이름, 문의 번호 머리]
const APPS = {
  'gorani-web': ['Gorani 웹', 'GW'],
};

// 주제 코드 → 시트에 적는 이름(관리자가 읽는 말)
const TOPICS = { usage: '사용 방법', bug: '오류 신고', data: '지역·데이터 요청', idea: '기능 제안', other: '기타' };

const HEADERS = ['문의 번호', '받은 시각', '앱', '주제', '이름', '이메일', '내용', '언어', '페이지', '상태', '담당', '메모', '답장한 날'];
const STATUSES = ['새 문의', '확인 중', '답장함', '완료', '스팸'];
const LIMITS = { name: 60, email: 120, message: 4000, perEmailSeconds: 60, perHour: 60 };

/** 웹 폼이 보낸 문의 하나. 본문은 JSON 문자열(text/plain). 결과는 {ok, id} 또는 {ok:false, error}. */
function doPost(e) {
  try {
    const msg = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const app = APPS[msg.app];
    if (!app) return reply_({ ok: false, error: 'unknown_app' });
    const name = clean_(msg.name, LIMITS.name);
    const email = clean_(msg.email, LIMITS.email).toLowerCase();
    const message = clean_(msg.message, LIMITS.message);
    if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply_({ ok: false, error: 'invalid' });
    if (Number(msg.elapsed) < 3000) return reply_({ ok: true, id: '' });   // 사람이 3초 안에 다 쓰지는 못한다 — 봇은 조용히 버린다

    const cache = CacheService.getScriptCache();
    if (cache.get('mail:' + email)) return reply_({ ok: false, error: 'too_fast' });   // 같은 메일은 1분에 한 번
    const hourKey = 'hour:' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMddHH');
    const count = Number(cache.get(hourKey) || 0);
    if (count >= LIMITS.perHour) return reply_({ ok: false, error: 'busy' });   // 몰려 오면 막는다(메일 한도 보호)

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    let id;
    try {
      const sheet = sheetFor_(app[0]);
      const now = new Date();
      id = app[1] + '-' + Utilities.formatDate(now, 'Asia/Seoul', 'yyMMdd') + '-' + String(sheet.getLastRow()).padStart(3, '0');
      sheet.appendRow([id, now, msg.app, TOPICS[msg.topic] || '기타', cell_(name), cell_(email), cell_(message),
        cell_(clean_(msg.lang, 8)), cell_(clean_(msg.page, 300)), STATUSES[0], '', '', '']);
    } finally {
      lock.releaseLock();
    }
    cache.put('mail:' + email, '1', LIMITS.perEmailSeconds);
    cache.put(hourKey, String(count + 1), 3600);
    notify_(app[0], id, TOPICS[msg.topic] || '기타', name, email, message, msg.lang);
    return reply_({ ok: true, id: id });
  } catch (err) {
    console.error(err);
    return reply_({ ok: false, error: 'server' });
  }
}

/** 배포 주소를 브라우저로 열었을 때 — 살아 있는지만 알려 준다. */
function doGet() {
  return reply_({ ok: true, apps: Object.keys(APPS) });
}

/** 처음 한 번 실행: 앱마다 탭과 칸·상태 목록을 만든다. 알림 메일은 스크립트 속성 NOTIFY_EMAIL(없으면 이 계정). */
function setup() {
  Object.keys(APPS).forEach(function (key) { sheetFor_(APPS[key][0]); });
}

function sheetFor_(title) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(title);
  if (sheet) return sheet;
  sheet = book.insertSheet(title);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(7, 420);
  sheet.getRange('B:B').setNumberFormat('yyyy-mm-dd hh:mm');
  const status = sheet.getRange(2, HEADERS.indexOf('상태') + 1, sheet.getMaxRows() - 1, 1);
  status.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build());
  const colors = { '새 문의': '#FDECEA', '확인 중': '#FFF4E5', '답장함': '#E8F0FE', '완료': '#E6F4EA', '스팸': '#EEEEEE' };
  sheet.setConditionalFormatRules(STATUSES.map(function (s) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s).setBackground(colors[s]).setRanges([status]).build();
  }));
  return sheet;
}

function notify_(appTitle, id, topic, name, email, message, lang) {
  const to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({
    to: to,
    replyTo: email,   // 메일에서 바로 [답장]하면 문의한 사람에게 간다
    subject: '[' + appTitle + '] ' + topic + ' — ' + name + ' (' + id + ')',
    body: message + '\n\n— ' + name + ' <' + email + '> · 언어 ' + (lang || '?') + '\n시트: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl(),
  });
}

function clean_(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

/** 시트 칸에 넣을 글 — =·+·-·@로 시작하면 수식으로 읽히지 않게 앞에 '를 붙인다. */
function cell_(text) {
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
