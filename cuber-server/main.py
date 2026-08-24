"""
Cuber 后端服务 - Roboflow 魔方检测
使用 Roboflow Universe 预训练 YOLOv8 模型检测魔方
"""
import io
import os
import time
import logging
from typing import Optional
import requests
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import cv2
from PIL import Image

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Cuber 魔方检测服务")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Roboflow 配置
ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "nJNN9coDC2lKNecMH2t3")
ROBOFLOW_MODEL_ID = os.environ.get("ROBOFLOW_MODEL_ID", "rubik-cube-last/1")
ROBOFLOW_URL = f"https://serverless.roboflow.com/{ROBOFLOW_MODEL_ID}?api_key={ROBOFLOW_API_KEY}"


class DetectionResult(BaseModel):
    success: bool
    bbox: Optional[dict] = None
    confidence: Optional[float] = None
    grid: Optional[list] = None
    message: str = ""


def detect_cube_roboflow(image_bytes: bytes) -> tuple[Optional[dict], Optional[str]]:
    """使用 Roboflow Universe 预训练魔方模型检测。
    返回 (bbox_info, error_msg)。成功时 error_msg=None；失败时 bbox_info=None。
    """
    try:
        files = {"file": ("cube.jpg", image_bytes, "image/jpeg")}
        resp = requests.post(ROBOFLOW_URL, files=files, timeout=15)
        if resp.status_code != 200:
            snippet = resp.text[:120].replace("\n", " ")
            logger.warning(f"Roboflow API 返回 {resp.status_code}: {snippet}")
            return None, f"Roboflow {resp.status_code}: {snippet}"
        data = resp.json()
        predictions = data.get("predictions", [])
        if not predictions:
            return None, "Roboflow 未返回预测结果"

        # 找面积最大的检测
        best = max(predictions, key=lambda p: p.get("width", 0) * p.get("height", 0))
        x = best.get("x", 0)
        y = best.get("y", 0)
        w = best.get("width", 0)
        h = best.get("height", 0)
        conf = best.get("confidence", 0)

        return {
            "x1": int(x - w / 2),
            "y1": int(y - h / 2),
            "x2": int(x + w / 2),
            "y2": int(y + h / 2),
            "confidence": conf,
            "class": best.get("class", "Face"),
        }, None
    except requests.exceptions.Timeout:
        logger.warning("Roboflow API 超时")
        return None, "Roboflow API 超时"
    except Exception as e:
        logger.error(f"Roboflow 检测异常: {e}")
        return None, f"Roboflow 检测异常: {e}"


def sample_sticker_colors(frame: np.ndarray, bbox: dict) -> list:
    """在检测区域内采样 3x3 贴纸颜色，返回 HEX 字符串列表"""
    x1, y1 = bbox["x1"], bbox["y1"]
    x2, y2 = bbox["x2"], bbox["y2"]
    w = x2 - x1
    h = y2 - y1
    n = 3
    colors = []

    for row in range(n):
        for col in range(n):
            cx = x1 + (col + 0.5) * w / n
            cy = y1 + (row + 0.5) * h / n
            cell_w = w / n * 0.45
            cell_h = h / n * 0.45

            sx1 = max(0, int(cx - cell_w / 2))
            sy1 = max(0, int(cy - cell_h / 2))
            sx2 = min(frame.shape[1] - 1, int(cx + cell_w / 2))
            sy2 = min(frame.shape[0] - 1, int(cy + cell_h / 2))

            if sx2 <= sx1 or sy2 <= sy1:
                colors.append("#000000")
                continue

            cell = frame[sy1:sy2, sx1:sx2]
            avg_bgr = cv2.mean(cell)[:3]
            b, g, r = [int(v) for v in avg_bgr]
            colors.append(f"#{r:02x}{g:02x}{b:02x}")

    return colors


