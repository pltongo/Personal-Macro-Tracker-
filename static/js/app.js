/**
 * MacroTracker Pro - Client Application Logic
 * Midnight Theme Edition with Seamless Staged Cards & Barcode Scanner
 */

// Global State
const state = {
    currentTab: 'daily',
    selectedDate: new Date().toISOString().split('T')[0],
    currentMonth: new Date().toISOString().slice(0, 7),
    settings: null,
    dailyData: null,
    weeklyData: null,
    pnlData: null,
    stagedItems: [],
    uploadedImageUrl: null,
    currentMode: 'text',
    scannerStream: null,
    calculatedCoachGoals: {
        cal: 2400, p: 175, c: 260, f: 70, na: 2300, fib: 35
    }
};

// Helper: Get current time in PDT
function getPDTTime() {
    return new Date().toLocaleTimeString('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    initDateControls();
    initTabs();
    initModeSwitcher();
    initPhotoInputs();
    initBarcodeScanner();
    initMealForm();
    initGoalCoach();
    initPnLCalendarControls();
    await loadDailyData();
});

// Toast Feedback
function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 2800);
}

// Navigation Tabs
function initTabs() {
    const tabBtns = document.querySelectorAll('.nav-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const targetTab = btn.getAttribute('data-tab');
            state.currentTab = targetTab;

            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.style.display = 'none';
            });
            const targetPane = document.getElementById(`tab-${targetTab}`);
            if (targetPane) targetPane.style.display = 'block';

            // Stop live camera scanner if active when navigating away
            stopCameraScanner();

            if (targetTab === 'daily') {
                await loadDailyData();
            } else if (targetTab === 'pnl') {
                await loadPnLCalendar();
            } else if (targetTab === 'weekly') {
                await loadWeeklyData();
            } else if (targetTab === 'settings') {
                renderSettingsForm();
            } else if (targetTab === 'coach') {
                calculateCoachTargets();
            }
        });
    });
}

// Date Controls
function initDateControls() {
    const picker = document.getElementById('date-picker');
    picker.value = state.selectedDate;

    picker.addEventListener('change', async (e) => {
        state.selectedDate = e.target.value;
        updateDateLabel();
        await loadDailyData();
    });

    document.getElementById('prev-day-btn').addEventListener('click', () => changeDate(-1));
    document.getElementById('next-day-btn').addEventListener('click', () => changeDate(1));
    document.getElementById('today-btn').addEventListener('click', () => {
        state.selectedDate = new Date().toISOString().split('T')[0];
        picker.value = state.selectedDate;
        updateDateLabel();
        loadDailyData();
    });

    updateDateLabel();
}

function changeDate(deltaDays) {
    const [y, m, d] = state.selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + deltaDays);
    state.selectedDate = dateObj.toISOString().split('T')[0];
    document.getElementById('date-picker').value = state.selectedDate;
    updateDateLabel();
    loadDailyData();
}

function updateDateLabel() {
    const [y, m, d] = state.selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
    document.getElementById('current-date-label').textContent = dateObj.toLocaleDateString(undefined, options);
}

// Mode Switcher (Text vs. Photo vs. Barcode)
function initModeSwitcher() {
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.getAttribute('data-mode');
            state.currentMode = mode;

            document.getElementById('text-input-group').style.display = mode === 'text' ? 'block' : 'none';
            document.getElementById('photo-input-group').style.display = mode === 'photo' ? 'block' : 'none';
            document.getElementById('barcode-input-group').style.display = mode === 'barcode' ? 'block' : 'none';

            if (mode !== 'barcode') stopCameraScanner();
        });
    });
}

