import sys
import os
import tempfile
import shutil
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture(autouse=True)
def isolated_registry_state(monkeypatch):
    """Every test gets a clean area_registry: empty in-memory cache, empty
    per-area lock dict, and its own temp DATA_DIR — so tests can't leak
    state into each other (important since area_registry uses module-level
    globals by design, mirroring how it behaves in the real running
    service)."""
    from app.services import area_registry

    tmp_dir = tempfile.mkdtemp(prefix="prahari_test_areas_")
    monkeypatch.setattr(area_registry.config, "DATA_DIR", tmp_dir)
    area_registry._MEM_CACHE.clear()
    area_registry._area_build_locks.clear()
    area_registry._building.clear()
    area_registry._build_errors.clear()
    yield
    shutil.rmtree(tmp_dir, ignore_errors=True)
