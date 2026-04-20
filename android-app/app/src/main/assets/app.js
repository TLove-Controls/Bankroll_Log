const DEFAULT_STATE = Object.freeze({
    bets: [],
    lessons: [],
    startingBankroll: 86.12,
    goalBankroll: 600
});

const HAS_ANDROID_BRIDGE = typeof window.AndroidStorageBridge !== 'undefined';
const SYNC_SETTINGS_KEY = 'bankroll-log-sync-settings';
const STATE_CACHE_KEY = 'bankroll-log-state-cache';

let bets = [];
let lessons = [];
let startingBankroll = DEFAULT_STATE.startingBankroll;
let goalBankroll = DEFAULT_STATE.goalBankroll;
let editingBetId = null;
let activeFilter = 'all';
let notificationTimeoutId = null;
let currentPage = 'dashboard';

document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    loadSyncSettingsIntoForm();
    updateSyncModeStatus();
    resetBetForm();

    try {
        await loadState();
    } catch (error) {
        console.error('Failed to load state:', error);
        setSaveStatus('Using defaults');
        showNotification(`Could not load saved data: ${error.message}`, 'error');
    }

    updateUI();
    navigateToPage('dashboard');
});

function bindEvents() {
    document.getElementById('quickAddBtn').addEventListener('click', openQuickAdd);
    document.getElementById('betForm').addEventListener('submit', onBetSubmit);
    document.getElementById('bankrollSettingsForm').addEventListener('submit', saveBankrollSettings);
    document.getElementById('syncSettingsForm').addEventListener('submit', saveSyncSettings);
    document.getElementById('resetFormBtn').addEventListener('click', resetBetForm);
    document.getElementById('recalcUnitBtn').addEventListener('click', calculateUnit);
    document.getElementById('betType').addEventListener('change', onBetTypeChange);
    document.getElementById('betEdge').addEventListener('change', onBetEdgeChange);
    document.getElementById('saveLessonBtn').addEventListener('click', addLesson);
    document.getElementById('syncNowBtn').addEventListener('click', syncNow);
    document.getElementById('clearSyncSettingsBtn').addEventListener('click', clearSyncSettings);
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', handleFileImport);
    document.getElementById('clearAllBtn').addEventListener('click', clearAllData);
    document.querySelectorAll('.bottom-nav-link').forEach((button) => {
        button.addEventListener('click', () => {
            navigateToPage(button.dataset.page);
        });
    });
    document.querySelectorAll('[data-page-link]').forEach((button) => {
        button.addEventListener('click', () => {
            navigateToPage(button.dataset.pageLink);
        });
    });
    document.querySelectorAll('.collapse-toggle').forEach((button) => {
        button.addEventListener('click', () => {
            toggleCollapseSection(button);
        });
    });

    document.querySelectorAll('.filter-button').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.filter-button').forEach((entry) => entry.classList.remove('active'));
            button.classList.add('active');
            activeFilter = button.dataset.filter;
            updateBetTable(activeFilter);
        });
    });
}

function toggleCollapseSection(button, forceExpanded = null) {
    const targetId = button.dataset.collapseTarget;
    const target = document.getElementById(targetId);
    const parentCard = button.closest('.collapsible-card');
    const isExpanded = forceExpanded === null
        ? button.getAttribute('aria-expanded') !== 'true'
        : forceExpanded;

    button.setAttribute('aria-expanded', String(isExpanded));
    target.classList.toggle('hidden-field', !isExpanded);
    parentCard.classList.toggle('expanded', isExpanded);
}

function expandEntrySection(sectionName) {
    const section = document.querySelector(`.collapsible-card[data-section="${sectionName}"]`);
    if (!section) {
        return;
    }

    const toggleButton = section.querySelector('.collapse-toggle');
    if (!toggleButton) {
        return;
    }

    toggleCollapseSection(toggleButton, true);
}

function openQuickAdd() {
    navigateToPage('entry');
    expandEntrySection('bet-entry');
    setTimeout(() => {
        document.getElementById('betTeam').focus();
    }, 120);
}