def classify_sticker_hex(hex_color: str) -> str:
    """将 HEX 颜色分类为 U/D/F/B/L/R"""
    r = int(hex_color[1:3], 16)
    g = int(hex_color[3:5], 16)
    b = int(hex_color[5:7], 16)

    hsv = cv2.cvtColor(np.uint8([[[b, g, r]]]), cv2.COLOR_BGR2HSV)[0][0]
    h, s, v = int(hsv[0]), int(hsv[1]), int(hsv[2])

    if s < 22 and v > 55:
        return "U"
    if s > 28:
        if h < 10 or h > 170:
            return "R"
        elif h < 25:
            return "L"
        elif h < 45:
            return "D"
        elif h < 75:
            return "F"
        else:
            return "B"
    return "U"


def grid_to_face_keys(grid_hex: list) -> list:
    return [classify_sticker_hex(h) for h in grid_hex]


@app.get("/")
async def root():
    return {
        "name": "Cuber 魔方检测服务",
        "version": "1.0.0",
        "method": "roboflow",
        "model": ROBOFLOW_MODEL_ID,
        "endpoints": {
            "health": "GET /health",
            "detect": "POST /detect",
        },
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "method": "roboflow",
        "model": ROBOFLOW_MODEL_ID,
    }


@app.post("/debug/detect")
async def debug_detect(file: UploadFile = File(...)):
    """调试接口：返回 Roboflow 原始响应，便于排查检测失败原因"""
    contents = await file.read()
    try:
        files = {"file": ("cube.jpg", contents, "image/jpeg")}
        resp = requests.post(ROBOFLOW_URL, files=files, timeout=15)
        return {
            "status_code": resp.status_code,
            "roboflow_url": ROBOFLOW_URL.replace(ROBOFLOW_API_KEY, "***"),
            "body_preview": resp.text[:500],
        }
    except Exception as e:
        return {"error": str(e)}


@app.post("/detect", response_model=DetectionResult)
async def detect(file: UploadFile = File(...)):
    """接收图片，通过 Roboflow 检测魔方区域并返回 3x3 贴纸颜色"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="未上传文件")

    try:
        contents = await file.read()
        pil_img = Image.open(io.BytesIO(contents))
        frame = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"图片解析失败: {str(e)}")

    h, w = frame.shape[:2]
    if w > 960:
        scale = 960 / w
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
        success, encoded = cv2.imencode(".jpg", frame)
        if success:
            contents = encoded.tobytes()

    t0 = time.time()

    bbox_info, err = detect_cube_roboflow(contents)
    elapsed = (time.time() - t0) * 1000

    if bbox_info is None:
        return DetectionResult(
            success=False,
            message=err or "未检测到魔方，请将魔方一个面正对镜头并靠近",
        )

    grid_hex = sample_sticker_colors(frame, bbox_info)
    grid_keys = grid_to_face_keys(grid_hex)
    confidence = bbox_info.get("confidence", 0.0)

    logger.info(
        f"[roboflow] 检测完成: bbox=({bbox_info['x1']},{bbox_info['y1']})-({bbox_info['x2']},{bbox_info['y2']}) "
        f"conf={confidence:.2f} grid={''.join(grid_keys)} time={elapsed:.0f}ms"
    )

    return DetectionResult(
        success=True,
        bbox={
            "x1": bbox_info["x1"],
            "y1": bbox_info["y1"],
            "x2": bbox_info["x2"],
            "y2": bbox_info["y2"],
            "width": bbox_info["x2"] - bbox_info["x1"],
            "height": bbox_info["y2"] - bbox_info["y1"],
        },
        confidence=round(confidence, 3),
        grid=grid_keys,
        message=f"检测完成 ({elapsed:.0f}ms)",
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("CUBER_PORT", "8000"))
    logger.info(f"启动 Cuber 检测服务 (Roboflow): http://localhost:{port}")
    logger.info(f"模型: {ROBOFLOW_MODEL_ID}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
