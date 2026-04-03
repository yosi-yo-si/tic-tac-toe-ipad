const STORAGE_KEY = 'therapyFlowTemplatesV1';
const ACTIVE_KEY = 'therapyFlowActiveTemplateName';

const defaultPlan = {
  totalMinutes: 120,
  counselingMinutes: 5,
  prepMinutes: 5,
  sections: [
    {
      name: 'もみほぐし',
      minutes: 60,
      steps: [
        { name: '首肩', minutes: 15 },
        { name: '背中', minutes: 15 },
        { name: '腰', minutes: 10 },
        { name: '右脚', minutes: 10 },
        { name: '左脚', minutes: 10 }
      ]
    },
    {
      name: '足ツボ',
      minutes: 30,
      steps: [
        { name: '右足裏', minutes: 10 },
        { name: '左足裏', minutes: 10 },
        { name: 'ふくらはぎ', minutes: 10 }
      ]
    },
    {
      name: 'ヘッド',
      minutes: 20,
      steps: [
        { name: '頭皮', minutes: 12 },
        { name: '首まわり', minutes: 8 }
      ]
    }
  ]
};

let plan = structuredClone(defaultPlan);
let timer = {
  flatSteps: [],
  currentIndex: 0,
  remainingSec: 0,
  running: false,
  tickId: null,
  startTotalSec: 0,
  completed: 0,
  soundOn: true,
  notes: {}
};

const $ = (id) => document.getElementById(id);
const els = {
  planningScreen: $('planningScreen'),
  runScreen: $('runScreen'),
  totalMinutes: $('totalMinutes'),
  counselingMinutes: $('counselingMinutes'),
  prepMinutes: $('prepMinutes'),
  therapyMinutesMeta: $('therapyMinutesMeta'),
  sectionSumMeta: $('sectionSumMeta'),
  sectionsList: $('sectionsList'),
  addSectionBtn: $('addSectionBtn'),
  templateNameInput: $('templateNameInput'),
  templateSelect: $('templateSelect'),
  saveTemplateBtn: $('saveTemplateBtn'),
  duplicateTemplateBtn: $('duplicateTemplateBtn'),
  loadTemplateBtn: $('loadTemplateBtn'),
  deleteTemplateBtn: $('deleteTemplateBtn'),
  goRunBtn: $('goRunBtn'),
  timerCard: $('timerCard'),
  currentStepName: $('currentStepName'),
  currentStepTime: $('currentStepTime'),
  nextStepMeta: $('nextStepMeta'),
  overallRemainingMeta: $('overallRemainingMeta'),
  progressBar: $('progressBar'),
  progressMeta: $('progressMeta'),
  startBtn: $('startBtn'),
  pauseBtn: $('pauseBtn'),
  resumeBtn: $('resumeBtn'),
  prevBtn: $('prevBtn'),
  nextBtn: $('nextBtn'),
  add30Btn: $('add30Btn'),
  add60Btn: $('add60Btn'),
  sub30Btn: $('sub30Btn'),
  sub60Btn: $('sub60Btn'),
  stopBtn: $('stopBtn'),
  restartBtn: $('restartBtn'),
  backToPlanBtn: $('backToPlanBtn'),
  soundToggle: $('soundToggle'),
  stepMemoInput: $('stepMemoInput')
};

function init() {
  bindBaseInputs();
  bindRunControls();
  loadTemplatesToSelector();
  const lastName = localStorage.getItem(ACTIVE_KEY);
  if (lastName) {
    const templates = getTemplates();
    if (templates[lastName]) {
      plan = structuredClone(templates[lastName]);
      els.templateSelect.value = lastName;
    }
  }
  renderPlan();
}

function bindBaseInputs() {
  ['totalMinutes', 'counselingMinutes', 'prepMinutes'].forEach((key) => {
    els[key].addEventListener('input', () => {
      plan[key] = sanitizeMinutes(els[key].value, key === 'totalMinutes' ? 10 : 0);
      renderPlan();
    });
  });

  els.addSectionBtn.addEventListener('click', () => {
    plan.sections.push({ name: 'その他', minutes: 10, steps: [{ name: '工程', minutes: 10 }] });
    renderPlan();
  });

  els.goRunBtn.addEventListener('click', () => {
    buildFlatSteps();
    if (!timer.flatSteps.length) {
      alert('工程を1つ以上作成してください。');
      return;
    }
    switchScreen('run');
    refreshTimerUI();
  });

  els.backToPlanBtn.addEventListener('click', () => {
    stopTimer();
    switchScreen('plan');
  });

  els.saveTemplateBtn.addEventListener('click', () => saveTemplate(false));
  els.duplicateTemplateBtn.addEventListener('click', () => saveTemplate(true));
  els.loadTemplateBtn.addEventListener('click', loadSelectedTemplate);
  els.deleteTemplateBtn.addEventListener('click', deleteSelectedTemplate);
}