// Photo Input (Single button giving native iOS prompt: Take Photo / Photo Library / Choose File)
function initPhotoInputs() {
    const fileInput = document.getElementById('meal-photo-input');
    const btnPick = document.getElementById('btn-photo-pick');
    const previewBox = document.getElementById('photo-preview-box');
    const previewImg = document.getElementById('photo-preview-img');
    const removeBtn = document.getElementById('remove-photo-btn');

    btnPick.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Data = event.target.result;
            previewImg.src = base64Data;
            previewBox.style.display = 'flex';

            try {
                const res = await fetch('/api/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: base64Data })
                });
                const data = await res.json();
                if (data.url) {
                    state.uploadedImageUrl = data.url;
                    showToast('Photo attached');
                }
            } catch (err) {
                console.error(err);
                showToast('Failed to upload photo');
            }
        };
        reader.readAsDataURL(file);
    });

    removeBtn.addEventListener('click', () => {
        fileInput.value = '';
        state.uploadedImageUrl = null;
        previewImg.src = '';
        previewBox.style.display = 'none';
    });
}

// Barcode Scanner Integration (Camera / Photo + Open Food Facts)
function initBarcodeScanner() {
    const scanBtn = document.getElementById('btn-barcode-scan-photo');
    const barcodeFileInput = document.getElementById('barcode-file-input');
    const input = document.getElementById('barcode-input');
    const lookupBtn = document.getElementById('barcode-lookup-btn');
    const stopScannerBtn = document.getElementById('stop-scanner-btn');

    // Camera Scan Action
    scanBtn.addEventListener('click', async () => {
        // First try live video scanner if BarcodeDetector is available
        if ('BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            startLiveCameraScanner();
        } else {
            // Otherwise open camera/photo picker to decode image
            barcodeFileInput.click();
        }
    });

    barcodeFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        decodeBarcodeFromImageFile(file);
    });

    if (stopScannerBtn) {
        stopScannerBtn.addEventListener('click', stopCameraScanner);
    }

    lookupBtn.addEventListener('click', () => {
        const code = input.value.trim();
        if (code) lookupBarcode(code);
        else showToast('Enter a barcode number');
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            lookupBtn.click();
        }
    });
}

async function startLiveCameraScanner() {
    const container = document.getElementById('scanner-container');
    const video = document.getElementById('barcode-video');
    container.style.display = 'block';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        state.scannerStream = stream;
        video.srcObject = stream;
        await video.play();

        const barcodeDetector = new BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code']
        });

        const scanFrame = async () => {
            if (!state.scannerStream) return;
            try {
                const barcodes = await barcodeDetector.detect(video);
                if (barcodes.length > 0) {
                    const rawCode = barcodes[0].rawValue;
                    document.getElementById('barcode-input').value = rawCode;
                    showToast(`Detected: ${rawCode}`);
                    stopCameraScanner();
                    lookupBarcode(rawCode);
                    return;
                }
            } catch (err) {
                // Ignore frame parse errors
            }
            if (state.scannerStream) requestAnimationFrame(scanFrame);
        };
        requestAnimationFrame(scanFrame);
    } catch (err) {
        console.error('Camera access error:', err);
        container.style.display = 'none';
        // Fallback to photo capture
        document.getElementById('barcode-file-input').click();
    }
}

function stopCameraScanner() {
    const container = document.getElementById('scanner-container');
    if (container) container.style.display = 'none';
    if (state.scannerStream) {
        state.scannerStream.getTracks().forEach(track => track.stop());
        state.scannerStream = null;
    }
}

async function decodeBarcodeFromImageFile(file) {
    if ('BarcodeDetector' in window) {
        try {
            showToast('Scanning barcode photo...');
            const bitmap = await createImageBitmap(file);
            const detector = new BarcodeDetector({
                formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']
            });
            const barcodes = await detector.detect(bitmap);
            if (barcodes.length > 0) {
                const code = barcodes[0].rawValue;
                document.getElementById('barcode-input').value = code;
                showToast(`Detected: ${code}`);
                lookupBarcode(code);
                return;
            }
        } catch (err) {
            console.error(err);
        }
    }
    showToast('Could not auto-read barcode. Please type the digits.');
}

