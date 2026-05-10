# SPDX-License-Identifier: Apache-2.0
"""
Tests for MAP Protocol storage.
"""

import os
import tempfile

import pytest

from mapprotocol.storage import (
    FileReceiptStoreAdapter,
    FileStorage,
    FileTaskStoreAdapter,
    InMemoryStorage,
    SQLiteStorage,
)


class TestInMemoryStorage:
    """Tests for InMemoryStorage class."""

    def test_initialization(self):
        """Test storage initialization."""
        storage = InMemoryStorage()
        assert storage is not None

    @pytest.mark.asyncio
    async def test_store_and_retrieve_task(self):
        """Test storing and retrieving a task."""
        storage = InMemoryStorage()
        task_data = {
            "task_id": "task-1",
            "status": "completed",
            "result": {"key": "value"},
        }
        result = await storage.save_task(task_data)
        assert result.ok is True

        result = await storage.get_task("task-1")
        assert result.ok is True
        assert result.data["task_id"] == "task-1"

    @pytest.mark.asyncio
    async def test_get_nonexistent_task(self):
        """Test retrieving a non-existent task."""
        storage = InMemoryStorage()
        result = await storage.get_task("nonexistent")
        assert result.ok is False

    @pytest.mark.asyncio
    async def test_list_tasks(self):
        """Test listing tasks."""
        storage = InMemoryStorage()
        await storage.save_task({"task_id": "task-1", "status": "completed"})
        await storage.save_task({"task_id": "task-2", "status": "running"})
        result = await storage.list_tasks()
        assert result.ok is True
        assert len(result.data) >= 2

    @pytest.mark.asyncio
    async def test_delete_task(self):
        """Test deleting a task."""
        storage = InMemoryStorage()
        await storage.save_task({"task_id": "task-1", "status": "completed"})
        result = await storage.delete_task("task-1")
        assert result.ok is True


class TestFileStorage:
    """Tests for FileStorage class."""

    def test_initialization(self):
        """Test file storage initialization."""
        with tempfile.TemporaryDirectory() as tmpdir:
            storage = FileStorage(base_path=tmpdir)
            assert storage is not None

    @pytest.mark.asyncio
    async def test_store_and_retrieve_task(self):
        """Test storing and retrieving a task."""
        with tempfile.TemporaryDirectory() as tmpdir:
            storage = FileStorage(base_path=tmpdir)
            task_data = {
                "task_id": "task-1",
                "status": "completed",
                "result": {"key": "value"},
            }
            result = await storage.save_task(task_data)
            assert result.ok is True

            result = await storage.get_task("task-1")
            assert result.ok is True
            assert result.data["task_id"] == "task-1"

    @pytest.mark.asyncio
    async def test_delete_task(self):
        """Test deleting a task."""
        with tempfile.TemporaryDirectory() as tmpdir:
            storage = FileStorage(base_path=tmpdir)
            await storage.save_task({"task_id": "task-1", "status": "completed"})
            result = await storage.delete_task("task-1")
            assert result.ok is True


class TestSQLiteStorage:
    """Tests for SQLiteStorage class."""

    def test_initialization(self):
        """Test SQLite storage initialization."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            storage = SQLiteStorage(db_path=db_path)
            assert storage is not None

    @pytest.mark.asyncio
    async def test_store_and_retrieve_task(self):
        """Test storing and retrieving a task."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            storage = SQLiteStorage(db_path=db_path)
            task_data = {
                "task_id": "task-1",
                "status": "completed",
                "result": {"key": "value"},
            }
            result = await storage.save_task(task_data)
            assert result.ok is True

            result = await storage.get_task("task-1")
            assert result.ok is True
            assert result.data["task_id"] == "task-1"

    @pytest.mark.asyncio
    async def test_store_and_retrieve_receipt(self):
        """Test storing and retrieving a receipt."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            storage = SQLiteStorage(db_path=db_path)
            receipt_data = {
                "receipt_id": "receipt-1",
                "task_id": "task-1",
                "agent_id": "agent-1",
            }
            result = await storage.save_receipt(receipt_data)
            assert result.ok is True

            result = await storage.get_receipt("receipt-1")
            assert result.ok is True
            assert result.data["receipt_id"] == "receipt-1"

    @pytest.mark.asyncio
    async def test_delete_task(self):
        """Test deleting a task."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            storage = SQLiteStorage(db_path=db_path)
            await storage.save_task({"task_id": "task-1", "status": "completed"})
            result = await storage.delete_task("task-1")
            assert result.ok is True


class TestFileTaskStoreAdapter:
    """Tests for FileTaskStoreAdapter class."""

    def test_initialization(self):
        """Test adapter initialization."""
        with tempfile.TemporaryDirectory() as tmpdir:
            adapter = FileTaskStoreAdapter(base_path=tmpdir)
            assert adapter is not None


class TestFileReceiptStoreAdapter:
    """Tests for FileReceiptStoreAdapter class."""

    def test_initialization(self):
        """Test adapter initialization."""
        with tempfile.TemporaryDirectory() as tmpdir:
            adapter = FileReceiptStoreAdapter(base_path=tmpdir)
            assert adapter is not None
