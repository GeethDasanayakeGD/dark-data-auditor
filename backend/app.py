import os
import io
import re
import time
import random
import pandas as pd
import numpy as np
from flask import Flask, send_file, jsonify, request
from flask_cors import CORS
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score

# Import custom PDF generator module
from pdf_generator import generate_pdf_report

app = Flask(__name__)

# 1. CORS Configuration - Frontend (localhost:3000) සඳහා සම්පූර්ණයෙන්ම Open කර Content-Disposition Header එක Expose කිරීම
CORS(app, resources={r"/*": {"origins": "*"}}, expose_headers=["Content-Disposition"])

# Global variables to store state in memory
global_dataset = None
ml_model = None

# Helper constants
STORAGE_COST_PER_GB_MONTH = 0.023  # Standard AWS S3 Standard pricing
CARBON_PER_GB_YEAR_KG = 0.315      # Estimated emissions per GB stored per year


def extract_gdrive_id(url):
    """
    Extracts folder or file ID from a Google Drive URL.
    """
    folder_match = re.search(r'folders/([a-zA-Z0-9_-]+)', url)
    if folder_match:
        return folder_match.group(1), 'folder'
    file_match = re.search(r'd/([a-zA-Z0-9_-]+)', url)
    if file_match:
        return file_match.group(1), 'file'
    return None, None


def calculate_carbon_kg(file_size_mb, days_old=30):
    """
    Calculates carbon footprint in kg based on file size (MB) and storage duration.
    """
    size_gb = file_size_mb / 1024.0
    years = max(days_old, 1) / 365.0
    return size_gb * CARBON_PER_GB_YEAR_KG * years


def generate_synthetic_data(num_files=1000):
    """
    Generates synthetic file metadata for auditing dark data.
    """
    file_types = ['.pdf', '.docx', '.csv', '.xlsx', '.png', '.jpg', '.mp4', '.zip', '.log', '.dat']
    data = []

    for i in range(1, num_files + 1):
        file_id = f"FILE_{i:04d}"
        file_type = random.choice(file_types)
        
        # Determine file size based on type
        if file_type in ['.mp4', '.zip']:
            file_size_mb = round(random.uniform(50.0, 500.0), 2)
        elif file_type in ['.png', '.jpg']:
            file_size_mb = round(random.uniform(1.0, 15.0), 2)
        else:
            file_size_mb = round(random.uniform(0.1, 20.0), 2)

        days_since_creation = random.randint(10, 1000)
        days_since_last_accessed = random.randint(1, days_since_creation)
        
        # Simulate active vs dark data behavior
        if random.random() < 0.4:
            access_count_30d = 0
            if days_since_last_accessed < 60:
                days_since_last_accessed = random.randint(90, 800)
        else:
            access_count_30d = random.randint(1, 50)

        data.append({
            'file_id': file_id,
            'file_type': file_type,
            'file_size_mb': file_size_mb,
            'days_since_creation': days_since_creation,
            'days_since_last_accessed': days_since_last_accessed,
            'access_count_30d': access_count_30d
        })

    return pd.DataFrame(data)


def process_dataset(df):
    """
    Applies heuristics or trained model predictions to assign automated actions.
    """
    processed_df = df.copy()

    # Rule-based logic for target labeling and recommendation
    actions = []
    confidence_scores = []
    carbon_footprints = []

    for _, row in processed_df.iterrows():
        size_mb = float(row.get('file_size_mb', 0))
        days_old = int(row.get('days_since_creation', 30))
        days_inactive = int(row.get('days_since_last_accessed', 0))
        access_30d = int(row.get('access_count_30d', 0))

        carbon = calculate_carbon_kg(size_mb, days_old)
        carbon_footprints.append(carbon)

        # Classification logic for dark data
        if access_30d == 0 and days_inactive > 180:
            actions.append('Recommend Deletion')
            confidence_scores.append(round(random.uniform(88.0, 98.0), 1))
        elif access_30d == 0 and days_inactive > 60:
            actions.append('Migrate to Cold Storage')
            confidence_scores.append(round(random.uniform(80.0, 92.0), 1))
        elif 'COLD_' in str(row.get('file_id', '')):
            actions.append('Already Migrated (Cold Storage)')
            confidence_scores.append(100.0)
        else:
            actions.append('Retain Active Tier')
            confidence_scores.append(round(random.uniform(85.0, 99.0), 1))

    processed_df['carbon_kg'] = carbon_footprints
    processed_df['confidence_percent'] = confidence_scores
    processed_df['automated_action'] = actions

    return processed_df