async function lookupBarcode(code) {
    showToast('Searching Open Food Facts...');
    try {
        const res = await fetch(`/api/barcode?code=${encodeURIComponent(code)}`);
        const data = await res.json();
        if (data.found && data.item) {
            state.stagedItems = [data.item];
            renderStagedItems();
            showToast(`Found: ${data.item.name}`);
        } else {
            showToast(data.error || 'Product not found');
        }
    } catch (err) {
        console.error('Barcode error:', err);
        showToast('Barcode lookup failed');
    }
}

// Meal Form & Staging
function initMealForm() {
    document.getElementById('estimate-btn').addEventListener('click', async () => {
        const desc = state.currentMode === 'text'
            ? document.getElementById('meal-description').value.trim()
            : document.getElementById('photo-description').value.trim();

        if (!desc) {
            showToast('Please enter foods or description');
            return;
        }

        try {
            const res = await fetch('/api/estimate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: desc })
            });
            const data = await res.json();
            if (data.items && data.items.length > 0) {
                state.stagedItems = data.items;
                renderStagedItems();
                showToast(`Estimated ${data.items.length} items`);
            } else {
                showToast('No items parsed');
            }
        } catch (err) {
            console.error(err);
            showToast('Estimation failed');
        }
    });

    document.getElementById('add-manual-item-btn').addEventListener('click', () => {
        state.stagedItems.push({
            name: 'New Item',
            portion: '1 serving',
            calories: 150,
            protein: 10,
            carbs: 15,
            fat: 5,
            sodium: 150,
            fiber: 2
        });
        renderStagedItems();
    });

    document.getElementById('save-staged-btn').addEventListener('click', async () => {
        if (state.stagedItems.length === 0) {
            showToast('No items to save');
            return;
        }

        const pdtTime = getPDTTime();
        const payload = {
            date: state.selectedDate,
            time: pdtTime,
            image_url: state.uploadedImageUrl || '',
            items: state.stagedItems
        };

        try {
            const res = await fetch('/api/meals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.created) {
                showToast(`Logged at ${pdtTime} (PDT)`);
                state.stagedItems = [];
                state.uploadedImageUrl = null;
                document.getElementById('meal-description').value = '';
                document.getElementById('photo-description').value = '';
                document.getElementById('photo-preview-box').style.display = 'none';
                document.getElementById('staged-items-container').style.display = 'none';
                await loadDailyData();
            }
        } catch (err) {
            console.error(err);
            showToast('Failed to save meal');
        }
    });
}

// SEAMLESS STAGED ITEMS CARDS (Fixes white overflowing text boxes!)
function renderStagedItems() {
    const container = document.getElementById('staged-items-container');
    const wrapper = document.getElementById('staged-cards-wrapper');
    wrapper.innerHTML = '';

    if (state.stagedItems.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';

    state.stagedItems.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'staged-card';
        card.innerHTML = `
            <div class="staged-card-top">
                <input type="text" class="staged-name-input" value="${item.name}" placeholder="Food name" onchange="updateStagedItem(${index}, 'name', this.value)">
                <input type="text" class="staged-portion-input" value="${item.portion}" placeholder="Portion" onchange="updateStagedItem(${index}, 'portion', this.value)">
                <button class="delete-btn" title="Remove" onclick="removeStagedItem(${index})">✕</button>
            </div>
            <div class="staged-macros-grid">
                <div class="staged-macro-box">
                    <span class="staged-macro-label">Calories</span>
                    <input type="number" step="1" class="staged-macro-num" value="${item.calories}" onchange="updateStagedItem(${index}, 'calories', parseFloat(this.value)||0)">
                </div>
                <div class="staged-macro-box">
                    <span class="staged-macro-label" style="color: var(--accent-cyan);">Protein</span>
                    <input type="number" step="0.5" class="staged-macro-num" value="${item.protein}" onchange="updateStagedItem(${index}, 'protein', parseFloat(this.value)||0)">
                </div>
                <div class="staged-macro-box">
                    <span class="staged-macro-label">Carbs</span>
                    <input type="number" step="0.5" class="staged-macro-num" value="${item.carbs}" onchange="updateStagedItem(${index}, 'carbs', parseFloat(this.value)||0)">
                </div>
                <div class="staged-macro-box">
                    <span class="staged-macro-label">Fat</span>
                    <input type="number" step="0.5" class="staged-macro-num" value="${item.fat}" onchange="updateStagedItem(${index}, 'fat', parseFloat(this.value)||0)">
                </div>
                <div class="staged-macro-box">
                    <span class="staged-macro-label">Sodium</span>
                    <input type="number" step="10" class="staged-macro-num" value="${item.sodium}" onchange="updateStagedItem(${index}, 'sodium', parseFloat(this.value)||0)">
                </div>
                <div class="staged-macro-box">
                    <span class="staged-macro-label">Fiber</span>
                    <input type="number" step="0.5" class="staged-macro-num" value="${item.fiber}" onchange="updateStagedItem(${index}, 'fiber', parseFloat(this.value)||0)">
                </div>
            </div>
        `;
        wrapper.appendChild(card);
    });
}