function bindRunControls() {
  els.startBtn.addEventListener('click', startTimer);
  els.pauseBtn.addEventListener('click', () => (timer.running = false));
  els.resumeBtn.addEventListener('click', () => (timer.running = true));
  els.prevBtn.addEventListener('click', () => moveStep(-1));
  els.nextBtn.addEventListener('click', () => moveStep(1));
  els.add30Btn.addEventListener('click', () => adjustCurrent(30));
  els.add60Btn.addEventListener('click', () => adjustCurrent(60));
  els.sub30Btn.addEventListener('click', () => adjustCurrent(-30));
  els.sub60Btn.addEventListener('click', () => adjustCurrent(-60));
  els.stopBtn.addEventListener('click', stopTimer);
  els.restartBtn.addEventListener('click', restartTimer);
  els.soundToggle.addEventListener('change', () => (timer.soundOn = els.soundToggle.checked));
  els.stepMemoInput.addEventListener('input', () => {
    const step = timer.flatSteps[timer.currentIndex];
    if (!step) return;
    timer.notes[step.id] = els.stepMemoInput.value.trim();
  });
}

function renderPlan() {
  els.totalMinutes.value = plan.totalMinutes;
  els.counselingMinutes.value = plan.counselingMinutes;
  els.prepMinutes.value = plan.prepMinutes;

  const therapyMinutes = Math.max(plan.totalMinutes - plan.counselingMinutes - plan.prepMinutes, 0);
  els.therapyMinutesMeta.textContent = `施術に使える時間: ${therapyMinutes}分`;

  const sectionSum = plan.sections.reduce((sum, s) => sum + sanitizeMinutes(s.minutes), 0);
  const diff = therapyMinutes - sectionSum;
  els.sectionSumMeta.className = `meta ${diff < 0 ? 'danger' : diff === 0 ? 'ok' : 'warn'}`;
  els.sectionSumMeta.textContent = diff === 0
    ? `大枠合計 ${sectionSum}分（ちょうど一致）`
    : diff < 0
      ? `大枠合計 ${sectionSum}分（${Math.abs(diff)}分オーバー）`
      : `大枠合計 ${sectionSum}分（あと${diff}分割当可）`;

  renderSections();
}

function renderSections() {
  els.sectionsList.innerHTML = '';

  plan.sections.forEach((section, sIdx) => {
    const wrap = document.createElement('div');
    wrap.className = 'section-card';

    const stepSum = section.steps.reduce((sum, st) => sum + sanitizeMinutes(st.minutes), 0);
    const stepDiff = sanitizeMinutes(section.minutes) - stepSum;

    wrap.innerHTML = `
      <div class="section-head">
        <label class="field">
          <span>メニュー名</span>
          <input data-action="section-name" data-sidx="${sIdx}" value="${escapeAttr(section.name)}" />
        </label>
        <label class="field">
          <span>分</span>
          <input type="number" min="1" step="1" data-action="section-min" data-sidx="${sIdx}" value="${sanitizeMinutes(section.minutes,1)}" />
        </label>
        <div class="actions">
          <button class="btn" data-action="section-up" data-sidx="${sIdx}">↑</button>
          <button class="btn" data-action="section-down" data-sidx="${sIdx}">↓</button>
          <button class="btn ghost" data-action="add-step" data-sidx="${sIdx}">+工程</button>
          <button class="btn danger" data-action="section-del" data-sidx="${sIdx}">削除</button>
        </div>
      </div>
      <p class="meta ${stepDiff === 0 ? 'ok' : 'warn'}">内訳合計 ${stepSum}分 ${stepDiff === 0 ? '（一致）' : `（差 ${stepDiff}分）`}</p>
      <div class="stack" id="steps-${sIdx}"></div>
    `;

    const stepsWrap = wrap.querySelector(`#steps-${sIdx}`);
    section.steps.forEach((step, stIdx) => {
      const row = document.createElement('div');
      row.className = 'step-row';
      row.innerHTML = `
        <div class="step-head">
          <label class="field">
            <span>工程名</span>
            <input data-action="step-name" data-sidx="${sIdx}" data-stidx="${stIdx}" value="${escapeAttr(step.name)}" />
          </label>
          <label class="field">
            <span>分</span>
            <input type="number" min="1" step="1" data-action="step-min" data-sidx="${sIdx}" data-stidx="${stIdx}" value="${sanitizeMinutes(step.minutes,1)}" />
          </label>
          <div class="actions">
            <button class="btn" data-action="step-up" data-sidx="${sIdx}" data-stidx="${stIdx}">↑</button>
            <button class="btn" data-action="step-down" data-sidx="${sIdx}" data-stidx="${stIdx}">↓</button>
            <button class="btn" data-action="dup-lr" data-sidx="${sIdx}" data-stidx="${stIdx}">左右複製</button>
            <button class="btn danger" data-action="step-del" data-sidx="${sIdx}" data-stidx="${stIdx}">削除</button>
          </div>
        </div>
      `;
      stepsWrap.appendChild(row);
    });

    els.sectionsList.appendChild(wrap);
  });

  bindDynamicActions();
}

