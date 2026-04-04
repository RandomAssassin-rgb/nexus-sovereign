from fastapi import FastAPI

from api.ml.main import (
    health as app_health,
    predict_fraud as app_predict_fraud,
    predict_oracle as app_predict_oracle,
    predict_premium as app_predict_premium,
    predict_risk as app_predict_risk,
)

app = FastAPI()


@app.get("/health")
async def health():
    return await app_health()


@app.post("/predict/oracle")
async def predict_oracle(data: dict):
    return await app_predict_oracle(data)


@app.post("/predict/fraud")
async def predict_fraud(data: dict):
    return await app_predict_fraud(data)


@app.post("/predict/risk")
async def predict_risk(data: dict):
    return await app_predict_risk(data)


@app.post("/predict/premium")
async def predict_premium(data: dict):
    return await app_predict_premium(data)
