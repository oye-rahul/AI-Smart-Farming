from fastapi import FastAPI, UploadFile, File
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import sys
from pathlib import Path
import joblib
import pickle
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
import io
import json


if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

app = FastAPI(
    title="AI Smart Farming API",
    description="Precision Crop Recommendation & Optical Plant Disease Detection",
    version="2.0.0"
)

# CORS
# Allows your frontend to communicate with FastAPI

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# LOAD CROP RECOMMENDATION MODEL

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = (BASE_DIR / "Models") if (BASE_DIR / "Models").exists() else (BASE_DIR / "models")
CROP_MODEL_PATH = (MODELS_DIR / "Crop-reom.pkl") if (MODELS_DIR / "Crop-reom.pkl").exists() else (MODELS_DIR / "crop-reom.pkl")
crop_model = None

try:
    crop_model = joblib.load(CROP_MODEL_PATH)
    print("Crop recommendation model loaded successfully with joblib")
except Exception as e_joblib:
    try:
        with open(CROP_MODEL_PATH, "rb") as file:
            crop_model = pickle.load(file)
        print("Crop recommendation model loaded successfully with pickle")
    except Exception as e_pickle:
        print(f"Warning: Failed to load crop model: joblib={e_joblib}, pickle={e_pickle}")

# LOAD PLANT DISEASE CLASSIFIER (ResNet-18 PyTorch)

DISEASE_MODEL_PATH = MODELS_DIR / "plant_classifier.pth"
CLASS_NAMES_PATH = MODELS_DIR / "class_names.json"

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
disease_model = None
disease_classes = []

if CLASS_NAMES_PATH.exists() and DISEASE_MODEL_PATH.exists():
    try:
        with open(CLASS_NAMES_PATH, "r", encoding="utf-8") as f:
            disease_classes = json.load(f)

        disease_model = models.resnet18()
        disease_model.fc = nn.Linear(disease_model.fc.in_features, len(disease_classes))
        state_dict = torch.load(DISEASE_MODEL_PATH, map_location=device)
        disease_model.load_state_dict(state_dict)
        disease_model.to(device)
        disease_model.eval()
        print(f"Plant disease classifier loaded successfully ({len(disease_classes)} classes on {device})")
    except Exception as e_disease:
        print(f"Warning: Failed to load plant disease model: {e_disease}")
else:
    print(f"Warning: Disease model files missing at {DISEASE_MODEL_PATH} or {CLASS_NAMES_PATH}")

disease_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

CROP_FAMILIES = {
    "apple": "Rosaceae",
    "blueberry": "Ericaceae",
    "cherry": "Rosaceae",
    "corn": "Poaceae",
    "grape": "Vitaceae",
    "orange": "Rutaceae",
    "peach": "Rosaceae",
    "pepper": "Solanaceae",
    "potato": "Solanaceae",
    "raspberry": "Rosaceae",
    "soybean": "Fabaceae",
    "squash": "Cucurbitaceae",
    "strawberry": "Rosaceae",
    "tomato": "Solanaceae"
}

