from fastapi import FastAPI, UploadFile, File
from fastapi.responses import RedirectResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import sys
import os
import io
import json
from pathlib import Path
import numpy as np
from PIL import Image

# Graceful optional imports
try:
    import onnxruntime as ort
    ONNX_AVAILABLE = True
except ImportError:
    ort = None
    ONNX_AVAILABLE = False

try:
    import torch
    import torch.nn as nn
    from torchvision import models, transforms
    TORCH_AVAILABLE = True
except ImportError:
    torch = None
    nn = None
    models = None
    transforms = None
    TORCH_AVAILABLE = False

try:
    import joblib
except ImportError:
    joblib = None

try:
    import pickle
except ImportError:
    pickle = None

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

app = FastAPI(
    title="AI Smart Farming API",
    description="Precision Crop Recommendation & Optical Plant Disease Detection",
    version="2.1.0"
)

# Enable CORS for all origins so web and mobile clients connect freely
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# LOCATE MODELS DIRECTORY
# -----------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent

POSSIBLE_MODEL_DIRS = [
    BASE_DIR / "Models",
    BASE_DIR / "models",
    ROOT_DIR / "backend" / "Models",
    ROOT_DIR / "backend" / "models",
    ROOT_DIR / "Models",
    Path.cwd() / "backend" / "Models",
    Path.cwd() / "Models",
]

MODELS_DIR = None
for candidate in POSSIBLE_MODEL_DIRS:
    if candidate.exists() and candidate.is_dir():
        MODELS_DIR = candidate
        break

if MODELS_DIR is None:
    MODELS_DIR = BASE_DIR / "Models"

# -----------------------------------------------------------------------------
# 1. LOAD CROP RECOMMENDATION MODEL
# -----------------------------------------------------------------------------
crop_model = None
crop_knn_data = None

# A) Try ultra-fast, zero-dependency JSON KNN data (works anywhere, avoids pickle version mismatches)
crop_json_path = MODELS_DIR / "crop_knn_data.json"
if crop_json_path.exists():
    try:
        with open(crop_json_path, "r", encoding="utf-8") as f:
            crop_knn_data = json.load(f)
            crop_knn_data["X"] = np.array(crop_knn_data["X"], dtype=np.float64)
            crop_knn_data["y"] = np.array(crop_knn_data["y"], dtype=np.int64)
            crop_knn_data["classes"] = np.array(crop_knn_data["classes"])
            print("Crop recommendation engine loaded via JSON KNN dataset")
    except Exception as e_json:
        print(f"Notice: Failed to load crop JSON data: {e_json}")

# B) Fallback or primary pickle/joblib model
crop_pkl_path = (MODELS_DIR / "Crop-reom.pkl") if (MODELS_DIR / "Crop-reom.pkl").exists() else (MODELS_DIR / "crop-reom.pkl")
if crop_pkl_path.exists():
    if joblib:
        try:
            crop_model = joblib.load(crop_pkl_path)
            print("Crop recommendation model loaded with joblib")
        except Exception:
            pass
    if crop_model is None and pickle:
        try:
            with open(crop_pkl_path, "rb") as file:
                crop_model = pickle.load(file)
            print("Crop recommendation model loaded with pickle")
        except Exception:
            pass

# -----------------------------------------------------------------------------
# 2. LOAD PLANT DISEASE CLASSIFIER (ONNX or PyTorch)
# -----------------------------------------------------------------------------
onnx_session = None
torch_disease_model = None
disease_classes = []
disease_engine = None

class_names_path = MODELS_DIR / "class_names.json"
onnx_model_path = MODELS_DIR / "plant_classifier.onnx"
torch_model_path = MODELS_DIR / "plant_classifier.pth"

if class_names_path.exists():
    try:
        with open(class_names_path, "r", encoding="utf-8") as f:
            disease_classes = json.load(f)
    except Exception as e_cls:
        print(f"Warning: Failed to load disease class names: {e_cls}")