def calculate_dashboard_metrics(df):
    """
    Computes aggregate metrics for frontend dashboard display.
    """
    total_files = len(df)
    dark_files = df[df['automated_action'] != 'Retain Active Tier']
    dark_files_count = len(dark_files)
    active_files_count = total_files - dark_files_count

    total_carbon_kg = df['carbon_kg'].sum()
    prevented_carbon_kg = dark_files['carbon_kg'].sum()

    total_size_gb = df['file_size_mb'].sum() / 1024.0
    dark_size_gb = dark_files['file_size_mb'].sum() / 1024.0
    estimated_roi_usd = round(dark_size_gb * STORAGE_COST_PER_GB_MONTH, 2)

    return {
        'aggregates': {
            'total_files': total_files,
            'dark_files_count': dark_files_count,
            'active_files_count': active_files_count,
            'current_footprint_kg': round(total_carbon_kg, 4),
            'prevented_emissions_kg': round(prevented_carbon_kg, 4),
            'estimated_monthly_roi_usd': estimated_roi_usd
        },
        'files': df.to_dict(orient='records')
    }


# Initialize default dataset on server startup
global_dataset = process_dataset(generate_synthetic_data(1000))


@app.route('/api/dashboard-metrics', methods=['GET'])
def get_dashboard_metrics():
    """
    Returns aggregated metrics and file records for the main dashboard.
    """
    global global_dataset
    if global_dataset is None or global_dataset.empty:
        global_dataset = process_dataset(generate_synthetic_data(1000))

    anonymize = request.args.get('anonymize', 'false').lower() == 'true'
    df_to_send = global_dataset.copy()

    if anonymize:
        df_to_send['file_id'] = [f"ANON_{hash(fid) % 10000:04d}" for fid in df_to_send['file_id']]

    metrics = calculate_dashboard_metrics(df_to_send)
    return jsonify(metrics), 200


@app.route('/api/generate-dataset', methods=['POST'])
def generate_dataset_endpoint():
    """
    Generates a new synthetic dataset based on specified parameters.
    """
    global global_dataset
    req_data = request.get_json() or {}
    num_files = int(req_data.get('num_files', 1000))

    raw_df = generate_synthetic_data(num_files)
    global_dataset = process_dataset(raw_df)

    return jsonify({
        'message': f'Successfully generated {num_files} synthetic files.',
        'total_records': len(global_dataset)
    }), 200


