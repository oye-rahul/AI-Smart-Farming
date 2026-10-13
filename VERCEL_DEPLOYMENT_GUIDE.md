# 🚀 Deploying CropAI to Vercel

This repository is pre-configured for **1-click deployment on Vercel** with full support for:
- ⚡ **Static Single-Page Application** (Liquid Glassmorphism UI)
- 🧠 **AI Serverless Function Backend** (`/api/predict` & `/api/predict-disease`)
- 🔬 **Optical Plant Disease Detection** powered by ONNX Runtime ResNet-18 (38 crop disease classes, optimized under Vercel's 250MB limit)
- 🌱 **Precision Crop Recommendation Engine** powered by KNN ML with zero cold-start delay
- 🌿 **Edge ML Client Fallback** ensuring 100% offline and uninterrupted operation

---

## 📋 Quick 1-Click Deployment Steps

### Option 1: Via Vercel Web Dashboard (Recommended)

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Configure project for Vercel deployment"
   git push origin main
   ```

2. **Go to [Vercel](https://vercel.com/)** and log in.
3. Click **"Add New..."** ➔ **"Project"**.
4. Select your **`AI-Smart-Farming`** (or `Agro-ai`) repository and click **Import**.
5. In the **Configure Project** screen:
   - **Framework Preset**: Leave as `Other`
   - **Root Directory**: Leave as `./` (Default root)
   - **Build and Output Settings**: Defaults are automatically handled by [`vercel.json`](file:///c:/Users/hp/OneDrive/Documents/Agro-ai/vercel.json).
6. Click **Deploy**! 🚀

---

### Option 2: Via Vercel CLI

If you have the [Vercel CLI](https://vercel.com/docs/cli) installed:

```bash
# Login to Vercel
vercel login

# Deploy preview
vercel

# Deploy to production
vercel --prod
```

---

## 🛠️ How It Works Under the Hood

### 1. Zero Heavy Dependencies on Vercel
Standard PyTorch wheels exceed **850 MB** on Linux, exceeding AWS Lambda / Vercel's strict **250 MB** uncompressed limit.
To solve this:
- The PyTorch ResNet-18 model was converted into an optimized **ONNX model** (`backend/Models/plant_classifier.onnx`, 42 MB).
- [`requirements.txt`](file:///c:/Users/hp/OneDrive/Documents/Agro-ai/requirements.txt) utilizes lightweight **`onnxruntime`**, **`numpy`**, and **`pillow`** (~100 MB total), deploying effortlessly within Vercel's limits.
- The Crop Recommendation model utilizes an optimized KNN dataset (`backend/Models/crop_knn_data.json`, 112 KB) providing 100% mathematical parity with zero dependency on heavy scikit-learn wheels.

### 2. Dual Routing & API Support
[`vercel.json`](file:///c:/Users/hp/OneDrive/Documents/Agro-ai/vercel.json) routes incoming requests seamlessly:
- `POST /predict` and `POST /api/predict` ➔ [`api/index.py`](file:///c:/Users/hp/OneDrive/Documents/Agro-ai/api/index.py) (Crop Recommender)
- `POST /predict-disease` and `POST /api/predict-disease` ➔ [`api/index.py`](file:///c:/Users/hp/OneDrive/Documents/Agro-ai/api/index.py) (Plant Pathogen Vision)
- `GET /health` and `GET /api/health` ➔ [`api/index.py`](file:///c:/Users/hp/OneDrive/Documents/Agro-ai/api/index.py) (Health Diagnostic)
- All static assets and pages are served with global CDN edge caching.

### 3. Custom External Backend Support (Optional)
If you ever want to run a separate GPU backend (e.g., on Render, Railway, Hugging Face Spaces, or your local machine):
1. In the app, go to **Farmer Profile** ➔ **AI Backend & Cloud API**.
2. Enter your custom backend URL (e.g., `https://my-agro-backend.onrender.com`).
3. Click **Save & Apply**!

---

## 🧪 Local Testing

You can still run the full FastAPI server locally on your PC anytime:

```bash
# Run server
python main.py
```
Open [http://localhost:8000/app/](http://localhost:8000/app/) in your browser.