window.updateStagedItem = function(index, field, value) {
    if (state.stagedItems[index]) {
        state.stagedItems[index][field] = value;
    }
};

window.removeStagedItem = function(index) {
    state.stagedItems.splice(index, 1);
    renderStagedItems();
};

// Load Daily Data & Render
async function loadDailyData() {
    try {
        const res = await fetch(`/api/meals?date=${state.selectedDate}`);
        const data = await res.json();
        state.dailyData = data;
        renderDailyMacroCards(data.totals);
        renderTimelineMeals(data.meals);
    } catch (err) {
        console.error('Error loading daily data:', err);
    }
}

function renderDailyMacroCards(totals) {
    const targets = state.settings || {
        calorie_target: 2400, protein_target: 175, carbs_target: 260,
        fat_target: 70, sodium_target: 2300, fiber_target: 35
    };

    updateMacroCard('calories', totals.calories, targets.calorie_target, 'kcal');
    updateMacroCard('protein', totals.protein, targets.protein_target, 'g');
    updateMacroCard('carbs', totals.carbs, targets.carbs_target, 'g');
    updateMacroCard('fat', totals.fat, targets.fat_target, 'g');
    updateMacroCard('sodium', totals.sodium, targets.sodium_target, 'mg');
    updateMacroCard('fiber', totals.fiber, targets.fiber_target, 'g');
}

function updateMacroCard(key, current, target, unit) {
    const card = document.querySelector(`.macro-card.${key}`);
    if (!card) return;

    const valEl = card.querySelector('.macro-val');
    const targetEl = card.querySelector('.macro-target');
    const fillEl = card.querySelector('.progress-fill');

    valEl.textContent = `${current} ${unit}`;
    const pct = Math.round((current / (target || 1)) * 100);
    targetEl.textContent = `Goal: ${target} ${unit} (${pct}%)`;

    fillEl.style.width = `${Math.min(100, pct)}%`;
}

// 24-Hour PDT Chronological Timeline (Replaces Breakfast/Lunch/Dinner)
function renderTimelineMeals(meals) {
    const container = document.getElementById('timeline-meals-list');
    container.innerHTML = '';

    if (!meals || meals.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                <div style="font-size: 2.2rem; margin-bottom: 6px;">🥣</div>
                <div style="font-weight: 700; color: var(--text-secondary);">No meals logged on this date yet</div>
                <div style="font-size: 0.85rem;">Use the logger above to log food by text, photo, or barcode.</div>
            </div>
        `;
        return;
    }

    const timelineWrap = document.createElement('div');
    timelineWrap.className = 'timeline-container';

    meals.forEach(m => {
        const timeDisplay = m.time || 'Logged';
        const entry = document.createElement('div');
        entry.className = 'timeline-entry';
        entry.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-card">
                <div style="display: flex; align-items: center; gap: 14px;">
                    ${m.image_url ? `<img src="${m.image_url}" class="preview-img" style="width: 54px; height: 54px;" alt="Meal photo">` : ''}
                    <div>
                        <div class="timeline-time-badge">🕒 ${timeDisplay} PDT</div>
                        <div class="meal-name">${m.name}</div>
                        <div class="meal-portion">${m.portion}</div>
                    </div>
                </div>
                <div class="meal-badges">
                    <span class="badge">${m.calories} kcal</span>
                    <span class="badge p-badge">${m.protein}g Protein</span>
                    <span class="badge">${m.carbs}g Carbs</span>
                    <span class="badge">${m.fat}g Fat</span>
                    <span class="badge">${m.sodium}mg Na</span>
                    <span class="badge">${m.fiber}g Fiber</span>
                    <button class="delete-btn" title="Delete item" onclick="deleteMealItem(${m.id})">✕</button>
                </div>
            </div>
        `;
        timelineWrap.appendChild(entry);
    });

    container.appendChild(timelineWrap);
}

