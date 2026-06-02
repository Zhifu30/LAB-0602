"""
PaddleOCR API Server — 部署到 Hugging Face Spaces
接收 base64 图片，返回识别文字
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import base64
import re
from io import BytesIO
from PIL import Image

app = FastAPI()

# 允许跨域（网页端调用）
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 延迟加载 PaddleOCR（首次请求时加载）
ocr = None

def get_ocr():
    global ocr
    if ocr is None:
        from paddleocr import PaddleOCR
        ocr = PaddleOCR(
            use_angle_cls=True,  # 文字方向检测
            lang='ch',           # 中文模型
            use_gpu=False,       # CPU 模式
            show_log=False,
        )
    return ocr

class ImageRequest(BaseModel):
    image: str  # base64 编码的图片（可含 data:image/...;base64, 前缀）

def decode_image(image_str: str) -> Image.Image:
    """解码 base64 图片"""
    # 去除 data:image/...;base64, 前缀
    if ',' in image_str:
        image_str = image_str.split(',', 1)[1]
    try:
        img_bytes = base64.b64decode(image_str)
        return Image.open(BytesIO(img_bytes)).convert('RGB')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"图片解码失败: {e}")

@app.get("/")
def root():
    return {"status": "ok", "service": "PaddleOCR API", "usage": "POST /ocr with {\"image\": \"base64...\"}"}

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.post("/ocr")
def ocr_endpoint(req: ImageRequest):
    """OCR 识别接口"""
    try:
        img = decode_image(req.image)
        model = get_ocr()
        results = model.ocr(img, cls=True)

        if not results or not results[0]:
            return {"text": "", "details": [], "message": "未检测到文字"}

        # 提取所有文字 + 位置坐标
        lines = []
        details = []
        for line in results[0]:
            if line and len(line) >= 2:
                bbox = line[0]   # [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
                text = line[1][0]
                confidence = line[1][1]
                lines.append(text)

                # 计算包围盒：x, y, width, height
                xs = [p[0] for p in bbox]
                ys = [p[1] for p in bbox]
                box = {
                    "x": round(min(xs), 1),
                    "y": round(min(ys), 1),
                    "w": round(max(xs) - min(xs), 1),
                    "h": round(max(ys) - min(ys), 1),
                }
                details.append({
                    "text": text,
                    "confidence": round(float(confidence), 4),
                    "box": box,
                })

        full_text = '\n'.join(lines)
        return {"text": full_text, "details": details}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR 识别失败: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
