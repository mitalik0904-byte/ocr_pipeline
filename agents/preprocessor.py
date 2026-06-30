import cv2
import os
import numpy as np
from PIL import Image
from loguru import logger


class PreprocessingAgent:
    def __init__(self):
        self.name = "PreprocessingAgent"
        self.fast_mode = os.getenv("OCR_FAST_MODE", "1").lower() in {"1", "true", "yes"}

    def _load(self, path: str) -> np.ndarray:
        img = cv2.imread(path)
        if img is None:
            pil = Image.open(path).convert("RGB")
            img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
        return img

    def _upscale_if_small(self, img: np.ndarray) -> np.ndarray:
        h, w = img.shape[:2]
        if max(h, w) < 1500:
            img = cv2.resize(img, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
            logger.info(f"[Preprocessor] Upscaled {w}x{h} to {img.shape[1]}x{img.shape[0]}")
        return img

    def _denoise(self, gray: np.ndarray) -> np.ndarray:
        if self.fast_mode:
            return cv2.medianBlur(gray, 3)
        denoised = cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)
        kernel   = np.array([[0,-1,0],[-1,5,-1],[0,-1,0]])
        return cv2.filter2D(denoised, -1, kernel)

    def _deskew(self, gray: np.ndarray) -> tuple:
        coords = np.column_stack(np.where(gray < 200))
        angle  = 0.0
        if len(coords) > 300:
            rect  = cv2.minAreaRect(coords)
            angle = rect[-1]
            if angle < -45:
                angle = 90 + angle
            elif angle > 45:
                angle = angle - 90
            if abs(angle) > 0.5:
                h, w = gray.shape
                M    = cv2.getRotationMatrix2D((w//2, h//2), -angle, 1.0)
                gray = cv2.warpAffine(gray, M, (w, h),
                                      flags=cv2.INTER_CUBIC,
                                      borderMode=cv2.BORDER_REPLICATE)
        return gray, angle

    def _enhance(self, gray: np.ndarray) -> np.ndarray:
        clahe    = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
        enhanced = clahe.apply(gray)
        return enhanced

    def _binarize(self, gray: np.ndarray) -> np.ndarray:
        # Otsu global
        _, otsu  = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        # Adaptive local
        adapt    = cv2.adaptiveThreshold(gray, 255,
                       cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10)
        combined = cv2.bitwise_and(otsu, adapt)
        kernel   = np.ones((2,1), np.uint8)
        combined = cv2.dilate(combined, kernel, iterations=1)
        return combined

    def process(self, image_path: str) -> dict:
        logger.info(f"[Preprocessor] {image_path}")
        img  = self._load(image_path)
        img  = self._upscale_if_small(img)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape)==3 else img
        gray = self._denoise(gray)
        gray, angle = self._deskew(gray)
        enhanced = self._enhance(gray)
        binary   = self._binarize(enhanced)
        logger.success(f"[Preprocessor] Done - {binary.shape}, angle={angle:.2f} deg")
        return {
            "processed_image": binary,
            "enhanced_image":  enhanced,
            "original_shape":  img.shape,
            "deskew_angle":    round(angle, 2),
            "image_path":      image_path,
        }

    def process_pdf(self, pdf_path: str) -> list:
        from pdf2image import convert_from_path
        dpi = int(os.getenv("OCR_PDF_DPI", "200"))
        images  = convert_from_path(pdf_path, dpi=dpi)
        results = []
        for i, pil_img in enumerate(images):
            tmp = f"/tmp/ocr_pdf_p{i}.png"
            pil_img.save(tmp, "PNG")
            results.append(self.process(tmp))
        return results
