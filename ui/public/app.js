const conversation = document.querySelector('#conversation');
const composer = document.querySelector('#composer');
const intentInput = document.querySelector('#intent-input');
const sendButton = document.querySelector('#send-message');
const runtimeLabel = document.querySelector('#runtime-label');
const runtimeLight = document.querySelector('#runtime-light');
const statusBadge = document.querySelector('#status-badge');
const progressSummary = document.querySelector('#progress-summary');
const missingList = document.querySelector('#missing-list');
const draftOutput = document.querySelector('#draft-output');
const errorCard = document.querySelector('#error-card');
const downloadButton = document.querySelector('#download-spec');

let sessionId;
let currentState;
let terminal = false;

function setBusy(busy) {
  intentInput.disabled = busy || terminal;
  sendButton.disabled = busy || terminal;
  sendButton.textContent = busy ? 'Thinking…' : 'Send';
}

function showError(message) {
  errorCard.hidden = false;
  errorCard.textContent = message;
  runtimeLight.className = 'offline';
}

function clearError() {
  errorCard.hidden = true;
  errorCard.textContent = '';
}

function messageElement(message) {
  const article = document.createElement('article');
  article.className = `message ${message.role}`;
  const author = document.createElement('p');
  author.className = 'message-author';
  author.textContent = message.role === 'user' ? 'YOU' : 'SPEC INTERVIEWER';
  const content = document.createElement('p');
  content.className = 'message-content';
  content.textContent = message.content;
  article.append(author, content);
  return article;
}

function renderMessages(messages = []) {
  conversation.replaceChildren(...messages.map(messageElement));
  conversation.scrollTop = conversation.scrollHeight;
}

function renderMissing(items = []) {
  missingList.replaceChildren();
  for (const item of items.slice(0, 5)) {
    const row = document.createElement('li');
    const rule = document.createElement('span');
    rule.textContent = item.ruleId;
    const slot = document.createElement('strong');
    slot.textContent = item.slot;
    row.append(rule, slot);
    missingList.append(row);
  }
  if (items.length > 5) {
    const remaining = document.createElement('li');
    remaining.textContent = `+ ${items.length - 5} more gaps`;
    missingList.append(remaining);
  }
}

function render(result) {
  currentState = result.state;
  renderMessages(currentState.messages);
  draftOutput.textContent = JSON.stringify(currentState.draft, null, 2);
  runtimeLabel.textContent = result.runtime;
  runtimeLight.className = '';
  downloadButton.hidden = result.status !== 'sealed';
  terminal = ['sealed', 'awaiting_handoff', 'blocking_decision'].includes(result.status);

  const missing = Array.isArray(result.missing)
    ? result.missing
    : result.missing ? [result.missing] : [];
  renderMissing(missing);
  statusBadge.className = `status ${result.status}`;
  statusBadge.textContent = result.status.replaceAll('_', ' ');
  if (result.status === 'sealed') {
    progressSummary.textContent = 'Zero deterministic gaps. This specification is ready for handoff.';
  } else if (result.status === 'ask') {
    progressSummary.textContent = `The next answer must resolve ${result.missing.slot}.`;
  } else if (result.status === 'awaiting_handoff') {
    progressSummary.textContent = `${missing.length} gap${missing.length === 1 ? '' : 's'} need an entitled technical author.`;
  } else if (result.status === 'blocking_decision') {
    progressSummary.textContent = 'A repeated unanswered question is now a blocking decision.';
  } else if (result.status === 'refused') {
    progressSummary.textContent = 'The turn was refused safely; the specification was not sealed.';
    showError(result.reason);
  }
}

async function post(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
  return result;
}

async function startConversation() {
  terminal = false;
  setBusy(true);
  clearError();
  try {
    const started = await post('/api/conversation/start', {});
    sessionId = started.sessionId;
    render(started);
    intentInput.value = '';
    intentInput.focus();
  } catch (error) {
    showError(`The UI server could not start a conversation: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function sendMessage() {
  const message = intentInput.value.trim();
  if (!message || !sessionId) return;
  setBusy(true);
  clearError();
  intentInput.value = '';
  renderMessages([...currentState.messages, { role: 'user', content: message }]);
  try {
    render(await post('/api/conversation/turn', { sessionId, message }));
  } catch (error) {
    intentInput.value = message;
    showError(`The conversation could not continue: ${error.message}`);
  } finally {
    setBusy(false);
    intentInput.focus();
  }
}

composer.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage();
});
intentInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});
document.querySelector('#new-session').addEventListener('click', startConversation);
downloadButton.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(currentState.draft, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'specification.json';
  link.click();
  URL.revokeObjectURL(link.href);
});

startConversation();