function bindDynamicActions() {
  els.sectionsList.querySelectorAll('[data-action]').forEach((node) => {
    const action = node.dataset.action;
    const sIdx = Number(node.dataset.sidx);
    const stIdx = node.dataset.stidx !== undefined ? Number(node.dataset.stidx) : null;

    if (node.tagName === 'INPUT') {
      node.addEventListener('input', (e) => handleInputAction(action, sIdx, stIdx, e.target.value));
    } else {
      node.addEventListener('click', () => handleButtonAction(action, sIdx, stIdx));
    }
  });
}

function handleInputAction(action, sIdx, stIdx, value) {
  if (action === 'section-name') plan.sections[sIdx].name = value || '無題メニュー';
  if (action === 'section-min') plan.sections[sIdx].minutes = sanitizeMinutes(value, 1);
  if (action === 'step-name') plan.sections[sIdx].steps[stIdx].name = value || '無題工程';
  if (action === 'step-min') plan.sections[sIdx].steps[stIdx].minutes = sanitizeMinutes(value, 1);
  renderPlan();
}

function handleButtonAction(action, sIdx, stIdx) {
  const sec = plan.sections[sIdx];
  if (!sec) return;

  if (action === 'section-del') plan.sections.splice(sIdx, 1);
  if (action === 'section-up' && sIdx > 0) [plan.sections[sIdx - 1], plan.sections[sIdx]] = [plan.sections[sIdx], plan.sections[sIdx - 1]];
  if (action === 'section-down' && sIdx < plan.sections.length - 1) [plan.sections[sIdx + 1], plan.sections[sIdx]] = [plan.sections[sIdx], plan.sections[sIdx + 1]];
  if (action === 'add-step') sec.steps.push({ name: '新規工程', minutes: 5 });

  if (stIdx !== null && sec.steps[stIdx]) {
    if (action === 'step-del') sec.steps.splice(stIdx, 1);
    if (action === 'step-up' && stIdx > 0) [sec.steps[stIdx - 1], sec.steps[stIdx]] = [sec.steps[stIdx], sec.steps[stIdx - 1]];
    if (action === 'step-down' && stIdx < sec.steps.length - 1) [sec.steps[stIdx + 1], sec.steps[stIdx]] = [sec.steps[stIdx], sec.steps[stIdx + 1]];
    if (action === 'dup-lr') {
      const original = sec.steps[stIdx];
      const duplicated = duplicateLeftRightStep(original);
      sec.steps.splice(stIdx + 1, 0, duplicated);
    }
  }
  renderPlan();
}

function duplicateLeftRightStep(step) {
  const n = step.name;
  if (n.includes('右')) return { ...step, name: n.replace('右', '左') };
  if (n.includes('左')) return { ...step, name: n.replace('左', '右') };
  return { ...step, name: `${n} (反対側)` };
}

function buildFlatSteps() {
  timer.flatSteps = plan.sections.flatMap((sec, sIdx) =>
    sec.steps.map((st, stIdx) => ({
      id: `${sIdx}-${stIdx}-${Date.now()}`,
      section: sec.name,
      name: st.name,
      sec: sanitizeMinutes(st.minutes, 1) * 60
    }))
  );
  timer.currentIndex = 0;
  timer.remainingSec = timer.flatSteps[0]?.sec || 0;
  timer.startTotalSec = timer.flatSteps.reduce((sum, st) => sum + st.sec, 0);
  timer.completed = 0;
  timer.notes = {};
  els.stepMemoInput.value = '';
}

function startTimer() {
  if (!timer.flatSteps.length) buildFlatSteps();
  timer.running = true;
  clearInterval(timer.tickId);
  timer.tickId = setInterval(tick, 1000);
}

function tick() {
  if (!timer.running) return;
  if (timer.remainingSec > 0) {
    timer.remainingSec -= 1;
    refreshTimerUI();
    return;
  }
  moveStep(1, true);
}

