# Entry point allowing uvicorn to be run directly from the project root
import socket
from backend.main import app

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

if __name__ == "__main__":
    import uvicorn
    local_ip = get_local_ip()
    print("=" * 60)
    print("🌱 AI Smart Farming Server Starting:")
    print(f"  • Local (This PC):     http://localhost:8000")
    print(f"  • Same Wi-Fi Network:  http://{local_ip}:8000")
    print("  (Open the Network URL on your phone or other device)")
    print("=" * 60)
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