# Try ONNX Runtime first (lightweight, under 250MB Lambda limit, highly optimized for CPU)
if ONNX_AVAILABLE and onnx_model_path.exists() and len(disease_classes) > 0:
    try:
        # Disable heavy telemetry, run on CPUExecutionProvider
        opts = ort.SessionOptions()
        opts.enable_mem_pattern = True
        opts.enable_cpu_mem_arena = True
        onnx_session = ort.InferenceSession(str(onnx_model_path), sess_options=opts, providers=["CPUExecutionProvider"])
        disease_engine = "onnx"
        print(f"Plant disease classifier loaded with ONNX Runtime ({len(disease_classes)} classes)")
    except Exception as e_onnx:
        print(f"Notice: ONNX Runtime failed to load: {e_onnx}")

# Fallback to PyTorch ResNet-18 if available and ONNX not active
if onnx_session is None and TORCH_AVAILABLE and torch_model_path.exists() and len(disease_classes) > 0:
    try:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        torch_disease_model = models.resnet18()
        torch_disease_model.fc = nn.Linear(torch_disease_model.fc.in_features, len(disease_classes))
        state_dict = torch.load(torch_model_path, map_location=device)
        torch_disease_model.load_state_dict(state_dict)
        torch_disease_model.to(device)
        torch_disease_model.eval()
        disease_engine = f"torch-{device}"
        print(f"Plant disease classifier loaded with PyTorch ({len(disease_classes)} classes on {device})")
    except Exception as e_torch:
        print(f"Warning: PyTorch model failed to load: {e_torch}")

# Preprocessing constants (standard ImageNet normalization)
NORM_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
NORM_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

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
        symptoms = "Leaf tissues exhibit uniform chlorophyll distribution, healthy cellular integrity, and zero visible fungal pustules or bacterial spots."
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
        "confidence": round(float(confidence), 1),
        "family": family,
        "symptoms": symptoms,
        "actions": actions,
        "engine": disease_engine or "unknown"
    }

# -----------------------------------------------------------------------------
# INPUT DATA SCHEMA
# -----------------------------------------------------------------------------
class CropInput(BaseModel):
    N: float
    P: float
    K: float
    temperature: float
    humidity: float
    ph: float
    rainfall: float

# -----------------------------------------------------------------------------
# API ROUTES (Supporting both root and /api prefixed routes)
# -----------------------------------------------------------------------------
@app.get("/health")
@app.get("/api/health")
def health():
    return {
        "success": True,
        "message": "AI Smart Farming API is operational",
        "crop_model_loaded": (crop_knn_data is not None) or (crop_model is not None),
        "crop_engine": "json-knn" if crop_knn_data is not None else ("joblib" if crop_model is not None else None),
        "disease_model_loaded": (onnx_session is not None) or (torch_disease_model is not None),
        "disease_engine": disease_engine,
        "num_classes": len(disease_classes),
        "platform": "serverless" if os.environ.get("VERCEL") else "standard"
    }

@app.post("/predict")
@app.post("/api/predict")
def predict_crop(data: CropInput):
    # Method 1: Ultra-fast NumPy KNN using crop_knn_data.json
    if crop_knn_data is not None:
        try:
            sample = np.array([[data.N, data.P, data.K, data.temperature, data.humidity, data.ph, data.rainfall]], dtype=np.float64)
            diff = crop_knn_data["X"] - sample
            dist_sq = np.sum(diff * diff, axis=1)
            k = int(crop_knn_data.get("n_neighbors", 5))
            top_k_indices = np.argsort(dist_sq)[:k]
            top_k_labels = crop_knn_data["y"][top_k_indices]
            majority_label_idx = int(np.bincount(top_k_labels).argmax())
            predicted_crop = str(crop_knn_data["classes"][majority_label_idx])
            return {
                "success": True,
                "crop": predicted_crop,
                "engine": "edge-knn"
            }
        except Exception as err:
            print(f"Error in JSON KNN inference: {err}")

    # Method 2: Scikit-learn model via joblib/pickle
    if crop_model is not None:
        try:
            sample = np.array([[data.N, data.P, data.K, data.temperature, data.humidity, data.ph, data.rainfall]])
            prediction = crop_model.predict(sample)
            return {
                "success": True,
                "crop": str(prediction[0]),
                "engine": "sklearn"
            }
        except Exception as err:
            return JSONResponse(
                status_code=500,
                content={"success": False, "error": f"Crop model inference error: {str(err)}"}
            )

    return JSONResponse(
        status_code=503,
        content={"success": False, "error": "Crop recommendation model is not loaded on this server."}
    )