function navigateToPage(pageName) {
    currentPage = pageName;

    document.querySelectorAll('.app-page').forEach((page) => {
        page.classList.toggle('active', page.dataset.page === pageName);
    });

    document.querySelectorAll('.bottom-nav-link').forEach((button) => {
        button.classList.toggle('active', button.dataset.page === pageName);
    });

    const pageTitles = {
        dashboard: 'Overview',
        entry: 'Entry',
        history: 'Past Bets'
    };

    document.getElementById('currentPageTitle').textContent = pageTitles[pageName] || 'Bankroll Log';
    document.getElementById('quickAddBtn').classList.toggle('is-hidden', pageName === 'entry');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getLocalDateString(date = new Date()) {
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - timezoneOffset).toISOString().split('T')[0];
}

function parseAmount(value, fallback = 0) {
    const amount = Number.parseFloat(value);
    return Number.isFinite(amount) ? amount : fallback;
}

function getDefaultSyncSettings() {
    return {
        apiUrl: '',
        accessToken: ''
    };
}

function sanitizeSyncSettings(rawSettings = {}) {
    return {
        apiUrl: String(rawSettings.apiUrl || '').trim().replace(/\/+$/, ''),
        accessToken: String(rawSettings.accessToken || '').trim()
    };
}

function getSyncSettings() {
    try {
        const rawSettings = localStorage.getItem(SYNC_SETTINGS_KEY);
        return sanitizeSyncSettings(rawSettings ? JSON.parse(rawSettings) : getDefaultSyncSettings());
    } catch {
        return getDefaultSyncSettings();
    }
}

function hasCloudSync() {
    return Boolean(getSyncSettings().apiUrl);
}

function persistSyncSettings(settings) {
    localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(sanitizeSyncSettings(settings)));
}

function loadSyncSettingsIntoForm() {
    const settings = getSyncSettings();
    document.getElementById('syncApiUrl').value = settings.apiUrl;
    document.getElementById('syncAccessToken').value = settings.accessToken;
}

function updateSyncModeStatus() {
    const settings = getSyncSettings();
    const statusElement = document.getElementById('syncModeStatus');

    statusElement.textContent = settings.apiUrl
        ? `Cloud sync active: ${settings.apiUrl}`
        : 'Using on-device storage only.';
}

function getApiUrl(pathname) {
    const settings = getSyncSettings();
    return settings.apiUrl ? `${settings.apiUrl}${pathname}` : pathname;
}

function getAuthHeaders() {
    const settings = getSyncSettings();
    return settings.accessToken ? { Authorization: `Bearer ${settings.accessToken}` } : {};
}

function saveDeviceMirror(state) {
    const normalizedState = normalizeState(state);
    const stateJson = JSON.stringify(normalizedState);
    let saved = false;

    if (HAS_ANDROID_BRIDGE) {
        try {
            saved = window.AndroidStorageBridge.saveState(stateJson);
        } catch {
            saved = false;
        }
    }

    try {
        localStorage.setItem(STATE_CACHE_KEY, stateJson);
        saved = true;
    } catch {
        // Ignore cache failures.
    }

    return saved;
}

function loadDeviceMirror() {
    if (HAS_ANDROID_BRIDGE) {
        try {
            const rawState = window.AndroidStorageBridge.loadState();
            if (rawState) {
                return normalizeState(JSON.parse(rawState));
            }
        } catch {
            // Ignore Android cache failures and try localStorage next.
        }
    }

    try {
        const rawState = localStorage.getItem(STATE_CACHE_KEY);
        return rawState ? normalizeState(JSON.parse(rawState)) : null;
    } catch {
        return null;
    }
}

function normalizeBet(rawBet = {}) {
    const result = rawBet.result || 'pending';
    const stake = parseAmount(rawBet.stake);
    const hasReturnValue = rawBet.return !== undefined && rawBet.return !== null && rawBet.return !== '';
    const normalizedReturn = hasReturnValue
        ? parseAmount(rawBet.return)
        : (result === 'push' ? stake : 0);
    const normalizedType = rawBet.type || 'Moneyline';
    const parlayLegs = normalizedType === 'Parlay' && ['2', '3', 2, 3].includes(rawBet.parlayLegs)
        ? Number(rawBet.parlayLegs)
        : null;

    return {
        id: rawBet.id ?? Date.now(),
        date: rawBet.date || getLocalDateString(),
        startTime: rawBet.startTime || '',
        sport: rawBet.sport || 'Other',
        team: rawBet.team || '',
        type: normalizedType,
        parlayLegs,
        stake,
        odds: rawBet.odds || '',
        edge: rawBet.edge || '',
        result,
        return: normalizedReturn,
        notes: rawBet.notes || ''
    };
}

