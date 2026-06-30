import requests
import json
from pathlib import Path
from loguru import logger
from datetime import datetime, timedelta

logger.remove()
logger.add(lambda msg: print(msg, end=""), colorize=True, format="<level>{time:YYYY-MM-DD HH:mm:ss.SSS}</level> | <level>{level: <8}</level> | {name}:{function}:{line} - {message}")

API_BASE = "http://localhost:8000"
TEST_DATA_DIR = Path.home() / "ocr_pipeline" / "test_data"

def test_health():
    logger.info("\n[TEST 1] API Health Check")
    try:
        resp = requests.get(f"{API_BASE}/api/health", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        logger.success(f"✓ API healthy: {data['status']}")
        logger.info(f"  - Pipeline: {data['pipeline']}")
        logger.info(f"  - Batch enabled: {data.get('batch_enabled', False)}")
    except Exception as e:
        logger.error(f"✗ Health check failed: {e}")
        return False
    return True


def test_single_file():
    logger.info("\n[TEST 2] Single File Processing")
    try:
        test_file = list(TEST_DATA_DIR.glob("clean/*.pdf"))[0]
        
        with open(test_file, "rb") as f:
            files = {"file": f}
            data = {"language": "auto", "model": "llama3"}
            resp = requests.post(f"{API_BASE}/api/process", files=files, data=data, timeout=30)
        
        resp.raise_for_status()
        result = resp.json()
        
        logger.success(f"✓ Single file processed")
        logger.info(f"  - Routing: {result.get('routing', 'N/A')}")
        logger.info(f"  - Confidence: {result.get('confidence_score', 0)}")
        logger.info(f"  - Language: {result.get('language_detected')}")
        logger.info(f"  - OCR Engine: {result.get('ocr_engine', 'unknown')}")
        logger.info(f"  - Time: {result.get('processing_time_seconds', 0)}s")
    except Exception as e:
        logger.error(f"✗ Single file test failed: {e}")
        try:
            logger.error(f"  Response: {resp.json()}")
        except:
            logger.error(f"  Response: {resp.text}")
        return False
    return True


def test_batch():
    logger.info("\n[TEST 3] Batch Upload (Multiple Files)")
    try:
        batch_files = list(TEST_DATA_DIR.glob("clean/*.pdf"))[:3]
        
        if not batch_files:
            logger.warning("⚠ No test files found")
            return True
        
        files = [("files", open(f, "rb")) for f in batch_files]
        resp = requests.post(f"{API_BASE}/api/batch", files=files, timeout=60)
        
        for _, f in files:
            f.close()
        
        resp.raise_for_status()
        result = resp.json()
        
        batch_id = result.get("batch_id")
        logger.success(f"✓ Batch uploaded: {batch_id}")
        logger.info(f"  - Files: {result.get('file_count', 0)}")
        logger.info(f"  - Results: {result.get('results_count', 0)}")
        
        # Try to retrieve batch
        resp = requests.get(f"{API_BASE}/api/batch/{batch_id}", timeout=10)
        resp.raise_for_status()
        logger.success(f"✓ Batch retrieved successfully")
        
    except Exception as e:
        logger.error(f"✗ Batch test failed: {e}")
        try:
            logger.error(f"  Response: {resp.json()}")
        except:
            logger.error(f"  Response: {resp.text}")
        return False
    return True


def test_date_range():
    logger.info("\n[TEST 4] Date Range Processing")
    try:
        end = datetime.now()
        start = end - timedelta(days=7)
        
        params = {
            "start_date": start.isoformat(),
            "end_date": end.isoformat()
        }
        resp = requests.get(f"{API_BASE}/api/date-range", params=params, timeout=10)
        resp.raise_for_status()
        result = resp.json()
        
        count = len(result.get("results", []))
        if count == 0:
            logger.warning("⚠ No files found in date range (expected if no history)")
        else:
            logger.success(f"✓ Found {count} files in date range")
        
    except Exception as e:
        logger.error(f"✗ Date range test failed: {e}")
        return False
    return True


def test_quick_filters():
    logger.info("\n[TEST 5] Quick Filters (Today/Week/Month)")
    try:
        for period in ["TODAY", "WEEK", "MONTH"]:
            resp = requests.get(f"{API_BASE}/api/quick-filter", params={"period": period}, timeout=10)
            resp.raise_for_status()
            result = resp.json()
            count = result.get("count", 0)
            logger.warning(f"  ⚠ {period}: {count} files found")
    except Exception as e:
        logger.error(f"✗ Quick filter test failed: {e}")
        return False
    return True


if __name__ == "__main__":
    logger.info("=" * 80)
    logger.info("END-TO-END TEST SUITE")
    logger.info("=" * 80)
    
    results = []
    results.append(("Health Check", test_health()))
    results.append(("Single File", test_single_file()))
    results.append(("Batch Upload", test_batch()))
    results.append(("Date Range", test_date_range()))
    results.append(("Quick Filters", test_quick_filters()))
    
    logger.info("\n" + "=" * 80)
    logger.success("END-TO-END TESTS COMPLETE")
    logger.info("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    logger.info(f"\nResults: {passed}/{total} tests passed")
    
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        logger.info(f"  {status}: {name}")