function moveStep(direction, auto = false) {
  if (!timer.flatSteps.length) return;
  const nextIndex = timer.currentIndex + direction;
  if (nextIndex < 0) return;

  if (direction > 0) timer.completed = Math.min(timer.completed + 1, timer.flatSteps.length);
  if (nextIndex >= timer.flatSteps.length) {
    timer.running = false;
    timer.remainingSec = 0;
    refreshTimerUI(true);
    if (auto) playBeep();
    return;
  }

  timer.currentIndex = nextIndex;
  timer.remainingSec = timer.flatSteps[timer.currentIndex].sec;
  els.stepMemoInput.value = timer.notes[timer.flatSteps[timer.currentIndex].id] || '';
  animateStepChange();
  if (auto) playBeep();
  refreshTimerUI();
}

function adjustCurrent(deltaSec) {
  timer.remainingSec = Math.max(timer.remainingSec + deltaSec, 0);
  refreshTimerUI();
}

function stopTimer() {
  timer.running = false;
  clearInterval(timer.tickId);
}

function restartTimer() {
  stopTimer();
  buildFlatSteps();
  refreshTimerUI();
}

function refreshTimerUI(done = false) {
  const current = timer.flatSteps[timer.currentIndex];
  els.currentStepName.textContent = done ? '施術完了' : (current ? `${current.section} / ${current.name}` : '-');
  els.currentStepTime.textContent = formatSec(timer.remainingSec);

  const next = timer.flatSteps[timer.currentIndex + 1];
  els.nextStepMeta.textContent = `次: ${next ? `${next.section} / ${next.name}` : 'なし'}`;

  const remainingAll = timer.flatSteps.reduce((sum, st, idx) => {
    if (idx < timer.currentIndex) return sum;
    if (idx === timer.currentIndex) return sum + timer.remainingSec;
    return sum + st.sec;
  }, 0);

  els.overallRemainingMeta.textContent = `全体残り: ${formatSec(remainingAll)}`;

  const progressDone = timer.completed + (current ? (current.sec - timer.remainingSec) / current.sec : 0);
  const percent = timer.startTotalSec ? Math.min((1 - remainingAll / timer.startTotalSec) * 100, 100) : 0;
  els.progressBar.value = percent;
  els.progressMeta.textContent = `進捗 ${Math.floor(progressDone)} / ${timer.flatSteps.length}`;
}

function animateStepChange() {
  els.timerCard.classList.add('flash');
  setTimeout(() => els.timerCard.classList.remove('flash'), 260);
}

function playBeep() {
  if (!timer.soundOn) return;
  const context = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.04;
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
}

function saveTemplate(forceDuplicate) {
  const name = (els.templateNameInput.value || '').trim();
  if (!name) return alert('テンプレート名を入力してください。');

  const templates = getTemplates();
  let finalName = name;
  if (forceDuplicate && templates[finalName]) {
    let i = 2;
    while (templates[`${name} (${i})`]) i += 1;
    finalName = `${name} (${i})`;
  }

  templates[finalName] = structuredClone(plan);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  localStorage.setItem(ACTIVE_KEY, finalName);
  loadTemplatesToSelector();
  els.templateSelect.value = finalName;
}

function loadSelectedTemplate() {
  const selected = els.templateSelect.value;
  const templates = getTemplates();
  if (!templates[selected]) return;
  plan = structuredClone(templates[selected]);
  localStorage.setItem(ACTIVE_KEY, selected);
  renderPlan();
}

function deleteSelectedTemplate() {
  const selected = els.templateSelect.value;
  if (!selected) return;
  const templates = getTemplates();
  delete templates[selected];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  if (localStorage.getItem(ACTIVE_KEY) === selected) localStorage.removeItem(ACTIVE_KEY);
  loadTemplatesToSelector();
}

function loadTemplatesToSelector() {
  const templates = getTemplates();
  if (!Object.keys(templates).length) {
    templates['サンプル120分'] = structuredClone(defaultPlan);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  }

  els.templateSelect.innerHTML = '';
  Object.keys(templates).forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    els.templateSelect.appendChild(option);
  });
}

function getTemplates() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function switchScreen(screen) {
  const isPlan = screen === 'plan';
  els.planningScreen.classList.toggle('active', isPlan);
  els.runScreen.classList.toggle('active', !isPlan);
}

function sanitizeMinutes(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(Math.round(n), 0);
}

function formatSec(sec) {
  const safe = Math.max(0, Math.floor(sec));
  const m = String(Math.floor(safe / 60)).padStart(2, '0');
  const s = String(safe % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function escapeAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

init();
