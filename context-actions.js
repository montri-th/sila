/* Owner-selected contextual discovery. LDS 0.9.7 / CityChat Add-on 0.9.2.
 * No AI runtime, source upload, background request, or municipal state write. */
(function () {
  'use strict';
  var active = null;
  var serial = 0;
  var INTENTS = {
    overview: ['ข้อมูลประกอบการจัดลำดับโครงการและงบประมาณ', 'information for prioritising projects and budgets'],
    houses: ['แนวทางจัดระเบียบข้อมูลบ้านเลขที่และตรวจสอบความครบถ้วน', 'ways to organise house-number data and check coverage'],
    buildings: ['ข้อมูลประกอบการสำรวจสิ่งปลูกสร้างและวางโครงการ', 'information for building surveys and project planning'],
    roads: ['แหล่งข้อมูลถนนและแนวทางวางแผนโครงสร้างพื้นฐาน', 'road sources and infrastructure planning methods'],
    cctv: ['แนวทางดูแลกล้อง CCTV และวางแผนบริการเทศบาล', 'municipal CCTV maintenance and service planning methods'],
    education: ['ข้อมูลสถานศึกษาเพื่อวางแผนบริการพื้นที่', 'education sources for local service planning'],
    health: ['ข้อมูลสถานพยาบาลเพื่อวางแผนบริการพื้นที่', 'health-service sources for local service planning'],
    religion: ['ข้อมูลศาสนสถานประกอบการวางแผนบริการพื้นที่', 'religious-place sources for local service planning'],
    publicfacilities: ['ข้อมูลสาธารณูปการเพื่อวางแผนบริการพื้นที่', 'public-facility sources for local service planning'],
    waterways: ['ข้อมูลลำห้วยและน้ำเพื่อเตรียมโครงการป้องกันน้ำท่วม', 'waterway and water sources for flood-prevention planning'],
    population: ['แหล่งข้อมูลและวิธีสอบทานประชากรรายหมู่บ้าน', 'sources and methods for reconciling village population'],
    villages: ['แหล่งอ้างอิงขอบเขตหมู่บ้านและข้อมูลพื้นที่', 'reference sources for village boundaries and area data'],
    municipality: ['แหล่งอ้างอิงขอบเขตเทศบาลและข้อมูลพื้นที่', 'reference sources for municipal boundaries and area data'],
    election: ['แหล่งอ้างอิงขอบเขตเลือกตั้งที่ประกาศอย่างเป็นทางการ', 'officially published electoral-boundary references'],
    parcels: ['ข้อมูลที่ต้องขอเพื่อจับคู่แผนที่กับทะเบียนภาษีที่ดินและสิ่งปลูกสร้าง', 'data needed to match maps with land and building tax records'],
    flood: ['แหล่งข้อมูลน้ำและแนวทางเตรียมโครงการป้องกันน้ำท่วม', 'water sources and options for flood-prevention projects'],
    terrain: ['แหล่งข้อมูลความสูงและข้อจำกัดในการใช้ DEM วางแผนพื้นที่', 'elevation sources and limitations of DEMs in area planning']
  };
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clean(value) {
    return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 220) : '';
  }
  function isSensitive(value) {
    return /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(value) || /(?:\d[ -]?){13}/.test(value) || /(?:\+66|0)[ -]?(?:\d[ -]?){8,9}/.test(value) || /\b\d{1,3}\.\d{4,}\s*[, ]\s*-?\d{1,3}\.\d{4,}\b/.test(value) || /https?:\/\//i.test(value);
  }
  function t(th, en) { return active.language === 'en' ? en : th; }
  function defaultTexts(context, language) {
    var en = language === 'en';
    var intent = INTENTS[context.datasetId][en ? 1 : 0];
    var place = [context.scopeLabel, context.municipality, en ? 'Khon Kaen, Thailand' : 'จังหวัดขอนแก่น'].filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join(' · ');
    var query = place + ' ' + context.datasetLabel + ' ' + intent + ' ' + (en ? 'official sources' : 'แหล่งข้อมูลทางการ');
    var prompt = en
      ? 'Context: ' + place + '\nTopic: ' + context.datasetLabel + '\nTask: ' + intent + '\nHelp find publicly accessible source pages and outline what a municipal officer should check before proposing a project or budget. Separate supported facts, assumptions, missing inputs and possible actions. Give openable source links and their dates. Do not infer current flood risk, legal boundaries, population, tax coverage or tax liability from missing data. No municipal files or individual records accompany this question.'
      : 'บริบทพื้นที่: ' + place + '\nหัวข้อ: ' + context.datasetLabel + '\nงานที่ต้องการช่วย: ' + intent + '\nช่วยหาแหล่งข้อมูลสาธารณะที่เปิดอ่านได้ และเสนอสิ่งที่เจ้าหน้าที่เทศบาลควรตรวจสอบก่อนเสนอโครงการหรืองบประมาณ แยกข้อเท็จจริงที่มีแหล่งรองรับ สมมติฐาน ข้อมูลที่ยังขาด และแนวทางที่ทำต่อได้ พร้อมลิงก์ต้นทางและวันที่ของข้อมูล ห้ามเดาความเสี่ยงน้ำท่วมปัจจุบัน ขอบเขตทางกฎหมาย ประชากร ความครอบคลุมภาษี หรือภาษีที่ต้องชำระจากข้อมูลที่ไม่มี คำถามนี้ไม่ได้แนบไฟล์เทศบาลหรือรายการรายบุคคล';
    if (context.sourceDate) prompt += en ? '\nLocal data received: ' + context.sourceDate + ' (not a survey or reference date).' : '\nวันรับข้อมูลในต้นแบบ: ' + context.sourceDate + ' (ไม่ใช่วันสำรวจหรือวันอ้างอิงข้อมูล)';
    return { query: query, prompt: prompt, intent: intent, place: place };
  }
  function openExternal(url) {
    var link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.referrerPolicy = 'no-referrer';
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  function message(root, kind, value) {
    var node = root.querySelector('[data-context-status="' + kind + '"]');
    if (node) node.textContent = value;
  }
  function copy(root, kind, text) {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      var input = root.querySelector('[data-context-input="' + kind + '"]');
      input.focus(); input.select();
      message(root, kind, t('คัดลอกอัตโนมัติไม่ได้ เลือกข้อความไว้ให้แล้ว ใช้คำสั่งคัดลอกของเครื่องได้', 'Automatic copy is unavailable. The text is selected; use your device’s Copy command.'));
      return Promise.resolve(false);
    }
    return navigator.clipboard.writeText(text).then(function () {
      message(root, kind, t('คัดลอกข้อความแล้ว', 'Text copied.'));
      return true;
    }).catch(function () {
      var input = root.querySelector('[data-context-input="' + kind + '"]');
      input.focus(); input.select();
      message(root, kind, t('คัดลอกอัตโนมัติไม่ได้ เลือกข้อความไว้ให้แล้ว ใช้คำสั่งคัดลอกของเครื่องได้', 'Automatic copy failed. The text is selected; use your device’s Copy command.'));
      return false;
    });
  }
  function validate(root, kind) {
    var input = root.querySelector('[data-context-input="' + kind + '"]');
    var value = input.value.trim();
    if (!value) {
      message(root, kind, t('ใส่ข้อความก่อนเปิดเครื่องมือ', 'Enter text before opening the tool.')); input.focus(); return null;
    }
    if (isSensitive(value)) {
      message(root, kind, t('พบรูปแบบอีเมล โทรศัพท์ เลขประจำตัว พิกัด หรือลิงก์ กรุณาลบข้อมูลส่วนนี้ก่อนเปิดเครื่องมือภายนอก', 'The text contains an email, phone, identifier, precise coordinate or URL pattern. Remove it before opening the external tool.')); input.focus(); return null;
    }
    return value;
  }
  function fields(context, defaults, ai) {
    var rows = [
      [t('พื้นที่', 'Area'), context.scopeLabel],
      [t('เทศบาล', 'Municipality'), context.municipality],
      [t('จังหวัด', 'Province'), t('ขอนแก่น', 'Khon Kaen')],
      [t('ชุดข้อมูล', 'Dataset'), context.datasetLabel],
      [t('งานที่ต้องการช่วย', 'Task'), defaults.intent]
    ];
    if (ai && context.sourceDate) rows.push([t('วันรับไฟล์ · ไม่ใช่วันสำรวจ', 'File received · not survey date'), context.sourceDate]);
    return '<dl class="cc-context-fields">' + rows.map(function (row) { return '<div><dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1]) + '</dd></div>'; }).join('') + '</dl>';
  }
  function render(options) {
    options = options || {};
    var mount = typeof options.mount === 'string' ? document.getElementById(options.mount) : options.mount;
    if (!mount || typeof mount.querySelector !== 'function') return;
    var language = options.language === 'en' ? 'en' : 'th';
    var context = {
      datasetId: clean(options.datasetId), datasetLabel: clean(options.datasetLabel),
      scopeId: clean(options.scopeId), scopeLabel: clean(options.scopeLabel),
      municipality: clean(options.municipality),
      sourceDate: /^\d{4}-\d{2}-\d{2}$/.test(String(options.sourceDate || '')) ? String(options.sourceDate) : ''
    };
    var supported = Object.prototype.hasOwnProperty.call(INTENTS, context.datasetId) && /^(sila|v(?:0[1-9]|1\d|2[0-8])|e0?[1-3])$/.test(context.scopeId) && context.datasetLabel && context.scopeLabel && context.municipality && ![context.datasetLabel, context.scopeLabel, context.municipality].some(isSensitive);
    var key = context.datasetId + ':' + context.scopeId;
    var same = active && active.key === key;
    var existing = mount.querySelector('[data-sila-context-actions]');
    if (same && existing) {
      active.expanded = existing.open;
      var searchJob = existing.querySelector('[data-context-job="search"]');
      var aiJob = existing.querySelector('[data-context-job="ai"]');
      if (searchJob) active.searchExpanded = searchJob.open;
      if (aiJob) active.aiExpanded = aiJob.open;
    }
    if (same && active.language === language && existing && active.renderedContext === JSON.stringify(context)) return;
    if (!same) active = { key: key, query: '', prompt: '', queryEdited: false, promptEdited: false, expanded: false, searchExpanded: true, aiExpanded: false };
    active.language = language;
    active.context = context;
    active.renderedContext = JSON.stringify(context);
    if (!supported) {
      mount.innerHTML = '<p class="cc-context-unavailable">' + esc(t('เลือกเทศบาล หมู่บ้าน หรือเขตเลือกตั้งเพื่อค้นข้อมูลประกอบพื้นที่', 'Select a municipality, village or electoral area to find supporting context.')) + '</p>';
      return;
    }
    var defaults = defaultTexts(context, language);
    if (!active.queryEdited) active.query = defaults.query;
    if (!active.promptEdited) active.prompt = defaults.prompt;
    var focus = document.activeElement && mount.contains(document.activeElement) ? document.activeElement.getAttribute('data-context-focus') : null;
    var selection = focus && document.activeElement.selectionStart != null ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    var prefix = 'sila-context-' + (++serial);
    var html = '<details class="cc-context-actions" data-sila-context-actions' + (active.expanded ? ' open' : '') + '><summary data-context-focus="outer">' + esc(t('ค้นข้อมูลเพิ่มเพื่อวางโครงการ', 'Find more context for project planning')) + '</summary><div class="cc-context-body"><p class="cc-context-benefit">' + esc(t('ค้นต้นทางเพิ่มหรือเตรียมคำถาม โดยยังอยู่กับพื้นที่และหัวข้อที่กำลังดู', 'Find source pages or prepare a question while keeping this area and topic in view.')) + '</p>';
    html += '<details class="cc-context-job" data-context-job="search"' + (active.searchExpanded ? ' open' : '') + '><summary data-context-focus="search-disclosure">' + esc(t('ค้นแหล่งข้อมูลใน Google', 'Find sources in Google')) + '</summary><p>' + esc(t('หาเอกสารหรือข่าวต้นทางที่เปิดตรวจได้ ข้อความด้านล่างแก้ได้ก่อนเปิดแท็บใหม่', 'Find source documents or reporting to inspect. Edit the query before opening a new tab.')) + '</p><p class="cc-context-field-heading">' + esc(t('ประกอบข้อความจาก', 'Composed from')) + '</p>' + fields(context, defaults, false);
    html += '<label for="' + prefix + '-query">' + esc(t('คำค้นที่จะส่งให้ Google', 'Query to send to Google')) + '</label><textarea id="' + prefix + '-query" data-context-input="search" data-context-focus="query" rows="3" maxlength="1600" spellcheck="false">' + esc(active.query) + '</textarea><div class="cc-context-controls"><button type="button" data-context-search data-context-focus="search">' + esc(t('ค้นคำนี้ต่อใน Google', 'Search this query in Google')) + '</button><button type="button" class="cc-context-copy" data-context-copy="search" data-context-focus="copy-query">' + esc(t('คัดลอกคำค้น', 'Copy query')) + '</button></div><p class="cc-context-status" role="status" aria-live="polite" data-context-status="search"></p></details>';
    html += '<details class="cc-context-job" data-context-job="ai"' + (active.aiExpanded ? ' open' : '') + '><summary data-context-focus="ai-disclosure">' + esc(t('เตรียมคำถามเพื่อคิดต่อกับ Google AI', 'Prepare a question for Google AI')) + '</summary><p>' + esc(t('ขอให้ AI ช่วยหาข้อมูลและจัดประเด็นก่อนวางโครงการ ปุ่มนี้คัดลอกคำถามและเปิด Google AI ให้คุณวางข้อความเอง', 'Ask AI to find context and organise questions for planning. The action copies your question and opens Google AI; paste it there yourself.')) + '</p><p class="cc-context-field-heading">' + esc(t('ประกอบคำถามจาก', 'Composed from')) + '</p>' + fields(context, defaults, true);
    html += '<label for="' + prefix + '-prompt">' + esc(t('คำถามสำหรับ Google AI · แก้ได้', 'Question for Google AI · editable')) + '</label><textarea id="' + prefix + '-prompt" data-context-input="ai" data-context-focus="prompt" rows="7" maxlength="4000" spellcheck="false">' + esc(active.prompt) + '</textarea><p class="cc-context-note">' + esc(t('คำตอบอาจต่างกันตามระบบของ Google บัญชีที่ล็อกอิน ประวัติ และการปรับให้เหมาะกับผู้ใช้', 'Responses may vary with Google’s model, signed-in account, history and personalisation.')) + '</p><div class="cc-context-controls"><button type="button" data-context-ai data-context-focus="ai">' + esc(t('คัดลอกคำถามและเปิด Google AI', 'Copy question & open Google AI')) + '</button><button type="button" class="cc-context-copy" data-context-copy="ai" data-context-focus="copy-prompt">' + esc(t('คัดลอกคำถาม', 'Copy question')) + '</button></div><p class="cc-context-status" role="status" aria-live="polite" data-context-status="ai"></p><a class="cc-context-provider" href="https://www.google.com/ai" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">' + esc(t('เปิด Google AI เอง · แท็บใหม่', 'Open Google AI manually · new tab')) + '</a></details>';
    html += '<p class="cc-context-note">' + esc(t('ระบบใช้เฉพาะชื่อพื้นที่และหัวข้อ ไม่ใส่บ้านเลขที่ พิกัด หรือรายการรายบุคคลให้เอง ตรวจข้อความที่แก้ก่อนเปิดเครื่องมือภายนอก คำตอบภายนอกต้องตรวจต้นทางก่อนนำไปกำหนดโครงการหรืองบประมาณ', 'Only area names and the topic are composed; house numbers, coordinates and individual records are not added. Check your edits before opening an external tool. Verify outside sources before using them for projects or budgets.')) + '</p></div></details>';
    mount.innerHTML = html;
    var root = mount.querySelector('[data-sila-context-actions]');
    root.addEventListener('toggle', function (event) { if (event.target === root) active.expanded = root.open; });
    root.querySelectorAll('[data-context-job]').forEach(function (job) { job.addEventListener('toggle', function () { active[job.dataset.contextJob === 'search' ? 'searchExpanded' : 'aiExpanded'] = job.open; }); });
    root.querySelectorAll('[data-context-input]').forEach(function (input) {
      input.addEventListener('input', function () {
        var search = input.dataset.contextInput === 'search';
        active[search ? 'query' : 'prompt'] = input.value;
        active[search ? 'queryEdited' : 'promptEdited'] = true;
        message(root, input.dataset.contextInput, '');
      });
    });
    root.querySelector('[data-context-search]').addEventListener('click', function () {
      var query = validate(root, 'search'); if (query == null) return;
      var url = new URL('https://www.google.com/search'); url.searchParams.set('q', query); url.searchParams.set('hl', active.language);
      openExternal(url.href);
      message(root, 'search', t('เปิดคำค้นในแท็บใหม่ งานใน CityChat ยังอยู่ที่เดิม หากไม่เห็นแท็บใหม่ ใช้คำค้นที่คัดลอกได้', 'The query opens in a new tab; your CityChat work stays here. If no tab appears, use the copyable query.'));
    });
    root.querySelectorAll('[data-context-copy]').forEach(function (button) { button.addEventListener('click', function () { var kind = button.dataset.contextCopy; var value = validate(root, kind); if (value != null) copy(root, kind, value); }); });
    root.querySelector('[data-context-ai]').addEventListener('click', function () {
      var prompt = validate(root, 'ai'); if (prompt == null) return;
      openExternal('https://www.google.com/ai');
      copy(root, 'ai', prompt).then(function (ok) {
        if (ok) message(root, 'ai', t('คัดลอกคำถามแล้ว วางในช่องถามของ Google AI ในแท็บใหม่ หากไม่เห็นแท็บ ใช้ลิงก์เปิดเองด้านล่าง', 'Question copied. Paste it into Google AI in the new tab. If no tab appears, use the manual link below.'));
      });
    });
    if (focus) {
      var next = root.querySelector('[data-context-focus="' + focus + '"]');
      if (next) { next.focus({ preventScroll: true }); if (selection && next.setSelectionRange) next.setSelectionRange(selection[0], selection[1]); }
    }
  }
  window.SilaContextActions = Object.freeze({ render: render });
})();
