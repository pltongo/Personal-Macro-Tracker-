import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Default API URL (can be pointed to local IP or hosted backend)
const DEFAULT_API_URL = 'http://192.168.1.50:8000';

export default function App() {
  const [tab, setTab] = useState('daily'); // 'daily', 'weekly', 'settings'
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [settings, setSettings] = useState({
    calorie_target: 2400,
    protein_target: 175,
    carbs_target: 260,
    fat_target: 70,
    sodium_target: 2300,
    fiber_target: 35
  });

  const [dailyMeals, setDailyMeals] = useState([]);
  const [dailyTotals, setDailyTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, fiber: 0 });
  const [weeklyData, setWeeklyData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Logging Form State
  const [mealType, setMealType] = useState('Lunch');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState(null);

  useEffect(() => {
    loadSettings();
    fetchDailyData(selectedDate);
  }, [selectedDate]);

  const loadSettings = async () => {
    try {
      const saved = await AsyncStorage.getItem('macro_settings');
      if (saved) setSettings(JSON.parse(saved));
      const savedUrl = await AsyncStorage.getItem('macro_api_url');
      if (savedUrl) setApiUrl(savedUrl);
    } catch (e) {
      console.log('Error loading settings', e);
    }
  };

  const fetchDailyData = async (date) => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/meals?date=${date}`);
      if (res.ok) {
        const data = await res.json();
        setDailyMeals(data.meals || []);
        setDailyTotals(data.totals || { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, fiber: 0 });
      }
    } catch (err) {
      // Fallback to local storage if offline
      const localKey = `meals_${date}`;
      const local = await AsyncStorage.getItem(localKey);
      if (local) {
        const parsed = JSON.parse(local);
        setDailyMeals(parsed.meals || []);
        setDailyTotals(parsed.totals || { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, fiber: 0 });
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchWeeklyData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/weekly?date=${selectedDate}`);
      if (res.ok) {
        const data = await res.json();
        setWeeklyData(data);
      }
    } catch (err) {
      Alert.alert('Offline Mode', 'Could not sync weekly data from server.');
    } finally {
      setLoading(false);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to snap food photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true
    });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true
    });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleLogMeal = async () => {
    if (!description.trim()) {
      Alert.alert('Input Required', 'Please enter a description or ingredients.');
      return;
    }

    setLoading(true);
    try {
      // Estimate from server
      const estRes = await fetch(`${apiUrl}/api/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description })
      });
      const estData = await estRes.json();

      const itemsToLog = estData.items && estData.items.length > 0 ? estData.items : [{
        name: description,
        portion: '1 serving',
        calories: 350,
        protein: 25,
        carbs: 30,
        fat: 10,
        sodium: 400,
        fiber: 3
      }];

      const logRes = await fetch(`${apiUrl}/api/meals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          meal_type: mealType,
          items: itemsToLog,
          image_url: photoUri || ''
        })
      });

      if (logRes.ok) {
        Alert.alert('Success', `Logged ${itemsToLog.length} items to ${mealType}`);
        setDescription('');
        setPhotoUri(null);
        fetchDailyData(selectedDate);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to reach server. Ensure backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const changeDay = (days) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brandTitle}>🥗 MacroTracker Mobile</Text>
        <Text style={styles.subTitle}>Cross-Platform Nutrition & Averages</Text>
      </View>

      {/* Main Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'daily' && styles.tabBtnActive]}
          onPress={() => setTab('daily')}
        >
          <Text style={[styles.tabText, tab === 'daily' && styles.tabTextActive]}>Daily Log</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'weekly' && styles.tabBtnActive]}
          onPress={() => { setTab('weekly'); fetchWeeklyData(); }}
        >
          <Text style={[styles.tabText, tab === 'weekly' && styles.tabTextActive]}>Weekly Avg</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'settings' && styles.tabBtnActive]}
          onPress={() => setTab('settings')}
        >
          <Text style={[styles.tabText, tab === 'settings' && styles.tabTextActive]}>Settings</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content}>
        {tab === 'daily' && (
          <View>
            {/* Date Bar */}
            <View style={styles.dateBar}>
              <TouchableOpacity onPress={() => changeDay(-1)} style={styles.navBtn}>
                <Text style={styles.navBtnText}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.dateLabel}>{selectedDate}</Text>
              <TouchableOpacity onPress={() => changeDay(1)} style={styles.navBtn}>
                <Text style={styles.navBtnText}>▶</Text>
              </TouchableOpacity>
            </View>

            {/* Daily Macro Progress Summary */}
            <View style={styles.macroGrid}>
              <View style={[styles.macroCard, { borderLeftColor: '#f97316' }]}>
                <Text style={styles.cardLabel}>Calories</Text>
                <Text style={styles.cardVal}>{dailyTotals.calories} kcal</Text>
                <Text style={styles.cardGoal}>Goal: {settings.calorie_target}</Text>
              </View>
              <View style={[styles.macroCard, { borderLeftColor: '#38bdf8' }]}>
                <Text style={styles.cardLabel}>Protein</Text>
                <Text style={styles.cardVal}>{dailyTotals.protein} g</Text>
                <Text style={styles.cardGoal}>Goal: {settings.protein_target}g</Text>
              </View>
              <View style={[styles.macroCard, { borderLeftColor: '#fbbf24' }]}>
                <Text style={styles.cardLabel}>Carbs</Text>
                <Text style={styles.cardVal}>{dailyTotals.carbs} g</Text>
                <Text style={styles.cardGoal}>Goal: {settings.carbs_target}g</Text>
              </View>
              <View style={[styles.macroCard, { borderLeftColor: '#f87171' }]}>
                <Text style={styles.cardLabel}>Fat</Text>
                <Text style={styles.cardVal}>{dailyTotals.fat} g</Text>
                <Text style={styles.cardGoal}>Goal: {settings.fat_target}g</Text>
              </View>
              <View style={[styles.macroCard, { borderLeftColor: '#c084fc' }]}>
                <Text style={styles.cardLabel}>Sodium</Text>
                <Text style={styles.cardVal}>{dailyTotals.sodium} mg</Text>
                <Text style={styles.cardGoal}>Goal: {settings.sodium_target}mg</Text>
              </View>
              <View style={[styles.macroCard, { borderLeftColor: '#34d399' }]}>
                <Text style={styles.cardLabel}>Fiber</Text>
                <Text style={styles.cardVal}>{dailyTotals.fiber} g</Text>
                <Text style={styles.cardGoal}>Goal: {settings.fiber_target}g</Text>
              </View>
            </View>

            {/* Meal Logger Box */}
            <View style={styles.formCard}>
              <Text style={styles.formHeader}>Quick Log Food</Text>
              
              {/* Meal Type Selectors */}
              <View style={styles.mealTypeRow}>
                {['Breakfast', 'Lunch', 'Dinner', 'Snacks'].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.typeBtn, mealType === m && styles.typeBtnActive]}
                    onPress={() => setMealType(m)}
                  >
                    <Text style={[styles.typeText, mealType === m && styles.typeTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.inputArea}
                placeholder="e.g. 8oz chicken breast, 1.5 cups rice, 1 cup broccoli"
                placeholderTextColor="#64748b"
                value={description}
                onChangeText={setDescription}
                multiline
              />

              {/* Camera & Photo Actions */}
              <View style={styles.photoActions}>
                <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
                  <Text style={styles.photoBtnText}>📷 Snap Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={pickImage}>
                  <Text style={styles.photoBtnText}>🖼️ Choose Photo</Text>
                </TouchableOpacity>
              </View>

              {photoUri && (
                <View style={styles.previewBox}>
                  <Image source={{ uri: photoUri }} style={styles.previewImg} />
                  <TouchableOpacity onPress={() => setPhotoUri(null)}>
                    <Text style={{ color: '#ef4444', marginTop: 4 }}>Remove Photo</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={styles.submitBtn} onPress={handleLogMeal} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>✨ Save to {mealType}</Text>}
              </TouchableOpacity>
            </View>

            {/* Today's Meals */}
            <View style={styles.mealsListCard}>
              <Text style={styles.formHeader}>Today's Logged Items ({dailyMeals.length})</Text>
              {dailyMeals.length === 0 ? (
                <Text style={styles.emptyText}>Fresh tracker! No meals logged yet for this date.</Text>
              ) : (
                dailyMeals.map((meal) => (
                  <View key={meal.id} style={styles.mealRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mealName}>{meal.name} <Text style={{ color: '#94a3b8', fontSize: 12 }}>({meal.meal_type})</Text></Text>
                      <Text style={styles.mealPortion}>{meal.portion}</Text>
                    </View>
                    <View style={styles.badgeRow}>
                      <Text style={[styles.badge, { color: '#f97316' }]}>{meal.calories} kcal</Text>
                      <Text style={[styles.badge, { color: '#38bdf8' }]}>{meal.protein}g P</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {tab === 'weekly' && (
          <View>
            <View style={styles.formCard}>
              <Text style={styles.formHeader}>End-of-Week 7-Day Averages</Text>
              {weeklyData ? (
                <View>
                  <Text style={{ color: '#94a3b8', marginBottom: 12 }}>
                    Week: {weeklyData.week_start} to {weeklyData.week_end} ({weeklyData.active_days}/7 active days)
                  </Text>
                  <View style={styles.macroGrid}>
                    <View style={styles.macroCard}>
                      <Text style={styles.cardLabel}>Avg Protein</Text>
                      <Text style={[styles.cardVal, { color: '#38bdf8' }]}>{weeklyData.week_averages.protein} g</Text>
                      <Text style={styles.cardGoal}>Goal: {weeklyData.targets.protein}g</Text>
                    </View>
                    <View style={styles.macroCard}>
                      <Text style={styles.cardLabel}>Avg Carbs</Text>
                      <Text style={[styles.cardVal, { color: '#fbbf24' }]}>{weeklyData.week_averages.carbs} g</Text>
                      <Text style={styles.cardGoal}>Goal: {weeklyData.targets.carbs}g</Text>
                    </View>
                    <View style={styles.macroCard}>
                      <Text style={styles.cardLabel}>Avg Fat</Text>
                      <Text style={[styles.cardVal, { color: '#f87171' }]}>{weeklyData.week_averages.fat} g</Text>
                      <Text style={styles.cardGoal}>Goal: {weeklyData.targets.fat}g</Text>
                    </View>
                    <View style={styles.macroCard}>
                      <Text style={styles.cardLabel}>Avg Sodium</Text>
                      <Text style={[styles.cardVal, { color: '#c084fc' }]}>{weeklyData.week_averages.sodium} mg</Text>
                      <Text style={styles.cardGoal}>Goal: {weeklyData.targets.sodium}mg</Text>
                    </View>
                    <View style={styles.macroCard}>
                      <Text style={styles.cardLabel}>Avg Calories</Text>
                      <Text style={[styles.cardVal, { color: '#f97316' }]}>{weeklyData.week_averages.calories} kcal</Text>
                      <Text style={styles.cardGoal}>Goal: {weeklyData.targets.calories} kcal</Text>
                    </View>
                    <View style={styles.macroCard}>
                      <Text style={styles.cardLabel}>Avg Fiber</Text>
                      <Text style={[styles.cardVal, { color: '#34d399' }]}>{weeklyData.week_averages.fiber} g</Text>
                      <Text style={styles.cardGoal}>Goal: {weeklyData.targets.fiber}g</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <ActivityIndicator color="#3b82f6" style={{ marginVertical: 20 }} />
              )}
            </View>
          </View>
        )}

        {tab === 'settings' && (
          <View style={styles.formCard}>
            <Text style={styles.formHeader}>Custom Targets & Config</Text>
            <Text style={styles.inputLabel}>Backend Server URL</Text>
            <TextInput
              style={styles.input}
              value={apiUrl}
              onChangeText={setApiUrl}
              placeholder="http://192.168.1.50:8000"
              placeholderTextColor="#64748b"
            />

            <Text style={styles.inputLabel}>Daily Protein Goal (g)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(settings.protein_target)}
              onChangeText={(v) => setSettings({ ...settings, protein_target: Number(v) || 0 })}
            />

            <Text style={styles.inputLabel}>Daily Calories Goal (kcal)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(settings.calorie_target)}
              onChangeText={(v) => setSettings({ ...settings, calorie_target: Number(v) || 0 })}
            />

            <Text style={styles.inputLabel}>Daily Sodium Goal (mg)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(settings.sodium_target)}
              onChangeText={(v) => setSettings({ ...settings, sodium_target: Number(v) || 0 })}
            />

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={async () => {
                await AsyncStorage.setItem('macro_settings', JSON.stringify(settings));
                await AsyncStorage.setItem('macro_api_url', apiUrl);
                Alert.alert('Saved', 'Preferences saved successfully.');
              }}
            >
              <Text style={styles.submitBtnText}>Save Preferences</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  brandTitle: { color: '#f8fafc', fontSize: 20, fontWeight: '800' },
  subTitle: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  tabBar: { flexDirection: 'row', backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#3b82f6' },
  tabText: { color: '#94a3b8', fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#38bdf8' },
  content: { flex: 1, padding: 16 },
  dateBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b', padding: 12, borderRadius: 10, marginBottom: 14 },
  navBtn: { padding: 8 },
  navBtnText: { color: '#38bdf8', fontSize: 18, fontWeight: '700' },
  dateLabel: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  macroCard: { width: '48%', backgroundColor: '#1e293b', padding: 12, borderRadius: 10, borderLeftWidth: 4, borderLeftColor: '#3b82f6' },
  cardLabel: { color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', fontWeight: '700' },
  cardVal: { color: '#f8fafc', fontSize: 18, fontWeight: '800', marginVertical: 4 },
  cardGoal: { color: '#64748b', fontSize: 11 },
  formCard: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 16 },
  formHeader: { color: '#f8fafc', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  mealTypeRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  typeBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, backgroundColor: '#0f172a', alignItems: 'center' },
  typeBtnActive: { backgroundColor: '#3b82f6' },
  typeText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  typeTextActive: { color: '#fff' },
  inputArea: { backgroundColor: '#0f172a', color: '#f8fafc', padding: 12, borderRadius: 8, minHeight: 70, textAlignVertical: 'top', marginBottom: 12 },
  photoActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  photoBtn: { flex: 1, backgroundColor: '#334155', padding: 10, borderRadius: 8, alignItems: 'center' },
  photoBtnText: { color: '#f8fafc', fontWeight: '600', fontSize: 13 },
  previewBox: { alignItems: 'center', marginBottom: 12 },
  previewImg: { width: 100, height: 100, borderRadius: 8 },
  submitBtn: { backgroundColor: '#10b981', padding: 14, borderRadius: 8, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  mealsListCard: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 30 },
  mealRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#334155' },
  mealName: { color: '#f8fafc', fontWeight: '600', fontSize: 14 },
  mealPortion: { color: '#64748b', fontSize: 12 },
  badgeRow: { flexDirection: 'row', gap: 6 },
  badge: { fontSize: 12, fontWeight: '700' },
  emptyText: { color: '#64748b', textAlign: 'center', marginVertical: 20 },
  inputLabel: { color: '#94a3b8', fontSize: 12, marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: '#0f172a', color: '#f8fafc', padding: 10, borderRadius: 8, marginBottom: 10 }
});
