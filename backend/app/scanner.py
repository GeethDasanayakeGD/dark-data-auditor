import os
import time
import pandas as pd
from pathlib import Path

def scan_local_directory(target_path, max_files=1000):
    """
    Local Disk එකේ folder එකක් scan කර real file metadata ලබාගැනීම.
    """
    file_data = []
    current_time = time.time()
    count = 0

    if not os.path.exists(target_path):
        return pd.DataFrame()

    for root, _, files in os.walk(target_path):
        for file in files:
            if count >= max_files:
                break
            
            file_path = os.path.join(root, file)
            try:
                stat = os.stat(file_path)
                
                file_size_mb = round(stat.st_size / (1024 * 1024), 4)
                last_accessed_days = int((current_time - stat.st_atime) / (24 * 3600))
                last_modified_days = int((current_time - stat.st_mtime) / (24 * 3600))
                ext = Path(file).suffix.lower()

                file_data.append({
                    'file_name': file,
                    'file_path': file_path,
                    'file_size_mb': file_size_mb,
                    'days_since_last_accessed': last_accessed_days,
                    'days_since_last_modified': last_modified_days,
                    'file_extension': ext,
                    'access_count_30d': 0 if last_accessed_days > 30 else 5
                })
                count += 1
            except (PermissionError, FileNotFoundError):
                continue
                
    return pd.DataFrame(file_data)