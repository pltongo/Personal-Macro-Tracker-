/**
 * MacroTracker Pro - Client Application Logic
 * Midnight Theme Edition with Dynamic Goal-Oriented Progress & Goal Coach
 */

// Global State
const state = {
    currentTab: 'daily',
    selectedDate: new Date().toISOString().split('T')[0],
    settings: null,
    dailyData: null,
    weeklyData: null,
    stagedItems: [],
    uploadedImageUrl: null,
    currentMode: 'text',
    calculatedCoachGoals: {
        cal: 2400, p: 175, c: 260, f: 70, na: 2300, fib: 35
    }
};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    initDateControls();
    initTabs();
    initModeSwitcher();
    initPhotoUpload();
    initMealForm();
    initGoalCoach();
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
            
            if (targetTab === 'daily') {
                await loadDailyData();
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

// Date Controls (Date on LEFT, grouped controls on RIGHT)
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

// Input Mode (Text vs. Photo)
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
        });
    });
}

// Photo Upload Handling
function initPhotoUpload() {
    const fileInput = document.getElementById('meal-photo-input');
    const dropzone = document.getElementById('photo-dropzone');
    const previewContainer = document.getElementById('photo-preview-box');
    const previewImg = document.getElementById('photo-preview-img');
    const removeBtn = document.getElementById('remove-photo-btn');

    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Data = event.target.result;
            previewImg.src = base64Data;
            previewContainer.style.display = 'flex';
            dropzone.style.display = 'none';

            try {
                const res = await fetch('/api/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: base64Data })
                });
                const data = await res.json();
                if (data.url) {
                    state.uploadedImageUrl = data.url;
                    showToast('Photo uploaded successfully');
                }
            } catch (err) {
                console.error('Upload error:', err);
                showToast('Failed to upload photo');
            }
        };
        reader.readAsDataURL(file);
    });

    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.value = '';
        state.uploadedImageUrl = null;
        previewImg.src = '';
        previewContainer.style.display = 'none';
        dropzone.style.display = 'block';
    });
}

// Form and Staged Items
function initMealForm() {
    document.getElementById('estimate-btn').addEventListener('click', async () => {
        const desc = state.currentMode === 'text'
            ? document.getElementById('meal-description').value.trim()
            : document.getElementById('photo-description').value.trim();

        if (!desc) {
            showToast('Please enter a meal description');
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
                showToast(`Estimated ${data.items.length} food items`);
            } else {
                showToast('No items estimated');
            }
        } catch (err) {
            console.error('Estimate error:', err);
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

        const mealType = document.getElementById('meal-type-select').value;
        const payload = {
            date: state.selectedDate,
            meal_type: mealType,
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
                showToast(`Saved to ${mealType}`);
                state.stagedItems = [];
                state.uploadedImageUrl = null;
                document.getElementById('meal-description').value = '';
                document.getElementById('photo-description').value = '';
                document.getElementById('photo-preview-box').style.display = 'none';
                document.getElementById('photo-dropzone').style.display = 'block';
                document.getElementById('staged-items-container').style.display = 'none';
                await loadDailyData();
            }
        } catch (err) {
            console.error('Save error:', err);
            showToast('Failed to save meal');
        }
    });
}

