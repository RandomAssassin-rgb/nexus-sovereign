import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestClassifier
import xgboost as xgb
import joblib
import pickle
import os

os.makedirs('models', exist_ok=True)

print("Training Isolation Forest (Fraud Anomaly)...")
# Features: gps_distance_km, order_pings_last_60m, claims_last_7d
np.random.seed(42)
X_fraud_normal = np.random.normal(loc=[2.0, 15, 0.1], scale=[1.0, 5, 0.3], size=(900, 3))
X_fraud_anomalies = np.random.normal(loc=[15.0, 2, 3.0], scale=[5.0, 1, 1.0], size=(100, 3))
X_fraud = np.vstack([X_fraud_normal, X_fraud_anomalies])

iso = IsolationForest(contamination=0.1, random_state=42)
iso.fit(X_fraud)
with open('models/isolation_forest.pkl', 'wb') as f:
    pickle.dump(iso, f)

print("Training Random Forest (Risk Profiler)...")
# Features: declared_earnings, device_age_months, account_age_months
X_risk = np.random.rand(1000, 3) * [50000, 48, 60]
# 0: Low Risk, 1: Medium Risk, 2: High Risk
y_risk = []
for row in X_risk:
    score = row[0]/50000 - row[1]/48 - row[2]/60
    if score > 0: y_risk.append(0)
    elif score > -0.5: y_risk.append(1)
    else: y_risk.append(2)

rf = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
rf.fit(X_risk, y_risk)
with open('models/random_forest.pkl', 'wb') as f:
    pickle.dump(rf, f)

print("Training XGBoost (Premium Calculator)...")
# Features: weather_severity, traffic_density, aqi_severity, trust_score(0-1), persona_multiplier, declared_earnings, zone_risk, weeks_enrolled
X_prem = np.random.rand(2000, 8)
# persona_multiplier: 1.2, 1.0, 0.8
persona_choices = [1.2, 1.0, 0.8]
base_choices = [59, 49, 39]

y_prem = []
for row in X_prem:
    idx = np.random.randint(0, 3)
    p_mult = persona_choices[idx]
    base = base_choices[idx]
    
    weather = row[0] * 28      # up to +28
    traffic = row[1] * 15      # up to +15
    aqi = row[2] * 12          # up to +12
    trust = row[3] * 25        # up to -25
    earnings = ((row[5]*2000 - 500) / 500) * 10 # scale to actual earnings up to 2000
    zone = row[6] * 18         # up to +18
    tenure = min((row[7]*12) / 8, 1) * 10 # up to -10 after 8 weeks
    
    raw = (base * p_mult) + weather + traffic + aqi + zone + max(0, earnings) - trust - tenure
    y_prem.append(max(29, min(99, raw)))

y_prem = np.array(y_prem)

xgb_model = xgb.XGBRegressor(n_estimators=100, max_depth=5, learning_rate=0.1)
xgb_model.fit(X_prem, y_prem)
xgb_model.save_model('models/xgboost_premium.json')

print("All models trained and saved successfully in 'models/' directory.")