function normalizeLesson(rawLesson = {}) {
    return {
        id: rawLesson.id ?? Date.now(),
        date: rawLesson.date || getLocalDateString(),
        text: rawLesson.text || ''
    };
}

function normalizeState(rawState = {}) {
    return {
        bets: Array.isArray(rawState.bets) ? rawState.bets.map(normalizeBet) : [],
        lessons: Array.isArray(rawState.lessons) ? rawState.lessons.map(normalizeLesson) : [],
        startingBankroll: parseAmount(rawState.startingBankroll, DEFAULT_STATE.startingBankroll),
        goalBankroll: parseAmount(rawState.goalBankroll, DEFAULT_STATE.goalBankroll)
    };
}

function getBetEdgeValue() {
    const selectedEdge = document.getElementById('betEdge').value;
    if (selectedEdge === 'Custom') {
        return document.getElementById('betEdgeCustom').value.trim();
    }

    return selectedEdge;
}

function syncParlayFields(typeValue = 'Moneyline', parlayLegsValue = null) {
    const parlayLegsWrap = document.getElementById('parlayLegsWrap');
    const parlayLegsInput = document.getElementById('parlayLegs');
    const isParlay = typeValue === 'Parlay';

    parlayLegsWrap.classList.toggle('hidden-field', !isParlay);

    if (!isParlay) {
        parlayLegsInput.value = '';
        return;
    }

    parlayLegsInput.value = parlayLegsValue ? String(parlayLegsValue) : '';
}

function onBetTypeChange() {
    syncParlayFields(document.getElementById('betType').value);
}

function syncBetEdgeFields(edgeValue = '') {
    const edgeSelect = document.getElementById('betEdge');
    const edgeCustomWrap = document.getElementById('betEdgeCustomWrap');
    const edgeCustomInput = document.getElementById('betEdgeCustom');
    const availableValues = Array.from(edgeSelect.options).map((option) => option.value);
    const normalizedEdgeValue = edgeValue || '';
    const isBuiltInValue = availableValues.includes(normalizedEdgeValue) && normalizedEdgeValue !== 'Custom';

    if (!normalizedEdgeValue) {
        edgeSelect.value = '';
        edgeCustomInput.value = '';
        edgeCustomWrap.classList.add('hidden-field');
        return;
    }

    if (isBuiltInValue) {
        edgeSelect.value = normalizedEdgeValue;
        edgeCustomInput.value = '';
        edgeCustomWrap.classList.add('hidden-field');
        return;
    }

    edgeSelect.value = 'Custom';
    edgeCustomInput.value = normalizedEdgeValue;
    edgeCustomWrap.classList.remove('hidden-field');
}

function onBetEdgeChange() {
    const edgeCustomWrap = document.getElementById('betEdgeCustomWrap');
    const edgeCustomInput = document.getElementById('betEdgeCustom');
    const isCustom = document.getElementById('betEdge').value === 'Custom';

    edgeCustomWrap.classList.toggle('hidden-field', !isCustom);

    if (isCustom) {
        edgeCustomInput.focus();
    } else {
        edgeCustomInput.value = '';
    }
}

function snapshotState() {
    return normalizeState({ bets, lessons, startingBankroll, goalBankroll });
}

function applyState(state) {
    const nextState = normalizeState(state);
    bets = nextState.bets;
    lessons = nextState.lessons;
    startingBankroll = nextState.startingBankroll;
    goalBankroll = nextState.goalBankroll;
}

async function requestJSON(url, options = {}) {
    const headers = options.body
        ? { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(options.headers || {}) }
        : { ...getAuthHeaders(), ...(options.headers || {}) };

    const response = await fetch(getApiUrl(url), { ...options, headers });

    if (!response.ok) {
        let errorMessage = `Request failed with status ${response.status}`;

        try {
            const payload = await response.json();
            if (payload && payload.error) {
                errorMessage = payload.error;
            }
        } catch (error) {
            // Ignore parse failures on error responses.
        }

        throw new Error(errorMessage);
    }

    return response.json();
}