window.deleteMealItem = async function(id) {
    if (!confirm('Delete this item from your timeline?')) return;
    try {
        const res = await fetch(`/api/meals/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('Item deleted');
            await loadDailyData();
        }
    } catch (err) {
        console.error('Delete error:', err);
    }
};

// ==============================================================
// PnL-Style Protein Goal Calendar Logic (Image 1 replica)
// ==============================================================
function initPnLCalendarControls() {
    document.getElementById('pnl-prev-month').addEventListener('click', () => changePnLMonth(-1));
    document.getElementById('pnl-next-month').addEventListener('click', () => changePnLMonth(1));
    document.getElementById('pnl-today-month').addEventListener('click', () => {
        state.currentMonth = new Date().toISOString().slice(0, 7);
        loadPnLCalendar();
    });
}

function changePnLMonth(deltaMonths) {
    const [y, m] = state.currentMonth.split('-').map(Number);
    const dt = new Date(y, m - 1 + deltaMonths, 1);
    state.currentMonth = dt.toISOString().slice(0, 7);
    loadPnLCalendar();
}

async function loadPnLCalendar() {
    try {
        const res = await fetch(`/api/calendar?month=${state.currentMonth}`);
        const data = await res.json();
        state.pnlData = data;
        renderPnLCalendar(data);
    } catch (err) {
        console.error('Calendar load error:', err);
    }
}

function renderPnLCalendar(data) {
    const [year, month] = data.year_month.split('-').map(Number);
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    document.getElementById('pnl-month-label').textContent = monthName;
    document.getElementById('pnl-target-subtext').textContent = `Target: ${data.protein_target}g Protein/day`;
    document.getElementById('pnl-score-badge').textContent = `🎯 Hit: ${data.summary.hit} | Missed: ${data.summary.missed} | Untracked: ${data.summary.untracked}`;

    const grid = document.getElementById('pnl-calendar-grid');
    grid.innerHTML = '';

    const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    weekdays.forEach(wd => {
        const h = document.createElement('div');
        h.className = 'pnl-weekday';
        h.textContent = wd;
        grid.appendChild(h);
    });

    if (data.days.length > 0) {
        const firstDayWeekday = data.days[0].weekday;
        for (let i = 0; i < firstDayWeekday; i++) {
            const pad = document.createElement('div');
            pad.style.opacity = '0.2';
            grid.appendChild(pad);
        }
    }

    data.days.forEach(d => {
        const dayCell = document.createElement('div');
        dayCell.className = `pnl-day ${d.status}`;
        dayCell.title = `${d.date}: ${d.protein}g / ${d.target}g Protein`;

        let statusText = '';
        if (d.status === 'hit') statusText = `${Math.round(d.protein)}g ✓`;
        else if (d.status === 'missed') statusText = `${Math.round(d.protein)}g`;
        else statusText = '—';

        dayCell.innerHTML = `
            <div class="pnl-day-num">${String(d.day).padStart(2, '0')}</div>
            <div class="pnl-day-status">${statusText}</div>
        `;

        dayCell.addEventListener('click', () => {
            state.selectedDate = d.date;
            document.getElementById('date-picker').value = d.date;
            updateDateLabel();
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.nav-btn[data-tab="daily"]').classList.add('active');
            document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
            document.getElementById('tab-daily').style.display = 'block';
            loadDailyData();
        });

        grid.appendChild(dayCell);
    });
}

// Weekly Analytics
async function loadWeeklyData() {
    try {
        const res = await fetch(`/api/weekly?date=${state.selectedDate}`);
        const data = await res.json();
        state.weeklyData = data;
        renderWeeklyAnalytics(data);
    } catch (err) {
        console.error('Weekly load error:', err);
    }
}

function renderWeeklyAnalytics(data) {
    document.getElementById('weekly-range-label').textContent = `${data.week_start} to ${data.week_end}`;
    document.getElementById('weekly-active-days').textContent = `${data.active_days} of 7 days logged`;

    const avgs = data.week_averages;
    const tgts = data.targets;

    const averagesContainer = document.getElementById('weekly-averages-grid');
    averagesContainer.innerHTML = `
        <div class="macro-card">
            <div class="macro-title">Avg Protein</div>
            <div class="macro-val" style="color: var(--accent-cyan);">${avgs.protein}g</div>
            <div class="macro-target">Target: ${tgts.protein}g (${avgs.protein >= tgts.protein ? '+' : ''}${Math.round(avgs.protein - tgts.protein)}g)</div>
        </div>
        <div class="macro-card">
            <div class="macro-title">Avg Carbs</div>
            <div class="macro-val">${avgs.carbs}g</div>
            <div class="macro-target">Target: ${tgts.carbs}g</div>
        </div>
        <div class="macro-card">
            <div class="macro-title">Avg Fat</div>
            <div class="macro-val">${avgs.fat}g</div>
            <div class="macro-target">Target: ${tgts.fat}g</div>
        </div>
        <div class="macro-card">
            <div class="macro-title">Avg Sodium</div>
            <div class="macro-val">${avgs.sodium}mg</div>
            <div class="macro-target">Target: ${tgts.sodium}mg</div>
        </div>
        <div class="macro-card">
            <div class="macro-title">Avg Calories</div>
            <div class="macro-val">${avgs.calories}</div>
            <div class="macro-target">Target: ${tgts.calories} kcal</div>
        </div>
        <div class="macro-card">
            <div class="macro-title">Avg Fiber</div>
            <div class="macro-val">${avgs.fiber}g</div>
            <div class="macro-target">Target: ${tgts.fiber}g</div>
        </div>
    `;

    const chart = document.getElementById('weekly-chart-bars');
    chart.innerHTML = '';
    const maxProtein = Math.max(...data.days.map(d => d.totals.protein), tgts.protein, 1);

    data.days.forEach(d => {
        const heightPct = Math.round((d.totals.protein / maxProtein) * 100);
        const group = document.createElement('div');
        group.className = 'chart-bar-group';
        group.innerHTML = `
            <div style="font-size: 0.75rem; font-weight: 700; color: #ffffff;">${d.totals.protein > 0 ? Math.round(d.totals.protein) + 'g' : ''}</div>
            <div class="chart-bar-track">
                <div class="chart-bar-fill" style="height: ${heightPct}%; background-color: var(--accent-cyan);"></div>
            </div>
            <div class="chart-label">${d.day_name}</div>
        `;
        chart.appendChild(group);
    });

    const tbody = document.getElementById('weekly-table-tbody');
    tbody.innerHTML = '';
    data.days.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding: 10px 12px; border-bottom: 1px solid var(--border-color);"><strong>${d.day_name}</strong> (${d.date.slice(5)})</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid var(--border-color);">${d.meal_count}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid var(--border-color);">${d.totals.calories}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid var(--border-color); font-weight: 700; color: var(--accent-cyan);">${d.totals.protein}g</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid var(--border-color);">${d.totals.carbs}g</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid var(--border-color);">${d.totals.fat}g</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid var(--border-color);">${d.totals.sodium}mg</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid var(--border-color);">${d.totals.fiber}g</td>
        `;
        tbody.appendChild(tr);
    });
}

