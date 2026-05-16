# MAP Protocol - Micro Agent Protocol
#
# Copyright © 2026 Sidian Labs
# SPDX-License-Identifier: Apache-2.0

# SPDX-License-Identifier: Apache-2.0
"""
Storage adapters for MAP Protocol SDK.

Supports in-memory, file-based, and SQLite storage backends.
"""

from __future__ import annotations

import json
import os
import sqlite3
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


@dataclass
class StorageResult:
    """Result of a storage operation."""

    ok: bool
    data: Optional[Any] = None
    error: Optional[str] = None


class TaskStoreAdapter(ABC):
    """Abstract task store adapter."""

    @abstractmethod
    async def save(self, task: Dict[str, Any]) -> StorageResult:
        """Save a task record."""
        pass

    @abstractmethod
    async def get(self, task_id: str) -> StorageResult:
        """Get a task by ID."""
        pass

    @abstractmethod
    async def list(
        self,
        tenant_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> StorageResult:
        """List tasks with optional filtering."""
        pass

    @abstractmethod
    async def delete(self, task_id: str) -> StorageResult:
        """Delete a task."""
        pass


class ReceiptStoreAdapter(ABC):
    """Abstract receipt store adapter."""

    @abstractmethod
    async def save(self, receipt: Dict[str, Any]) -> StorageResult:
        """Save a receipt."""
        pass

    @abstractmethod
    async def get(self, receipt_id: str) -> StorageResult:
        """Get a receipt by ID."""
        pass

    @abstractmethod
    async def get_by_task_id(self, task_id: str) -> StorageResult:
        """Get a receipt by task ID."""
        pass

    @abstractmethod
    async def list(
        self,
        tenant_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> StorageResult:
        """List receipts with optional filtering."""
        pass


class InMemoryStorage:
    """
    In-memory task and receipt storage.

    Thread-safe for basic operations.
    """

    def __init__(self, max_tasks: int = 10000, max_receipts: int = 50000):
        """
        Initialize in-memory storage.

        Args:
            max_tasks: Maximum number of tasks to store.
            max_receipts: Maximum number of receipts to store.
        """
        self._tasks: Dict[str, Dict[str, Any]] = {}
        self._task_index: List[str] = []
        self._receipts: Dict[str, Dict[str, Any]] = {}
        self._task_receipts: Dict[str, str] = {}
        self._receipt_index: List[str] = []
        self._max_tasks = max_tasks
        self._max_receipts = max_receipts

    async def save_task(self, task: Dict[str, Any]) -> StorageResult:
        """Save a task."""
        try:
            task_id = task.get("task_id")
            if not task_id:
                return StorageResult(ok=False, error="task_id is required")

            task["updated_at"] = datetime.now(timezone.utc).isoformat()
            self._tasks[task_id] = task

            if task_id not in self._task_index:
                self._task_index.append(task_id)

            self._evict_tasks()
            return StorageResult(ok=True, data=task)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))

    async def get_task(self, task_id: str) -> StorageResult:
        """Get a task by ID."""
        task = self._tasks.get(task_id)
        if not task:
            return StorageResult(ok=False, error=f"Task not found: {task_id}")
        return StorageResult(ok=True, data=task)

    async def list_tasks(
        self,
        tenant_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> StorageResult:
        """List tasks with optional filtering."""
        try:
            tasks = list(self._task_index)
            filtered = []

            for tid in tasks:
                task = self._tasks.get(tid)
                if not task:
                    continue

                if tenant_id:
                    requester = task.get("requester_identity", {})
                    if requester.get("tenant_id") != tenant_id:
                        continue

                if status and task.get("status") != status:
                    continue

                filtered.append(task)

            start_idx = 0
            if cursor:
                try:
                    start_idx = (
                        filtered.index(
                            next(t for t in filtered if t.get("task_id") == cursor)
                        )
                        + 1
                    )
                except (StopIteration, ValueError):
                    pass

            result = filtered[start_idx : start_idx + limit]
            return StorageResult(ok=True, data=result)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))

    async def delete_task(self, task_id: str) -> StorageResult:
        """Delete a task."""
        if task_id not in self._tasks:
            return StorageResult(ok=False, error=f"Task not found: {task_id}")

        del self._tasks[task_id]
        self._task_index.remove(task_id)
        return StorageResult(ok=True)

    async def save_receipt(self, receipt: Dict[str, Any]) -> StorageResult:
        """Save a receipt."""
        try:
            receipt_id = receipt.get("receipt_id")
            if not receipt_id:
                return StorageResult(ok=False, error="receipt_id is required")

            self._receipts[receipt_id] = receipt

            task_id = receipt.get("task_id")
            if task_id:
                self._task_receipts[task_id] = receipt_id

            if receipt_id not in self._receipt_index:
                self._receipt_index.append(receipt_id)

            self._evict_receipts()
            return StorageResult(ok=True, data=receipt)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))

    async def get_receipt(self, receipt_id: str) -> StorageResult:
        """Get a receipt by ID."""
        receipt = self._receipts.get(receipt_id)
        if not receipt:
            return StorageResult(ok=False, error=f"Receipt not found: {receipt_id}")
        return StorageResult(ok=True, data=receipt)

    async def get_receipt_by_task_id(self, task_id: str) -> StorageResult:
        """Get a receipt by task ID."""
        receipt_id = self._task_receipts.get(task_id)
        if not receipt_id:
            return StorageResult(
                ok=False, error=f"Receipt not found for task: {task_id}"
            )
        return await self.get_receipt(receipt_id)

    async def list_receipts(
        self,
        tenant_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> StorageResult:
        """List receipts with optional filtering."""
        try:
            receipts = list(self._receipt_index)
            filtered = []

            for rid in receipts:
                receipt = self._receipts.get(rid)
                if not receipt:
                    continue

                if tenant_id and receipt.get("tenant_id") != tenant_id:
                    continue

                if agent_id and receipt.get("agent_id") != agent_id:
                    continue

                filtered.append(receipt)

            start_idx = 0
            if cursor:
                try:
                    start_idx = (
                        filtered.index(
                            next(r for r in filtered if r.get("receipt_id") == cursor)
                        )
                        + 1
                    )
                except (StopIteration, ValueError):
                    pass

            result = filtered[start_idx : start_idx + limit]
            return StorageResult(ok=True, data=result)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))

    def clear(self) -> None:
        """Clear all storage."""
        self._tasks.clear()
        self._task_index.clear()
        self._receipts.clear()
        self._task_receipts.clear()
        self._receipt_index.clear()

    def _evict_tasks(self) -> None:
        """Evict oldest tasks if over limit."""
        while len(self._tasks) > self._max_tasks and self._task_index:
            oldest_id = self._task_index.pop(0)
            self._tasks.pop(oldest_id, None)

    def _evict_receipts(self) -> None:
        """Evict oldest receipts if over limit."""
        while len(self._receipts) > self._max_receipts and self._receipt_index:
            oldest_id = self._receipt_index.pop(0)
            receipt = self._receipts.pop(oldest_id, None)
            if receipt:
                task_id = receipt.get("task_id")
                if task_id:
                    self._task_receipts.pop(task_id, None)


