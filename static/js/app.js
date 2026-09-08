/**
 * MacroTracker Pro - Client Application Logic
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
    currentMode: 'text' // 'text' or 'photo'
};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    await loadSettings();
    initDateControls();
    initTabs();
    initModeSwitcher();
    initPhotoUpload();
    initMealForm();
    await loadDailyData();
});

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('macro_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        themeBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
        themeBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('macro_theme', next);
            themeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
        });
    }
}

// Toast Feedback
function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
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
            document.getElementById(`tab-${targetTab}`).style.display = 'block';
            
            if (targetTab === 'daily') {
                await loadDailyData();
            } else if (targetTab === 'weekly') {
                await loadWeeklyData();
            } else if (targetTab === 'settings') {
                renderSettingsForm();
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

    document.getElementById('prev-day-btn').addEventListener('click', async () => {
        changeDate(-1);
    });

    document.getElementById('next-day-btn').addEventListener('click', async () => {
        changeDate(1);
    });

    document.getElementById('today-btn').addEventListener('click', async () => {
        state.selectedDate = new Date().toISOString().split('T')[0];
        picker.value = state.selectedDate;
        updateDateLabel();
        await loadDailyData();
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
            if (mode === 'text') {
                document.getElementById('text-input-group').style.display = 'block';
                document.getElementById('photo-input-group').style.display = 'none';
            } else {
                document.getElementById('text-input-group').style.display = 'none';
                document.getElementById('photo-input-group').style.display = 'block';
            }
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

            // Upload to server
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
    // Smart Estimate Button
    document.getElementById('estimate-btn').addEventListener('click', async () => {
        let desc = '';
        if (state.currentMode === 'text') {
            desc = document.getElementById('meal-description').value.trim();
        } else {
            desc = document.getElementById('photo-description').value.trim();
        }

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

    // Add Blank Item Row Button
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

    // Save All Staged Items to Today's Log
    document.getElementById('save-staged-btn').addEventListener('click', async () => {
        if (state.stagedItems.length === 0) {
            showToast('No items to save. Estimate or add items first.');
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
                showToast(`Logged ${data.created.length} items to ${mealType}`);
                // Clear form
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
    targetEl.textContent = `Goal: ${target} ${unit} (${Math.round((current / (target || 1)) * 100)}%)`;
    
    const pct = Math.min(100, Math.round((current / (target || 1)) * 100));
    fillEl.style.width = `${pct}%`;
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
                    <span style="font-size: 0.85rem; font-weight: normal; color: var(--text-muted);">${items.length} item${items.length > 1 ? 's' : ''}</span>
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
                        <span class="badge cal">${m.calories} kcal</span>
                        <span class="badge p">${m.protein}g P</span>
                        <span class="badge c">${m.carbs}g C</span>
                        <span class="badge f">${m.fat}g F</span>
                        <span class="badge na">${m.sodium}mg Na</span>
                        <span class="badge fib">${m.fiber}g Fib</span>
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
                <div style="font-size: 2.5rem; margin-bottom: 8px;">🥣</div>
                <div style="font-weight: 600; color: var(--text-secondary);">Fresh tracker for this day</div>
                <div style="font-size: 0.9rem;">No meals logged yet. Use the logger above to log food by text or photo.</div>
            </div>
        `;
    }
}

window.deleteMealItem = async function(id) {
    if (!confirm('Are you sure you want to delete this meal item?')) return;
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
            <div class="avg-val" style="color: var(--accent-protein);">${avgs.protein}g</div>
            <div class="macro-target">Target: ${tgts.protein}g (${avgs.protein >= tgts.protein ? '+' : ''}${Math.round(avgs.protein - tgts.protein)}g)</div>
        </div>
        <div class="avg-card">
            <div class="macro-title">Avg Carbs</div>
            <div class="avg-val" style="color: var(--accent-carbs);">${avgs.carbs}g</div>
            <div class="macro-target">Target: ${tgts.carbs}g</div>
        </div>
        <div class="avg-card">
            <div class="macro-title">Avg Fat</div>
            <div class="avg-val" style="color: var(--accent-fat);">${avgs.fat}g</div>
            <div class="macro-target">Target: ${tgts.fat}g</div>
        </div>
        <div class="avg-card">
            <div class="macro-title">Avg Sodium</div>
            <div class="avg-val" style="color: var(--accent-sodium);">${avgs.sodium}mg</div>
            <div class="macro-target">Target: ${tgts.sodium}mg</div>
        </div>
        <div class="avg-card">
            <div class="macro-title">Avg Calories</div>
            <div class="avg-val" style="color: var(--accent-calories);">${avgs.calories}</div>
            <div class="macro-target">Target: ${tgts.calories} kcal</div>
        </div>
        <div class="avg-card">
            <div class="macro-title">Avg Fiber</div>
            <div class="avg-val" style="color: var(--accent-fiber);">${avgs.fiber}g</div>
            <div class="macro-target">Target: ${tgts.fiber}g</div>
        </div>
    `;

    // Render Weekly Bar Chart (Protein)
    const chart = document.getElementById('weekly-chart-bars');
    chart.innerHTML = '';
    const maxProtein = Math.max(...data.days.map(d => d.totals.protein), tgts.protein, 1);

    data.days.forEach(d => {
        const heightPct = Math.round((d.totals.protein / maxProtein) * 100);
        const group = document.createElement('div');
        group.className = 'chart-bar-group';
        group.innerHTML = `
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--accent-protein);">${d.totals.protein > 0 ? Math.round(d.totals.protein) + 'g' : ''}</div>
            <div class="chart-bar-track">
                <div class="chart-bar-fill" style="height: ${heightPct}%;"></div>
            </div>
            <div class="chart-label">${d.day_name}</div>
        `;
        chart.appendChild(group);
    });

    // Render Breakdown Table
    const tbody = document.getElementById('weekly-table-tbody');
    tbody.innerHTML = '';
    data.days.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${d.day_name}</strong> (${d.date.slice(5)})</td>
            <td>${d.meal_count}</td>
            <td>${d.totals.calories}</td>
            <td style="color: var(--accent-protein); font-weight: 700;">${d.totals.protein}g</td>
            <td>${d.totals.carbs}g</td>
            <td>${d.totals.fat}g</td>
            <td>${d.totals.sodium}mg</td>
            <td>${d.totals.fiber}g</td>
        `;
        tbody.appendChild(tr);
    });

    // Add Average Row
    const avgTr = document.createElement('tr');
    avgTr.style.backgroundColor = 'var(--bg-hover)';
    avgTr.style.fontWeight = 'bold';
    avgTr.innerHTML = `
        <td>7-Day Average</td>
        <td>-</td>
        <td>${avgs.calories}</td>
        <td style="color: var(--accent-protein);">${avgs.protein}g</td>
        <td>${avgs.carbs}g</td>
        <td>${avgs.fat}g</td>
        <td>${avgs.sodium}mg</td>
        <td>${avgs.fiber}g</td>
    `;
    tbody.appendChild(avgTr);
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
        theme: document.documentElement.getAttribute('data-theme') || 'dark'
    };

    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        state.settings = await res.json();
        showToast('Settings and custom targets saved!');
    } catch (err) {
        console.error('Settings save error:', err);
        showToast('Failed to save settings');
    }
});