function renderStagedItems() {
    const container = document.getElementById('staged-items-container');
    const tbody = document.getElementById('staged-items-tbody');
    tbody.innerHTML = '';

    if (state.stagedItems.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';

    state.stagedItems.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="mini-input" style="width: 140px;" value="${item.name}" onchange="updateStagedItem(${index}, 'name', this.value)"></td>
            <td><input type="text" class="mini-input" style="width: 80px;" value="${item.portion}" onchange="updateStagedItem(${index}, 'portion', this.value)"></td>
            <td><input type="number" step="1" class="mini-input" value="${item.calories}" onchange="updateStagedItem(${index}, 'calories', parseFloat(this.value)||0)"></td>
            <td><input type="number" step="0.5" class="mini-input" value="${item.protein}" onchange="updateStagedItem(${index}, 'protein', parseFloat(this.value)||0)"></td>
            <td><input type="number" step="0.5" class="mini-input" value="${item.carbs}" onchange="updateStagedItem(${index}, 'carbs', parseFloat(this.value)||0)"></td>
            <td><input type="number" step="0.5" class="mini-input" value="${item.fat}" onchange="updateStagedItem(${index}, 'fat', parseFloat(this.value)||0)"></td>
            <td><input type="number" step="10" class="mini-input" value="${item.sodium}" onchange="updateStagedItem(${index}, 'sodium', parseFloat(this.value)||0)"></td>
            <td><input type="number" step="0.5" class="mini-input" value="${item.fiber}" onchange="updateStagedItem(${index}, 'fiber', parseFloat(this.value)||0)"></td>
            <td><button class="delete-btn" onclick="removeStagedItem(${index})">✕</button></td>
        `;
        tbody.appendChild(tr);
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
        renderDailyMealsList(data.meals_by_type);
    } catch (err) {
        console.error('Error loading daily data:', err);
    }
}

// Render Daily Macro Cards with Dynamic Red/Green Progress Bars
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

    // Dynamic Color: Red until target is met, then Green!
    fillEl.style.width = `${Math.min(100, pct)}%`;
    if (current >= target && target > 0) {
        fillEl.classList.add('goal-met');
    } else {
        fillEl.classList.remove('goal-met');
    }
}

function renderDailyMealsList(mealsByType) {
    const container = document.getElementById('daily-meals-list');
    container.innerHTML = '';

    const categories = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
    let totalMealCount = 0;

    categories.forEach(cat => {
        const items = mealsByType[cat] || [];
        totalMealCount += items.length;
        if (items.length > 0) {
            const catDiv = document.createElement('div');
            catDiv.className = 'meal-category';
            catDiv.innerHTML = `
                <div class="category-header">
                    <span>${cat}</span>
                    <span style="font-size: 0.8rem; font-weight: normal; color: var(--text-muted);">${items.length} item${items.length > 1 ? 's' : ''}</span>
                </div>
                <div class="category-items"></div>
            `;
            const itemsContainer = catDiv.querySelector('.category-items');
            items.forEach(m => {
                const card = document.createElement('div');
                card.className = 'meal-item-card';
                card.innerHTML = `
                    <div class="meal-info">
                        ${m.image_url ? `<img src="${m.image_url}" class="meal-thumb" alt="Meal photo" onclick="window.open('${m.image_url}', '_blank')">` : ''}
                        <div>
                            <div class="meal-name">${m.name}</div>
                            <div class="meal-portion">${m.portion}</div>
                        </div>
                    </div>
                    <div class="meal-badges">
                        <span class="badge">${m.calories} kcal</span>
                        <span class="badge">${m.protein}g P</span>
                        <span class="badge">${m.carbs}g C</span>
                        <span class="badge">${m.fat}g F</span>
                        <span class="badge">${m.sodium}mg Na</span>
                        <span class="badge">${m.fiber}g Fib</span>
                        <button class="delete-btn" title="Delete item" onclick="deleteMealItem(${m.id})">🗑️</button>
                    </div>
                `;
                itemsContainer.appendChild(card);
            });
            container.appendChild(catDiv);
        }
    });

    if (totalMealCount === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                <div style="font-size: 2.2rem; margin-bottom: 6px;">🥣</div>
                <div style="font-weight: 600; color: var(--text-secondary);">Fresh tracker for this day</div>
                <div style="font-size: 0.85rem;">No meals logged yet. Use the logger above to log food by text or photo.</div>
            </div>
        `;
    }
}