class FileStorage:
    """
    File-based storage adapter using JSON files.

    Stores data in JSON files organized by type.
    """

    def __init__(self, base_path: str = "./data"):
        """
        Initialize file storage.

        Args:
            base_path: Base directory for storage files.
        """
        self.base_path = base_path
        self.tasks_path = os.path.join(base_path, "tasks")
        self.receipts_path = os.path.join(base_path, "receipts")

        os.makedirs(self.tasks_path, exist_ok=True)
        os.makedirs(self.receipts_path, exist_ok=True)

    def _get_task_path(self, task_id: str) -> str:
        """Get file path for a task."""
        return os.path.join(self.tasks_path, f"{task_id}.json")

    def _get_receipt_path(self, receipt_id: str) -> str:
        """Get file path for a receipt."""
        return os.path.join(self.receipts_path, f"{receipt_id}.json")

    def _get_task_receipt_path(self, task_id: str) -> str:
        """Get file path for task->receipt mapping."""
        return os.path.join(self.receipts_path, f"task-{task_id}.json")

    async def save_task(self, task: Dict[str, Any]) -> StorageResult:
        """Save a task to a JSON file."""
        try:
            task_id = task.get("task_id")
            if not task_id:
                return StorageResult(ok=False, error="task_id is required")

            task["updated_at"] = datetime.now(timezone.utc).isoformat()
            file_path = self._get_task_path(task_id)

            with open(file_path, "w") as f:
                json.dump(task, f, indent=2)

            return StorageResult(ok=True, data=task)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))

    async def get_task(self, task_id: str) -> StorageResult:
        """Get a task from a JSON file."""
        try:
            file_path = self._get_task_path(task_id)
            if not os.path.exists(file_path):
                return StorageResult(ok=False, error=f"Task not found: {task_id}")

            with open(file_path, "r") as f:
                task = json.load(f)

            return StorageResult(ok=True, data=task)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))

    async def list_tasks(
        self,
        tenant_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> StorageResult:
        """List tasks from JSON files."""
        try:
            tasks = []

            for filename in os.listdir(self.tasks_path):
                if not filename.endswith(".json"):
                    continue

                file_path = os.path.join(self.tasks_path, filename)
                with open(file_path, "r") as f:
                    task = json.load(f)

                if tenant_id:
                    requester = task.get("requester_identity", {})
                    if requester.get("tenant_id") != tenant_id:
                        continue

                if status and task.get("status") != status:
                    continue

                tasks.append(task)

            tasks.sort(key=lambda t: t.get("updated_at", ""), reverse=True)

            start_idx = 0
            if cursor:
                for i, t in enumerate(tasks):
                    if t.get("task_id") == cursor:
                        start_idx = i + 1
                        break

            result = tasks[start_idx : start_idx + limit]
            return StorageResult(ok=True, data=result)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))

    async def delete_task(self, task_id: str) -> StorageResult:
        """Delete a task file."""
        try:
            file_path = self._get_task_path(task_id)
            if os.path.exists(file_path):
                os.remove(file_path)
            return StorageResult(ok=True)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))

    async def save_receipt(self, receipt: Dict[str, Any]) -> StorageResult:
        """Save a receipt to a JSON file."""
        try:
            receipt_id = receipt.get("receipt_id")
            if not receipt_id:
                return StorageResult(ok=False, error="receipt_id is required")

            file_path = self._get_receipt_path(receipt_id)

            with open(file_path, "w") as f:
                json.dump(receipt, f, indent=2)

            task_id = receipt.get("task_id")
            if task_id:
                mapping_path = self._get_task_receipt_path(task_id)
                with open(mapping_path, "w") as f:
                    json.dump({"receipt_id": receipt_id}, f)

            return StorageResult(ok=True, data=receipt)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))

    async def get_receipt(self, receipt_id: str) -> StorageResult:
        """Get a receipt from a JSON file."""
        try:
            file_path = self._get_receipt_path(receipt_id)
            if not os.path.exists(file_path):
                return StorageResult(ok=False, error=f"Receipt not found: {receipt_id}")

            with open(file_path, "r") as f:
                receipt = json.load(f)

            return StorageResult(ok=True, data=receipt)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))

    async def get_receipt_by_task_id(self, task_id: str) -> StorageResult:
        """Get a receipt by task ID."""
        try:
            mapping_path = self._get_task_receipt_path(task_id)
            if not os.path.exists(mapping_path):
                return StorageResult(
                    ok=False, error=f"Receipt not found for task: {task_id}"
                )

            with open(mapping_path, "r") as f:
                mapping = json.load(f)

            receipt_id = mapping.get("receipt_id")
            if receipt_id:
                return await self.get_receipt(receipt_id)

            return StorageResult(
                ok=False, error=f"Receipt not found for task: {task_id}"
            )
        except Exception as e:
            return StorageResult(ok=False, error=str(e))

    async def list_receipts(
        self,
        tenant_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> StorageResult:
        """List receipts from JSON files."""
        try:
            receipts = []

            for filename in os.listdir(self.receipts_path):
                if not filename.startswith("receipt_") or not filename.endswith(
                    ".json"
                ):
                    continue

                file_path = os.path.join(self.receipts_path, filename)
                with open(file_path, "r") as f:
                    receipt = json.load(f)

                if tenant_id and receipt.get("tenant_id") != tenant_id:
                    continue

                if agent_id and receipt.get("agent_id") != agent_id:
                    continue

                receipts.append(receipt)

            receipts.sort(key=lambda r: r.get("timestamp", ""), reverse=True)

            start_idx = 0
            if cursor:
                for i, r in enumerate(receipts):
                    if r.get("receipt_id") == cursor:
                        start_idx = i + 1
                        break

            result = receipts[start_idx : start_idx + limit]
            return StorageResult(ok=True, data=result)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))


