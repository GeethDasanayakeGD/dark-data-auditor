import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import './App.css';

// Render Cloud Backend API URL
const BASE_URL = 'https://dark-data-auditor-api.onrender.com';
const METRICS_URL = `${BASE_URL}/api/dashboard-metrics`;
const GENERATE_URL = `${BASE_URL}/api/generate-dataset`;
const UPLOAD_URL = `${BASE_URL}/api/upload-dataset`;
const RETRAIN_URL = `${BASE_URL}/api/retrain-model`;
const BENCHMARK_URL = `${BASE_URL}/api/run-benchmark`;
const MIGRATE_URL = `${BASE_URL}/api/migrate-dark-files`;
const AWS_CONNECT_URL = `${BASE_URL}/api/connect-aws-bucket`;

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionStatus, setActionStatus] = useState(null); // small status message under the buttons
  const [busy, setBusy] = useState(false); // disables buttons while generating/uploading/analyzing
  const [privacyMode, setPrivacyMode] = useState(false);
  const [activeTab, setActiveTab] = useState('automation'); // 'automation' or 'research'
  const [benchmarkResults, setBenchmarkResults] = useState(null);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState(null);
  const fileInputRef = React.useRef(null);
  const folderInputRef = React.useRef(null);

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
        setError(
          'Could not reach the backend API. Make sure your Render backend service is live.'
        );
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
        setActionStatus('❌ Failed to generate a dataset. Check the backend terminal for errors.');
      })
      .finally(() => setBusy(false));
  };

  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  // Turns a filename like "report.final.docx" into ".docx"
  const getExtension = (filename) => {
    const idx = filename.lastIndexOf('.');
    return idx === -1 ? '.unknown' : filename.slice(idx).toLowerCase();
  };

  const MAX_SCAN_FILES = 8000; // keeps the browser responsive; raise only if your machine handles it well

  // Shared by both "Scan Real Files/Folder" and "Upload" (when given non-CSV files):
  // turns a raw browser FileList into a metadata CSV, processing in small batches
  // so large selections don't freeze the tab.
  const buildCsvFromRealFiles = async (rawFileList, labelPrefix) => {
    let fileList = rawFileList;
    let capped = false;
    if (fileList.length > MAX_SCAN_FILES) {
      fileList = fileList.slice(0, MAX_SCAN_FILES);
      capped = true;
    }

    const now = Date.now();
    const rows = [['file_id', 'file_type', 'file_size_mb', 'days_since_creation', 'days_since_last_accessed', 'access_count_30d']];

    const BATCH_SIZE = 500;
    for (let start = 0; start < fileList.length; start += BATCH_SIZE) {
      const batch = fileList.slice(start, start + BATCH_SIZE);
      batch.forEach((file, i) => {
        const index = start + i;
        const relativePath = file.webkitRelativePath || file.name;
        const sizeMb = (file.size / (1024 * 1024)).toFixed(3);
        const daysSinceModified = Math.max(0, Math.floor((now - file.lastModified) / (1000 * 60 * 60 * 24)));

        rows.push([
          `${labelPrefix}_${index + 1}_${relativePath.replace(/[,"]/g, '_')}`,
          getExtension(file.name),
          sizeMb,
          daysSinceModified,
          daysSinceModified,
          0,
        ]);
      });

      setActionStatus(`Processing files... ${Math.min(start + BATCH_SIZE, fileList.length)} / ${fileList.length}`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (capped) {
      setActionStatus(`⚠️ More than ${MAX_SCAN_FILES} files selected - only the first ${MAX_SCAN_FILES} were processed.`);
    }

    const csvContent = rows.map((row) => row.join(',')).join('\n');
    const csvBlob = new Blob([csvContent], { type: 'text/csv' });
    return { csvFile: new File([csvBlob], 'scanned_files.csv', { type: 'text/csv' }), count: fileList.length };
  };

  // Shared upload + auto-retrain + refresh pipeline
  const uploadCsvAndRetrain = (csvFile, successPrefix) => {
    const formData = new FormData();
    formData.append('file', csvFile);

    axios
      .post(UPLOAD_URL, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((res) => {
        setActionStatus(`✅ ${successPrefix} Retraining the AI on this data...`);
        return axios.post(RETRAIN_URL);
      })
      .then((res) => {
        setActionStatus(
          `✅ Done. Model accuracy on this data: ${res.data.accuracy_percent}%. Refreshing dashboard...`
        );
        fetchMetrics();
      })
      .catch((err) => {
        console.error(err);
        const message = err.response?.data?.error || 'Upload or retraining failed.';
        setActionStatus(`❌ ${message}`);
      })
      .finally(() => setBusy(false));
  };

  const handleFileChange = async (event) => {
    const selectedFiles = Array.from(event.target.files);
    if (selectedFiles.length === 0) return;

    setBusy(true);

    // If exactly one file was chosen and it's already a formatted metadata CSV,
    // upload it directly - this is the "advanced" path for people who already
    // have structured data.
    if (selectedFiles.length === 1 && selectedFiles[0].name.toLowerCase().endsWith('.csv')) {
      setActionStatus(`Uploading "${selectedFiles[0].name}"...`);
      uploadCsvAndRetrain(selectedFiles[0], `Uploaded "${selectedFiles[0].name}".`);
      event.target.value = '';
      return;
    }

    // Otherwise, treat whatever was selected as real files - build a dataset
    // from their real size/type/date automatically, same as folder scanning.
    setActionStatus(`Reading ${selectedFiles.length} file(s)...`);
    const { csvFile, count } = await buildCsvFromRealFiles(selectedFiles, 'UPLOAD');
    setActionStatus(`Uploading ${count} file(s)...`);
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
    setActionStatus(`Scanning ${fileList.length} real files from your folder...`);
    const { csvFile, count } = await buildCsvFromRealFiles(fileList, 'SCAN');
    setActionStatus(`Uploading ${count} scanned files...`);
    uploadCsvAndRetrain(csvFile, `Scanned and analyzed ${count} real files.`);
    event.target.value = '';
  };

  const handleRetrain = () => {
    setBusy(true);
    setActionStatus('Retraining the AI model on the current dataset...');
    axios
      .post(RETRAIN_URL)
      .then((res) => {
        setActionStatus(
          `✅ Model retrained. Validation accuracy: ${res.data.accuracy_percent}% ` +
          `(trained on ${res.data.training_rows} rows, tested on ${res.data.test_rows} rows). Refreshing results...`
        );
        fetchMetrics();
      })
      .catch((err) => {
        console.error(err);
        const message = err.response?.data?.error || 'Retraining failed.';
        setActionStatus(`❌ ${message}`);
      })
      .finally(() => setBusy(false));
  };

  const handleMigrate = () => {
    setBusy(true);
    setActionStatus('Migrating flagged dark files to cold storage...');
    axios
      .post(MIGRATE_URL)
      .then((res) => {
        setActionStatus(
          `✅ ${res.data.message} Real carbon prevented: ${(res.data.carbon_prevented_kg * 1000).toFixed(2)} g CO₂. Refreshing...`
        );
        fetchMetrics();
      })
      .catch((err) => {
        console.error(err);
        const message = err.response?.data?.error || 'Migration failed.';
        setActionStatus(`❌ ${message}`);
      })
      .finally(() => setBusy(false));
  };

  const handleAwsConnect = () => {
    setBusy(true);
    setActionStatus('Connecting to your AWS S3 bucket...');
    axios
      .post(AWS_CONNECT_URL)
      .then((res) => {
        setActionStatus(`✅ ${res.data.message} Retraining the AI on this real cloud data...`);
        return axios.post(RETRAIN_URL);
      })
      .then((res) => {
        setActionStatus(
          `✅ Connected and retrained. Model accuracy: ${res.data.accuracy_percent}%. Refreshing dashboard...`
        );
        fetchMetrics();
      })
      .catch((err) => {
        console.error(err);
        const message = err.response?.data?.error || 'Could not connect to AWS.';
        setActionStatus(`❌ ${message}`);
      })
      .finally(() => setBusy(false));
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
      .then((res) => {
        setBenchmarkResults(res.data.results);
      })
      .catch((err) => {
        console.error(err);
        setBenchmarkError(err.response?.data?.error || 'Benchmark failed to run.');
      })
      .finally(() => setBenchmarkRunning(false));
  };

  const datasetControls = (
    <section className="dataset-controls">
      <div className="dataset-controls-row">
        <button className="btn btn-primary" onClick={handleGenerate} disabled={busy}>
          🔄 Generate Sample Dataset
        </button>
        <button className="btn btn-secondary" onClick={handleUploadClick} disabled={busy}>
          📁 Upload Files (any type)
        </button>
        <button className="btn btn-tertiary" onClick={handleRetrain} disabled={busy}>
          🧠 Retrain Model on Current Dataset
        </button>
        <button className="btn btn-scan" onClick={handleFolderScanClick} disabled={busy}>
          📂 Scan Real Files / Folder
        </button>
        <button className="btn btn-migrate" onClick={handleMigrate} disabled={busy}>
          🗄️ Migrate Flagged Files to Cold Storage
        </button>
        <button className="btn btn-aws" onClick={handleAwsConnect} disabled={busy}>
          ☁️ Connect to AWS S3 Bucket
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: 'none' }}
          multiple
        />
        <input
          type="file"
          ref={folderInputRef}
          onChange={handleFolderScanChange}
          style={{ display: 'none' }}
          webkitdirectory="true"
          directory="true"
          multiple
        />
      </div>
      <label className="privacy-toggle">
        <input type="checkbox" checked={privacyMode} onChange={handlePrivacyToggle} disabled={busy} />
        🔒 Privacy Mode (anonymize file IDs)
      </label>
      {actionStatus && <p className="dataset-status">{actionStatus}</p>}
      <p className="dataset-hint">
        "Upload Files" accepts any regular files (photos, docs, anything) - just pick them and
        the system builds the dataset automatically from their real size, type, and date.
        If you already have a pre-formatted metadata CSV (file_id, file_type, file_size_mb,
        days_since_creation, days_since_last_accessed, access_count_30d), select that single
        file instead and it will be used directly.
      </p>
      <p className="dataset-hint">
        Note: Browsers don't expose a file's true creation date or access history, so age and
        last-accessed values are approximated from the file's last-modified date, and access
        counts default to 0.
      </p>
    </section>
  );

  const tabNav = (
    <nav className="tab-nav">
      <button
        className={`tab-btn ${activeTab === 'automation' ? 'tab-active' : ''}`}
        onClick={() => setActiveTab('automation')}
      >
        🤖 Automation System
      </button>
      <button
        className={`tab-btn ${activeTab === 'research' ? 'tab-active' : ''}`}
        onClick={() => setActiveTab('research')}
      >
        🔬 AI Research Lab
      </button>
    </nav>
  );

  const researchLab = (
    <section className="research-lab">
      <div className="dataset-controls">
        <h2>Multi-Model Green AI Performance Analysis</h2>
        <p className="dataset-hint" style={{ marginBottom: 16 }}>
          Trains 5 different classifier types on the same benchmark dataset and compares
          accuracy, F1 score, and estimated training carbon footprint - so you can justify
          which model is actually the best trade-off for this project.
        </p>
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
      </div>
    );
  }

  const { aggregates, files } = data;

  // For large datasets, rendering every single row (thousands of them) makes the
  // browser tab feel stuck. Instead, show the most relevant files first - anything
  // flagged by the AI, sorted by carbon impact - capped at a manageable number.
  // All the stat cards and charts above still reflect the FULL dataset, not just
  // what's shown in this table.
  const MAX_TABLE_ROWS = 300;
  const sortedFiles = [...files].sort((a, b) => {
    const aDark = a.automated_action !== 'Retain Active Tier' ? 1 : 0;
    const bDark = b.automated_action !== 'Retain Active Tier' ? 1 : 0;
    if (aDark !== bDark) return bDark - aDark; // flagged files first
    return b.carbon_kg - a.carbon_kg; // then highest carbon impact first
  });
  const displayedFiles = sortedFiles.slice(0, MAX_TABLE_ROWS);
  const tableTruncated = files.length > MAX_TABLE_ROWS;

  // Prepare data for the "Active vs Dark" pie chart
  const pieData = [
    { name: 'Active Files', value: aggregates.active_files_count },
    { name: 'Dark Data Files', value: aggregates.dark_files_count },
  ];
  const PIE_COLORS = ['#4ade80', '#f87171'];

  // Prepare data for the "Carbon Footprint by File Type" bar chart
  // Displayed in grams instead of kg - kg values are tiny and hard to read at this scale
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
            <StatCard
              label="Current Carbon Footprint"
              value={`${(aggregates.current_footprint_kg * 1000).toFixed(2)} g CO₂`}
            />
            <StatCard
              label="Prevented Emissions"
              value={`${(aggregates.prevented_emissions_kg * 1000).toFixed(2)} g CO₂`}
              highlight="good"
            />
            <StatCard
              label="Estimated Monthly Savings"
              value={`$${aggregates.estimated_monthly_roi_usd}`}
              highlight="good"
            />
          </section>

          <section className="charts-grid">
            <div className="chart-card">
              <h2>Active vs Dark Data</h2>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label
                  >
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
            <h2>File Details</h2>
            {tableTruncated && (
              <p className="dataset-hint" style={{ marginBottom: 12 }}>
                Showing the {MAX_TABLE_ROWS} most impactful files (flagged files first, sorted by
                carbon footprint) out of {files.length} total. All stats above reflect every file,
                not just what's shown here.
              </p>
            )}
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