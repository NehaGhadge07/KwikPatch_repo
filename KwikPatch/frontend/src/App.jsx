import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Check, AlertTriangle, RefreshCw, Moon, Sun, ArrowRight, Info, Calendar, Database, Download, ArrowLeft, Search, Plus, Edit2, X, Save, LogOut
} from 'lucide-react';

const API_BASE = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? "http://localhost:8000/api"
  : "/api";

const authFetch = async (url, options = {}) => {
  const token = localStorage.getItem('kwikpatch_token');
  if (token) {
    if (!options.headers) options.headers = {};
    if (!(options.body instanceof FormData)) {
      if (!options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json';
      }
    }
    options.headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, options);
  if (res.status === 401) {
    localStorage.removeItem('kwikpatch_token');
    localStorage.removeItem('kwikpatch_username');
  }
  return res;
};

// ─── Top-level auth UI components (MUST be outside App to keep stable identity) ───

function AuthCard({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg-primary)',
      fontFamily: 'var(--font-main)', padding: '20px', width: '100%'
    }}>
      <div className="glass-panel" style={{
        width: '100%', maxWidth: '420px', padding: '36px',
        display: 'flex', flexDirection: 'column', gap: '24px',
        animation: 'fadeIn 0.4s ease'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '12px',
            background: 'linear-gradient(135deg, var(--primary), #00b0ff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#050508', fontWeight: 'bold', fontSize: '1.4rem',
            fontFamily: 'var(--font-display)'
          }}>KP</div>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>KwikPatch</h2>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Compound Planning Dashboard</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function InputField({ label, type = 'text', value, onChange, placeholder, required = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</label>
      <input
        type={type}
        className="form-control"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '10px 12px' }}
        required={required}
      />
    </div>
  );
}