async function loadState() {
    if (hasCloudSync()) {
        try {
            const response = await requestJSON('/api/state');
            const state = response.state || response;
            applyState(state);
            saveDeviceMirror(state);
            setSaveStatus('Synced with cloud');
            return;
        } catch (error) {
            const mirroredState = loadDeviceMirror();
            if (!mirroredState) {
                throw error;
            }

            applyState(mirroredState);
            setSaveStatus('Using cached cloud data');
            showNotification('Cloud sync is unavailable. Showing cached device data.', 'error');
            return;
        }
    }

    if (HAS_ANDROID_BRIDGE) {
        const mirroredState = loadDeviceMirror();
        applyState(mirroredState || DEFAULT_STATE);
        setSaveStatus('Loaded from device');
        return;
    }

    const response = await requestJSON('/api/state');
    const state = response.state || response;
    applyState(state);
    saveDeviceMirror(state);
    setSaveStatus('Loaded saved data');
}

async function persistState() {
    if (hasCloudSync()) {
        setSaveStatus('Syncing...');
        const response = await requestJSON('/api/state', {
            method: 'PUT',
            body: JSON.stringify(snapshotState())
        });
        const state = response.state || response;
        applyState(state);
        saveDeviceMirror(state);
        setSaveStatus('Synced with cloud');
        return;
    }

    if (HAS_ANDROID_BRIDGE) {
        setSaveStatus('Saving on device...');
        const saved = saveDeviceMirror(snapshotState());
        if (!saved) {
            throw new Error('Android storage bridge could not save your data.');
        }

        setSaveStatus('Saved on device');
        return;
    }

    setSaveStatus('Saving...');
    const response = await requestJSON('/api/state', {
        method: 'PUT',
        body: JSON.stringify(snapshotState())
    });
    const state = response.state || response;
    applyState(state);
    saveDeviceMirror(state);
    setSaveStatus('Saved');
}

function updateUI() {
    updateGoalDisplay();
    updateBankroll();
    updateStats();
    updateRecentBetsPreview();
    updateLessons();
    updateBetTable(activeFilter);
    updateProgress();
    syncBankrollSettingsForm();
}

function updateGoalDisplay() {
    document.getElementById('goalBankrollLabel').textContent = `Goal: $${goalBankroll.toFixed(2)}`;
}

function getCurrentBankroll() {
    return bets.reduce((currentBankroll, bet) => {
        if (bet.result === 'win' || bet.result === 'cashout') {
            return currentBankroll - bet.stake + bet.return;
        }

        if (bet.result === 'push') {
            return currentBankroll - bet.stake + (bet.return || bet.stake);
        }

        if (bet.result === 'loss') {
            return currentBankroll - bet.stake;
        }

        return currentBankroll;
    }, startingBankroll);
}

function syncBankrollSettingsForm() {
    document.getElementById('currentBankrollInput').value = getCurrentBankroll().toFixed(2);
    document.getElementById('goalBankrollInput').value = goalBankroll.toFixed(2);
}

function updateBankroll() {
    const currentBankroll = getCurrentBankroll();
    document.getElementById('bankrollDisplay').textContent = `$${currentBankroll.toFixed(2)}`;
    document.getElementById('startingBankroll').textContent = `$${startingBankroll.toFixed(2)}`;
    document.getElementById('unitValue').textContent = `$${(currentBankroll * 0.06).toFixed(2)}`;
}

function updateStats() {
    const today = getLocalDateString();
    const todayBets = bets.filter((bet) => bet.date === today);
    const settledBets = bets.filter((bet) => bet.result !== 'pending' && bet.result !== 'push');
    const completedBets = bets.filter((bet) => bet.result !== 'pending');
    const wins = settledBets.filter((bet) => bet.result === 'win' || bet.result === 'cashout');

    document.getElementById('todayBets').textContent = `${todayBets.length}`;
    document.getElementById('todayWins').textContent = `${todayBets.filter((bet) => bet.result === 'win' || bet.result === 'cashout').length}`;
    document.getElementById('todayLosses').textContent = `${todayBets.filter((bet) => bet.result === 'loss').length}`;
    document.getElementById('totalBets').textContent = `${completedBets.length}`;
    document.getElementById('winRate').textContent = `${settledBets.length ? ((wins.length / settledBets.length) * 100).toFixed(1) : '0.0'}%`;

    const totals = completedBets.reduce((accumulator, bet) => {
        accumulator.staked += bet.stake;

        if (bet.result === 'win' || bet.result === 'cashout') {
            accumulator.returned += bet.return;
        } else if (bet.result === 'push') {
            accumulator.returned += bet.return || bet.stake;
        }

        return accumulator;
    }, { staked: 0, returned: 0 });

    const profit = totals.returned - totals.staked;
    const profitElement = document.getElementById('totalProfit');
    profitElement.textContent = `${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`;
    profitElement.classList.toggle('loss-text', profit < 0);
    document.getElementById('roi').textContent = `${totals.staked ? ((profit / totals.staked) * 100).toFixed(1) : '0.0'}%`;

    const streaks = calculateStreaks();
    document.getElementById('bestStreak').textContent = `${streaks.best}`;
    document.getElementById('currentStreak').textContent = `${streaks.current}`;
}

