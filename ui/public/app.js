const draftInput = document.querySelector('#draft-input');
const projectInput = document.querySelector('#project-input');
const resultTitle = document.querySelector('#result-title');
const resultSummary = document.querySelector('#result-summary');
const statusBadge = document.querySelector('#status-badge');
const missingList = document.querySelector('#missing-list');
const questionCard = document.querySelector('#question-card');
const questionText = document.querySelector('#question-text');
const rawOutput = document.querySelector('#raw-output');

let attempts = [];
let lastQuestion;
let lastDraft;

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function setStatus(status, title, summary) {
  statusBadge.className = `status ${status}`;
  statusBadge.textContent = status.replaceAll('_', ' ');
  resultTitle.textContent = title;
  resultSummary.textContent = summary;
}

function clearResult() {
  missingList.replaceChildren();
  questionCard.hidden = true;
  questionText.textContent = '';
  rawOutput.hidden = true;
  rawOutput.textContent = '';
}

function renderMissing(items = []) {
  for (const item of items) {
    const row = document.createElement('li');
    row.className = 'missing-item';
    const rule = document.createElement('span');
    rule.className = 'missing-rule';
    rule.textContent = `${item.ruleId} · ${item.slot}`;
    const message = document.createElement('p');
    message.className = 'missing-message';
    message.textContent = item.message;
    row.append(rule, message);
    missingList.append(row);
  }
}

function render(result) {
  clearResult();
  if (result.status === 'sealed') {
    setStatus('sealed', 'Specification sealed', 'Every deterministic rule is satisfied. This document is ready for the next layer.');
  } else if (result.status === 'incomplete') {
    setStatus('incomplete', 'Specification has gaps', `${result.missing.length} missing item${result.missing.length === 1 ? '' : 's'} prevent sealing.`);
    renderMissing(result.missing);
  } else if (result.status === 'ask') {
    setStatus('ask', 'One answer needed', 'This is the next requester-owned gap selected by seal-check.');
    questionCard.hidden = false;
    questionText.textContent = result.prompt;
    renderMissing([result.missing]);
    lastQuestion = result;
    lastDraft = draftInput.value;
  } else if (result.status === 'awaiting_technical_completion') {
    setStatus('ask', 'Requester intake complete', 'The remaining gaps belong to a technical author. This is a successful handoff.');
    renderMissing(result.missing);
  } else if (result.status === 'blocking_decision') {
    setStatus('refused', 'Blocking decision recorded', result.decision.question);
  } else {
    setStatus('refused', 'Request refused', result.reason ?? result.error ?? 'The input could not be evaluated safely.');
  }
  rawOutput.textContent = pretty(result);
}

function inputs() {
  return {
    draft: JSON.parse(draftInput.value),
    project: JSON.parse(projectInput.value),
  };
}

async function request(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
  return result;
}

async function loadExample() {
  const response = await fetch('/api/examples');
  const examples = await response.json();
  draftInput.value = pretty(examples.draft);
  projectInput.value = pretty(examples.project);
  attempts = [];
  lastQuestion = undefined;
  lastDraft = undefined;
  clearResult();
  setStatus('idle', 'Ready to check', 'The golden example is loaded. Edit it or run seal-check as written.');
}

async function checkDraft() {
  try {
    const { draft } = inputs();
    render(await request('/api/seal-check', { draft }));
  } catch (error) {
    clearResult();
    setStatus('error', 'Could not check draft', error.message);
  }
}

async function nextQuestion() {
  try {
    if (lastQuestion) {
      attempts.push({
        ruleId: lastQuestion.missing.ruleId,
        slot: lastQuestion.missing.slot,
        wording: lastQuestion.prompt,
        yieldedNewInformation: draftInput.value !== lastDraft,
      });
    }
    const { draft, project } = inputs();
    render(await request('/api/interview', { draft, project, attempts }));
  } catch (error) {
    clearResult();
    setStatus('error', 'Could not advance interview', error.message);
  }
}

document.querySelector('#load-example').addEventListener('click', loadExample);
document.querySelector('#check-draft').addEventListener('click', checkDraft);
document.querySelector('#next-question').addEventListener('click', nextQuestion);
loadExample().catch((error) => setStatus('error', 'Could not load example', error.message));
