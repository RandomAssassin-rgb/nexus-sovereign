from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import os
import numpy as np
from xgboost import Booster
import xgboost as xgb

app = FastAPI()

# Model paths updated for Vercel deployment structure
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

# Load Models with Industrial Fallbacks
def load_safe(path, name):
    try:
        if os.path.exists(path):
            return joblib.load(path)
        print(f"Warning: {name} not found at {path}. Using heuristic fallback.")
        return None
    except Exception as e:
        print(f"Error loading {name} ({e}). Engaging zero-failure fallback.")
        return None

iso_forest = load_safe(os.path.join(MODEL_DIR, "isolation_forest.pkl"), "IsolationForest")
random_forest = load_safe(os.path.join(MODEL_DIR, "random_forest.pkl"), "RandomForest")

# XGBoost needs special handling
xgboost_premium = None
try:
    xgboost_premium = xgb.XGBRegressor()
    if os.path.exists(os.path.join(MODEL_DIR, "xgboost_premium.json")):
        xgboost_premium.load_model(os.path.join(MODEL_DIR, "xgboost_premium.json"))
    else:
        xgboost_premium = None
except Exception as e:
    print(f"XGBoost load error: {e}")
    xgboost_premium = None


class FraudInput(BaseModel):
    gps_distance_km: float = 2.0
    order_pings_last_60m: int = 15
    claims_last_7d: int = 0
    # Additional fields for flexibility
    claim_velocity: float = 0.12
    risk_score: float = 0.12


class RiskInput(BaseModel):
    declared_earnings: float = 15000.0
    device_age_months: int = 12
    account_age_months: int = 6
    weather_severity: float = 0.22
    aqi_severity: float = 0.22


class PremiumInput(BaseModel):
    weather_severity: float = 0.22
    traffic_density: float = 0.35
    aqi_severity: float = 0.18
    trust_score: float = 0.75
    persona_multiplier: float = 1.0
    declared_earnings: float = 15000.0
    zone_risk: float = 0.15
    weeks_enrolled: int = 4


class OracleInput(BaseModel):
    features: list = []
    user_id: str = ""


@app.post("/api/ml/predict/oracle")
async def predict_oracle(data: dict):
    """Anomaly detection oracle using Isolation Forest."""
    features = data.get("features", [])

    if iso_forest is not None:
        try:
            # Default features for oracle: gps_distance, order_pings, claims
            if not features or len(features) < 3:
                features = [
                    data.get("gps_distance_km", 2.0),
                    data.get("order_pings_last_60m", 15),
                    data.get("claims_last_7d", 0)
                ]

            X = np.array([features])
            prediction = iso_forest.predict(X)[0]
            score = iso_forest.decision_function(X)[0]

            # IsolationForest: -1 = anomaly, 1 = normal
            # decision_function: negative = anomalous, positive = normal
            is_anomaly = bool(prediction == -1)
            normalized_score = (1 - (score + 0.5)) if score < 0 else (0.5 - score * 0.5)
            normalized_score = max(0.0, min(1.0, 0.5 + normalized_score))

            return {
                "anomaly": is_anomaly,
                "score": round(float(normalized_score), 3),
                "confidence": "high" if abs(score) > 0.1 else "medium",
                "raw_score": round(float(score), 4),
                "model_used": "isolation_forest"
            }
        except Exception as e:
            print(f"Oracle prediction error: {e}")

    # Fallback heuristic
    claim_velocity = data.get("claim_velocity", data.get("risk_score", 0.12))
    risk_score = min(0.92, max(0.08, float(claim_velocity)))
    return {
        "anomaly": risk_score >= 0.72,
        "score": round(risk_score, 3),
        "confidence": "medium",
        "source": "fallback"
    }