function calculateStreaks() {
    let best = 0;
    let currentRun = 0;
    let current = 0;

    const settledBets = [...bets]
        .filter((bet) => bet.result !== 'pending' && bet.result !== 'push')
        .sort((left, right) => new Date(left.date) - new Date(right.date));

    settledBets.forEach((bet) => {
        if (bet.result === 'win' || bet.result === 'cashout') {
            currentRun += 1;
            best = Math.max(best, currentRun);
        } else {
            currentRun = 0;
        }
    });

    [...settledBets].reverse().some((bet) => {
        if (bet.result === 'win' || bet.result === 'cashout') {
            current += 1;
            return false;
        }

        return true;
    });

    return { best, current };
}

function updateProgress() {
    const currentBankroll = getCurrentBankroll();
    const range = goalBankroll - startingBankroll;
    const progress = range === 0 ? 100 : ((currentBankroll - startingBankroll) / range) * 100;
    const clampedProgress = Math.max(0, Math.min(100, progress));

    document.getElementById('progressFill').style.width = `${clampedProgress}%`;
    document.getElementById('progressPercent').textContent = `${clampedProgress.toFixed(0)}%`;
}

function updateBetTable(filter = 'all') {
    const body = document.getElementById('betTableBody');
    const filteredBets = filter === 'all' ? bets : bets.filter((bet) => bet.result === filter);

    if (!filteredBets.length) {
        body.innerHTML = '<div class="empty-state">No bets logged yet.</div>';
        return;
    }

    const groupedBets = filteredBets.reduce((groups, bet) => {
        if (!groups.has(bet.date)) {
            groups.set(bet.date, []);
        }

        groups.get(bet.date).push(bet);
        return groups;
    }, new Map());

    body.innerHTML = Array.from(groupedBets.entries()).map(([date, dayBets]) => {
        const dayStats = dayBets.reduce((stats, bet) => {
            stats.count += 1;

            if (bet.result === 'win' || bet.result === 'cashout') {
                stats.profit += bet.return - bet.stake;
            } else if (bet.result === 'loss') {
                stats.profit -= bet.stake;
            }

            return stats;
        }, { count: 0, profit: 0 });

        return `
            <section class="day-card">
                <header class="day-card-header">
                    <div>
                        <h4>${formatDisplayDate(date)}</h4>
                        <p>${dayStats.count} bet${dayStats.count === 1 ? '' : 's'}</p>
                    </div>
                    <div class="day-card-profit ${dayStats.profit < 0 ? 'loss-text' : ''}">
                        ${dayStats.profit >= 0 ? '+' : ''}$${dayStats.profit.toFixed(2)}
                    </div>
                </header>
                <div class="day-card-bets">
                    ${dayBets.map(renderBetCardItem).join('')}
                </div>
            </section>
        `;
    }).join('');
}