export default function App() {
  // ── Dashboard state ──────────────────────────────────────────────────────
  const [currentView, setCurrentView] = useState('master-sheet');
  const [theme, setTheme] = useState('dark');
  const [alert, setAlert] = useState(null);
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [currentSheetIdx, setCurrentSheetIdx] = useState(0);
  const [isUploadingMaster, setIsUploadingMaster] = useState(false);
  const [masterItems, setMasterItems] = useState([]);
  const [activeMasterItems, setActiveMasterItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sheetMappings, setSheetMappings] = useState([]);
  const [selectedCustId, setSelectedCustId] = useState(null);
  const [custPlanningData, setCustPlanningData] = useState(null);
  const [loadingPlanning, setLoadingPlanning] = useState(false);
  const [planningSearch, setPlanningSearch] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingPI, setIsEditingPI] = useState(false);
  const [editedRows, setEditedRows] = useState([]);
  const [isSavingPlanning, setIsSavingPlanning] = useState(false);
  const [showAddCustModal, setShowAddCustModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustConsignee, setNewCustConsignee] = useState('');
  const [isCreatingCust, setIsCreatingCust] = useState(false);
  const [calculationResult, setCalculationResult] = useState(null);

  // ── Auth state ───────────────────────────────────────────────────────────
  const [userToken, setUserToken] = useState(localStorage.getItem('kwikpatch_token') || null);
  const [username, setUsername] = useState(localStorage.getItem('kwikpatch_username') || '');

  // Screen: 'login' | 'register' | 'verify-email' | 'verify-login'
  const [authScreen, setAuthScreen] = useState('login');

  // Registration fields
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regMobile, setRegMobile] = useState('');

  // Login field
  const [loginEmail, setLoginEmail] = useState('');

  // Shared OTP
  const [otpCode, setOtpCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');

  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // ── showAlert helper (must come before all effects) ─────────────────────
  const showAlert = (message, type = 'success') => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 5000);
  };

  // ── Resend cooldown timer ────────────────────────────────────────────────
  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCooldown]);

  // ── Registration: Send OTP ───────────────────────────────────────────────
  const handleRegisterSendOtp = async (e) => {
    e.preventDefault();
    if (!regUsername.trim() || !regEmail.trim()) {
      showAlert("Username and email are required.", "error");
      return;
    }
    setIsAuthLoading(true);
    try {
      console.log("Sending register OTP to backend...");
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: regUsername.trim(), email: regEmail.trim().toLowerCase(), mobile: regMobile.trim() })
      });
      const data = await res.json();
      console.log("Register response:", res.status, data);
      if (res.ok) {
        setPendingEmail(data.email);
        setOtpCode('');
        setResendCooldown(60);
        setAuthScreen('verify-email');
        showAlert(data.message, "success");
      } else {
        showAlert(data.detail || "Registration failed.", "error");
      }
    } catch (err) {
      console.error("Register OTP error:", err);
      showAlert("Network error. Please try again.", "error");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // ── Registration: Verify Email OTP ──────────────────────────────────────
  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    if (otpCode.length !== 6) { showAlert("Enter the 6-digit OTP.", "error"); return; }
    setIsAuthLoading(true);
    try {
      console.log("Verifying email OTP...");
      const res = await fetch(`${API_BASE}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, otp: otpCode })
      });
      const data = await res.json();
      if (res.ok) {
        showAlert(data.message, "success");
        setOtpCode('');
        setAuthScreen('login');
        setLoginEmail(pendingEmail);
      } else {
        showAlert(data.detail || "Verification failed.", "error");
      }
    } catch (err) {
      console.error("Verify email error:", err);
      showAlert("Network error. Please try again.", "error");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // ── Login: Send OTP ──────────────────────────────────────────────────────
  const handleLoginSendOtp = async (e) => {
    e.preventDefault();
    if (!loginEmail.trim()) { showAlert("Email is required.", "error"); return; }
    setIsAuthLoading(true);
    try {
      console.log("Sending login OTP to backend...");
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim().toLowerCase() })
      });
      const data = await res.json();
      console.log("Login OTP response:", res.status, data);
      if (res.ok) {
        setPendingEmail(loginEmail.trim().toLowerCase());
        setOtpCode('');
        setResendCooldown(60);
        setAuthScreen('verify-login');
        showAlert(data.message, "success");
      } else {
        showAlert(data.detail || "Login failed.", "error");
      }
    } catch (err) {
      console.error("Login OTP error:", err);
      showAlert("Network error. Please try again.", "error");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // ── Login: Verify Login OTP ──────────────────────────────────────────────
  const handleVerifyLogin = async (e) => {
    e.preventDefault();
    if (otpCode.length !== 6) { showAlert("Enter the 6-digit OTP.", "error"); return; }
    setIsAuthLoading(true);
    try {
      console.log("Verifying login OTP...");
      const res = await fetch(`${API_BASE}/auth/verify-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, otp: otpCode })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('kwikpatch_token', data.token);
        localStorage.setItem('kwikpatch_username', data.username);
        setUserToken(data.token);
        setUsername(data.username);
        showAlert("Welcome! Signed in successfully.", "success");
      } else {
        showAlert(data.detail || "Verification failed.", "error");
      }
    } catch {
      showAlert("Network error. Please try again.", "error");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('kwikpatch_token');
    localStorage.removeItem('kwikpatch_username');
    setUserToken(null);
    setUsername('');
    setAuthScreen('login');
  };

  // ── Resend OTP ───────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    const purpose = authScreen === 'verify-email' ? 'register' : 'login';
    setIsAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, purpose })
      });
      const data = await res.json();
      if (res.ok) {
        setResendCooldown(60);
        showAlert(data.message, "success");
      } else {
        showAlert(data.detail || "Resend failed.", "error");
      }
    } catch {
      showAlert("Network error.", "error");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // ─── Auth screens ─────────────────────────────────────────────────────────





  const fileInputRef = useRef(null);

  const masterWorkbookInputRef = useRef(null);

  // Initialize

  useEffect(() => {

    document.documentElement.setAttribute('data-theme', theme);

  }, [theme]);

  // Fetch customer-specific active master planning items when mappings sheet changes

  useEffect(() => {

    if (sheetMappings.length > 0 && currentSheetIdx < sheetMappings.length) {

      const activeSheet = sheetMappings[currentSheetIdx];

      if (activeSheet.customer_id) {

        fetchActiveMasterItems(activeSheet.customer_id);

      }

    }

  }, [currentSheetIdx, sheetMappings]);

  const fetchActiveMasterItems = async (customerId) => {

    try {

      const res = await authFetch(`${API_BASE}/master-items?customer_id=${customerId}`);

      if (res.ok) {

        const data = await res.json();

        setActiveMasterItems(data);

      }

    } catch (err) {

      console.error("Error fetching active master items:", err);

    }

  };

  useEffect(() => {
    if (!userToken) return;
    fetchMasterData();
    initCustomers();
  }, [userToken]);


  const fetchMasterData = async () => {

    try {

      const res = await authFetch(`${API_BASE}/master-items`);

      if (res.ok) {

        const data = await res.json();

        setMasterItems(data);

      }

    } catch (err) {

      console.error("Error fetching master items:", err);

    }

  };

  const initCustomers = async () => {

    try {

      const res = await authFetch(`${API_BASE}/customers`);

      if (res.ok) {

        const data = await res.json();

        setCustomers(data);

        if (data.length > 0) {

          fetchCustomerPlanning(data[0].id);

        }

      }

    } catch (err) {

      console.error("Error initializing customers:", err);

    }

  };

  const fetchCustomerPlanning = async (id) => {

    setLoadingPlanning(true);

    setSelectedCustId(id);

    setIsEditing(false);

    try {

      const res = await authFetch(`${API_BASE}/customers/${id}/planning`);

      if (res.ok) {

        const data = await res.json();

        setCustPlanningData(data);

        setEditedRows(data.rows);

      } else {

        showAlert("Error loading customer planning data", "error");

        setSelectedCustId(null);

      }

    } catch (err) {

      showAlert("Network error fetching planning data", "error");

      setSelectedCustId(null);

    } finally {

      setLoadingPlanning(false);

    }

  };

  // Upload handlers for PI

  const handleDragOver = (e) => {

    e.preventDefault();

  };

  const handleDrop = (e) => {

    e.preventDefault();

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {

      setFile(e.dataTransfer.files[0]);

    }

  };

  const handleFileSelect = (e) => {

    if (e.target.files && e.target.files[0]) {

      setFile(e.target.files[0]);

    }

  };

  const uploadFile = async () => {

    if (!file) return;

    setIsUploading(true);

    const formData = new FormData();

    formData.append("file", file);

    try {

      const res = await authFetch(`${API_BASE}/upload-pi`, {

        method: "POST",

        body: formData

      });

      const data = await res.json();

      if (res.ok) {

        showAlert("PI parsed successfully! Please review mappings.");

        setUploadResult(data.uploads);

        const initialMappings = data.uploads.map(sheet => ({

          upload_id: sheet.upload_id,

          customer_name: sheet.customer_name,

          pi_number: sheet.pi_number,

          sheet_name: sheet.sheet_name,

          consignee_info: sheet.consignee_info,

          items: sheet.items.map(item => ({

            product_code: item.product_code,

            product_desc: item.matched_planning_item || item.product_desc,

            quantity: item.quantity,

            matched_planning_item: item.matched_planning_item || ""

          }))

        }));

        setSheetMappings(initialMappings);

        setCurrentSheetIdx(0);

        setCurrentView('mapping');

      } else {

        showAlert(data.detail || "Upload failed", "error");

      }

    } catch (err) {

      showAlert("Network error during upload", "error");

    } finally {

      setIsUploading(false);

    }

  };

  // Upload handler for Master Planning Workbook

  const handleMasterWorkbookDragOver = (e) => {

    e.preventDefault();

  };

  const handleMasterWorkbookDrop = (e) => {

    e.preventDefault();

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {

      uploadMasterWorkbook(e.dataTransfer.files[0]);

    }

  };

  const handleMasterWorkbookSelect = (e) => {

    if (e.target.files && e.target.files[0]) {

      uploadMasterWorkbook(e.target.files[0]);

    }

  };

  const uploadMasterWorkbook = async (selectedFile) => {

    setIsUploadingMaster(true);

    const formData = new FormData();

    formData.append("file", selectedFile);

    try {

      const res = await authFetch(`${API_BASE}/upload-master-workbook`, {

        method: "POST",

        body: formData

      });

      const data = await res.json();

      if (res.ok) {

        showAlert("Master Planning Workbook uploaded and synchronized successfully!");

        // Refresh customers list and load first customer

        const custRes = await authFetch(`${API_BASE}/customers`);

        if (custRes.ok) {

          const custs = await custRes.json();

          setCustomers(custs);

          if (custs.length > 0) {

            fetchCustomerPlanning(custs[0].id);

          }

        }

        fetchMasterData();

      } else {

        showAlert(data.detail || "Failed to upload master workbook", "error");

      }

    } catch (err) {

      showAlert("Network error uploading master workbook", "error");

    } finally {

      setIsUploadingMaster(false);

    }

  };

  // Add Customer handler

  const handleCreateCustomer = async (e) => {

    e.preventDefault();

    if (!newCustName.replace(/^\s+|\s+$/g, "")) return;

    setIsCreatingCust(true);

    try {

      const res = await authFetch(`${API_BASE}/customers`, {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          name: newCustName.replace(/^\s+|\s+$/g, ""),

          consignee_info: newCustConsignee

        })

      });

      const data = await res.json();

      if (res.ok) {

        showAlert(`Customer "${newCustName}" created successfully! Dedicate sheet tab added in Excel.`);

        setShowAddCustModal(false);

        setNewCustName('');

        setNewCustConsignee('');

        // Refresh customers list and load the newly created customer

        const custRes = await authFetch(`${API_BASE}/customers`);

        if (custRes.ok) {

          const custs = await custRes.json();

          setCustomers(custs);

          const newCust = custs.find(c => c.name.toUpperCase() === data.name.toUpperCase());

          if (newCust) {

            fetchCustomerPlanning(newCust.id);

          } else if (custs.length > 0) {

            fetchCustomerPlanning(custs[0].id);

          }

        }

      } else {

        showAlert(data.detail || "Failed to create customer", "error");

      }

    } catch (err) {

      showAlert("Network error creating customer", "error");

    } finally {

      setIsCreatingCust(false);

    }

  };

  // Inline grid cell update

  const handleCellChange = (rowIndex, field, value) => {

    const updated = [...editedRows];

    updated[rowIndex] = { ...updated[rowIndex], [field]: value };

    setEditedRows(updated);

  };

  // Save modified planning rows to server/Excel

  const savePlanningEdits = async () => {

    if (!selectedCustId) return;

    setIsSavingPlanning(true);

    try {

      const res = await authFetch(`${API_BASE}/customers/${selectedCustId}/planning/save`, {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ rows: editedRows })

      });

      const data = await res.json();

      if (res.ok) {

        showAlert("Calculations updated and saved directly to Excel successfully!");

        setIsEditing(false);

        fetchCustomerPlanning(selectedCustId);

      } else {

        showAlert(data.detail || "Failed to save edits", "error");

      }

    } catch (err) {

      showAlert("Network error saving planning data", "error");

    } finally {

      setIsSavingPlanning(false);

    }

  };

  // Mapping update handlers for PI

  const handleMappingChange = (sheetIdx, itemIdx, val) => {

    const updated = [...sheetMappings];

    updated[sheetIdx].items[itemIdx].matched_planning_item = val;

    setSheetMappings(updated);

  };

  const handlePIItemChange = (idx, field, value) => {

    const updated = [...sheetMappings];

    updated[currentSheetIdx].items[idx][field] = value;

    setSheetMappings(updated);

  };

  const submitMappings = async (sheetIdx) => {

    const sheetData = sheetMappings[sheetIdx];

    // Map planning item name directly to the product description (clean whitespace)

    const confirmedItems = sheetData.items.map(item => ({

      ...item,

      matched_planning_item: (item.product_desc || '').trim()

    }));

    try {

      const res = await authFetch(`${API_BASE}/process-planning`, {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          customer_name: sheetData.customer_name,

          upload_id: sheetData.upload_id,

          confirmed_mappings: confirmedItems

        })

      });

      const data = await res.json();

      if (res.ok) {

        showAlert(`Successfully calculated required weights for ${sheetData.customer_name}!`);

        if (sheetIdx < sheetMappings.length - 1) {

          setCurrentSheetIdx(sheetIdx + 1);

        } else {

          setUploadResult(null);

          setFile(null);

          setCalculationResult(data);

          setCurrentView('calculation-result');

        }

      } else {

        showAlert(data.detail || "Failed to process planning", "error");

      }

    } catch (err) {

      showAlert("Network error processing sheet", "error");

    }

  };

  // Filter planning table rows

  const filteredPlanningRows = (isEditing ? editedRows : (custPlanningData ? custPlanningData.rows : []))

    .filter(row => 

      (row.item_name && row.item_name.toUpperCase().includes(planningSearch.toUpperCase())) ||

      (row.die_name && row.die_name.toUpperCase().includes(planningSearch.toUpperCase()))

    );



  if (!userToken) {
    // ── Registration Screen ────────────────────────────────────────────────
    if (authScreen === 'register') return (
      <AuthCard>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Create Account</h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Fill in your details to register</p>
        </div>
        {alert && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: alert.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', color: alert.type === 'error' ? 'var(--danger)' : 'var(--success)', fontSize: '0.85rem', marginBottom: '14px' }}>
            {alert.message}
          </div>
        )}
        <form onSubmit={handleRegisterSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <InputField label="Username" value={regUsername} onChange={setRegUsername} placeholder="Enter your name" required />
          <InputField label="Email ID" type="email" value={regEmail} onChange={setRegEmail} placeholder="Enter email ID" required />
          <InputField label="Mobile Number" type="tel" value={regMobile} onChange={setRegMobile} placeholder="Enter mobile number (optional)" />
          <button type="submit" className="btn btn-primary" disabled={isAuthLoading}
            style={{ width: '100%', padding: '12px', justifyContent: 'center', fontWeight: 600, marginTop: '4px' }}>
            {isAuthLoading ? <RefreshCw className="spinner" size={18} /> : 'Send OTP'}
          </button>
        </form>
        <div style={{ textAlign: 'center', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
          Already registered?{' '}
          <button type="button" onClick={() => setAuthScreen('login')}
            style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            Sign In
          </button>
        </div>
      </AuthCard>
    );

    // ── Verify Email OTP ───────────────────────────────────────────────────
    if (authScreen === 'verify-email') return (
      <AuthCard>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Verify Your Email</h3>
          <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            A 6-digit code was sent to <b>{pendingEmail}</b>
          </p>
        </div>
        {alert && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: alert.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', color: alert.type === 'error' ? 'var(--danger)' : 'var(--success)', fontSize: '0.85rem' }}>
            {alert.message}
          </div>
        )}
        <form onSubmit={handleVerifyEmail} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input
            type="text" className="form-control" value={otpCode}
            onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
            placeholder="Enter 6-digit OTP" maxLength={6}
            style={{ width: '100%', padding: '14px', textAlign: 'center', fontSize: '1.6rem', letterSpacing: '8px', fontWeight: 700 }}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={isAuthLoading || otpCode.length !== 6}
            style={{ width: '100%', padding: '12px', justifyContent: 'center', fontWeight: 600 }}>
            {isAuthLoading ? <RefreshCw className="spinner" size={18} /> : 'Verify Email'}
          </button>
        </form>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
          <button type="button" onClick={() => setAuthScreen('register')}
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Back
          </button>
          <button type="button" onClick={handleResend} disabled={isAuthLoading || resendCooldown > 0}
            style={{ color: resendCooldown > 0 ? 'var(--text-muted)' : 'var(--primary)', background: 'none', border: 'none', cursor: resendCooldown > 0 ? 'default' : 'pointer', fontWeight: 600 }}>
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
          </button>
        </div>
      </AuthCard>
    );

    // ── Verify Login OTP ───────────────────────────────────────────────────
    if (authScreen === 'verify-login') return (
      <AuthCard>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Enter Sign In Code</h3>
          <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            A 6-digit code was sent to <b>{pendingEmail}</b>
          </p>
        </div>
        {alert && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: alert.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', color: alert.type === 'error' ? 'var(--danger)' : 'var(--success)', fontSize: '0.85rem' }}>
            {alert.message}
          </div>
        )}
        <form onSubmit={handleVerifyLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input
            type="text" className="form-control" value={otpCode}
            onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
            placeholder="Enter 6-digit OTP" maxLength={6}
            style={{ width: '100%', padding: '14px', textAlign: 'center', fontSize: '1.6rem', letterSpacing: '8px', fontWeight: 700 }}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={isAuthLoading || otpCode.length !== 6}
            style={{ width: '100%', padding: '12px', justifyContent: 'center', fontWeight: 600 }}>
            {isAuthLoading ? <RefreshCw className="spinner" size={18} /> : 'Verify & Sign In'}
          </button>
        </form>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
          <button type="button" onClick={() => setAuthScreen('login')}
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Back
          </button>
          <button type="button" onClick={handleResend} disabled={isAuthLoading || resendCooldown > 0}
            style={{ color: resendCooldown > 0 ? 'var(--text-muted)' : 'var(--primary)', background: 'none', border: 'none', cursor: resendCooldown > 0 ? 'default' : 'pointer', fontWeight: 600 }}>
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
          </button>
        </div>
      </AuthCard>
    );

    // ── Login Screen (default) ─────────────────────────────────────────────
    return (
      <AuthCard>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Sign In</h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Enter your registered email to receive an OTP</p>
        </div>
        {alert && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: alert.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', color: alert.type === 'error' ? 'var(--danger)' : 'var(--success)', fontSize: '0.85rem' }}>
            {alert.message}
          </div>
        )}
        <form onSubmit={handleLoginSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <InputField label="Email ID" type="email" value={loginEmail} onChange={setLoginEmail} placeholder="Enter registered email" required />
          <button type="submit" className="btn btn-primary" disabled={isAuthLoading}
            style={{ width: '100%', padding: '12px', justifyContent: 'center', fontWeight: 600, marginTop: '4px' }}>
            {isAuthLoading ? <RefreshCw className="spinner" size={18} /> : 'Send OTP'}
          </button>
        </form>
        <div style={{ textAlign: 'center', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
          New user?{' '}
          <button type="button" onClick={() => setAuthScreen('register')}
            style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            Create Account
          </button>
        </div>
      </AuthCard>
    );
  }

  return (

    <div className="dashboard-root" style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>

      {/* Sidebar Navigation */}

      <aside style={{

        width: '260px',

        background: 'var(--bg-secondary)',

        borderRight: '1px solid var(--border-color)',

        padding: '24px',

        display: 'flex',

        flexDirection: 'column',

        gap: '24px',

        position: 'sticky',

        top: 0,

        height: '100vh'

      }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

          <div style={{

            width: '40px',

            height: '40px',

            borderRadius: '10px',

            background: 'linear-gradient(135deg, var(--primary), #00b0ff)',

            display: 'flex',

            alignItems: 'center',

            justifyContent: 'center',

            color: '#050508',

            fontWeight: 'bold',

            fontSize: '1.2rem',

            fontFamily: 'var(--font-display)'

          }}>KP</div>

          <div>

            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>KwikPatch</h2>

            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Compound Planning</span>

          </div>

        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, marginTop: '20px' }}>

          <button 

            className={`btn ${currentView === 'upload' ? 'btn-primary' : 'btn-secondary'}`}

            onClick={() => { setCalculationResult(null); setCurrentView('upload'); }}

            style={{ justifyContent: 'flex-start', width: '100%', padding: '12px 16px' }}

          >

            <Upload size={18} /> Upload PI

          </button>

          <button 

            className={`btn ${currentView === 'master-sheet' ? 'btn-primary' : 'btn-secondary'}`}

            onClick={() => { setCalculationResult(null); initCustomers(); setCurrentView('master-sheet'); }}

            style={{ justifyContent: 'flex-start', width: '100%', padding: '12px 16px' }}

          >

            <Database size={18} /> Master Planning Sheet

          </button>

        </nav>

        {/* Bottom Utility */}
        
        <button
          onClick={handleSignOut}
          className="btn btn-secondary"
          style={{ width: '100%', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
        >
          <LogOut size={16} /> Sign Out
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>

          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>v3.3.0</span>

          <button 

            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}

            className="btn btn-secondary" 

            style={{ padding: '8px', borderRadius: '50%' }}

          >

            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}

          </button>

        </div>

      </aside>

      {/* Main Content Area */}

      <main style={{ flex: 1, padding: '40px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '30px' }}>

        {/* Alert Banner */}

        {alert && (

          <div className="glass-panel" style={{

            padding: '16px 20px',

            borderLeft: `4px solid ${alert.type === 'error' ? 'var(--danger)' : 'var(--success)'}`,

            display: 'flex',

            alignItems: 'center',

            gap: '12px',

            animation: 'fadeIn 0.3s ease'

          }}>

            {alert.type === 'error' ? <AlertTriangle color="var(--danger)" /> : <Check color="var(--success)" />}

            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{alert.message}</span>

          </div>

        )}

        {/* View: Master Planning Sheet Upload & Grid Viewer */}

        {currentView === 'master-sheet' && (

          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>

            {customers.length === 0 ? (

              /* State 1: Dropzone for Upload if empty */

              <div style={{ maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '30px' }}>

                <div>

                  <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Upload Master Planning File</h1>

                  <p style={{ color: 'var(--text-secondary)' }}>

                    Upload the main "Compound Planing file.xlsx" spreadsheet to sync and load customer definitions into the database.

                  </p>

                </div>

                <div 

                  onDragOver={handleMasterWorkbookDragOver}

                  onDrop={handleMasterWorkbookDrop}

                  onClick={() => masterWorkbookInputRef.current.click()}

                  className="glass-panel"

                  style={{

                    height: '240px',

                    border: '2px dashed var(--border-color)',

                    display: 'flex',

                    flexDirection: 'column',

                    alignItems: 'center',

                    justifyContent: 'center',

                    gap: '16px',

                    cursor: 'pointer',

                    borderRadius: 'var(--radius-lg)'

                  }}

                >

                  <input 

                    type="file" 

                    ref={masterWorkbookInputRef} 

                    onChange={handleMasterWorkbookSelect} 

                    accept=".xlsx" 

                    style={{ display: 'none' }} 

                  />

                  <div style={{

                    width: '64px',

                    height: '64px',

                    borderRadius: '50%',

                    background: 'var(--primary-glow)',

                    color: 'var(--primary)',

                    display: 'flex',

                    alignItems: 'center',

                    justifyContent: 'center'

                  }}>

                    <Database size={28} />

                  </div>

                  <div style={{ textAlign: 'center' }}>

                    <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>

                      {isUploadingMaster ? "Uploading & Processing..." : "Drag & Drop Compound Planning File Here"}

                    </p>

                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>

                      Select or drop your "Compound Planing file.xlsx" sheet (Supports .xlsx)

                    </p>

                  </div>

                </div>

              </div>

            ) : (

              /* State 2: Fully populated spreadsheet viewer with Edit / Save / Add Customer buttons */

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>

                  <div>

                    <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Master Planning Sheets</h1>

                    <p style={{ color: 'var(--text-secondary)' }}>Select any customer tab to verify and edit their compound planning data.</p>

                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>

                    <input 

                      type="file" 

                      ref={masterWorkbookInputRef} 

                      onChange={handleMasterWorkbookSelect} 

                      accept=".xlsx" 

                      style={{ display: 'none' }} 

                    />

                    {/* Mode-based Buttons */}

                    {!isEditing ? (

                      <>

                        <button className="btn btn-secondary" onClick={() => setIsEditing(true)}>

                          <Edit2 size={16} /> Edit

                        </button>

                        <button className="btn btn-primary" onClick={() => setShowAddCustModal(true)}>

                          <Plus size={16} /> Add New Customer

                        </button>

                        <button 

                          className="btn btn-secondary" 

                          onClick={() => masterWorkbookInputRef.current.click()}

                          disabled={isUploadingMaster}

                          style={{ padding: '10px 14px' }}

                        >

                          {isUploadingMaster ? <RefreshCw className="animate-spin" size={16} /> : <Upload size={16} />}

                          Update Master File

                        </button>

                      </>

                    ) : (

                      <>

                        <button 

                          className="btn btn-success" 

                          onClick={savePlanningEdits}

                          disabled={isSavingPlanning}

                        >

                          {isSavingPlanning ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}

                          {isSavingPlanning ? "Saving..." : "Save"}

                        </button>

                        <button 

                          className="btn btn-secondary" 

                          onClick={() => { setIsEditing(false); if (selectedCustId) fetchCustomerPlanning(selectedCustId); }}

                          disabled={isSavingPlanning}

                        >

                          <X size={16} /> Cancel

                        </button>

                      </>

                    )}

                  </div>

                </div>

                <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>

                    {/* Customer tab dropdown selector */}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

                      <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Customer Sheet:</span>

                      <select 

                        className="input-field"

                        value={selectedCustId || ""}

                        disabled={isEditing}

                        onChange={(e) => {

                          const val = e.target.value;

                          if (val) {

                            fetchCustomerPlanning(parseInt(val));

                          } else {

                            setSelectedCustId(null);

                            setCustPlanningData(null);

                          }

                        }}

                        style={{ width: '250px', background: 'var(--bg-primary)' }}

                      >

                        <option value="">-- Choose customer --</option>

                        {customers.map((c) => (

                          <option key={c.id} value={c.id}>{c.name}</option>

                        ))}

                      </select>

                    </div>

                    {selectedCustId && (

                      <div style={{ position: 'relative', width: '300px' }}>

                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-muted)' }} />

                        <input 

                          type="text"

                          placeholder="Search Item Name..."

                          value={planningSearch}

                          disabled={isEditing}

                          onChange={(e) => setPlanningSearch(e.target.value)}

                          className="input-field"

                          style={{ paddingLeft: '38px' }}

                        />

                      </div>

                    )}

                  </div>

                  {loadingPlanning ? (

                    <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>

                      <RefreshCw className="animate-spin" size={24} color="var(--primary)" />

                      <span>Loading planning worksheet...</span>

                    </div>

                  ) : custPlanningData ? (

                    <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', maxHeight: '600px', overflowY: 'auto' }}>

                      <table className="custom-table" style={{ fontSize: '0.8rem' }}>

                        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>

                          <tr>

                            <th>Item Name</th>

                            <th>Compound</th>

                            <th>Side</th>

                            <th>Thou</th>

                            <th>Die Type</th>

                            <th>Die Name</th>

                            <th>Die Size (MM)</th>

                            <th>Comp Size (Inch)</th>

                            <th>Per Sheet Item</th>

                            <th style={{ background: 'rgba(0,229,255,0.03)', color: 'var(--primary)' }}>order</th>

                            <th>Required Sheet</th>

                            <th>Per Sheet Gm</th>

                            <th>Weight in Gm</th>

                            <th>Total kg</th>

                          </tr>

                        </thead>

                        <tbody>

                          {filteredPlanningRows.map((row, idx) => (

                            <tr 

                              key={idx} 

                              style={{ 

                                opacity: row.is_required ? 1 : 0.4, 

                                fontStyle: row.is_required ? 'normal' : 'italic',

                                background: row.order_qty ? 'rgba(0, 230, 118, 0.03)' : 'transparent'

                              }}

                            >

                              {/* Inline edit checks with custom widths and padding */}

                              {isEditing ? (

                                <>

                                  <td>

                                    {row.item_name ? (

                                      <input 

                                        type="text" 

                                        value={row.item_name} 

                                        onChange={(e) => handleCellChange(idx, 'item_name', e.target.value)} 

                                        className="input-field"

                                        style={{ padding: '4px 6px', fontSize: '0.8rem', width: '120px' }}

                                      />

                                    ) : null}

                                  </td>

                                  <td>

                                    <input 

                                      type="text" 

                                      value={row.compound || ''} 

                                      onChange={(e) => handleCellChange(idx, 'compound', e.target.value)} 

                                      className="input-field"

                                      style={{ padding: '4px 6px', fontSize: '0.8rem', width: '80px' }}

                                    />

                                  </td>

                                  <td>

                                    <select 

                                      value={row.side || ''} 

                                      onChange={(e) => handleCellChange(idx, 'side', e.target.value)} 

                                      className="input-field"

                                      style={{ padding: '4px 6px', fontSize: '0.8rem', background: 'var(--bg-primary)', width: '90px' }}

                                    >

                                      <option value="-">-</option>

                                      <option value="Top">Top</option>

                                      <option value="Bottom">Bottom</option>

                                      <option value="Single">Single</option>

                                      <option value="Passing">Passing</option>

                                    </select>

                                  </td>

                                  <td>

                                    <input 

                                      type="number" 

                                      value={row.thou || ''} 

                                      onChange={(e) => handleCellChange(idx, 'thou', e.target.value)} 

                                      className="input-field"

                                      style={{ padding: '4px 6px', fontSize: '0.8rem', width: '70px' }}

                                    />

                                  </td>

                                  <td>

                                    <input 

                                      type="text" 

                                      value={row.die_type || ''} 

                                      onChange={(e) => handleCellChange(idx, 'die_type', e.target.value)} 

                                      className="input-field"

                                      style={{ padding: '4px 6px', fontSize: '0.8rem', width: '100px' }}

                                    />

                                  </td>

                                  <td>

                                    <input 

                                      type="text" 

                                      value={row.die_name || ''} 

                                      onChange={(e) => handleCellChange(idx, 'die_name', e.target.value)} 

                                      className="input-field"

                                      style={{ padding: '4px 6px', fontSize: '0.8rem', width: '130px' }}

                                    />

                                  </td>

                                  <td>

                                    <input 

                                      type="text" 

                                      value={row.die_size || ''} 

                                      onChange={(e) => handleCellChange(idx, 'die_size', e.target.value)} 

                                      className="input-field"

                                      style={{ padding: '4px 6px', fontSize: '0.8rem', width: '95px' }}

                                    />

                                  </td>

                                  <td>

                                    <input 

                                      type="text" 

                                      value={row.comp_sheet_size || ''} 

                                      onChange={(e) => handleCellChange(idx, 'comp_sheet_size', e.target.value)} 

                                      className="input-field"

                                      style={{ padding: '4px 6px', fontSize: '0.8rem', width: '95px' }}

                                    />

                                  </td>

                                  <td>

                                    <input 

                                      type="number" 

                                      value={row.per_sheet_item || ''} 

                                      onChange={(e) => handleCellChange(idx, 'per_sheet_item', e.target.value)} 

                                      className="input-field"

                                      style={{ padding: '4px 6px', fontSize: '0.8rem', width: '75px' }}

                                    />

                                  </td>

                                  <td>

                                    <input 

                                      type="number" 

                                      value={row.order_qty || ''} 

                                      onChange={(e) => handleCellChange(idx, 'order_qty', e.target.value)} 

                                      className="input-field"

                                      style={{ padding: '4px 6px', fontSize: '0.8rem', width: '85px' }}

                                    />

                                  </td>

                                  <td>{row.required_sheet || ''}</td>

                                  <td>

                                    <input 

                                      type="text" 

                                      value={row.per_sheet_gm || ''} 

                                      onChange={(e) => handleCellChange(idx, 'per_sheet_gm', e.target.value)} 

                                      className="input-field"

                                      style={{ padding: '4px 6px', fontSize: '0.8rem', width: '100px' }}

                                    />

                                  </td>

                                  <td>{row.per_sheet_weight_gm || ''}</td>

                                  <td>{row.total_kg ? `${row.total_kg} kg` : ''}</td>

                                </>

                              ) : (

                                <>

                                  <td style={{ fontWeight: 600 }}>{row.item_name || ''}</td>

                                  <td>{row.compound || ''}</td>

                                  <td style={{ color: row.side === 'Top' ? 'var(--primary)' : row.side === 'Bottom' ? 'var(--warning)' : 'inherit' }}>

                                    {row.side || ''}

                                  </td>

                                  <td>{row.thou || ''}</td>

                                  <td>{row.die_type || ''}</td>

                                  <td>{row.die_name || ''}</td>

                                  <td>{row.die_size || ''}</td>

                                  <td>{row.comp_sheet_size || ''}</td>

                                  <td>{row.per_sheet_item || ''}</td>

                                  <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{row.order_qty || ''}</td>

                                  <td>{row.required_sheet || ''}</td>

                                  <td>{row.per_sheet_gm || ''}</td>

                                  <td>{row.per_sheet_weight_gm || ''}</td>

                                  <td style={{ fontWeight: 'bold', color: 'var(--success)' }}>

                                    {row.total_kg ? `${row.total_kg} kg` : ''}

                                  </td>

                                </>

                              )}

                            </tr>

                          ))}

                        </tbody>

                      </table>

                    </div>

                  ) : (

                    <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>

                      Please select a customer worksheet from the dropdown to verify compound planning details.

                    </div>

                  )}

                </div>

              </div>

            )}

            {/* Modal: Add Customer with Compound Planning */}

            {showAddCustModal && (

              <div style={{

                position: 'fixed',

                top: 0,

                left: 0,

                right: 0,

                bottom: 0,

                background: 'rgba(0,0,0,0.7)',

                display: 'flex',

                alignItems: 'center',

                justifyContent: 'center',

                zIndex: 1000,

                backdropFilter: 'blur(4px)'

              }}>

                <form 

                  onSubmit={handleCreateCustomer}

                  className="glass-panel" 

                  style={{

                    width: '100%',

                    maxWidth: '500px',

                    padding: '30px',

                    display: 'flex',

                    flexDirection: 'column',

                    gap: '20px',

                    animation: 'fadeIn 0.2s ease'

                  }}

                >

                  <h3 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)' }}>Add New Customer</h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>

                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Customer Name</label>

                    <input 

                      type="text" 

                      required 

                      className="input-field" 

                      placeholder="e.g. VOLGA, CELEBI, MYERS"

                      value={newCustName}

                      onChange={(e) => setNewCustName(e.target.value)}

                    />

                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>

                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Consignee Address Information</label>

                    <textarea 

                      rows={4}

                      className="input-field" 

                      placeholder="Full delivery address, contacts, Vat id details..."

                      value={newCustConsignee}

                      onChange={(e) => setNewCustConsignee(e.target.value)}

                      style={{ resize: 'vertical' }}

                    />

                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>

                    <button 

                      type="button" 

                      className="btn btn-secondary" 

                      onClick={() => { setShowAddCustModal(false); setNewCustName(''); setNewCustConsignee(''); }}

                    >

                      Cancel

                    </button>

                    <button 

                      type="submit" 

                      className="btn btn-primary"

                      disabled={isCreatingCust}

                    >

                      {isCreatingCust ? <RefreshCw className="animate-spin" size={16} /> : null}

                      {isCreatingCust ? "Creating..." : "Create Customer"}

                    </button>

                  </div>

                </form>

              </div>

            )}

          </div>

        )}

        {/* View: Calculation Result Output (Post-Mapping Page) */}

        {currentView === 'calculation-result' && calculationResult && (

          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

              <div>

                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Calculation Output Results</h1>

                <p style={{ color: 'var(--text-secondary)' }}>

                  Successfully calculated required compound weights for <strong>{calculationResult.customer_name}</strong>.

                </p>

              </div>

              <button 

                className="btn btn-secondary" 

                onClick={() => { setCalculationResult(null); setCurrentView('upload'); }}

              >

                <ArrowLeft size={16} /> Back to Upload

              </button>

            </div>

            {/* Quick Actions Card */}

            <div className="glass-panel" style={{ padding: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>

              <div>

                <h4 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Download Generated Reports</h4>

                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>

                  The order weights have been calculated. Click below to download the production summary.

                </p>

              </div>

              <div style={{ display: 'flex', gap: '12px' }}>

                <a href={`${API_BASE}/reports/download-excel/${calculationResult.upload_id}?token=${userToken}`} className="btn btn-success">

                  <Download size={16} /> Download Production Summary (Excel)

                </a>

              </div>

            </div>

            {/* Calculations Table */}

            <div className="glass-panel" style={{ padding: '24px' }}>

              <h3 style={{ fontSize: '1.25rem', marginBottom: '16px', fontFamily: 'var(--font-display)' }}>Compound Weight Calculations Breakdown</h3>

              <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', maxHeight: '500px', overflowY: 'auto' }}>

                <table className="custom-table" style={{ fontSize: '0.9rem' }}>

                  <thead>

                    <tr>

                      <th>Product / Item Name</th>

                      <th>Compound</th>

                      <th>Side</th>

                      <th>Order Quantity (Units)</th>

                      <th>Total Weight Required (kg)</th>

                    </tr>

                  </thead>

                  <tbody>

                    {calculationResult.rows.map((row, idx) => (

                      <tr key={idx} style={{ background: 'rgba(0, 230, 118, 0.02)' }}>

                        <td style={{ fontWeight: 600 }}>{row.item_name}</td>

                        <td style={{ fontWeight: 500 }}>{row.compound}</td>

                        <td style={{ 

                          color: row.side === 'Top' ? 'var(--primary)' : row.side === 'Bottom' ? 'var(--warning)' : 'inherit',

                          fontWeight: 500

                        }}>{row.side}</td>

                        <td style={{ fontWeight: 'bold' }}>{row.order_qty}</td>

                        <td style={{ fontWeight: 'bold', color: 'var(--success)' }}>{row.total_kg} kg</td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

            </div>

          </div>

        )}

        {/* View 1: Upload */}

        {currentView === 'upload' && (

          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '30px', maxWidth: '800px' }}>

            <div>

              <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Upload Purchase Invoice</h1>

              <p style={{ color: 'var(--text-secondary)' }}>Upload the PI Excel file. The system will extract the customer details and yellow-highlighted products for planning.</p>

            </div>

            <div 

              onDragOver={handleDragOver}

              onDrop={handleDrop}

              onClick={() => fileInputRef.current.click()}

              className="glass-panel"

              style={{

                height: '240px',

                border: '2px dashed var(--border-color)',

                display: 'flex',

                flexDirection: 'column',

                alignItems: 'center',

                justifyContent: 'center',

                gap: '16px',

                cursor: 'pointer',

                borderRadius: 'var(--radius-lg)'

              }}

            >

              <input 

                type="file" 

                ref={fileInputRef} 

                onChange={handleFileSelect} 

                accept=".xlsx,.xls" 

                style={{ display: 'none' }} 

              />

              <div style={{

                width: '64px',

                height: '64px',

                borderRadius: '50%',

                background: 'var(--primary-glow)',

                color: 'var(--primary)',

                display: 'flex',

                alignItems: 'center',

                justifyContent: 'center'

              }}>

                <Upload size={28} />

              </div>

              <div style={{ textAlign: 'center' }}>

                <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>

                  {file ? file.name : "Drag & Drop Excel PI File Here"}

                </p>

                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>

                  Supports .xlsx and .xls sheets

                </p>

              </div>

            </div>

            {file && (

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>

                <button className="btn btn-secondary" onClick={() => setFile(null)}>Clear</button>

                <button className="btn btn-primary" onClick={uploadFile} disabled={isUploading}>

                  {isUploading ? <RefreshCw className="animate-spin" size={18} /> : <ArrowRight size={18} />}

                  {isUploading ? "Processing..." : "Extract Products"}

                </button>

              </div>

            )}

          </div>

        )}

        {/* View 2: Mapping Wizard */}

        {currentView === 'mapping' && sheetMappings.length > 0 && (

          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

              <div>

                <span className="badge badge-primary" style={{ marginBottom: '8px' }}>

                  Sheet {currentSheetIdx + 1} of {sheetMappings.length}

                </span>

                <h1 style={{ fontSize: '2rem' }}>Verify Extracted PI Details</h1>

                <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>

                  Review and verify extracted details for <strong style={{ color: 'var(--primary)' }}>{sheetMappings[currentSheetIdx].customer_name}</strong> ({sheetMappings[currentSheetIdx].pi_number})

                </p>

              </div>

            </div>

            {/* Consignee Info Card & Invoice details */}

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>

              <div className="glass-panel" style={{ flex: 1, padding: '20px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>

                <Info color="var(--primary)" size={20} style={{ marginTop: '2px' }} />

                <div>

                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Detected Consignee Information</h4>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', marginTop: '6px' }}>

                    {sheetMappings[currentSheetIdx].consignee_info}

                  </p>

                </div>

              </div>

              <div className="glass-panel" style={{ width: '280px', padding: '20px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>

                <Calendar color="var(--primary)" size={20} style={{ marginTop: '2px' }} />

                <div>

                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>PI Number</h4>

                  <p style={{ fontSize: '1.2rem', color: 'var(--primary)', fontWeight: 700, marginTop: '6px' }}>

                    {sheetMappings[currentSheetIdx].pi_number || "Not detected"}

                  </p>

                </div>

              </div>

            </div>

            {/* Items Table */}

            <div className="glass-panel" style={{ padding: '24px', overflow: 'hidden' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>

                <h3 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-display)', margin: 0 }}>Highlighted Products from PI</h3>

                <button 

                  onClick={() => setIsEditingPI(!isEditingPI)} 

                  className="btn btn-secondary" 

                  style={{ padding: '6px 12px', fontSize: '0.85rem' }}

                >

                  {isEditingPI ? 'Done' : 'Edit Details'}

                </button>

              </div>

              <div className="table-container">

                <table className="custom-table">

                  <thead>

                    <tr>

                      <th>Product Code</th>

                      <th>Product Description</th>

                      <th>Qty (Units)</th>

                    </tr>

                  </thead>

                  <tbody>

                    {sheetMappings[currentSheetIdx].items.map((item, idx) => {

                      return (

                        <tr key={idx}>

                          <td>

                            {isEditingPI ? (

                              <input 

                                type="text"

                                className="input-field"

                                value={item.product_code || ''}

                                onChange={(e) => handlePIItemChange(idx, 'product_code', e.target.value)}

                                style={{ padding: '4px 8px', fontSize: '0.85rem', width: '130px' }}

                              />

                            ) : (

                              <code>{item.product_code || '-'}</code>

                            )}

                          </td>

                          <td style={{ fontWeight: 500 }}>

                            {isEditingPI ? (

                              <input 

                                type="text"

                                className="input-field"

                                value={item.product_desc || ''}

                                onChange={(e) => handlePIItemChange(idx, 'product_desc', e.target.value)}

                                style={{ padding: '4px 8px', fontSize: '0.85rem', width: '380px' }}

                              />

                            ) : (

                              item.product_desc

                            )}

                          </td>

                          <td>

                            {isEditingPI ? (

                              <input 

                                type="number"

                                className="input-field"

                                value={item.quantity || 0}

                                onChange={(e) => handlePIItemChange(idx, 'quantity', parseInt(e.target.value) || 0)}

                                style={{ padding: '4px 8px', fontSize: '0.85rem', width: '100px' }}

                              />

                            ) : (

                              <strong>{item.quantity}</strong>

                            )}

                          </td>

                        </tr>

                      );

                    })}

                  </tbody>

                </table>

              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>

                {currentSheetIdx > 0 && (

                  <button className="btn btn-secondary" onClick={() => setCurrentSheetIdx(currentSheetIdx - 1)}>

                    Back

                  </button>

                )}

                <button className="btn btn-primary" onClick={() => { setIsEditingPI(false); submitMappings(currentSheetIdx); }}>

                  {currentSheetIdx === sheetMappings.length - 1 ? "Save & Create Planning Sheet" : "Next Customer Sheet"}

                  <ArrowRight size={18} />

                </button>

              </div>

            </div>

          </div>

        )}

      </main>

    </div>

  );

}