class SQLiteStorage:
    """
    SQLite-based storage adapter.

    Provides full SQL storage with querying capabilities.
    """

    def __init__(self, db_path: str = "./data/mapprotocol.db"):
        """
        Initialize SQLite storage.

        Args:
            db_path: Path to the SQLite database file.
        """
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        """Get a database connection."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        """Initialize database schema."""
        conn = self._get_connection()
        try:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS tasks (
                    task_id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    data TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id);
                CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(JSON_EXTRACT(data, '$.status'));

                CREATE TABLE IF NOT EXISTS receipts (
                    receipt_id TEXT PRIMARY KEY,
                    task_id TEXT,
                    tenant_id TEXT,
                    agent_id TEXT,
                    data TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_receipts_task ON receipts(task_id);
                CREATE INDEX IF NOT EXISTS idx_receipts_tenant ON receipts(tenant_id);
                CREATE INDEX IF NOT EXISTS idx_receipts_agent ON receipts(agent_id);
            """)
            conn.commit()
        finally:
            conn.close()

    async def save_task(self, task: Dict[str, Any]) -> StorageResult:
        """Save a task to SQLite."""
        conn = self._get_connection()
        try:
            task_id = task.get("task_id")
            if not task_id:
                return StorageResult(ok=False, error="task_id is required")

            now = datetime.now(timezone.utc).isoformat()
            task["updated_at"] = now
            requester = task.get("requester_identity", {})
            tenant_id = requester.get("tenant_id")

            conn.execute(
                """
                INSERT OR REPLACE INTO tasks (task_id, tenant_id, data, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
            """,
                (task_id, tenant_id, json.dumps(task), now, now),
            )
            conn.commit()

            return StorageResult(ok=True, data=task)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))
        finally:
            conn.close()

    async def get_task(self, task_id: str) -> StorageResult:
        """Get a task from SQLite."""
        conn = self._get_connection()
        try:
            row = conn.execute(
                "SELECT data FROM tasks WHERE task_id = ?", (task_id,)
            ).fetchone()

            if not row:
                return StorageResult(ok=False, error=f"Task not found: {task_id}")

            return StorageResult(ok=True, data=json.loads(row["data"]))
        except Exception as e:
            return StorageResult(ok=False, error=str(e))
        finally:
            conn.close()

    async def list_tasks(
        self,
        tenant_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> StorageResult:
        """List tasks from SQLite."""
        conn = self._get_connection()
        try:
            query = "SELECT data FROM tasks WHERE 1=1"
            params: List[Any] = []

            if tenant_id:
                query += " AND tenant_id = ?"
                params.append(tenant_id)

            if status:
                query += " AND JSON_EXTRACT(data, '$.status') = ?"
                params.append(status)

            if cursor:
                query += (
                    " AND updated_at < (SELECT updated_at FROM tasks WHERE task_id = ?)"
                )
                params.append(cursor)

            query += " ORDER BY updated_at DESC LIMIT ?"
            params.append(limit + 1)

            rows = conn.execute(query, params).fetchall()

            tasks = [json.loads(row["data"]) for row in rows[:limit]]
            return StorageResult(ok=True, data=tasks)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))
        finally:
            conn.close()

    async def delete_task(self, task_id: str) -> StorageResult:
        """Delete a task from SQLite."""
        conn = self._get_connection()
        try:
            conn.execute("DELETE FROM tasks WHERE task_id = ?", (task_id,))
            conn.commit()
            return StorageResult(ok=True)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))
        finally:
            conn.close()

    async def save_receipt(self, receipt: Dict[str, Any]) -> StorageResult:
        """Save a receipt to SQLite."""
        conn = self._get_connection()
        try:
            receipt_id = receipt.get("receipt_id")
            if not receipt_id:
                return StorageResult(ok=False, error="receipt_id is required")

            now = datetime.now(timezone.utc).isoformat()
            task_id = receipt.get("task_id")
            tenant_id = receipt.get("tenant_id")
            agent_id = receipt.get("agent_id")

            conn.execute(
                """
                INSERT OR REPLACE INTO receipts (receipt_id, task_id, tenant_id, agent_id, data, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """,
                (receipt_id, task_id, tenant_id, agent_id, json.dumps(receipt), now),
            )
            conn.commit()

            return StorageResult(ok=True, data=receipt)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))
        finally:
            conn.close()

    async def get_receipt(self, receipt_id: str) -> StorageResult:
        """Get a receipt from SQLite."""
        conn = self._get_connection()
        try:
            row = conn.execute(
                "SELECT data FROM receipts WHERE receipt_id = ?", (receipt_id,)
            ).fetchone()

            if not row:
                return StorageResult(ok=False, error=f"Receipt not found: {receipt_id}")

            return StorageResult(ok=True, data=json.loads(row["data"]))
        except Exception as e:
            return StorageResult(ok=False, error=str(e))
        finally:
            conn.close()

    async def get_receipt_by_task_id(self, task_id: str) -> StorageResult:
        """Get a receipt by task ID."""
        conn = self._get_connection()
        try:
            row = conn.execute(
                "SELECT data FROM receipts WHERE task_id = ?", (task_id,)
            ).fetchone()

            if not row:
                return StorageResult(
                    ok=False, error=f"Receipt not found for task: {task_id}"
                )

            return StorageResult(ok=True, data=json.loads(row["data"]))
        except Exception as e:
            return StorageResult(ok=False, error=str(e))
        finally:
            conn.close()

    async def list_receipts(
        self,
        tenant_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> StorageResult:
        """List receipts from SQLite."""
        conn = self._get_connection()
        try:
            query = "SELECT data FROM receipts WHERE 1=1"
            params: List[Any] = []

            if tenant_id:
                query += " AND tenant_id = ?"
                params.append(tenant_id)

            if agent_id:
                query += " AND agent_id = ?"
                params.append(agent_id)

            if cursor:
                query += " AND created_at < (SELECT created_at FROM receipts WHERE receipt_id = ?)"
                params.append(cursor)

            query += " ORDER BY created_at DESC LIMIT ?"
            params.append(limit + 1)

            rows = conn.execute(query, params).fetchall()

            receipts = [json.loads(row["data"]) for row in rows[:limit]]
            return StorageResult(ok=True, data=receipts)
        except Exception as e:
            return StorageResult(ok=False, error=str(e))
        finally:
            conn.close()


FileTaskStoreAdapter = FileStorage
FileReceiptStoreAdapter = FileStorage