def analyze_disease_result(raw_label: str, confidence: float):
    parts = raw_label.split("___")
    crop_raw = parts[0].replace("_", " ").strip()
    disease_raw = parts[1].replace("_", " ").strip() if len(parts) > 1 else "Unknown"

    crop_clean = crop_raw.replace("(including sour)", "").replace("(maize)", "").replace(", bell", "").strip().title()
    disease_clean = disease_raw.title()

    crop_key = crop_clean.lower().split()[0]
    family = CROP_FAMILIES.get(crop_key, "Angiosperms")
    is_healthy = "healthy" in disease_raw.lower()

    if is_healthy:
        severity = "Healthy"
        symptoms = f"Leaf tissues exhibit uniform chlorophyll distribution, healthy cellular integrity, and zero visible fungal pustules or bacterial spots."
        actions = [
            "Maintain balanced watering schedule adhering to current weather conditions.",
            "Continue seasonal NPK nutrient fertilization as prescribed for this growth phase.",
            "Inspect foliar canopies weekly to ensure early protection against invasive pests."
        ]
        readable_title = f"{crop_clean} (Healthy)"
    else:
        if any(k in disease_raw.lower() for k in ["blight", "virus", "rot", "esca", "citrus greening", "haunglongbing"]):
            severity = "High Severity"
        elif any(k in disease_raw.lower() for k in ["scab", "rust", "mildew", "leaf scorch"]):
            severity = "Moderate Severity"
        else:
            severity = "Moderate to High"

        symptoms = f"Observable symptoms include necrotic lesions, chlorotic yellow halos, and foliar damage characteristic of {disease_clean} on {crop_clean} foliage."
        actions = [
            f"Promptly prune and safely dispose of infected {crop_clean} leaves away from healthy crops.",
            f"Apply an approved organic or copper-based fungicide spray targeted for {disease_clean}.",
            "Switch to root-zone drip irrigation to prevent surface leaf moisture and spore transmission."
        ]
        readable_title = f"{crop_clean} - {disease_clean}"

    return {
        "success": True,
        "class_index": disease_classes.index(raw_label) if raw_label in disease_classes else -1,
        "raw_label": raw_label,
        "prediction": readable_title,
        "crop": crop_clean,
        "disease": disease_clean,
        "is_healthy": is_healthy,
        "severity": severity,
        "confidence": round(confidence, 1),
        "family": family,
        "symptoms": symptoms,
        "actions": actions
    }


# INPUT DATA STRUCTURE (CROP RECOMMENDATION)
class CropInput(BaseModel):
    N: float
    P: float
    K: float
    temperature: float
    humidity: float
    ph: float
    rainfall: float


@app.get("/")
def home():
    return RedirectResponse(url="/app/")


@app.get("/api/health")
@app.get("/health")
def health():
    return {
        "success": True,
        "message": "AI Smart Farming API is running",
        "crop_model_loaded": crop_model is not None,
        "disease_model_loaded": disease_model is not None,
        "frontend_url": "/app/"
    }


@app.post("/predict")
def predict_crop(data: CropInput):
    if crop_model is None:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": "Crop recommendation model (Crop-reom.pkl) is not loaded on this server."
            }
        )

    try:
        features = pd.DataFrame([{
            'N': data.N,
            'P': data.P,
            'K': data.K,
            'temperature': data.temperature,
            'humidity': data.humidity,
            'ph': data.ph,
            'rainfall': data.rainfall
        }])

        prediction = crop_model.predict(features)
        crop = prediction[0]

        return {
            "success": True,
            "crop": str(crop)
        }
    except Exception as error:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": f"Crop model inference error: {str(error)}"
            }
        )


@app.post("/predict-disease")
@app.post("/predict-plant")
async def predict_plant_disease(file: UploadFile = File(...)):
    if disease_model is None:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": "Plant disease model (plant_classifier.pth / class_names.json) is not loaded on this server."
            }
        )

    try:
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        tensor = disease_transform(image).unsqueeze(0).to(device)

        with torch.no_grad():
            outputs = disease_model(tensor)
            probs = torch.softmax(outputs, dim=1)
            pred_idx = torch.argmax(probs, dim=1).item()
            conf = float(probs[0][pred_idx].item() * 100)

        raw_label = disease_classes[pred_idx]
        return analyze_disease_result(raw_label, conf)

    except Exception as error:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": f"Disease classifier inference failed: {str(error)}"
            }
        )


# MOUNT FRONTEND

FRONTEND_DIR = BASE_DIR.parent / "frontend"
ASSETS_DIR = BASE_DIR.parent / "assets"

if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")

if FRONTEND_DIR.exists():
    app.mount("/app", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    import socket

    def get_local_ip():
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    local_ip = get_local_ip()
    print("=" * 60)
    print("🌱 AI Smart Farming Server Starting:")
    print(f"  • Local (This PC):     http://localhost:8000")
    print(f"  • Same Wi-Fi Network:  http://{local_ip}:8000")
    print("  (Open the Network URL on your phone or other device)")
    print("=" * 60)

    target = "backend.main:app" if (Path.cwd() / "backend").exists() else "main:app"
    uvicorn.run(target, host="0.0.0.0", port=8000, reload=True)