// Goal Coach Logic
function initGoalCoach() {
    const calcBtn = document.getElementById('calculate-goals-btn');
    const applyBtn = document.getElementById('apply-goals-btn');

    if (calcBtn) calcBtn.addEventListener('click', calculateCoachTargets);
    if (applyBtn) applyBtn.addEventListener('click', applyCoachGoals);
}

function calculateCoachTargets() {
    const goal = document.getElementById('coach-goal')?.value || 'moderate_cut';
    const weight = parseFloat(document.getElementById('coach-weight')?.value) || 175;
    const activity = document.getElementById('coach-activity')?.value || 'athlete';

    let mult = 16.5;
    if (activity === 'sedentary') mult = 13.5;
    else if (activity === 'moderate') mult = 16.0;
    else if (activity === 'athlete') mult = 18.0;

    let tdee = weight * mult;
    let targetCal = tdee;

    if (goal === 'aggressive_cut') targetCal -= 500;
    else if (goal === 'moderate_cut') targetCal -= 350;
    else if (goal === 'lean_bulk') targetCal += 250;
    else if (goal === 'aggressive_bulk') targetCal += 500;

    targetCal = Math.round(Math.max(1200, targetCal));
    let targetP = Math.round(weight * 1.05);
    let targetF = Math.round((targetCal * 0.25) / 9);
    let remainingCal = targetCal - (targetP * 4 + targetF * 9);
    let targetC = Math.round(Math.max(50, remainingCal / 4));
    let targetNa = activity === 'athlete' ? 2800 : 2300;
    let targetFib = Math.round(Math.max(28, (targetCal / 1000) * 14));

    state.calculatedCoachGoals = {
        cal: targetCal, p: targetP, c: targetC, f: targetF, na: targetNa, fib: targetFib
    };

    document.getElementById('res-cal').textContent = `${targetCal}`;
    document.getElementById('res-p').textContent = `${targetP}g`;
    document.getElementById('res-c').textContent = `${targetC}g`;
    document.getElementById('res-f').textContent = `${targetF}g`;
    document.getElementById('res-na').textContent = `${targetNa}mg`;
    document.getElementById('res-fib').textContent = `${targetFib}g`;
}

