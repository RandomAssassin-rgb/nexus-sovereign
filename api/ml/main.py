from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import os
from xgboost import Booster

app = FastAPI()

# Model paths updated for Vercel deployment structure
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

# Load Models
try:
    iso_forest = joblib.load(os.path.join(MODEL_DIR, "isolation_forest.pkl"))
    random_forest = joblib.load(os.path.join(MODEL_DIR, "random_forest.pkl"))
    xgboost_premium = Booster()
    xgboost_premium.load_model(os.path.join(MODEL_DIR, "xgboost_premium.json"))
except Exception as e:
    print(f"Error loading models: {e}")
    iso_forest = None
    random_forest = None
    xgboost_premium = None

class FeedbackData(BaseModel):
    user_id: str
    features: list

@app.post("/api/ml/predict/oracle")
async def predict_oracle(data: dict):
    if not iso_forest: return {"anomaly": False, "score": 0.5}
    try:
        # Mock logic/simplified for Vercel
        return {"anomaly": False, "score": 0.95, "confidence": "high"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/predict/fraud")
async def predict_fraud(data: dict):
    try:
        # Placeholder for fraud detection logic
        return {"is_fraud": False, "risk_score": 0.12}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/predict/risk")
async def predict_risk(data: dict):
    try:
        return {"risk_level": "low", "adjustment": 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/predict/premium")
async def predict_premium(data: dict):
    try:
        return {"premium_eligible": True, "multiplier": 1.25}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/health")
async def health():
    return {"status": "healthy", "models_loaded": iso_forest is not None}
