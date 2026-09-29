from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import sys
from pathlib import Path
import joblib
import pickle
import numpy as np
import pandas as pd

# Ensure UTF-8 output encoding on Windows consoles
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


# ============================================================
# CREATE FASTAPI APP
# ============================================================

app = FastAPI(
    title="AI Crop Recommendation API",
    version="1.0.0"
)


# ============================================================
# CORS
# Allows your frontend to communicate with FastAPI
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# LOAD YOUR ML MODEL
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "Models" / "Crop-reom.pkl"

try:
    model = joblib.load(MODEL_PATH)
    print("Crop recommendation model loaded successfully with joblib")
except Exception as e_joblib:
    try:
        with open(MODEL_PATH, "rb") as file:
            model = pickle.load(file)
        print("Crop recommendation model loaded successfully with pickle")
    except Exception as e_pickle:
        print(f"Failed to load model: joblib error={e_joblib}, pickle error={e_pickle}")
        raise


# ============================================================
# INPUT DATA STRUCTURE
# ============================================================

class CropInput(BaseModel):

    N: float
    P: float
    K: float

    temperature: float
    humidity: float

    ph: float
    rainfall: float


# ============================================================
# HOME / HEALTH CHECK
# ============================================================

@app.get("/")
def home():

    return {
        "success": True,
        "message": "AI Crop Recommendation API is running",
        "frontend_url": "http://127.0.0.1:8000/app/"
    }


# ============================================================
# CROP PREDICTION
# ============================================================

@app.post("/predict")
def predict_crop(data: CropInput):

    try:

        # ----------------------------------------------------
        # Create model input
        # IMPORTANT:
        # Order must match the order used during training
        # ----------------------------------------------------

        features = pd.DataFrame([{
            'N': data.N,
            'P': data.P,
            'K': data.K,
            'temperature': data.temperature,
            'humidity': data.humidity,
            'ph': data.ph,
            'rainfall': data.rainfall
        }])

        print("Input received:")
        print(features)


        # ----------------------------------------------------
        # MODEL PREDICTION
        # ----------------------------------------------------

        prediction = model.predict(features)

        crop = prediction[0]


        print("Recommended crop:", crop)


        # ----------------------------------------------------
        # SEND RESPONSE TO FRONTEND
        # ----------------------------------------------------

        return {
            "success": True,
            "crop": str(crop)
        }


    except Exception as error:

        print("Prediction error:", error)

        return {
            "success": False,
            "error": str(error)
        }


# ============================================================
# MOUNT FRONTEND
# Allows viewing the frontend directly at http://127.0.0.1:8000/app/
# ============================================================

FRONTEND_DIR = BASE_DIR.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/app", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