function updateRecentBetsPreview() {
    const container = document.getElementById('recentBetsPreview');
    const sortedBets = [...bets]
        .sort((left, right) => {
            const dateDelta = new Date(right.date) - new Date(left.date);
            return dateDelta || right.id - left.id;
        });
    const recentBets = sortedBets.filter((bet) => bet.result === 'pending');

    if (!recentBets.length) {
        container.innerHTML = '<div class="empty-state">No pending bets right now.</div>';
        return;
    }

    container.innerHTML = recentBets.map((bet) => {
        const badgeType = bet.result === 'win' || bet.result === 'cashout'
            ? 'win'
            : bet.result === 'loss'
                ? 'loss'
                : 'pending';
        const parlayLabel = bet.type === 'Parlay' && bet.parlayLegs
            ? `${bet.parlayLegs}-Leg Parlay`
            : bet.type;

        return `
            <article class="recent-bet-item">
                <div class="recent-bet-top">
                    <div class="recent-bet-title">${escapeHtml(bet.team)}</div>
                    <span class="badge ${badgeType}">${escapeHtml(bet.result)}</span>
                </div>
                <div class="recent-bet-meta">
                    <span>${formatShortDisplayDate(bet.date)}</span>
                    ${bet.startTime ? `<span>${formatDisplayTime(bet.startTime)}</span>` : ''}
                    <span>${escapeHtml(bet.sport)}</span>
                    <span>${escapeHtml(parlayLabel)}</span>
                    <span>Stake $${bet.stake.toFixed(2)}</span>
                </div>
            </article>
        `;
    }).join('');
}

function renderBetCardItem(bet) {
    const badgeType = bet.result === 'win' || bet.result === 'cashout'
        ? 'win'
        : bet.result === 'loss'
            ? 'loss'
            : 'pending';
    const parlayLabel = bet.type === 'Parlay' && bet.parlayLegs
        ? `${bet.parlayLegs}-Leg Parlay`
        : bet.type;
    const returnLabel = bet.return > 0
        ? `$${bet.return.toFixed(2)}`
        : bet.result === 'push'
            ? `$${bet.stake.toFixed(2)}`
            : '-';
    const hasDetails = Boolean(bet.edge || bet.notes || bet.return > 0 || bet.result === 'push');

    return `
        <article class="bet-log-item">
            <div class="bet-log-main">
                <div class="bet-log-topline">
                    <div class="bet-log-title">${escapeHtml(bet.team)}</div>
                    <span class="badge ${badgeType}">${escapeHtml(bet.result)}</span>
                </div>
                <div class="bet-log-summary-row">
                    <span>${escapeHtml(bet.sport)}</span>
                    <span>${escapeHtml(parlayLabel)}</span>
                    ${bet.startTime ? `<span>${formatDisplayTime(bet.startTime)}</span>` : ''}
                    <span>${escapeHtml(bet.odds)}</span>
                    <span>S $${bet.stake.toFixed(2)}</span>
                </div>
            </div>
            <div class="bet-log-footer">
                ${hasDetails ? `
                    <details class="bet-log-details">
                        <summary>Details</summary>
                        <div class="bet-log-extra-meta">
                            <span>Return ${returnLabel}</span>
                            ${bet.edge ? `<span>Edge ${escapeHtml(bet.edge)}</span>` : ''}
                        </div>
                        ${bet.notes ? `<p class="bet-log-notes">${escapeHtml(bet.notes)}</p>` : ''}
                    </details>
                ` : '<div></div>'}
                <div class="table-actions">
                    <button type="button" class="table-action" onclick="editBet(${bet.id})">Edit</button>
                    <button type="button" class="table-action delete" onclick="deleteBet(${bet.id})">Delete</button>
                </div>
            </div>
        </article>
    `;
}

function formatDisplayDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    if (Number.isNaN(date.getTime())) {
        return dateString;
    }

    return date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatShortDisplayDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    if (Number.isNaN(date.getTime())) {
        return dateString;
    }

    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
    });
}

function formatDisplayTime(timeString) {
    if (!timeString) {
        return '';
    }

    const [hours, minutes] = timeString.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return timeString;
    }

    const date = new Date();
    date.setHours(hours, minutes, 0, 0);

    return date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit'
    });
}

function updateLessons() {
    const lessonList = document.getElementById('lessonList');

    if (!lessons.length) {
        lessonList.innerHTML = '<li class="empty-state">No lessons saved yet.</li>';
        return;
    }

    lessonList.innerHTML = lessons.map((lesson) => `
        <li>
            <div class="lesson-meta">
                <strong>${escapeHtml(lesson.text)}</strong>
                <span class="lesson-date">${lesson.date}</span>
            </div>
            <button type="button" class="table-action delete" onclick="deleteLesson(${lesson.id})">Delete</button>
        </li>
    `).join('');
}

