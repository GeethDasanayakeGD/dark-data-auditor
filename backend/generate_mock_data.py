import os
import csv
import random

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(DATA_DIR, exist_ok=True)
CSV_FILE_PATH = os.path.join(DATA_DIR, 'cloud_metadata.csv')

print("Generating high-density cloud metadata records...")

file_extensions = ['.pdf', '.zip', '.docx', '.xlsx', '.log', '.tmp', '.bak', '.png']

with open(CSV_FILE_PATH, mode='w', newline='') as file:
    writer = csv.writer(file)
    writer.writerow(['file_id', 'file_type', 'file_size_mb', 'days_since_creation', 'days_since_last_accessed', 'access_count_30d'])
    
    # Generate 5,000 files with boosted size and age baselines
    for i in range(1, 5001):
        is_dark_seed = (i > 4000) # Force the last 1,000 files to be explicit heavy dark data
        
        file_id = f"FILE_{i:04d}" if not is_dark_seed else f"DARK_SYS_BAK_{i}"
        f_type = random.choice(file_extensions) if not is_dark_seed else random.choice(['.zip', '.bak', '.log'])
        
        # BOOST: Making the file sizes much larger so their baseline numbers show up clearly in kg
        size = round(random.uniform(500.0, 4500.0), 2) if is_dark_seed else round(random.uniform(50.0, 800.0), 2)
        
        # AGE BOOST: Older assets mean more hours accumulated, driving higher carbon output values
        days_old = random.randint(150, 600) if is_dark_seed else random.randint(10, 180)
        
        if is_dark_seed:
            days_unaccessed = random.randint(120, days_old)
            access_30d = 0
        else:
            days_unaccessed = random.randint(0, min(days_old, 30))
            access_30d = random.randint(5, 50)
            
        writer.writerow([file_id, f_type, size, days_old, days_unaccessed, access_30d])

print(f"Success! High-density data exported to: {CSV_FILE_PATH}")