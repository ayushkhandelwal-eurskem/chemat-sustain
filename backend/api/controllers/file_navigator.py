from fastapi import HTTPException, Depends
from utils.custom_router import APIRouter
import os 
from typing import List
from parsers.mtt import parse_excel_mtt
from parsers.dls import parse_excel_dls
from utils.auth import get_current_user
# Base directory for folder navigation - change to your target path
BASE_DIR = os.path.join(os.getcwd(), "data")

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/", response_model=List[str])
async def get_folders():
    """Get top-level folders"""
    try:
        items = os.listdir(BASE_DIR)
        folders = [item for item in items if os.path.isdir(os.path.join(BASE_DIR, item))]
        return folders
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve folders: {str(e)}")


@router.get("/{folder_name}", response_model=List[str])
async def get_subfolders(folder_name: str):
    """Get subfolders within a selected folder"""
    try:
        folder_path = os.path.join(BASE_DIR, folder_name)
        items = os.listdir(folder_path)
        subfolders = [
                item for item in items 
                if os.path.isdir(os.path.join(folder_path, item))
            ]
        return subfolders
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve subfolders: {str(e)}")
    


@router.get("/{folder_name}/{subfolder_name}", response_model=List[str])
async def get_files(folder_name: str, subfolder_name: str):
    """Get files within a nested folder path"""
    try:
        folder_path = os.path.join(BASE_DIR, folder_name, subfolder_name)
        items = os.listdir(folder_path)
        files = [
                item for item in items 
                if os.path.isdir(os.path.join(folder_path, item))
            ]
        return files
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve files: {str(e)}")
    

@router.get("/{folder_name}/{subfolder_name}/{nested_subfolder}", response_model=List[dict])
async def get_nested_subfolder_contents(folder_name: str, subfolder_name: str, nested_subfolder: str):
    """Get files with details within a deeply nested subfolder path"""
    try:
        nested_path = os.path.join(BASE_DIR, folder_name, subfolder_name, nested_subfolder)
        directory_contents = os.listdir(nested_path)
        file_details = []
        
        for item in directory_contents:
            item_path = os.path.join(nested_path, item)
            if os.path.isfile(item_path) and '~' not in item_path:
                file_size = os.path.getsize(item_path)
                file_type = os.path.splitext(item)[1] or 'No extension'
                name_without_ext = os.path.splitext(item)[0]
                file_details.append({
                    'name': name_without_ext,
                    'size': file_size,
                    'type': file_type
                })
        return file_details
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve files: {str(e)}")


@router.get("/{folder_name}/{subfolder_name}/{nested_subfolder}/{file_name}")
async def get_file(folder_name: str, subfolder_name: str, nested_subfolder: str, file_name: str):
    """Get a specific file within a deeply nested subfolder path"""
    try:
        file_path = os.path.join(BASE_DIR, folder_name, subfolder_name, nested_subfolder, file_name)
        if nested_subfolder.lower() == "mtt":
            data = parse_excel_mtt(file_path)
            return data
        elif nested_subfolder.lower() == "dls":
            data_dls = parse_excel_dls(file_path)
            return data_dls
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse file: {str(e)}")