async function onBetSubmit(event) {
    event.preventDefault();

    const previousState = snapshotState();
    const nextBet = normalizeBet({
        id: editingBetId ?? Date.now(),
        date: document.getElementById('betDate').value,
        startTime: document.getElementById('betStartTime').value,
        sport: document.getElementById('betSport').value,
        team: document.getElementById('betTeam').value,
        type: document.getElementById('betType').value,
        parlayLegs: document.getElementById('parlayLegs').value,
        stake: document.getElementById('betStake').value,
        odds: document.getElementById('betOdds').value,
        edge: getBetEdgeValue(),
        result: document.getElementById('betResult').value,
        return: document.getElementById('betReturn').value,
        notes: document.getElementById('betNotes').value
    });

    const isEditing = editingBetId !== null;
    bets = isEditing
        ? bets.map((bet) => bet.id === editingBetId ? nextBet : bet)
        : [nextBet, ...bets];

    try {
        await persistState();
        resetBetForm();
        updateUI();
        showNotification(isEditing ? 'Bet updated successfully.' : 'Bet added successfully.');
    } catch (error) {
        applyState(previousState);
        updateUI();
        setSaveStatus('Save failed');
        showNotification(`Could not save bet: ${error.message}`, 'error');
    }
}

function editBet(id) {
    const bet = bets.find((entry) => entry.id === id);
    if (!bet) {
        return;
    }

    editingBetId = id;
    document.getElementById('formTitle').textContent = 'Edit wager';
    document.getElementById('submitBetBtn').textContent = 'Update Bet';
    document.getElementById('betDate').value = bet.date;
    document.getElementById('betStartTime').value = bet.startTime || '';
    document.getElementById('betSport').value = bet.sport;
    document.getElementById('betTeam').value = bet.team;
    document.getElementById('betType').value = bet.type;
    syncParlayFields(bet.type, bet.parlayLegs);
    document.getElementById('betStake').value = bet.stake;
    document.getElementById('betOdds').value = bet.odds;
    document.getElementById('betResult').value = bet.result;
    document.getElementById('betReturn').value = bet.return || '';
    syncBetEdgeFields(bet.edge);
    document.getElementById('betNotes').value = bet.notes;

    navigateToPage('entry');
    expandEntrySection('bet-entry');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetBetForm() {
    editingBetId = null;
    document.getElementById('formTitle').textContent = 'Add a new wager';
    document.getElementById('submitBetBtn').textContent = 'Add Bet';
    document.getElementById('betForm').reset();
    document.getElementById('betDate').value = getLocalDateString();
    syncParlayFields('Moneyline');
    syncBetEdgeFields('');
}

async function saveSyncSettings(event) {
    event.preventDefault();

    const settings = sanitizeSyncSettings({
        apiUrl: document.getElementById('syncApiUrl').value,
        accessToken: document.getElementById('syncAccessToken').value
    });

    persistSyncSettings(settings);
    loadSyncSettingsIntoForm();
    updateSyncModeStatus();

    try {
        await loadState();
        updateUI();
        showNotification(settings.apiUrl ? 'Cloud sync settings saved.' : 'Using on-device storage only.');
    } catch (error) {
        setSaveStatus('Sync settings saved');
        showNotification(`Saved settings, but could not reach sync server: ${error.message}`, 'error');
    }
}

async function syncNow() {
    try {
        await loadState();
        updateUI();
        showNotification(hasCloudSync() ? 'Synced with cloud.' : 'Reloaded device data.');
    } catch (error) {
        setSaveStatus('Sync failed');
        showNotification(`Could not sync right now: ${error.message}`, 'error');
    }
}

function clearSyncSettings() {
    persistSyncSettings(getDefaultSyncSettings());
    loadSyncSettingsIntoForm();
    updateSyncModeStatus();
    showNotification('Cloud sync disabled on this phone.');
}

async function deleteBet(id) {
    if (!confirm('Delete this bet?')) {
        return;
    }

    const previousState = snapshotState();
    bets = bets.filter((bet) => bet.id !== id);

    if (editingBetId === id) {
        resetBetForm();
    }

    try {
        await persistState();
        updateUI();
        showNotification('Bet deleted.');
    } catch (error) {
        applyState(previousState);
        updateUI();
        setSaveStatus('Save failed');
        showNotification(`Could not delete bet: ${error.message}`, 'error');
    }
}

async function addLesson() {
    const lessonInput = document.getElementById('lessonInput');
    const text = lessonInput.value.trim();

    if (!text) {
        showNotification('Enter a lesson before saving.', 'error');
        return;
    }

    const previousState = snapshotState();
    lessons = [normalizeLesson({ id: Date.now(), text }), ...lessons];

    try {
        await persistState();
        lessonInput.value = '';
        updateLessons();
        showNotification('Lesson saved.');
    } catch (error) {
        applyState(previousState);
        updateLessons();
        setSaveStatus('Save failed');
        showNotification(`Could not save lesson: ${error.message}`, 'error');
    }
}

async function deleteLesson(id) {
    const previousState = snapshotState();
    lessons = lessons.filter((lesson) => lesson.id !== id);

    try {
        await persistState();
        updateLessons();
        showNotification('Lesson deleted.');
    } catch (error) {
        applyState(previousState);
        updateLessons();
        setSaveStatus('Save failed');
        showNotification(`Could not delete lesson: ${error.message}`, 'error');
    }
}

async function saveBankrollSettings(event) {
    event.preventDefault();

    const nextCurrentBankroll = parseAmount(document.getElementById('currentBankrollInput').value, NaN);
    const nextGoalBankroll = parseAmount(document.getElementById('goalBankrollInput').value, NaN);

    if (!Number.isFinite(nextCurrentBankroll) || nextCurrentBankroll < 0) {
        showNotification('Enter a valid current bankroll amount.', 'error');
        return;
    }

    if (!Number.isFinite(nextGoalBankroll) || nextGoalBankroll < 0) {
        showNotification('Enter a valid goal bankroll amount.', 'error');
        return;
    }

    const previousState = snapshotState();
    const currentBankrollBeforeAdjustment = getCurrentBankroll();
    const bankrollDelta = nextCurrentBankroll - currentBankrollBeforeAdjustment;

    startingBankroll += bankrollDelta;
    goalBankroll = nextGoalBankroll;

    try {
        await persistState();
        updateUI();
        showNotification('Bankroll settings updated.');
    } catch (error) {
        applyState(previousState);
        updateUI();
        setSaveStatus('Save failed');
        showNotification(`Could not update bankroll: ${error.message}`, 'error');
    }
}

function calculateUnit() {
    updateBankroll();
    showNotification('Unit size refreshed.');
}

function exportData() {
    const payload = {
        ...snapshotState(),
        exportDate: new Date().toISOString()
    };

    if (HAS_ANDROID_BRIDGE) {
        const filename = `bankroll-log-${getLocalDateString()}.json`;
        const exported = window.AndroidStorageBridge.exportState(JSON.stringify(payload, null, 2), filename);

        if (exported) {
            showNotification('Exported current data to Downloads.');
        } else {
            showNotification('Could not export data on this device.', 'error');
        }
        return;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bankroll-log-${getLocalDateString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showNotification('Exported current data.');
}

function handleFileImport(event) {
    const [file] = event.target.files;
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
        const previousState = snapshotState();

        try {
            applyState(JSON.parse(loadEvent.target.result));
            await persistState();
            resetBetForm();
            updateUI();
            showNotification('Imported data successfully.');
        } catch (error) {
            applyState(previousState);
            updateUI();
            setSaveStatus('Import failed');
            showNotification(`Could not import file: ${error.message}`, 'error');
        } finally {
            event.target.value = '';
        }
    };

    reader.readAsText(file);
}

async function clearAllData() {
    if (!confirm('Clear all bankroll data? This cannot be undone.')) {
        return;
    }

    const previousState = snapshotState();
    applyState(DEFAULT_STATE);

    try {
        await persistState();
        resetBetForm();
        updateUI();
        showNotification('All data cleared.');
    } catch (error) {
        applyState(previousState);
        updateUI();
        setSaveStatus('Clear failed');
        showNotification(`Could not clear data: ${error.message}`, 'error');
    }
}

function setSaveStatus(message) {
    document.getElementById('saveStatus').textContent = message;
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `toast ${type} show`;

    if (notificationTimeoutId) {
        window.clearTimeout(notificationTimeoutId);
    }

    notificationTimeoutId = window.setTimeout(() => {
        notification.classList.remove('show');
    }, 2800);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

window.editBet = editBet;
window.deleteBet = deleteBet;
window.deleteLesson = deleteLesson;
