#  🌱 Dark Data Auditor & Sustainable Storage Analytics

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-18.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![AWS S3](https://img.shields.io/badge/AWS-S3_Integration-232F3E?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/s3/)
[![License](https://img.shields.io/badge/License-MIT-green.style=for-the-badge)](LICENSE)

An intelligent, full-stack enterprise solution designed to detect, analyze, and remediate **Dark Data** across local filesystems, cloud storage (AWS S3), and Google Drive. By leveraging Machine Learning classification and Green AI principles, this platform helps organizations drastically reduce cloud storage costs (ROI optimization) and lower digital carbon footprints.

---

## 📌 Executive Summary

Over **80% of enterprise data** is "Dark Data"—unstructured, unmanaged, or unused data stored permanently in servers and cloud buckets. Storing unused data consumes massive electricity and hardware resources, resulting in exponential cloud expenditure and greenhouse gas emissions.

**Dark Data Auditor** automates the lifecycle management of stale data by:
1. **Auditing Multi-Cloud & Local Storage**: Direct connectors for AWS S3, Google Drive, and system paths.
2. **ML Classifier**: Machine Learning algorithms flag candidates for deletion, cold storage migration, or active retention.
3. **Green AI Metrics**: Quantifies avoided emissions ($kg\ CO_2e$) and estimates monthly S3 cost savings ($USD$).
4. **Automated Auditing**: Generates downloadable PDF reports with executive analytics.

---

## ✨ Key Features

- 🔍 **Multi-Source Storage Scanning**:
  - **Local Filesystem Scanner**: Inspects directories and reads metadata without altering raw files.
  - **AWS S3 Simulator**: Simulates AWS bucket object ingestion and metadata indexing.
  - **Google Drive Integration**: Parses folder and file IDs from Drive URLs for dark risk analysis.
- 🤖 **Machine Learning Classification**:
  - Predicts lifecycle actions (`Recommend Deletion`, `Migrate to Cold Storage`, `Retain Active Tier`).
  - Powered by **Random Forest**, **Decision Trees**, **Logistic Regression**, and **Gradient Boosting**.
- 📊 **Green AI & Sustainability Benchmark**:
  - Evaluates model training energy expenditure vs. prediction accuracy.
  - Calculates carbon emissions saved ($kg\ CO_2e$) based on storage volume and age.
- 📄 **Executive PDF Report Generator**:
  - Generates audit-ready PDF reports summarizing ROI, footprint metrics, and file classifications.
- 📦 **Standalone Desktop Executable Support**:
  - Fully bundled into a single-click executable using **PyInstaller** for offline Windows deployments.

---

## 🛠️ Tech Stack

| Domain | Technologies Used |
| :--- | :--- |
| **Frontend** | React.js (v18), Tailwind CSS / Modern CSS3, Lucide Icons, Chart.js / Recharts |
| **Backend** | Python 3.11, Flask, Flask-CORS, PyInstaller |
| **Data & ML** | Pandas, NumPy, Scikit-Learn |
| **Cloud & Integrations** | AWS S3 SDK (Boto3 concept), Google Drive API Connectors |
| **Reporting** | ReportLab (PDF Generation) |

---

## 📂 Architecture Overview