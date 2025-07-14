import os
import shutil
from pathlib import Path
from typing import Union, Optional
import uuid
from fastapi import UploadFile


def save_uploaded_file(
    file: UploadFile,
    save_directory: Union[str, Path],
    filename: Optional[str] = None,
    create_dirs: bool = True,
    overwrite: bool = False,
    max_size_mb: Optional[float] = None
) -> str:
    """
    Save an uploaded file to the specified directory.
    
    Args:
        file: The uploaded file object (FastAPI UploadFile or similar)
        save_directory: Directory where the file should be saved
        filename: Custom filename (if None, uses original filename or generates UUID)
        create_dirs: Whether to create directories if they don't exist
        overwrite: Whether to overwrite existing files
        max_size_mb: Maximum file size in MB (None for no limit)
    
    Returns:
        str: Full path to the saved file
    
    Raises:
        ValueError: If file is too large or other validation errors
        FileExistsError: If file exists and overwrite is False
        OSError: If there are file system errors
    """
    
    # Convert save_directory to Path object
    save_dir = Path(save_directory)
    
    # Create directory if it doesn't exist
    if create_dirs:
        save_dir.mkdir(parents=True, exist_ok=True)
    elif not save_dir.exists():
        raise OSError(f"Directory does not exist: {save_dir}")
    
    # Determine filename
    if filename is None:
        if hasattr(file, 'filename') and file.filename:
            filename = file.filename
        else:
            # Generate UUID filename with original extension if available
            ext = ""
            if hasattr(file, 'filename') and file.filename:
                ext = Path(file.filename).suffix
            filename = f"{uuid.uuid4()}{ext}"
    
    # Sanitize filename (remove potentially dangerous characters)
    filename = "".join(c for c in filename if c.isalnum() or c in "._-")
    if not filename:
        filename = f"{uuid.uuid4()}.bin"
    
    # Full file path
    file_path = save_dir / filename
    
    # Check if file exists
    if file_path.exists() and not overwrite:
        raise FileExistsError(f"File already exists: {file_path}")
    
    # Check file size if limit is set
    if max_size_mb is not None:
        file.file.seek(0, 2)  # Seek to end
        file_size = file.file.tell()
        file.file.seek(0)  # Reset to beginning
        
        max_size_bytes = max_size_mb * 1024 * 1024
        if file_size > max_size_bytes:
            raise ValueError(f"File size ({file_size / 1024 / 1024:.2f} MB) exceeds limit ({max_size_mb} MB)")
    
    # Save the file
    try:
        with open(file_path, "wb") as buffer:
            if hasattr(file, 'file'):
                # FastAPI UploadFile
                shutil.copyfileobj(file.file, buffer)
            else:
                # Handle other file-like objects
                buffer.write(file.read())
        
        return str(file_path)
    
    except Exception as e:
        # Clean up partial file if something went wrong
        if file_path.exists():
            file_path.unlink()
        raise OSError(f"Error saving file: {str(e)}")
    

def delete_file(
    file_path: Union[str, Path],
    raise_if_not_exists: bool = False,
    secure_delete: bool = False
) -> bool:
    """
    Delete a single file safely.
    
    Args:
        file_path: Path to the file to delete
        raise_if_not_exists: Whether to raise exception if file doesn't exist
        secure_delete: Whether to overwrite file content before deletion (basic security)
    
    Returns:
        bool: True if file was deleted, False if it didn't exist
    
    Raises:
        FileNotFoundError: If file doesn't exist and raise_if_not_exists is True
        PermissionError: If insufficient permissions to delete
        OSError: If other file system errors occur
    """
    
    file_path = Path(file_path)
    
    # Check if file exists
    if not file_path.exists():
        if raise_if_not_exists:
            raise FileNotFoundError(f"File not found: {file_path}")
        return False
    
    # Check if it's actually a file (not a directory)
    if not file_path.is_file():
        raise OSError(f"Path is not a file: {file_path}")
    
    try:
        # Basic secure deletion (overwrite with zeros)
        if secure_delete:
            with open(file_path, "r+b") as f:
                file_size = f.seek(0, 2)  # Get file size
                f.seek(0)
                f.write(b'\x00' * file_size)  # Overwrite with zeros
                f.flush()
                os.fsync(f.fileno())  # Force write to disk
        
        # Delete the file
        file_path.unlink()
        return True
        
    except PermissionError:
        raise PermissionError(f"Permission denied: Cannot delete {file_path}")
    except Exception as e:
        raise OSError(f"Error deleting file {file_path}: {str(e)}")