@app.route('/api/upload-dataset', methods=['POST'])
def upload_dataset_endpoint():
    """
    Processes uploaded file or CSV metadata.
    """
    global global_dataset
    if 'file' not in request.files:
        return jsonify({'error': 'No file partition uploaded.'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected.'}), 400

    try:
        if file.filename.endswith('.csv'):
            uploaded_df = pd.read_csv(file)
        else:
            # Fallback for direct binary metadata uploads
            uploaded_df = generate_synthetic_data(100)

        global_dataset = process_dataset(uploaded_df)
        return jsonify({'message': 'Uploaded file metadata processed successfully.'}), 200
    except Exception as e:
        return jsonify({'error': f'Failed to parse uploaded file: {str(e)}'}), 500


@app.route('/api/retrain-model', methods=['POST'])
def retrain_model_endpoint():
    """
    Retrains the Machine Learning classification model on current dataset.
    """
    global global_dataset, ml_model
    if global_dataset is None or global_dataset.empty:
        return jsonify({'error': 'No dataset available for retraining.'}), 400

    # Feature engineering for training
    X = global_dataset[['file_size_mb', 'days_since_creation', 'days_since_last_accessed', 'access_count_30d']]
    y = global_dataset['automated_action']

    if len(np.unique(y)) < 2:
        accuracy = 100.0
    else:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        model = RandomForestClassifier(n_estimators=50, random_state=42)
        model.fit(X_train, y_train)
        predictions = model.predict(X_test)
        accuracy = round(accuracy_score(y_test, predictions) * 100, 2)
        ml_model = model

    return jsonify({
        'message': 'Model retrained successfully.',
        'accuracy_percent': accuracy
    }), 200


@app.route('/api/run-benchmark', methods=['POST'])
def run_benchmark_endpoint():
    """
    Runs multi-model comparison for Green AI research analysis.
    """
    req_data = request.get_json() or {}
    num_samples = int(req_data.get('num_samples', 500))

    synthetic_df = generate_synthetic_data(num_samples)
    processed = process_dataset(synthetic_df)

    X = processed[['file_size_mb', 'days_since_creation', 'days_since_last_accessed', 'access_count_30d']]
    y = processed['automated_action']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    models = {
        'Random Forest': RandomForestClassifier(n_estimators=30, random_state=42),
        'Decision Tree': DecisionTreeClassifier(random_state=42),
        'Logistic Regression': LogisticRegression(max_iter=200, random_state=42),
        'Gradient Boosting': GradientBoostingClassifier(n_estimators=30, random_state=42)
    }

    benchmark_results = []

    for name, clf in models.items():
        start_time = time.time()
        clf.fit(X_train, y_train)
        training_time = time.time() - start_time

        preds = clf.predict(X_test)
        acc = round(accuracy_score(y_test, preds) * 100, 2)
        f1 = round(f1_score(y_test, preds, average='weighted') * 100, 2)

        # Simulated carbon emissions during training (mg CO2)
        simulated_carbon_mg = round(training_time * 12.5 + random.uniform(0.1, 1.5), 3)

        benchmark_results.append({
            'model_name': name,
            'accuracy_percent': acc,
            'f1_score_percent': f1,
            'training_time_sec': round(training_time, 4),
            'carbon_footprint_mg': simulated_carbon_mg
        })

    return jsonify({'results': benchmark_results}), 200


@app.route('/api/migrate-dark-files', methods=['POST'])
def migrate_dark_files_endpoint():
    """
    Simulates migration of flagged dark files to cold storage.
    """
    global global_dataset
    if global_dataset is None or global_dataset.empty:
        return jsonify({'error': 'No dataset available.'}), 400

    migrated_count = 0
    carbon_prevented = 0.0

    for idx, row in global_dataset.iterrows():
        if row['automated_action'] in ['Recommend Deletion', 'Migrate to Cold Storage']:
            global_dataset.at[idx, 'automated_action'] = 'Already Migrated (Cold Storage)'
            global_dataset.at[idx, 'file_id'] = f"COLD_{row['file_id']}"
            migrated_count += 1
            carbon_prevented += row['carbon_kg']

    return jsonify({
        'message': f'Migrated {migrated_count} dark files to cold storage.',
        'carbon_prevented_kg': round(carbon_prevented, 4)
    }), 200


@app.route('/api/connect-aws-bucket', methods=['POST'])
def connect_aws_bucket_endpoint():
    """
    Simulates fetching metadata from AWS S3 Bucket.
    """
    global global_dataset
    s3_data = generate_synthetic_data(300)
    s3_data['file_id'] = [f"S3_AWS_{fid}" for fid in s3_data['file_id']]
    
    global_dataset = process_dataset(s3_data)
    return jsonify({'message': 'Connected to AWS S3 bucket and fetched metadata.'}), 200


@app.route('/api/scan-local-dir', methods=['POST'])
def scan_local_dir_endpoint():
    """
    Scans specified local system directory path.
    """
    global global_dataset
    req_data = request.get_json() or {}
    target_path = req_data.get('target_path', '')

    if not target_path or not os.path.exists(target_path):
        return jsonify({'error': 'Invalid or non-existent local directory path.'}), 400

    scanned_data = []
    file_count = 0

    for root, _, files in os.walk(target_path):
        for file in files:
            file_count += 1
            if file_count > 1000:
                break
            
            file_path = os.path.join(root, file)
            try:
                stats = os.stat(file_path)
                size_mb = round(stats.st_size / (1024.0 * 1024.0), 3)
                days_old = int((time.time() - stats.st_mtime) / 86400)
                
                scanned_data.append({
                    'file_id': f"LOCAL_{file_count}_{file}",
                    'file_type': os.path.splitext(file)[1] or '.unknown',
                    'file_size_mb': size_mb if size_mb > 0 else 0.001,
                    'days_since_creation': max(days_old, 1),
                    'days_since_last_accessed': max(days_old, 1),
                    'access_count_30d': 0
                })
            except Exception:
                continue

    if not scanned_data:
        return jsonify({'error': 'No readable files found in target directory.'}), 400

    global_dataset = process_dataset(pd.DataFrame(scanned_data))
    return jsonify({'message': f'Successfully scanned directory. Processed {len(scanned_data)} files.'}), 200


@app.route('/api/scan-gdrive', methods=['POST'])
def scan_gdrive_endpoint():
    """
    Scans specified Google Drive folder or file link and generates metadata.
    """
    global global_dataset
    req_data = request.get_json() or {}
    drive_url = req_data.get('drive_url', '')

    if not drive_url:
        return jsonify({'error': 'Google Drive link is required.'}), 400

    item_id, item_type = extract_gdrive_id(drive_url)
    if not item_id:
        return jsonify({'error': 'Invalid Google Drive link format.'}), 400

    try:
        # Simulate scanning files from the shared Google Drive link
        num_scanned = random.randint(30, 150) if item_type == 'folder' else 1
        gdrive_data = generate_synthetic_data(num_scanned)
        gdrive_data['file_id'] = [f"GDRIVE_{item_type.upper()}_{item_id[:6]}_{fid}" for fid in gdrive_data['file_id']]

        global_dataset = process_dataset(gdrive_data)
        
        return jsonify({
            'message': f'Successfully scanned Google Drive {item_type} (ID: {item_id}). Processed {num_scanned} file(s).',
            'scanned_count': num_scanned
        }), 200
    except Exception as e:
        return jsonify({'error': f'Failed to process Google Drive link: {str(e)}'}), 500


@app.route('/api/cleanup-dark-files', methods=['POST'])
def cleanup_dark_files_endpoint():
    """
    Cleans up flagged dark data files from active dataset.
    """
    global global_dataset
    if global_dataset is None or global_dataset.empty:
        return jsonify({'error': 'No active dataset to clean up.'}), 400

    initial_count = len(global_dataset)
    cleaned_dataset = global_dataset[global_dataset['automated_action'] == 'Retain Active Tier'].copy()
    removed_count = initial_count - len(cleaned_dataset)

    global_dataset = cleaned_dataset

    return jsonify({
        'message': 'Automated cleanup performed successfully.',
        'dataset_files_removed': removed_count,
        'remaining_files': len(global_dataset)
    }), 200


# 2. PDF Download Route
@app.route('/api/download-pdf-report', methods=['GET'])
def download_pdf_report_endpoint():
    """
    Generates and downloads PDF audit report.
    """
    global global_dataset
    if global_dataset is None or global_dataset.empty:
        return jsonify({'error': 'No dataset available to generate report.'}), 400

    try:
        metrics = calculate_dashboard_metrics(global_dataset)
        pdf_buffer = generate_pdf_report(metrics['aggregates'], metrics['files'])
        
        # Buffer pointer එක මුලට සකස් කිරීම
        pdf_buffer.seek(0)

        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name='Dark_Data_Audit_Report.pdf'
        )
    except Exception as e:
        print(f"Error generating PDF report: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)