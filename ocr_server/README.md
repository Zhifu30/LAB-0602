---
title: PaddleOCR
emoji: 👁️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# OCR Service - RapidOCR

基于 RapidOCR (ONNX Runtime) 的中英文文字识别 API。

- **POST /ocr** — 传入 `{"image": "base64..."}` 返回识别的文字
- **GET /health** — 健康检查
- **GET /** — 服务状态
