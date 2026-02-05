from typing import Dict, List
from ..models import ScheduledJob


class JobStore:
    def __init__(self) -> None:
        self._jobs: Dict[str, ScheduledJob] = {}

    def save(self, job: ScheduledJob) -> None:
        self._jobs[job.job_id] = job

    def list(self) -> List[ScheduledJob]:
        return list(self._jobs.values())


job_store = JobStore()
