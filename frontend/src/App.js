import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import './App.css';

// Dynamic Host Detection (Laptop එකෙන් 'localhost' ද, Phone එකෙන් Access කරන විට IP එකද ලබාගනී)
const HOST_IP = window.location.hostname;
const BASE_URL = `http://${HOST_IP}:5000`;

const METRICS_URL = `${BASE_URL}/api/dashboard-metrics`;
const GENERATE_URL = `${BASE_URL}/api/generate-dataset`;
const UPLOAD_URL = `${BASE_URL}/api/upload-dataset`;
const RETRAIN_URL = `${BASE_URL}/api/retrain-model`;
const BENCHMARK_URL = `${BASE_URL}/api/run-benchmark`;
const MIGRATE_URL = `${BASE_URL}/api/migrate-dark-files`;
const AWS_CONNECT_URL = `${BASE_URL}/api/connect-aws-bucket`;
const SCAN_DIR_URL = `${BASE_URL}/api/scan-local-dir`;
const SCAN_GDRIVE_URL = `${BASE_URL}/api/scan-gdrive`;
const CLEANUP_URL = `${BASE_URL}/api/cleanup-dark-files`;
const DOWNLOAD_PDF_URL = `${BASE_URL}/api/download-pdf-report`;

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionStatus, setActionStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  
  // Page Navigation State
  const [activePage, setActivePage] = useState('dashboard'); // 'dashboard', 'sources', 'ai_lab', 'actions'
  
  // Benchmark state
  const [benchmarkResults, setBenchmarkResults] = useState(null);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState(null);

  // Modal Dialog States
  const [activeModal, setActiveModal] = useState(null); // 'gdrive', 'local_path', 'cleanup', 'aws'
  const [modalInput, setModalInput] = useState('');

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
    }
  }, []);

  const fetchMetrics = (anonymize = privacyMode) => {
    setLoading(true);
    setError(null);
    axios
      .get(METRICS_URL, { params: { anonymize } })
      .then((response) => {
        setData(response.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError('Could not reach backend API. Ensure Flask Server is running and reachable.');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handlers
  const handleGenerate = () => {
    setBusy(true);
    setActionStatus('Generating a new synthetic dataset...');
    axios
      .post(GENERATE_URL, { num_files: 5000 })
      .then((res) => {
        setActionStatus(`✅ ${res.data.message} Running dark data analysis...`);
        fetchMetrics();
      })
      .catch(() => setActionStatus('❌ Failed to generate a dataset.'))
      .finally(() => setBusy(false));
  };

  const uploadCsvAndRetrain = (csvFile, successPrefix) => {
    const formData = new FormData();
    formData.append('file', csvFile);

    axios
      .post(UPLOAD_URL, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(() => {
        setActionStatus(`✅ ${successPrefix} Retraining AI model...`);
        return axios.post(RETRAIN_URL);
      })
      .then((res) => {
        setActionStatus(`✅ Done! Model accuracy: ${res.data.accuracy_percent}%. Refreshing dashboard...`);
        fetchMetrics();
      })
      .catch((err) => {
        const detail = err.response?.data?.error || err.message || 'Upload or retraining failed.';
        setActionStatus(`❌ ${detail}`);
      })
      .finally(() => setBusy(false));
  };

  const buildCsvFromRealFiles = async (rawFileList, labelPrefix) => {
    let fileList = Array.from(rawFileList);
    if (fileList.length > 5000) fileList = fileList.slice(0, 5000);

    const now = Date.now();
    const rows = [['file_id', 'file_type', 'file_size_mb', 'days_since_creation', 'days_since_last_accessed', 'access_count_30d']];

    fileList.forEach((file, index) => {
      const rawPath = file.webkitRelativePath || file.name || `file_${index + 1}`;
      const safeId = `${labelPrefix}_${index + 1}_${String(rawPath).replace(/[^a-zA-Z0-9_\.\-]/g, '_')}`;
      const ext = file.name ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '.unknown';
      const rawMb = (file.size || 0) / (1024 * 1024);
      const sizeMb = rawMb < 0.001 ? 0.001 : Number(rawMb.toFixed(3));
      const daysOld = Math.max(0, Math.floor((now - (file.lastModified || now)) / (1000 * 60 * 60 * 24)));

      rows.push([safeId, ext, sizeMb, daysOld, daysOld, 0]);
    });

    const csvContent = rows.map((row) => row.join(',')).join('\n');
    const csvBlob = new Blob([csvContent], { type: 'text/csv' });
    return { csvFile: new File([csvBlob], 'scanned_files.csv', { type: 'text/csv' }), count: fileList.length };
  };

  const handleFileChange = async (event) => {
    const selectedFiles = Array.from(event.target.files);
    if (selectedFiles.length === 0) return;
    setBusy(true);

    if (selectedFiles.length === 1 && selectedFiles[0].name.toLowerCase().endsWith('.csv')) {
      setActionStatus(`Uploading CSV "${selectedFiles[0].name}"...`);
      uploadCsvAndRetrain(selectedFiles[0], `Uploaded "${selectedFiles[0].name}".`);
      event.target.value = '';
      return;
    }

    setActionStatus(`Processing ${selectedFiles.length} file(s)...`);
    const { csvFile, count } = await buildCsvFromRealFiles(selectedFiles, 'FILE');
    uploadCsvAndRetrain(csvFile, `Analyzed ${count} uploaded file(s).`);
    event.target.value = '';
  };

  const handleFolderScanChange = async (event) => {
    const fileList = Array.from(event.target.files);
    if (fileList.length === 0) return;
    setBusy(true);
    setActionStatus(`Scanning ${fileList.length} files from folder...`);
    const { csvFile, count } = await buildCsvFromRealFiles(fileList, 'FOLDER');
    uploadCsvAndRetrain(csvFile, `Scanned ${count} real files.`);
    event.target.value = '';
  };

  // Modal Submit Handlers
  const submitGDriveScan = () => {
    if (!modalInput) return;
    const url = modalInput;
    setActiveModal(null);
    setModalInput('');
    setBusy(true);
    setActionStatus('Scanning Google Drive link...');

    axios
      .post(SCAN_GDRIVE_URL, { drive_url: url })
      .then((res) => {
        setActionStatus(`✅ ${res.data.message} Retraining AI model...`);
        return axios.post(RETRAIN_URL);
      })
      .then((res) => {
        setActionStatus(`✅ Google Drive Scanned & Model Retrained. Accuracy: ${res.data.accuracy_percent}%.`);
        fetchMetrics();
      })
      .catch((err) => setActionStatus(`❌ ${err.response?.data?.error || 'Failed to scan Google Drive link.'}`))
      .finally(() => setBusy(false));
  };

  const submitLocalPathScan = () => {
    if (!modalInput) return;
    const path = modalInput;
    setActiveModal(null);
    setModalInput('');
    setBusy(true);
    setActionStatus(`Scanning directory: ${path}...`);

    axios
      .post(SCAN_DIR_URL, { target_path: path })
      .then((res) => {
        setActionStatus(`✅ ${res.data.message} Retraining AI model...`);
        return axios.post(RETRAIN_URL);
      })
      .then((res) => {
        setActionStatus(`✅ Drive Scanned & Model Retrained. Accuracy: ${res.data.accuracy_percent}%.`);
        fetchMetrics();
      })
      .catch((err) => setActionStatus(`❌ ${err.response?.data?.error || 'Failed to scan local path.'}`))
      .finally(() => setBusy(false));
  };

  const submitAutomatedCleanup = () => {
    setActiveModal(null);
    setBusy(true);
    setActionStatus('🧹 Running automated data cleanup...');

    axios
      .post(CLEANUP_URL)
      .then((res) => {
        setActionStatus(`✅ ${res.data.message} (${res.data.dataset_files_removed} files removed). Retraining model...`);
        return axios.post(RETRAIN_URL);
      })
      .then(() => {
        setActionStatus(`✅ Cleanup complete & model retrained. Refreshing metrics...`);
        fetchMetrics();
      })
      .catch((err) => setActionStatus(`❌ Cleanup failed: ${err.response?.data?.error || err.message}`))
      .finally(() => setBusy(false));
  };

  const submitAwsConnect = () => {
    setActiveModal(null);
    setBusy(true);
    setActionStatus('Connecting to AWS S3...');
    axios
      .post(AWS_CONNECT_URL)
      .then((res) => {
        setActionStatus(`✅ ${res.data.message} Retraining model...`);
        return axios.post(RETRAIN_URL);
      })
      .then((res) => {
        setActionStatus(`✅ Connected & Retrained. Accuracy: ${res.data.accuracy_percent}%.`);
        fetchMetrics();
      })
      .catch((err) => setActionStatus(`❌ ${err.response?.data?.error || 'AWS Connection failed.'}`))
      .finally(() => setBusy(false));
  };

  const handleRetrain = () => {
    setBusy(true);
    setActionStatus('Retraining the AI model...');
    axios
      .post(RETRAIN_URL)
      .then((res) => {
        setActionStatus(`✅ Model retrained. Accuracy: ${res.data.accuracy_percent}%. Refreshing...`);
        fetchMetrics();
      })
      .catch((err) => setActionStatus(`❌ ${err.response?.data?.error || 'Retraining failed.'}`))
      .finally(() => setBusy(false));
  };

  const handleMigrate = () => {
    setBusy(true);
    setActionStatus('Migrating flagged dark files to cold storage...');
    axios
      .post(MIGRATE_URL)
      .then((res) => {
        setActionStatus(`✅ ${res.data.message} Carbon prevented: ${(res.data.carbon_prevented_kg * 1000).toFixed(2)} g CO₂.`);
        fetchMetrics();
      })
      .catch((err) => setActionStatus(`❌ ${err.response?.data?.error || 'Migration failed.'}`))
      .finally(() => setBusy(false));
  };

  const handleDownloadPdf = async () => {
    setActionStatus('📄 Generating PDF Audit Report...');
    try {
      const response = await axios.get(DOWNLOAD_PDF_URL, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Dark_Data_Audit_Report.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setActionStatus('✅ PDF Audit Report downloaded successfully!');
    } catch (err) {
      setActionStatus('❌ PDF Download failed. Check console for details.');
    }
  };

  const handleRunBenchmark = () => {
    setBenchmarkRunning(true);
    setBenchmarkError(null);
    axios
      .post(BENCHMARK_URL, { num_samples: 800 })
      .then((res) => setBenchmarkResults(res.data.results))
      .catch((err) => setBenchmarkError(err.response?.data?.error || 'Benchmark failed.'))
      .finally(() => setBenchmarkRunning(false));
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="animated-bg">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
        </div>
        <div className="status-message">✨ Initializing Dark Data Auditor...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="animated-bg">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
        </div>
        <div className="status-message error">{error}</div>
      </div>
    );
  }

  const { aggregates, files } = data;
  const pieData = [
    { name: 'Active Files', value: aggregates.active_files_count },
    { name: 'Dark Data Files', value: aggregates.dark_files_count },
  ];
  const PIE_COLORS = ['#38bdf8', '#f43f5e'];

  const carbonByType = {};
  files.forEach((f) => {
    const type = f.file_type || 'unknown';
    carbonByType[type] = (carbonByType[type] || 0) + f.carbon_kg;
  });
  const barData = Object.entries(carbonByType)
    .map(([type, carbonKg]) => ({ type, carbon: Number((carbonKg * 1000).toFixed(3)) }))
    .sort((a, b) => b.carbon - a.carbon);

  return (
    <div className="dashboard-container">
      {/* Dynamic Animated Ambient Background */}
      <div className="animated-bg">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      <header className="main-header glass-card">
        <div className="header-brand">
          <div className="brand-logo">🌍</div>
          <div>
            <h1>Dark Data Auditor</h1>
            <p>Cloud Storage Sustainability & Cost Optimization Engine</p>
          </div>
        </div>
        
        <div className="privacy-badge glass-card" onClick={() => { setPrivacyMode(!privacyMode); fetchMetrics(!privacyMode); }}>
          <span className={`privacy-indicator ${privacyMode ? 'active' : ''}`}></span>
          {privacyMode ? '🔒 Anonymized View' : '👁️ Standard View'}
        </div>
      </header>

      {/* Modern Navigation Menu */}
      <nav className="nav-bar glass-card">
        <button className={`nav-tab ${activePage === 'dashboard' ? 'active' : ''}`} onClick={() => setActivePage('dashboard')}>
          📊 Overview
        </button>
        <button className={`nav-tab ${activePage === 'sources' ? 'active' : ''}`} onClick={() => setActivePage('sources')}>
          📁 Data Sources & Scan
        </button>
        <button className={`nav-tab ${activePage === 'ai_lab' ? 'active' : ''}`} onClick={() => setActivePage('ai_lab')}>
          🧠 AI Engine & Research
        </button>
        <button className={`nav-tab ${activePage === 'actions' ? 'active' : ''}`} onClick={() => setActivePage('actions')}>
          ⚡ Actions & Reports
        </button>
      </nav>

      {actionStatus && (
        <div className="status-banner glass-card">
          <span>{actionStatus}</span>
        </div>
      )}

      {/* Hidden inputs */}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} multiple />
      <input type="file" ref={folderInputRef} onChange={handleFolderScanChange} style={{ display: 'none' }} multiple />

      {/* PAGE 1: DASHBOARD OVERVIEW */}
      {activePage === 'dashboard' && (
        <main className="page-view">
          <section className="stats-grid">
            <StatCard label="Total Files Analyzed" value={aggregates.total_files} icon="📑" />
            <StatCard label="Dark Data Files" value={aggregates.dark_files_count} highlight="warning" icon="⚠️" />
            <StatCard label="Active Files" value={aggregates.active_files_count} highlight="good" icon="✅" />
            <StatCard label="Current Carbon Footprint" value={`${(aggregates.current_footprint_kg * 1000).toFixed(2)} g CO₂`} icon="🌱" />
            <StatCard label="Prevented Emissions" value={`${(aggregates.prevented_emissions_kg * 1000).toFixed(2)} g CO₂`} highlight="good" icon="🛡️" />
            <StatCard label="Estimated Monthly ROI" value={`$${aggregates.estimated_monthly_roi_usd}`} highlight="good" icon="💰" />
          </section>

          <section className="charts-grid">
            <div className="chart-card glass-card">
              <h2>Active vs Dark Data Distribution</h2>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {pieData.map((entry, index) => (
                      <Cell key={entry.name} fill={PIE_COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card glass-card">
              <h2>Carbon Footprint by File Format (g CO₂)</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="type" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }} />
                  <Bar dataKey="carbon" fill="#818cf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="table-section glass-card">
            <h2>Audited File Index ({files.length} records)</h2>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>File Identifier</th>
                    <th>Type</th>
                    <th>Size (MB)</th>
                    <th>Days Old</th>
                    <th>Last Accessed</th>
                    <th>Access Count</th>
                    <th>Carbon (g)</th>
                    <th>AI Confidence</th>
                    <th>Recommended Action</th>
                  </tr>
                </thead>
                <tbody>
                  {files.slice(0, 200).map((file) => (
                    <tr key={file.file_id}>
                      <td className="code-font">{file.file_id}</td>
                      <td>{file.file_type}</td>
                      <td>{file.file_size_mb}</td>
                      <td>{file.days_since_creation}d</td>
                      <td>{file.days_since_last_accessed}d ago</td>
                      <td>{file.access_count_30d}</td>
                      <td>{(file.carbon_kg * 1000).toFixed(3)}</td>
                      <td>
                        <div className="confidence-pill">
                          <span className="confidence-fill" style={{ width: `${file.confidence_percent}%` }}></span>
                          <span className="confidence-text">{file.confidence_percent}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${badgeClass(file.automated_action)}`}>
                          {file.automated_action}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      )}

      {/* PAGE 2: DATA SOURCES & SCANNING */}
      {activePage === 'sources' && (
        <main className="page-view">
          <div className="page-header">
            <h2>Data Ingestion & Storage Connectors</h2>
            <p>Select a data source to scan, classify, and register file metadata into the AI engine.</p>
          </div>

          <div className="action-cards-grid">
            <div className="action-card glass-card">
              <div className="action-icon">📂</div>
              <h3>Scan Local Folder</h3>
              <p>Pick a directory directly from your browser to calculate carbon metrics and detect dark files.</p>
              <button className="btn btn-gradient-blue" onClick={() => folderInputRef.current.click()} disabled={busy}>Select Local Folder</button>
            </div>

            <div className="action-card glass-card">
              <div className="action-icon">☁️</div>
              <h3>Scan Google Drive</h3>
              <p>Connect a public or shared Google Drive link to audit remotely stored documents.</p>
              <button className="btn btn-gradient-indigo" onClick={() => { setModalInput(''); setActiveModal('gdrive'); }} disabled={busy}>Connect Google Drive</button>
            </div>

            <div className="action-card glass-card">
              <div className="action-icon">🖥️</div>
              <h3>Local Drive / Full Path</h3>
              <p>Specify a full system drive path (e.g., C:\Users\Data or /var/storage) for deep scanning.</p>
              <button className="btn btn-gradient-amber" onClick={() => { setModalInput(''); setActiveModal('local_path'); }} disabled={busy}>Specify System Path</button>
            </div>

            <div className="action-card glass-card">
              <div className="action-icon">🪣</div>
              <h3>Connect AWS S3 Bucket</h3>
              <p>Ingest cloud object storage metadata directly from configured AWS S3 buckets.</p>
              <button className="btn btn-gradient-orange" onClick={() => setActiveModal('aws')} disabled={busy}>Connect AWS S3</button>
            </div>

            <div className="action-card glass-card">
              <div className="action-icon">📄</div>
              <h3>Upload Metadata / Files</h3>
              <p>Upload raw CSV file records or individual document files for batch classification.</p>
              <button className="btn btn-gradient-purple" onClick={() => fileInputRef.current.click()} disabled={busy}>Upload Files</button>
            </div>

            <div className="action-card glass-card">
              <div className="action-icon">🔄</div>
              <h3>Synthetic Dataset Generator</h3>
              <p>Generate 5,000 synthetic cloud storage file records for testing and benchmarking.</p>
              <button className="btn btn-gradient-cyan" onClick={handleGenerate} disabled={busy}>Generate Test Data</button>
            </div>
          </div>
        </main>
      )}

      {/* PAGE 3: AI ENGINE & RESEARCH LAB */}
      {activePage === 'ai_lab' && (
        <main className="page-view">
          <div className="page-header">
            <h2>AI Model Management & Research Lab</h2>
            <p>Retrain models with newly ingested data or run multi-model efficiency benchmarks.</p>
          </div>

          <div className="ai-lab-section glass-card">
            <div className="ai-controls-bar">
              <div>
                <h3>RandomForest Classifier</h3>
                <p>Retrain the active Dark Data classification model using current dataset features.</p>
              </div>
              <button className="btn btn-gradient-cyan" onClick={handleRetrain} disabled={busy}>🧠 Retrain AI Classifier</button>
            </div>
          </div>

          <div className="ai-lab-section glass-card">
            <div className="ai-controls-bar">
              <div>
                <h3>Multi-Model Green AI Benchmark</h3>
                <p>Run accuracy vs carbon footprint comparison across Decision Trees, XGBoost, and RF models.</p>
              </div>
              <button className="btn btn-gradient-purple" onClick={handleRunBenchmark} disabled={benchmarkRunning}>
                {benchmarkRunning ? '⏳ Running Comparative Evaluation...' : '▶️ Run Model Benchmark'}
              </button>
            </div>

            {benchmarkError && <p className="error-text">❌ {benchmarkError}</p>}

            {benchmarkResults && (
              <>
                <div className="charts-grid" style={{ marginTop: '24px' }}>
                  <div className="chart-card">
                    <h2>Classification Accuracy & F1-Score (%)</h2>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={benchmarkResults}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="model_name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" domain={[0, 100]} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a' }} />
                        <Legend />
                        <Bar dataKey="accuracy_percent" name="Accuracy %" fill="#34d399" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="f1_score_percent" name="F1 Score %" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="chart-card">
                    <h2>Training Energy Carbon Footprint (mg CO₂)</h2>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={benchmarkResults}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="model_name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a' }} />
                        <Line type="monotone" dataKey="carbon_footprint_mg" name="Carbon (mg)" stroke="#f43f5e" strokeWidth={3} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="table-wrapper" style={{ marginTop: '20px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Model Name</th>
                        <th>Accuracy %</th>
                        <th>F1 Score %</th>
                        <th>Training Time (sec)</th>
                        <th>Carbon Cost (mg CO₂)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {benchmarkResults.map((r) => (
                        <tr key={r.model_name}>
                          <td><strong>{r.model_name}</strong></td>
                          <td>{r.accuracy_percent}%</td>
                          <td>{r.f1_score_percent}%</td>
                          <td>{r.training_time_sec} s</td>
                          <td>{r.carbon_footprint_mg} mg</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </main>
      )}

      {/* PAGE 4: ACTIONS & REPORTS */}
      {activePage === 'actions' && (
        <main className="page-view">
          <div className="page-header">
            <h2>Automated Actions & Executive Reporting</h2>
            <p>Execute lifecycle migrations, trigger automated cleanups, or export compliance audit reports.</p>
          </div>

          <div className="action-cards-grid">
            <div className="action-card glass-card">
              <div className="action-icon">🗄️</div>
              <h3>Cold Storage Migration</h3>
              <p>Migrate inactive/dark files to AWS Glacier / Cold tiers to reduce storage energy and costs.</p>
              <button className="btn btn-gradient-purple" onClick={handleMigrate} disabled={busy}>Execute Migration</button>
            </div>

            <div className="action-card glass-card">
              <div className="action-icon">🧹</div>
              <h3>Automated Data Cleanup</h3>
              <p>Safely remove redundant and unaccessed dark data records from active storage repositories.</p>
              <button className="btn btn-gradient-rose" onClick={() => setActiveModal('cleanup')} disabled={busy}>Run Data Cleanup</button>
            </div>

            <div className="action-card glass-card">
              <div className="action-icon">📑</div>
              <h3>Export Executive PDF Audit</h3>
              <p>Generate a comprehensive PDF audit report containing sustainability metrics and cost breakdowns.</p>
              <button className="btn btn-gradient-indigo" onClick={handleDownloadPdf} disabled={busy}>Download PDF Audit</button>
            </div>
          </div>
        </main>
      )}

      {/* POP-UP MODAL WINDOWS (CENTERED & GRAPHICAL) */}
      {activeModal && (
        <div className="modal-overlay">
          <div className="modal-card glass-card">
            <button className="modal-close" onClick={() => setActiveModal(null)}>✕</button>

            {activeModal === 'gdrive' && (
              <>
                <div className="modal-header-icon">☁️</div>
                <h3>Connect Google Drive</h3>
                <p>Paste your shared Google Drive folder or file link below:</p>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={modalInput}
                  onChange={(e) => setModalInput(e.target.value)}
                  autoFocus
                />
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                  <button className="btn btn-gradient-indigo" onClick={submitGDriveScan}>Start Scan</button>
                </div>
              </>
            )}

            {activeModal === 'local_path' && (
              <>
                <div className="modal-header-icon">🖥️</div>
                <h3>Scan Directory Path</h3>
                <p>Enter the full absolute directory path on your system:</p>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="e.g. C:\Users\Name\Documents or /var/data"
                  value={modalInput}
                  onChange={(e) => setModalInput(e.target.value)}
                  autoFocus
                />
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                  <button className="btn btn-gradient-amber" onClick={submitLocalPathScan}>Scan Path</button>
                </div>
              </>
            )}

            {activeModal === 'aws' && (
              <>
                <div className="modal-header-icon">🪣</div>
                <h3>Connect AWS S3 Bucket</h3>
                <p>Ready to sync dark data metrics with configured AWS S3 cloud buckets?</p>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                  <button className="btn btn-gradient-orange" onClick={submitAwsConnect}>Connect & Sync</button>
                </div>
              </>
            )}

            {activeModal === 'cleanup' && (
              <>
                <div className="modal-header-icon warning-icon">⚠️</div>
                <h3>Confirm Data Cleanup</h3>
                <p>Are you sure you want to run automated cleanup? Flagged dark files will be permanently purged.</p>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                  <button className="btn btn-gradient-rose" onClick={submitAutomatedCleanup}>Confirm Cleanup</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <footer className="copyright-watermark">
        © 2026 Geeth Dasanayake • Dark Data Auditor Engine
      </footer>
    </div>
  );
}

function StatCard({ label, value, highlight, icon }) {
  return (
    <div className={`stat-card glass-card ${highlight ? `stat-${highlight}` : ''}`}>
      <div className="stat-card-header">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function badgeClass(action) {
  if (action === 'Recommend Deletion') return 'badge-danger';
  if (action === 'Migrate to Cold Storage') return 'badge-warning';
  if (action === 'Already Migrated (Cold Storage)') return 'badge-info';
  return 'badge-good';
}

export default App;