async function applyCoachGoals() {
    const goals = state.calculatedCoachGoals;
    const payload = {
        calorie_target: goals.cal,
        protein_target: goals.p,
        carbs_target: goals.c,
        fat_target: goals.f,
        sodium_target: goals.na,
        fiber_target: goals.fib,
        week_start_day: state.settings?.week_start_day || 'Monday',
        theme: 'dark'
    };

    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        state.settings = await res.json();
        showToast('Goals applied to Custom Goals & Daily Tracker!');
        renderDailyMacroCards(state.dailyData ? state.dailyData.totals : { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, fiber: 0 });
    } catch (err) {
        console.error('Apply error:', err);
        showToast('Failed to apply goals');
    }
}

// Settings
async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        state.settings = await res.json();
    } catch (err) {
        console.error('Settings load error:', err);
    }
}

function renderSettingsForm() {
    if (!state.settings) return;
    const s = state.settings;
    document.getElementById('set-cal').value = s.calorie_target;
    document.getElementById('set-p').value = s.protein_target;
    document.getElementById('set-c').value = s.carbs_target;
    document.getElementById('set-f').value = s.fat_target;
    document.getElementById('set-na').value = s.sodium_target;
    document.getElementById('set-fib').value = s.fiber_target;
    document.getElementById('set-week-start').value = s.week_start_day;
}

document.getElementById('settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        calorie_target: parseFloat(document.getElementById('set-cal').value),
        protein_target: parseFloat(document.getElementById('set-p').value),
        carbs_target: parseFloat(document.getElementById('set-c').value),
        fat_target: parseFloat(document.getElementById('set-f').value),
        sodium_target: parseFloat(document.getElementById('set-na').value),
        fiber_target: parseFloat(document.getElementById('set-fib').value),
        week_start_day: document.getElementById('set-week-start').value,
        theme: 'dark'
    };

    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        state.settings = await res.json();
        showToast('Custom targets saved!');
    } catch (err) {
        console.error('Settings save error:', err);
        showToast('Failed to save settings');
    }
});