@app.post("/api/ml/predict/fraud")
async def predict_fraud(data: dict):
    """Fraud detection using Isolation Forest model."""
    if iso_forest is not None:
        try:
            # Extract features with defaults
            gps_distance = float(data.get("gps_distance_km", data.get("gps_distance", 2.0)))
            order_pings = int(data.get("order_pings_last_60m", data.get("order_pings", 15)))
            claims_7d = int(data.get("claims_last_7d", data.get("claims_7d", 0)))

            # Additional risk factors
            claim_velocity = float(data.get("claim_velocity", claims_7d / 7.0 if claims_7d > 0 else 0.12))
            device_trust = float(data.get("device_trust_score", 0.85))

            # Primary features for IsolationForest
            X = np.array([[gps_distance, order_pings, claims_7d]])

            prediction = iso_forest.predict(X)[0]
            raw_score = iso_forest.decision_function(X)[0]

            # Normalize: -1 (anomaly) -> high fraud risk, 1 (normal) -> low fraud risk
            # decision_function: more negative = more anomalous
            is_fraud = prediction == -1
            fraud_score = max(0.0, min(1.0, 0.5 + (0 - raw_score) * 0.3))

            # Adjust based on additional factors
            if claim_velocity > 0.5:
                fraud_score = min(1.0, fraud_score + 0.15)
            if device_trust < 0.5:
                fraud_score = min(1.0, fraud_score + 0.1)

            return {
                "is_fraud": is_fraud or fraud_score > 0.72,
                "risk_score": round(fraud_score, 3),
                "anomaly_detected": is_fraud,
                "raw_decision_score": round(float(raw_score), 4),
                "factors": {
                    "gps_distance_km": gps_distance,
                    "order_pings": order_pings,
                    "claims_last_7d": claims_7d,
                    "claim_velocity": round(claim_velocity, 3),
                    "device_trust": device_trust
                },
                "model_used": "isolation_forest"
            }
        except Exception as e:
            print(f"Fraud prediction error: {e}")

    # Fallback heuristic based on input
    claim_velocity = float(data.get("claim_velocity", data.get("risk_score", 0.12)))
    risk_score = min(0.92, max(0.08, claim_velocity))
    return {
        "is_fraud": risk_score >= 0.72,
        "risk_score": round(risk_score, 3),
        "source": "fallback"
    }


@app.post("/api/ml/predict/risk")
async def predict_risk(data: dict):
    """Risk profiling using Random Forest classifier."""
    if random_forest is not None:
        try:
            # Extract features with defaults
            declared_earnings = float(data.get("declared_earnings", data.get("earnings", 15000.0)))
            device_age_months = float(data.get("device_age_months", data.get("device_age", 12)))
            account_age_months = float(data.get("account_age_months", data.get("account_age", 6)))

            # Additional context factors
            weather_severity = float(data.get("weather_severity", 0.22))
            aqi_severity = float(data.get("aqi_severity", 0.22))

            X = np.array([[declared_earnings, device_age_months, account_age_months]])

            prediction = random_forest.predict(X)[0]
            probabilities = random_forest.predict_proba(X)[0]

            # Map: 0=Low Risk, 1=Medium Risk, 2=High Risk
            risk_levels = ["low", "medium", "high"]
            risk_level = risk_levels[prediction]

            # Calculate adjustment based on additional factors
            base_adjustment = 0
            if weather_severity >= 0.7:
                base_adjustment += 18
            elif weather_severity >= 0.4:
                base_adjustment += 8

            if aqi_severity >= 0.7:
                base_adjustment += 12
            elif aqi_severity >= 0.4:
                base_adjustment += 5

            # Probability-based adjustment
            high_risk_prob = probabilities[2] if len(probabilities) > 2 else 0
            if high_risk_prob > 0.5:
                base_adjustment += 10

            return {
                "risk_level": risk_level,
                "adjustment": base_adjustment,
                "probabilities": {
                    "low": round(float(probabilities[0]), 3),
                    "medium": round(float(probabilities[1]), 3),
                    "high": round(float(probabilities[2]), 3)
                },
                "factors": {
                    "declared_earnings": declared_earnings,
                    "device_age_months": device_age_months,
                    "account_age_months": account_age_months
                },
                "model_used": "random_forest"
            }
        except Exception as e:
            print(f"Risk prediction error: {e}")

    # Fallback heuristic
    base_risk = float(data.get("weather_severity", data.get("aqi_severity", 0.22)))
    return {
        "risk_level": "high" if base_risk >= 0.7 else "medium" if base_risk >= 0.4 else "low",
        "adjustment": 18 if base_risk >= 0.7 else 8 if base_risk >= 0.4 else 0,
        "source": "fallback"
    }


