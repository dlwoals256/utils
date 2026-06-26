'use strict';

// --- State ---
let timerState = 'idle'; // 'idle' | 'running' | 'paused' | 'finished'
let totalSeconds = 0;
let remainingSeconds = 0;
let endTime = 0;
let intervalId = null;
let presets = [];

// --- DOM ---
const body = document.body;
const startPauseBtn = document.getElementById('startPauseBtn');
const resetBtn = document.getElementById('resetBtn');
const statusText = document.getElementById('statusText');
const countdownDisplay = document.getElementById('countdownDisplay');
const progressFill = document.getElementById('progressFill');
const presetsList = document.getElementById('presetsList');
const emptyPresets = document.getElementById('emptyPresets');
const modalOverlay = document.getElementById('modalOverlay');
const addPresetBtn = document.getElementById('addPresetBtn');
const savePresetBtn = document.getElementById('savePresetBtn');
const cancelPresetBtn = document.getElementById('cancelPresetBtn');
const inputHours = document.getElementById('inputHours');
const inputMinutes = document.getElementById('inputMinutes');
const inputSeconds = document.getElementById('inputSeconds');
const presetNameInput = document.getElementById('presetNameInput');
const presetHoursInput = document.getElementById('presetHours');
const presetMinutesInput = document.getElementById('presetMinutes');
const presetSecondsInput = document.getElementById('presetSeconds');

// --- Init ---
loadPresets();
applyState();

// --- Time input: clamp & auto-select ---
[inputHours, inputMinutes, inputSeconds].forEach(input => {
    input.addEventListener('input', () => clampInput(input));
    input.addEventListener('focus', () => input.select());
});

// --- Button listeners ---
startPauseBtn.addEventListener('click', handleStartPause);
resetBtn.addEventListener('click', handleReset);
addPresetBtn.addEventListener('click', openModal);
savePresetBtn.addEventListener('click', handleSavePreset);
cancelPresetBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

// --- Keyboard shortcuts ---
document.addEventListener('keydown', e => {
    const inModal = !modalOverlay.classList.contains('hidden');

    if (inModal) {
        if (e.key === 'Enter') handleSavePreset();
        if (e.key === 'Escape') closeModal();
        return;
    }

    if (e.target.tagName === 'INPUT') return;

    if (e.code === 'Space') { e.preventDefault(); handleStartPause(); }
    if (e.code === 'KeyR')  handleReset();
});

// =========================================================
// Timer core
// =========================================================

function handleStartPause() {
    if      (timerState === 'idle')   startTimer();
    else if (timerState === 'running') pauseTimer();
    else if (timerState === 'paused') resumeTimer();
}

function startTimer() {
    const secs = readInputSeconds();
    if (secs <= 0) {
        inputMinutes.focus();
        return;
    }

    totalSeconds = secs;
    remainingSeconds = secs;
    endTime = Date.now() + secs * 1000;
    setState('running');
    renderCountdown();
    updateProgressBar();
    scheduleInterval();
}

function pauseTimer() {
    clearInterval(intervalId);
    setState('paused');
}

function resumeTimer() {
    endTime = Date.now() + remainingSeconds * 1000;
    setState('running');
    scheduleInterval();
}

function handleReset() {
    clearInterval(intervalId);
    setState('idle');
    // Keep inputs at current values so user can re-start easily
}

function finishTimer() {
    clearInterval(intervalId);
    remainingSeconds = 0;
    setState('finished');
    renderCountdown();
    updateProgressBar();
    playAlarm();
    flashFinished();

    setTimeout(() => {
        if (timerState === 'finished') {
            // Restore original duration in inputs for easy replay
            setInputsFromSeconds(totalSeconds);
            setState('idle');
        }
    }, 3000);
}

function scheduleInterval() {
    clearInterval(intervalId);
    intervalId = setInterval(() => {
        remainingSeconds = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        renderCountdown();
        updateProgressBar();
        updateWarning();
        updatePageTitle();

        if (remainingSeconds === 0) finishTimer();
    }, 1000);
}

// =========================================================
// UI rendering
// =========================================================

function setState(state) {
    timerState = state;
    applyState();
}

function applyState() {
    body.dataset.state = timerState;

    const isIdle     = timerState === 'idle';
    const isRunning  = timerState === 'running';
    const isPaused   = timerState === 'paused';
    const isFinished = timerState === 'finished';
    const isActive   = isRunning || isPaused || isFinished;

    // Start/Pause button label
    const labels = { idle: '시작', running: '일시정지', paused: '재개', finished: '시작' };
    startPauseBtn.textContent = labels[timerState];
    startPauseBtn.disabled = isFinished;

    // Reset button visibility
    resetBtn.classList.toggle('hidden', isIdle || isFinished);

    // Status text
    const status = { idle: '', running: '실행 중', paused: '일시정지됨', finished: '완료!' };
    statusText.textContent = status[timerState];

    // Warning overlay
    if (!isRunning) {
        body.classList.remove('warning');
    }

    renderPresets();
    updatePageTitle();
}

function renderCountdown() {
    countdownDisplay.textContent = formatSeconds(remainingSeconds, true);
}

function updateProgressBar() {
    const pct = totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 0;
    progressFill.style.width = `${pct}%`;
}

function updateWarning() {
    const warn = timerState === 'running' && remainingSeconds <= 10 && remainingSeconds > 0;
    body.classList.toggle('warning', warn);
}