@app.post("/predict-disease")
@app.post("/predict-plant")
@app.post("/api/predict-disease")
@app.post("/api/predict-plant")
async def predict_plant_disease(file: UploadFile = File(...)):
    if onnx_session is None and torch_disease_model is None:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": "Plant disease model (plant_classifier.onnx / plant_classifier.pth) is not loaded on this server."
            }
        )

    try:
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((224, 224), Image.Resampling.BILINEAR)

        # Preprocess: convert to float [0, 1], normalize with ImageNet mean/std, shape (1, 3, 224, 224)
        arr = np.array(image, dtype=np.float32) / 255.0
        normalized = (arr - NORM_MEAN) / NORM_STD
        channel_first = np.transpose(normalized, (2, 0, 1))
        batch = np.expand_dims(channel_first, axis=0)

        # A) ONNX Runtime Inference
        if onnx_session is not None:
            input_name = onnx_session.get_inputs()[0].name
            outputs = onnx_session.run(None, {input_name: batch})[0]
            logits = outputs[0]
            exp_logits = np.exp(logits - np.max(logits))
            probs = exp_logits / np.sum(exp_logits)
            pred_idx = int(np.argmax(probs))
            conf = float(probs[pred_idx] * 100.0)
            raw_label = disease_classes[pred_idx]
            return analyze_disease_result(raw_label, conf)

        # B) PyTorch Inference fallback
        if torch_disease_model is not None:
            device = next(torch_disease_model.parameters()).device
            tensor = torch.from_numpy(batch).to(device)
            with torch.no_grad():
                outputs = torch_disease_model(tensor)
                probs = torch.softmax(outputs, dim=1)
                pred_idx = torch.argmax(probs, dim=1).item()
                conf = float(probs[0][pred_idx].item() * 100.0)
            raw_label = disease_classes[pred_idx]
            return analyze_disease_result(raw_label, conf)

    except Exception as error:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Disease classifier inference failed: {str(error)}"}
        )

# -----------------------------------------------------------------------------
# STATIC FRONTEND MOUNTING (For standalone local server)
# -----------------------------------------------------------------------------
POSSIBLE_FRONTEND_DIRS = [
    ROOT_DIR / "frontend",
    BASE_DIR / "frontend",
    Path.cwd() / "frontend",
    ROOT_DIR,
]

FRONTEND_DIR = None
for candidate in POSSIBLE_FRONTEND_DIRS:
    if candidate.exists() and (candidate / "index.html").exists():
        FRONTEND_DIR = candidate
        break

if FRONTEND_DIR:
    # Mount assets directory if available
    assets_dir = FRONTEND_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    # Mount entire frontend under /app
    app.mount("/app", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

@app.get("/app")
def app_route():
    return RedirectResponse(url="/app/")

@app.get("/")
def home():
    if FRONTEND_DIR and (FRONTEND_DIR / "index.html").exists():
        return RedirectResponse(url="/app/")
    return {
        "status": "online",
        "name": "AI Smart Farming API",
        "docs": "/docs",
        "health": "/health"
    }

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

    uvicorn.run(app, host="0.0.0.0", port=8000)
