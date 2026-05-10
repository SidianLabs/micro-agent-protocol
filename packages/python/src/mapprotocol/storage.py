"""
Storage adapters for MAP Protocol SDK.
Supports file-based, Redis, and PostgreSQL backends.
"""

from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone


class TaskStoreAdapter(ABC):
    """Abstract task store adapter."""

    @abstractmethod
    async def save(self, task: Dict[str, Any]) -> bool:
        """Save a task record."""
        pass

    @abstractmethod
    async def get(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get a task by ID."""
        pass

    @abstractmethod
    async def list(
        self,
        tenant_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List tasks with optional filtering."""
        pass

    @abstractmethod
    async def delete(self, task_id: str) -> bool:
        """Delete a task."""
        pass


class FileTaskStoreAdapter(TaskStoreAdapter):
    """File-based task store adapter."""

    def __init__(self, base_path: str = "./data/tasks"):
        self.base_path = base_path
        os.makedirs(base_path, exist_ok=True)

    def _get_file_path(self, task_id: str) -> str:
        return os.path.join(self.base_path, f"{task_id}.json")

    async def save(self, task: Dict[str, Any]) -> bool:
        try:
            task_id = task.get("task_id")
            if not task_id:
                return False
            file_path = self._get_file_path(task_id)
            task["updated_at"] = datetime.now(timezone.utc).isoformat()
            with open(file_path, "w") as f:
                json.dump(task, f, indent=2)
            return True
        except Exception:
            return False

    async def get(self, task_id: str) -> Optional[Dict[str, Any]]:
        try:
            file_path = self._get_file_path(task_id)
            if not os.path.exists(file_path):
                return None
            with open(file_path, "r") as f:
                return json.load(f)
        except Exception:
            return None

    async def list(
        self,
        tenant_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        tasks = []
        try:
            for filename in os.listdir(self.base_path):
                if filename.endswith(".json"):
                    file_path = os.path.join(self.base_path, filename)
                    with open(file_path, "r") as f:
                        task = json.load(f)
                        if tenant_id and task.get("requester_identity", {}).get("tenant_id") != tenant_id:
                            continue
                        if status and task.get("status") != status:
                            continue
                        tasks.append(task)
        except Exception:
            pass

        tasks.sort(key=lambda t: t.get("updated_at", ""), reverse=True)
        start_idx = 0
        if cursor:
            start_idx = next((i for i, t in enumerate(tasks) if t.get("task_id") == cursor), 0) + 1
        return tasks[start_idx:start_idx + limit]

    async def delete(self, task_id: str) -> bool:
        try:
            file_path = self._get_file_path(task_id)
            if os.path.exists(file_path):
                os.remove(file_path)
                return True
            return False
        except Exception:
            return False


class ReceiptStoreAdapter(ABC):
    """Abstract receipt store adapter."""

    @abstractmethod
    async def save(self, receipt: Dict[str, Any]) -> bool:
        """Save a receipt."""
        pass

    @abstractmethod
    async def get(self, receipt_id: str) -> Optional[Dict[str, Any]]:
        """Get a receipt by ID."""
        pass

    @abstractmethod
    async def get_by_task_id(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get a receipt by task ID."""
        pass

    @abstractmethod
    async def list(
        self,
        tenant_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List receipts with optional filtering."""
        pass


class FileReceiptStoreAdapter(ReceiptStoreAdapter):
    """File-based receipt store adapter."""

    def __init__(self, base_path: str = "./data/receipts"):
        self.base_path = base_path
        os.makedirs(base_path, exist_ok=True)

    def _get_file_path(self, receipt_id: str) -> str:
        return os.path.join(self.base_path, f"{receipt_id}.json")

    async def save(self, receipt: Dict[str, Any]) -> bool:
        try:
            receipt_id = receipt.get("receipt_id")
            if not receipt_id:
                return False
            file_path = self._get_file_path(receipt_id)
            with open(file_path, "w") as f:
                json.dump(receipt, f, indent=2)

            task_id = receipt.get("task_id")
            if task_id:
                task_receipt_path = os.path.join(self.base_path, f"task-{task_id}.json")
                with open(task_receipt_path, "w") as f:
                    json.dump({"receipt_id": receipt_id}, f)
            return True
        except Exception:
            return False

    async def get(self, receipt_id: str) -> Optional[Dict[str, Any]]:
        try:
            file_path = self._get_file_path(receipt_id)
            if not os.path.exists(file_path):
                return None
            with open(file_path, "r") as f:
                return json.load(f)
        except Exception:
            return None

    async def get_by_task_id(self, task_id: str) -> Optional[Dict[str, Any]]:
        try:
            task_receipt_path = os.path.join(self.base_path, f"task-{task_id}.json")
            if not os.path.exists(task_receipt_path):
                return None
            with open(task_receipt_path, "r") as f:
                ref = json.load(f)
                receipt_id = ref.get("receipt_id")
                if receipt_id:
                    return await self.get(receipt_id)
            return None
        except Exception:
            return None

    async def list(
        self,
        tenant_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        receipts = []
        try:
            for filename in os.listdir(self.base_path):
                if filename.startswith("receipt_") and filename.endswith(".json"):
                    file_path = os.path.join(self.base_path, filename)
                    with open(file_path, "r") as f:
                        receipt = json.load(f)
                        if tenant_id and receipt.get("tenant_id") != tenant_id:
                            continue
                        if agent_id and receipt.get("agent_id") != agent_id:
                            continue
                        receipts.append(receipt)
        except Exception:
            pass

        receipts.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
        start_idx = 0
        if cursor:
            start_idx = next((i for i, r in enumerate(receipts) if r.get("receipt_id") == cursor), 0) + 1
        return receipts[start_idx:start_idx + limit]