@app.post("/api/ml/predict/premium")
async def predict_premium(data: dict):
    """Premium calculation using XGBoost regression model."""
    if xgboost_premium is not None:
        try:
            # Extract features with defaults
            weather_severity = float(data.get("weather_severity", 0.22))
            traffic_density = float(data.get("traffic_density", 0.35))
            aqi_severity = float(data.get("aqi_severity", 0.18))
            trust_score = float(data.get("trust_score", 0.75))

            # Persona multiplier based on platform
            persona = data.get("persona", data.get("platform", "Blinkit"))
            if "swiggy" in persona.lower():
                persona_multiplier = 1.2
            elif "zepto" in persona.lower() or "blinkit" in persona.lower():
                persona_multiplier = 1.0
            else:
                persona_multiplier = 0.8
            persona_multiplier = float(data.get("persona_multiplier", persona_multiplier))

            declared_earnings = float(data.get("declared_earnings", 15000.0))
            zone_risk = float(data.get("zone_risk", 0.15))
            weeks_enrolled = int(data.get("weeks_enrolled", 4))

            # Normalize earnings for model (0-1 scale relative to max 20000)
            earnings_normalized = declared_earnings / 20000.0

            # Feature vector: [weather_severity, traffic_density, aqi_severity,
            #                  trust_score, persona_multiplier, declared_earnings, zone_risk, weeks_enrolled]
            X = np.array([[weather_severity, traffic_density, aqi_severity,
                          trust_score, persona_multiplier, earnings_normalized,
                          zone_risk, weeks_enrolled / 12.0]])

            predicted_premium = xgboost_premium.predict(X)[0]

            # Ensure premium is within bounds (Rs 29 - Rs 99 per week)
            premium = max(29, min(99, float(predicted_premium)))

            # Calculate eligibility
            premium_eligible = trust_score >= 0.5 and zone_risk < 0.8

            return {
                "premium_eligible": premium_eligible,
                "weekly_premium": round(premium, 2),
                "multiplier": round(persona_multiplier, 2),
                "factors": {
                    "weather_severity": weather_severity,
                    "traffic_density": traffic_density,
                    "aqi_severity": aqi_severity,
                    "trust_score": trust_score,
                    "zone_risk": zone_risk,
                    "weeks_enrolled": weeks_enrolled
                },
                "risk_adjustment": round((weather_severity * 28 + traffic_density * 15 + aqi_severity * 12), 2),
                "model_used": "xgboost"
            }
        except Exception as e:
            print(f"Premium prediction error: {e}")

    # Fallback heuristic
    trust_score = float(data.get("trust_score", 0.75))
    return {
        "premium_eligible": trust_score >= 0.5,
        "multiplier": 1.25,
        "source": "fallback"
    }


@app.get("/api/ml/health")
async def health():
    """Health check endpoint reporting model status."""
    return {
        "status": "healthy",
        "models_loaded": {
            "isolation_forest": iso_forest is not None,
            "random_forest": random_forest is not None,
            "xgboost_premium": xgboost_premium is not None
        },
        "model_dir": MODEL_DIR,
        "models_exist": {
            "isolation_forest": os.path.exists(os.path.join(MODEL_DIR, "isolation_forest.pkl")),
            "random_forest": os.path.exists(os.path.join(MODEL_DIR, "random_forest.pkl")),
            "xgboost": os.path.exists(os.path.join(MODEL_DIR, "xgboost_premium.json"))
        }
    }