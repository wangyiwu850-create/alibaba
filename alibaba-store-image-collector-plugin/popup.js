const statusNode = document.querySelector('#status');
const siteNode = document.querySelector('#site');
const phaseNode = document.querySelector('#phase');
const counterNode = document.querySelector('#counter');
const currentItemNode = document.querySelector('#current-item');
const progressNode = document.querySelector('#progress');
const progressPanel = document.querySelector('#progress-panel');
const taskButtons = [document.querySelector('#current'), document.querySelector('#listing')];

function setStatus(message) {
  statusNode.textContent = message;
}

function archiveName() {
  return document.querySelector('#archive-name').value.trim() || '店铺商品图片';
}

function setBusy(value) {
  taskButtons.forEach((button) => { button.disabled = value; });
}

function renderProgress(state) {
  if (!state) return;
  progressPanel.hidden = false;
  phaseNode.textContent = state.phase || '';
  counterNode.textContent = state.total ? String(state.current || 0) + '/' + String(state.total) : '';
  progressNode.max = Math.max(state.total || 1, 1);
  progressNode.value = Math.min(state.current || 0, progressNode.max);
  currentItemNode.textContent = state.item || '';
  setBusy(state.status === 'running');
  if (state.message) setStatus(state.message);
}

async function refreshProgress() {
  const { taskProgress } = await chrome.storage.local.get('taskProgress');
  if (taskProgress?.status === 'running' && Date.now() - (taskProgress.updatedAt || 0) > 300000) {
    taskProgress.status = 'failed';
    taskProgress.phase = '任务已自动解锁';
    taskProgress.message = '超过 5 分钟没有进度，已自动解除按钮锁定。可重新开始或点击强制停止。';
    await chrome.storage.local.set({ taskProgress });
  }
  renderProgress(taskProgress);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function run(action) {
  setBusy(true);
  setStatus('任务已启动，请保持扩展窗口打开。');
  try {
    const tab = await activeTab();
    const result = await chrome.runtime.sendMessage({ action, tabId: tab.id, archiveName: archiveName() });
    setStatus(result.message);
  } catch (error) {
    setStatus('失败：' + error.message);
  } finally {
    await refreshProgress();
  }
}

document.querySelector('#current').addEventListener('click', () => run('archive-current'));
document.querySelector('#listing').addEventListener('click', () => run('archive-listing'));
document.querySelector('#reset').addEventListener('click', async () => {
  setStatus('正在强制停止任务…');
  try {
    const result = await chrome.runtime.sendMessage({ action: 'reset-task' });
    setStatus(result.message || '任务已停止并解锁。');
  } catch (error) {
    await chrome.storage.local.set({ taskProgress: { status: 'cancelled', phase: '已强制解锁', current: 0, total: 1, item: '', message: '后台已重启，按钮锁定已清除。', updatedAt: Date.now() } });
    setStatus('后台已重启，按钮锁定已清除。');
  }
  setBusy(false);
  await refreshProgress();
});

activeTab().then((tab) => chrome.tabs.sendMessage(tab.id, { action: 'platform' }))
  .then((result) => { siteNode.textContent = result.supported ? '已识别：' + result.platform : '请打开受支持的电商平台页面'; })
  .catch(() => { siteNode.textContent = '请刷新电商页面后重试'; });

refreshProgress();
setInterval(refreshProgress, 500);
