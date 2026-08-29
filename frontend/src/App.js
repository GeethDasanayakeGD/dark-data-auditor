import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import './App.css';

const BASE_URL = 'http://localhost:5000';
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
  const [activeTab, setActiveTab] = useState('automation');
  const [benchmarkResults, setBenchmarkResults] = useState(null);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState(null);
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
        setError('Could not reach backend API. Ensure Localhost Flask Server is running.');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = () => {
    setBusy(true);
    setActionStatus('Generating a new synthetic dataset...');
    axios
      .post(GENERATE_URL, { num_files: 5000 })
      .then((res) => {
        setActionStatus(`✅ ${res.data.message} Running dark data analysis...`);
        fetchMetrics();
      })
      .catch((err) => {
        console.error(err);
        setActionStatus('❌ Failed to generate a dataset.');
      })
      .finally(() => setBusy(false));
  };

  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  const getCleanExtension = (filename) => {
    if (!filename) return '.unknown';
    const idx = filename.lastIndexOf('.');
    if (idx === -1 || idx === filename.length - 1) return '.unknown';
    const ext = filename.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
    return ext ? `.${ext}` : '.unknown';
  };

  const sanitizeName = (str) => {
    if (!str) return 'file';
    return String(str).replace(/[^a-zA-Z0-9_\.\-]/g, '_');
  };

  const MAX_SCAN_FILES = 5000;

  const buildCsvFromRealFiles = async (rawFileList, labelPrefix) => {
    let fileList = Array.from(rawFileList);
    if (fileList.length > MAX_SCAN_FILES) {
      fileList = fileList.slice(0, MAX_SCAN_FILES);
    }

    const now = Date.now();
    const rows = [['file_id', 'file_type', 'file_size_mb', 'days_since_creation', 'days_since_last_accessed', 'access_count_30d']];

    fileList.forEach((file, index) => {
      const rawPath = file.webkitRelativePath || file.name || `file_${index + 1}`;
      const safeId = `${labelPrefix}_${index + 1}_${sanitizeName(rawPath)}`;
      const safeType = getCleanExtension(file.name);

      const rawMb = (file.size || 0) / (1024 * 1024);
      const sizeMb = rawMb < 0.001 ? 0.001 : Number(rawMb.toFixed(3));

      const lastMod = file.lastModified || now;
      const daysOld = Math.max(0, Math.floor((now - lastMod) / (1000 * 60 * 60 * 24)));

      rows.push([
        safeId,
        safeType,
        sizeMb,
        daysOld,
        daysOld,
        0
      ]);
    });

    const csvContent = rows.map((row) => row.join(',')).join('\n');
    const csvBlob = new Blob([csvContent], { type: 'text/csv' });
    return { csvFile: new File([csvBlob], 'scanned_files.csv', { type: 'text/csv' }), count: fileList.length };
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
        console.error(err);
        const detail = err.response?.data?.error || err.message || 'Upload or retraining failed.';
        setActionStatus(`❌ ${detail}`);
      })
      .finally(() => setBusy(false));
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
    setActionStatus(`Uploading metadata for ${count} file(s)...`);
    uploadCsvAndRetrain(csvFile, `Analyzed ${count} uploaded file(s).`);
    event.target.value = '';
  };

  const handleFolderScanClick = () => {
    folderInputRef.current.click();
  };

  const handleFolderScanChange = async (event) => {
    const fileList = Array.from(event.target.files);
    if (fileList.length === 0) return;

    setBusy(true);
    setActionStatus(`Scanning ${fileList.length} files from folder...`);
    const { csvFile, count } = await buildCsvFromRealFiles(fileList, 'FOLDER');
    setActionStatus(`Uploading metadata for ${count} scanned files...`);
    uploadCsvAndRetrain(csvFile, `Scanned ${count} real files.`);
    event.target.value = '';
  };

  const handleScanLocalPath = () => {
    const path = prompt("Enter full folder/drive path (e.g., C:\\Users\\Name\\Documents or D:\\Data):");
    if (!path) return;

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
      .catch((err) => {
        console.error(err);
        setActionStatus(`❌ ${err.response?.data?.error || 'Failed to scan local path.'}`);
      })
      .finally(() => setBusy(false));
  };

  const handleScanGDrive = () => {
    const url = prompt("Enter Google Drive folder or file shareable link:");
    if (!url) return;

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
      .catch((err) => {
        console.error(err);
        setActionStatus(`❌ ${err.response?.data?.error || 'Failed to scan Google Drive link.'}`);
      })
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
      .catch((err) => {
        console.error(err);
        setActionStatus(`❌ ${err.response?.data?.error || 'Retraining failed.'}`);
      })
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
      .catch((err) => {
        console.error(err);
        setActionStatus(`❌ ${err.response?.data?.error || 'Migration failed.'}`);
      })
      .finally(() => setBusy(false));
  };

  const handleAwsConnect = () => {
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
      .catch((err) => {
        console.error(err);
        setActionStatus(`❌ ${err.response?.data?.error || 'AWS Connection failed.'}`);
      })
      .finally(() => setBusy(false));
  };

  const handleAutomatedCleanup = () => {
    if (!window.confirm("Are you sure you want to run automated cleanup? Flagged dark files will be removed.")) return;

    setBusy(true);
    setActionStatus('🧹 Running automated data cleanup...');

    axios
      .post(CLEANUP_URL)
      .then((res) => {
        setActionStatus(`✅ ${res.data.message} (${res.data.dataset_files_removed} files removed). Retraining model...`);
        return axios.post(RETRAIN_URL);
      })
      .then((res) => {
        setActionStatus(`✅ Cleanup complete & model retrained. Refreshing metrics...`);
        fetchMetrics();
      })
      .catch((err) => {
        console.error(err);
        setActionStatus(`❌ Cleanup failed: ${err.response?.data?.error || err.message}`);
      })
      .finally(() => setBusy(false));
  };

  const handleDownloadPdf = async () => {
    setActionStatus('📄 Generating PDF Audit Report...');
    try {
      const response = await axios.get(DOWNLOAD_PDF_URL, {
        responseType: 'blob',
      });

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
      console.error('PDF Download failed:', err);
      setActionStatus('❌ PDF Download failed. Check console for details.');
    }
  };

  const handlePrivacyToggle = () => {
    const newValue = !privacyMode;
    setPrivacyMode(newValue);
    fetchMetrics(newValue);
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

  const datasetControls = (
    <section className="dataset-controls">
      <div className="dataset-controls-row">
        <button className="btn btn-primary" onClick={handleGenerate} disabled={busy}>🔄 Generate Sample Dataset</button>
        <button className="btn btn-secondary" onClick={handleUploadClick} disabled={busy}>📁 Upload Files (any type)</button>
        <button className="btn btn-tertiary" onClick={handleRetrain} disabled={busy}>🧠 Retrain Model</button>
        <button className="btn btn-scan" onClick={handleFolderScanClick} disabled={busy}>📂 Scan Folder</button>
        <button className="btn btn-scan" onClick={handleScanLocalPath} disabled={busy}>🖥️ Scan Drive / Path</button>
        <button className="btn btn-gdrive" onClick={handleScanGDrive} disabled={busy}>☁️ Scan Google Drive</button>
        <button className="btn btn-migrate" onClick={handleMigrate} disabled={busy}>🗄️ Migrate to Cold Storage</button>
        <button className="btn btn-aws" onClick={handleAwsConnect} disabled={busy}>☁️ Connect AWS S3</button>
        <button className="btn btn-danger" onClick={handleAutomatedCleanup} disabled={busy}>🧹 Run Automated Cleanup</button>
        <button className="btn btn-pdf" onClick={handleDownloadPdf} disabled={busy}>📄 Download PDF Report</button>

        <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} multiple />
        <input type="file" ref={folderInputRef} onChange={handleFolderScanChange} style={{ display: 'none' }} multiple />
      </div>
      <label className="privacy-toggle">
        <input type="checkbox" checked={privacyMode} onChange={handlePrivacyToggle} disabled={busy} />
        🔒 Privacy Mode (anonymize file IDs)
      </label>
      {actionStatus && <p className="dataset-status">{actionStatus}</p>}
      <p className="dataset-hint">"Upload Files" supports any file format (Images, PDFs, Videos, ZIP, Docs, Folders).</p>
    </section>
  );

  const tabNav = (
    <nav className="tab-nav">
      <button className={`tab-btn ${activeTab === 'automation' ? 'tab-active' : ''}`} onClick={() => setActiveTab('automation')}>🤖 Automation System</button>
      <button className={`tab-btn ${activeTab === 'research' ? 'tab-active' : ''}`} onClick={() => setActiveTab('research')}>🔬 AI Research Lab</button>
    </nav>
  );

  const researchLab = (
    <section className="research-lab">
      <div className="dataset-controls">
        <h2>Multi-Model Green AI Performance Analysis</h2>
        <button className="btn btn-primary" onClick={handleRunBenchmark} disabled={benchmarkRunning}>
          {benchmarkRunning ? '⏳ Running benchmark...' : '▶️ Run Model Comparison Benchmark'}
        </button>
        {benchmarkError && <p className="dataset-status error-text">❌ {benchmarkError}</p>}
      </div>

      {benchmarkResults && (
        <div className="charts-grid">
          <div className="chart-card">
            <h2>Predictive Classification Accuracies</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={benchmarkResults}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="model_name" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#94a3b8" domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="accuracy_percent" name="Accuracy %" fill="#4ade80" />
                <Bar dataKey="f1_score_percent" name="F1 Score %" fill="#60a5fa" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h2>Training Carbon Footprint (mg CO₂)</h2>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={benchmarkResults}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="model_name" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Line type="monotone" dataKey="carbon_footprint_mg" name="Carbon Footprint (mg)" stroke="#f87171" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {benchmarkResults && (
        <div className="table-section">
          <h2>Full Benchmark Results</h2>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Accuracy %</th>
                  <th>F1 Score %</th>
                  <th>Training Time (sec)</th>
                  <th>Carbon Footprint (mg)</th>
                </tr>
              </thead>
              <tbody>
                {benchmarkResults.map((r) => (
                  <tr key={r.model_name}>
                    <td>{r.model_name}</td>
                    <td>{r.accuracy_percent}</td>
                    <td>{r.f1_score_percent}</td>
                    <td>{r.training_time_sec}</td>
                    <td>{r.carbon_footprint_mg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );

  if (loading) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <h1>🌍 Dark Data Auditor</h1>
          <p>Cloud storage sustainability &amp; cost audit</p>
        </header>
        {tabNav}
        {activeTab === 'research' ? researchLab : (
          <>
            {datasetControls}
            <div className="status-message">Loading dashboard data...</div>
          </>
        )}
        <div className="copyright-watermark">© 2026 Geeth Dasanayake</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <h1>🌍 Dark Data Auditor</h1>
          <p>Cloud storage sustainability &amp; cost audit</p>
        </header>
        {tabNav}
        {activeTab === 'research' ? researchLab : (
          <>
            {datasetControls}
            <div className="status-message error">{error}</div>
          </>
        )}
        <div className="copyright-watermark">© 2026 Geeth Dasanayake</div>
      </div>
    );
  }

  const { aggregates, files } = data;
  const MAX_TABLE_ROWS = 300;
  const sortedFiles = [...files].sort((a, b) => {
    const aDark = a.automated_action !== 'Retain Active Tier' ? 1 : 0;
    const bDark = b.automated_action !== 'Retain Active Tier' ? 1 : 0;
    if (aDark !== bDark) return bDark - aDark;
    return b.carbon_kg - a.carbon_kg;
  });
  const displayedFiles = sortedFiles.slice(0, MAX_TABLE_ROWS);

  const pieData = [
    { name: 'Active Files', value: aggregates.active_files_count },
    { name: 'Dark Data Files', value: aggregates.dark_files_count },
  ];
  const PIE_COLORS = ['#4ade80', '#f87171'];

  const carbonByType = {};
  files.forEach((file) => {
    const type = file.file_type || 'unknown';
    carbonByType[type] = (carbonByType[type] || 0) + file.carbon_kg;
  });
  const barData = Object.entries(carbonByType)
    .map(([type, carbonKg]) => ({ type, carbon: Number((carbonKg * 1000).toFixed(3)) }))
    .sort((a, b) => b.carbon - a.carbon);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>🌍 Dark Data Auditor</h1>
        <p>Cloud storage sustainability &amp; cost audit</p>
      </header>

      {tabNav}

      {activeTab === 'research' ? researchLab : (
        <>
          {datasetControls}

          <section className="stats-grid">
            <StatCard label="Total Files" value={aggregates.total_files} />
            <StatCard label="Dark Data Files" value={aggregates.dark_files_count} highlight="warning" />
            <StatCard label="Active Files" value={aggregates.active_files_count} highlight="good" />
            <StatCard label="Current Carbon Footprint" value={`${(aggregates.current_footprint_kg * 1000).toFixed(2)} g CO₂`} />
            <StatCard label="Prevented Emissions" value={`${(aggregates.prevented_emissions_kg * 1000).toFixed(2)} g CO₂`} highlight="good" />
            <StatCard label="Estimated Monthly Savings" value={`$${aggregates.estimated_monthly_roi_usd}`} highlight="good" />
          </section>

          <section className="charts-grid">
            <div className="chart-card">
              <h2>Active vs Dark Data</h2>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {pieData.map((entry, index) => (
                      <Cell key={entry.name} fill={PIE_COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h2>Carbon Footprint by File Type (g CO₂)</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="type" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip />
                  <Bar dataKey="carbon" fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="table-section">
            <h2>File Details ({files.length} records)</h2>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>File ID</th>
                    <th>Type</th>
                    <th>Size (MB)</th>
                    <th>Days Old</th>
                    <th>Last Accessed (days)</th>
                    <th>Accesses (30d)</th>
                    <th>Carbon (g)</th>
                    <th>AI Confidence</th>
                    <th>Recommended Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedFiles.map((file) => (
                    <tr key={file.file_id}>
                      <td>{file.file_id}</td>
                      <td>{file.file_type}</td>
                      <td>{file.file_size_mb}</td>
                      <td>{file.days_since_creation}</td>
                      <td>{file.days_since_last_accessed}</td>
                      <td>{file.access_count_30d}</td>
                      <td>{(file.carbon_kg * 1000).toFixed(3)}</td>
                      <td>{file.confidence_percent}%</td>
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
        </>
      )}
      <div className="copyright-watermark">© 2026 Geeth Dasanayake</div>
    </div>
  );
}

function StatCard({ label, value, highlight }) {
  return (
    <div className={`stat-card ${highlight ? `stat-${highlight}` : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
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