window.deleteMealItem = async function(id) {
    if (!confirm('Delete this meal item?')) return;
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
        <div class="avg-card">
            <div class="macro-title">Avg Protein</div>
            <div class="avg-val">${avgs.protein}g</div>
            <div class="macro-target">Target: ${tgts.protein}g (${avgs.protein >= tgts.protein ? '+' : ''}${Math.round(avgs.protein - tgts.protein)}g)</div>
        </div>
        <div class="avg-card">
            <div class="macro-title">Avg Carbs</div>
            <div class="avg-val">${avgs.carbs}g</div>
            <div class="macro-target">Target: ${tgts.carbs}g</div>
        </div>
        <div class="avg-card">
            <div class="macro-title">Avg Fat</div>
            <div class="avg-val">${avgs.fat}g</div>
            <div class="macro-target">Target: ${tgts.fat}g</div>
        </div>
        <div class="avg-card">
            <div class="macro-title">Avg Sodium</div>
            <div class="avg-val">${avgs.sodium}mg</div>
            <div class="macro-target">Target: ${tgts.sodium}mg</div>
        </div>
        <div class="avg-card">
            <div class="macro-title">Avg Calories</div>
            <div class="avg-val">${avgs.calories}</div>
            <div class="macro-target">Target: ${tgts.calories} kcal</div>
        </div>
        <div class="avg-card">
            <div class="macro-title">Avg Fiber</div>
            <div class="avg-val">${avgs.fiber}g</div>
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
                <div class="chart-bar-fill" style="height: ${heightPct}%;"></div>
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
            <td><strong>${d.day_name}</strong> (${d.date.slice(5)})</td>
            <td>${d.meal_count}</td>
            <td>${d.totals.calories}</td>
            <td style="font-weight: 700;">${d.totals.protein}g</td>
            <td>${d.totals.carbs}g</td>
            <td>${d.totals.fat}g</td>
            <td>${d.totals.sodium}mg</td>
            <td>${d.totals.fiber}g</td>
        `;
        tbody.appendChild(tr);
    });

    const avgTr = document.createElement('tr');
    avgTr.style.backgroundColor = '#1a1a1a';
    avgTr.style.fontWeight = 'bold';
    avgTr.innerHTML = `
        <td>7-Day Average</td>
        <td>-</td>
        <td>${avgs.calories}</td>
        <td>${avgs.protein}g</td>
        <td>${avgs.carbs}g</td>
        <td>${avgs.fat}g</td>
        <td>${avgs.sodium}mg</td>
        <td>${avgs.fiber}g</td>
    `;
    tbody.appendChild(avgTr);
}

// Goal Coach & Interactive Calculator
function initGoalCoach() {
    const calcBtn = document.getElementById('calculate-goals-btn');
    const applyBtn = document.getElementById('apply-goals-btn');

    if (calcBtn) {
        calcBtn.addEventListener('click', calculateCoachTargets);
    }

    if (applyBtn) {
        applyBtn.addEventListener('click', applyCoachGoals);
    }
}

function calculateCoachTargets() {
    const goal = document.getElementById('coach-goal')?.value || 'moderate_cut';
    const weight = parseFloat(document.getElementById('coach-weight')?.value) || 175;
    const activity = document.getElementById('coach-activity')?.value || 'athlete';
    const proteinRatio = document.getElementById('coach-protein-ratio')?.value || 'high';

    // Activity multiplier (calories per lb)
    let mult = 16.5;
    if (activity === 'sedentary') mult = 13.5;
    else if (activity === 'light') mult = 14.5;
    else if (activity === 'moderate') mult = 16.0;
    else if (activity === 'athlete') mult = 18.0;

    let tdee = weight * mult;
    let targetCal = tdee;

    if (goal === 'aggressive_cut') targetCal -= 500;
    else if (goal === 'moderate_cut') targetCal -= 350;
    else if (goal === 'lean_bulk') targetCal += 250;
    else if (goal === 'aggressive_bulk') targetCal += 500;

    targetCal = Math.round(Math.max(1200, targetCal));

    // Protein calculation
    let pMult = 1.0;
    if (proteinRatio === 'athletic') pMult = 1.1;
    else if (proteinRatio === 'moderate') pMult = 0.85;

    let targetP = Math.round(weight * pMult);

    // Fat calculation (~25% of calories, 9 kcal/g)
    let targetF = Math.round((targetCal * 0.25) / 9);

    // Carbs calculation (remaining calories, 4 kcal/g)
    let remainingCal = targetCal - (targetP * 4 + targetF * 9);
    let targetC = Math.round(Math.max(50, remainingCal / 4));

    // Sodium & Fiber
    let targetNa = activity === 'athlete' ? 2800 : 2300;
    let targetFib = Math.round(Math.max(28, (targetCal / 1000) * 14));

    state.calculatedCoachGoals = {
        cal: targetCal,
        p: targetP,
        c: targetC,
        f: targetF,
        na: targetNa,
        fib: targetFib
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
        showToast('Targets applied to Custom Goals & Daily Tracker!');
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
