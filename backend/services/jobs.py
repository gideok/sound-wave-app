import threading
from typing import Dict, Any, Optional


_JOBS: Dict[str, Dict[str, Any]] = {}
_JOB_LOCK = threading.Lock()


def job_set(job_id: str, data: Dict[str, Any]) -> None:
    with _JOB_LOCK:
        _JOBS[job_id] = data


def job_get(job_id: str) -> Optional[Dict[str, Any]]:
    with _JOB_LOCK:
        return _JOBS.get(job_id)


def job_update(job_id: str, updates: Dict[str, Any]) -> None:
    with _JOB_LOCK:
        job = _JOBS.get(job_id)
        if job is not None:
            job.update(updates)


def job_pop(job_id: str) -> Optional[Dict[str, Any]]:
    with _JOB_LOCK:
        return _JOBS.pop(job_id, None)


def job_append_log(job_id: str, message: str) -> None:
    with _JOB_LOCK:
        job = _JOBS.get(job_id)
        if job is not None:
            logs = job.setdefault("logs", [])
            logs.append(message)


