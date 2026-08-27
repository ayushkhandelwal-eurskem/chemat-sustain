import os
from pathlib import Path
from typing import List

from fastapi import HTTPException, Depends

from parsers.mtt import parse_excel_mtt
from parsers.dls import parse_excel_dls
from security.files import resolve_beneath
from utils.auth import get_current_user
from utils.custom_router import APIRouter
from utils.logging_config import get_logger

logger = get_logger(__name__)

# Legacy session users share this file tree. Every request component is resolved
# beneath this root so encoded traversal and symlink escapes fail closed.
BASE_DIR = Path(os.environ.get("TENANT_DATA_ROOT", os.path.join(os.getcwd(), "data")))

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/", response_model=List[str])
async def get_folders():
    """Get top-level folders"""
    try:
        root = BASE_DIR.resolve(strict=True)
        items = os.listdir(root)
        folders = [item for item in items if (root / item).is_dir() and not (root / item).is_symlink()]
        return folders
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to retrieve top-level folders")
        raise HTTPException(status_code=500, detail="Failed to retrieve folders")


@router.get("/{folder_name}", response_model=List[str])
async def get_subfolders(folder_name: str):
    """Get subfolders within a selected folder"""
    try:
        folder_path = resolve_beneath(BASE_DIR, folder_name)
        items = os.listdir(folder_path)
        subfolders = [
                item for item in items
                if (folder_path / item).is_dir() and not (folder_path / item).is_symlink()
            ]
        return subfolders
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to retrieve subfolders")
        raise HTTPException(status_code=500, detail="Failed to retrieve subfolders")



@router.get("/{folder_name}/{subfolder_name}", response_model=List[str])
async def get_files(folder_name: str, subfolder_name: str):
    """Get files within a nested folder path"""
    try:
        folder_path = resolve_beneath(BASE_DIR, folder_name, subfolder_name)
        items = os.listdir(folder_path)
        files = [
                item for item in items
                if (folder_path / item).is_dir() and not (folder_path / item).is_symlink()
            ]
        return files
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to retrieve files")
        raise HTTPException(status_code=500, detail="Failed to retrieve files")


@router.get("/{folder_name}/{subfolder_name}/{nested_subfolder}", response_model=List[dict])
async def get_nested_subfolder_contents(folder_name: str, subfolder_name: str, nested_subfolder: str):
    """Get files with details within a deeply nested subfolder path"""
    try:
        nested_path = resolve_beneath(BASE_DIR, folder_name, subfolder_name, nested_subfolder)
        directory_contents = os.listdir(nested_path)
        file_details = []

        for item in directory_contents:
            item_path = nested_path / item
            if item_path.is_file() and not item_path.is_symlink() and '~' not in item:
                file_size = os.path.getsize(item_path)
                file_type = os.path.splitext(item)[1] or 'No extension'
                name_without_ext = os.path.splitext(item)[0]
                file_details.append({
                    'name': name_without_ext,
                    'size': file_size,
                    'type': file_type
                })
        return file_details
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to retrieve nested folder contents")
        raise HTTPException(status_code=500, detail="Failed to retrieve files")


@router.get("/{folder_name}/{subfolder_name}/{nested_subfolder}/{file_name}")
async def get_file(folder_name: str, subfolder_name: str, nested_subfolder: str, file_name: str):
    """Get a specific file within a deeply nested subfolder path"""
    try:
        file_path = resolve_beneath(
            BASE_DIR, folder_name, subfolder_name, nested_subfolder, file_name
        )
        if nested_subfolder.lower() == "mtt":
            data = parse_excel_mtt(str(file_path))
            return data
        elif nested_subfolder.lower() == "dls":
            data_dls = parse_excel_dls(str(file_path))
            return data_dls

    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to parse requested file")
        raise HTTPException(status_code=500, detail="Failed to parse file")