function flashFinished() {
    body.classList.remove('warning');
    body.classList.add('finished');
    setTimeout(() => body.classList.remove('finished'), 1400);
}

function updatePageTitle() {
    if (timerState === 'running' || timerState === 'paused') {
        document.title = `${formatSeconds(remainingSeconds, true)} — 타이머`;
    } else {
        document.title = '타이머';
    }
}

// =========================================================
// Presets
// =========================================================

function loadPresets() {
    try {
        presets = JSON.parse(localStorage.getItem('timerPresets') || '[]');
    } catch {
        presets = [];
    }
    renderPresets();
}

function savePresets() {
    localStorage.setItem('timerPresets', JSON.stringify(presets));
}

function renderPresets() {
    const isRunning = timerState === 'running';

    // Remove old items, keep the empty message node
    presetsList.querySelectorAll('.preset-item').forEach(el => el.remove());

    emptyPresets.classList.toggle('hidden', presets.length > 0);

    presets.forEach(preset => {
        const item = document.createElement('div');
        item.className = 'preset-item' + (isRunning ? ' disabled' : '');

        const info = document.createElement('div');
        info.className = 'preset-info';

        const name = document.createElement('span');
        name.className = 'preset-name';
        name.textContent = preset.name;

        const timeLabel = document.createElement('span');
        timeLabel.className = 'preset-time-label';
        timeLabel.textContent = formatSeconds(preset.seconds, false);

        const del = document.createElement('button');
        del.className = 'preset-delete';
        del.textContent = '×';
        del.title = '삭제';
        del.addEventListener('click', e => {
            e.stopPropagation();
            deletePreset(preset.id);
        });

        info.append(name, timeLabel);
        item.append(info, del);

        if (!isRunning) {
            item.addEventListener('click', () => applyPreset(preset));
        }

        presetsList.appendChild(item);
    });
}

function applyPreset(preset) {
    if (timerState === 'running') return;

    // If mid-session, reset first
    if (timerState !== 'idle') {
        clearInterval(intervalId);
        body.classList.remove('warning');
        timerState = 'idle'; // set directly to avoid double render
    }

    setInputsFromSeconds(preset.seconds);
    setState('idle');
}

function deletePreset(id) {
    presets = presets.filter(p => p.id !== id);
    savePresets();
    renderPresets();
}

// =========================================================
// Modal
// =========================================================

function openModal() {
    presetNameInput.value = '';
    presetHoursInput.value = 0;
    presetMinutesInput.value = 0;
    presetSecondsInput.value = 0;
    [presetNameInput, presetHoursInput, presetMinutesInput, presetSecondsInput]
        .forEach(el => el.classList.remove('error'));
    modalOverlay.classList.remove('hidden');
    setTimeout(() => presetNameInput.focus(), 60);
}

function closeModal() {
    modalOverlay.classList.add('hidden');
}

function handleSavePreset() {
    const name = presetNameInput.value.trim();
    const h = clamp(parseInt(presetHoursInput.value) || 0, 0, 99);
    const m = clamp(parseInt(presetMinutesInput.value) || 0, 0, 59);
    const s = clamp(parseInt(presetSecondsInput.value) || 0, 0, 59);
    const secs = h * 3600 + m * 60 + s;

    let valid = true;

    if (!name) {
        presetNameInput.classList.add('error');
        setTimeout(() => presetNameInput.classList.remove('error'), 1400);
        presetNameInput.focus();
        valid = false;
    }

    if (secs <= 0) {
        [presetHoursInput, presetMinutesInput, presetSecondsInput]
            .forEach(el => {
                el.classList.add('error');
                setTimeout(() => el.classList.remove('error'), 1400);
            });
        valid = false;
    }

    if (!valid) return;

    presets.push({ id: Date.now(), name, seconds: secs });
    savePresets();
    renderPresets();
    closeModal();
}

// =========================================================
// Audio alarm
// =========================================================

function playAlarm() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();

        const beep = (t, freq, dur) => {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.4, t + 0.02);
            gain.gain.setValueAtTime(0.4, t + dur - 0.05);
            gain.gain.linearRampToValueAtTime(0, t + dur);
            osc.start(t);
            osc.stop(t + dur);
        };

        const now = ctx.currentTime;
        beep(now,        880,  0.18);
        beep(now + 0.28, 880,  0.18);
        beep(now + 0.56, 1100, 0.38);
    } catch (_) {
        // Browser may require user interaction before AudioContext
    }
}

// =========================================================
// Utilities
// =========================================================

function pad(n) {
    return String(n).padStart(2, '0');
}

function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

function clampInput(input) {
    const val = parseInt(input.value);
    const max = parseInt(input.max);
    if (!isNaN(val) && val > max) input.value = max;
    if (!isNaN(val) && val < 0)   input.value = 0;
}

function readInputSeconds() {
    const h = clamp(parseInt(inputHours.value)   || 0, 0, 99);
    const m = clamp(parseInt(inputMinutes.value) || 0, 0, 59);
    const s = clamp(parseInt(inputSeconds.value) || 0, 0, 59);
    return h * 3600 + m * 60 + s;
}

function setInputsFromSeconds(secs) {
    inputHours.value   = pad(Math.floor(secs / 3600));
    inputMinutes.value = pad(Math.floor((secs % 3600) / 60));
    inputSeconds.value = pad(secs % 60);
}

function formatSeconds(secs, alwaysHours) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (alwaysHours || h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
}
