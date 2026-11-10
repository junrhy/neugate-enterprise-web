import { useState, useRef } from "react";
import { Employee, EmployeeFingerprint } from "../types";
import { useToast } from "../context/ToastContext";
import { extractFaceDescriptor } from "../utils/faceRecognition";

interface EmployeeDirectoryProps {
  employees: Employee[];
  onAdd: (employee: Omit<Employee, "id"> & { id: string }) => Promise<void>;
  onUpdate?: (employee: Employee) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const DEFAULT_PHOTO = "👤";

const ALL_FINGERS = [
  "Right Thumb",
  "Right Index",
  "Right Middle",
  "Right Ring",
  "Right Little",
  "Left Thumb",
  "Left Index",
  "Left Middle",
  "Left Ring",
  "Left Little",
];

interface FormState {
  id: string;
  name: string;
  department: string;
  jobTitle: string;
  email: string;
  phone: string;
  rfidTag: string;
  biometricTag: string;
  fingerprints: EmployeeFingerprint[];
  qrCode: string;
  managerName: string;
  managerPhone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  photo: string;
}

interface FormErrors {
  name?: string;
  id?: string;
  department?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  rfidTag?: string;
  biometricTag?: string;
  qrCode?: string;
  managerPhone?: string;
  emergencyContactPhone?: string;
  credentials?: string;
}

function generateFingerprintBase64(seed: string): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 120;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, 120, 120);

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#38bdf8";
  ctx.shadowColor = "#0284c7";
  ctx.shadowBlur = 4;

  const centerX = 60;
  const centerY = 60;
  const numRings = 7;

  for (let r = 1; r <= numRings; r++) {
    const radiusX = r * 6.5 + (absHash % 3);
    const radiusY = r * 8.5 + ((absHash >> 2) % 4);
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, (absHash % 15) * (Math.PI / 180), 0, 2 * Math.PI);
    ctx.stroke();
  }

  ctx.fillStyle = "#ef4444";
  ctx.shadowBlur = 0;
  for (let i = 0; i < 4; i++) {
    const angle = ((absHash >> (i * 3)) % 360) * (Math.PI / 180);
    const dist = 12 + (i * 10);
    const px = centerX + Math.cos(angle) * dist;
    const py = centerY + Math.sin(angle) * dist;
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, 2 * Math.PI);
    ctx.fill();
  }

  return canvas.toDataURL("image/png");
}

const emptyForm = (): FormState => ({
  id: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
  name: "",
  department: "",
  jobTitle: "",
  email: "",
  phone: "",
  rfidTag: "",
  biometricTag: "",
  fingerprints: [],
  qrCode: "",
  managerName: "",
  managerPhone: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  photo: DEFAULT_PHOTO,
});

export default function EmployeeDirectory({ employees, onAdd, onUpdate, onDelete }: EmployeeDirectoryProps) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [scanningRfid, setScanningRfid] = useState(false);
  const [scanningFingerName, setScanningFingerName] = useState<string | null>(null);
  const [scanningQr, setScanningQr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraCaptureRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const startWebcam = async () => {
    setWebcamError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraCaptureRef.current?.click();
      return;
    }

    try {
      // Try simple video constraint first
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });
      }

      mediaStreamRef.current = stream;
      setWebcamActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((e) => console.warn("Video play error:", e));
        }
      }, 150);
    } catch (err: any) {
      console.error("Webcam error:", err);
      // Fallback to native camera file capture if web stream is denied or unavailable
      if (cameraCaptureRef.current) {
        toast.warning("Streaming webcam not available. Opening camera file picker...", "Camera Access");
        cameraCaptureRef.current.click();
      } else {
        setWebcamError("Could not access camera. Please allow camera permissions in System Preferences.");
        toast.error("Could not access webcam camera.", "Webcam Error");
      }
    }
  };

  const stopWebcam = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setWebcamActive(false);
    setWebcamError(null);
  };

  const captureWebcamPhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    const size = 180;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const minDim = Math.min(video.videoWidth || size, video.videoHeight || size);
    const sx = ((video.videoWidth || minDim) - minDim) / 2;
    const sy = ((video.videoHeight || minDim) - minDim) / 2;

    ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, size, size);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

    setForm((f) => ({ ...f, photo: dataUrl }));
    toast.success("Photo captured from webcam!", "Webcam Photo");
    stopWebcam();
  };

  const filtered = employees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.departmentJobTitle.toLowerCase().includes(search.toLowerCase()) ||
    (e.email && e.email.toLowerCase().includes(search.toLowerCase())) ||
    (e.phone && e.phone.includes(search)) ||
    (e.rfidTag && e.rfidTag.includes(search)) ||
    (e.biometricTag && e.biometricTag.includes(search)) ||
    (e.fingerprints && e.fingerprints.some((f) => f.token.includes(search) || f.finger.toLowerCase().includes(search.toLowerCase()))) ||
    (e.qrCode && e.qrCode.includes(search)) ||
    e.id.toLowerCase().includes(search.toLowerCase()) ||
    (e.managerName && e.managerName.toLowerCase().includes(search.toLowerCase()))
  );

  const clearError = (field: keyof FormErrors) => {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): FormErrors => {
    const errs: FormErrors = {};

    if (!form.name.trim()) {
      errs.name = "Full name is required.";
    } else if (form.name.trim().length < 3) {
      errs.name = "Name must be at least 3 characters.";
    }

    if (!form.id.trim()) {
      errs.id = "Employee ID is required.";
    } else if (employees.some((e) => e.id === form.id.trim() && e.id !== editingEmployee?.id)) {
      errs.id = "This Employee ID is already registered.";
    }

    if (!form.department.trim()) {
      errs.department = "Department / Division is required.";
    }

    if (!form.jobTitle.trim()) {
      errs.jobTitle = "Job Title / Position is required.";
    }

    if (form.email.trim() && !/\S+@\S+\.\S+/.test(form.email.trim())) {
      errs.email = "Enter a valid email address.";
    }

    if (form.rfidTag.trim() && employees.some((e) => e.rfidTag === form.rfidTag.trim() && e.id !== editingEmployee?.id)) {
      errs.rfidTag = "This RFID tag is already registered to another employee.";
    }

    if (!form.rfidTag.trim() && form.fingerprints.length === 0 && !form.biometricTag.trim() && !form.qrCode.trim()) {
      errs.credentials = "At least one identity credential (RFID Card, Fingerprint, or QR Code) must be registered.";
    }

    if (form.managerPhone.trim() && !/^(09|\+639|\d{7,15})/.test(form.managerPhone.trim())) {
      errs.managerPhone = "Enter a valid mobile number (e.g. 09171234567).";
    }

    return errs;
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 150;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const scale = Math.min(size / img.width, size / img.height);
        const sw = img.width * scale;
        const sh = img.height * scale;
        ctx.drawImage(img, (size - sw) / 2, (size - sh) / 2, sw, sh);
        setForm((f) => ({ ...f, photo: canvas.toDataURL("image/jpeg", 0.75) }));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const startRfidScan = () => {
    setScanningRfid(true);
    clearError("rfidTag");
    clearError("credentials");
    let buf = "";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (buf.length > 0) {
          setForm((f) => ({ ...f, rfidTag: buf }));
          buf = "";
          setScanningRfid(false);
          window.removeEventListener("keydown", handler);
        }
      } else if (e.key.length === 1) {
        buf += e.key;
      }
    };
    window.addEventListener("keydown", handler);
    setTimeout(() => {
      window.removeEventListener("keydown", handler);
      setScanningRfid(false);
    }, 10000);
  };

  const startFingerScan = (fingerName: string) => {
    setScanningFingerName(fingerName);
    clearError("credentials");
    let buf = "";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (buf.length > 0) {
          const tokenScanned = buf;
          const fpImage = generateFingerprintBase64(tokenScanned);
          setForm((f) => {
            const remaining = f.fingerprints.filter((fp) => fp.finger !== fingerName);
            const updatedFp = [...remaining, { finger: fingerName, token: tokenScanned, image: fpImage }];
            return {
              ...f,
              fingerprints: updatedFp,
              biometricTag: f.biometricTag || tokenScanned,
            };
          });
          toast.success(`Registered fingerprint for ${fingerName}!`, "Finger Enrolled");
          buf = "";
          setScanningFingerName(null);
          window.removeEventListener("keydown", handler);
        }
      } else if (e.key.length === 1) {
        buf += e.key;
      }
    };
    window.addEventListener("keydown", handler);
    setTimeout(() => {
      window.removeEventListener("keydown", handler);
      setScanningFingerName(null);
    }, 10000);
  };

  const removeFingerprint = (fingerName: string) => {
    setForm((f) => {
      const updated = f.fingerprints.filter((fp) => fp.finger !== fingerName);
      return {
        ...f,
        fingerprints: updated,
        biometricTag: updated.length > 0 ? updated[0].token : "",
      };
    });
  };

  const startQrScan = () => {
    setScanningQr(true);
    clearError("qrCode");
    clearError("credentials");
    let buf = "";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (buf.length > 0) {
          setForm((f) => ({ ...f, qrCode: buf }));
          buf = "";
          setScanningQr(false);
          window.removeEventListener("keydown", handler);
        }
      } else if (e.key.length === 1) {
        buf += e.key;
      }
    };
    window.addEventListener("keydown", handler);
    setTimeout(() => {
      window.removeEventListener("keydown", handler);
      setScanningQr(false);
    }, 10000);
  };

  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    const parts = emp.departmentJobTitle.split(" - ");
    const dept = parts[0] || "";
    const title = parts.slice(1).join(" - ") || "";

    let initialFp: EmployeeFingerprint[] = emp.fingerprints || [];
    if (initialFp.length === 0 && emp.biometricTag) {
      initialFp = [{ finger: "Right Index", token: emp.biometricTag }];
    }

    setForm({
      id: emp.id,
      name: emp.name,
      department: dept,
      jobTitle: title,
      email: emp.email || "",
      phone: emp.phone || "",
      rfidTag: emp.rfidTag || "",
      biometricTag: emp.biometricTag || (initialFp[0]?.token || ""),
      fingerprints: initialFp,
      qrCode: emp.qrCode || "",
      managerName: emp.managerName || "",
      managerPhone: emp.managerPhone || "",
      emergencyContactName: emp.emergencyContactName || emp.managerName || "",
      emergencyContactPhone: emp.emergencyContactPhone || emp.managerPhone || "",
      photo: emp.photo || DEFAULT_PHOTO,
    });
    setErrors({});
    setShowModal(true);
  };

  const handleSave = async () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    try {
      const primaryBio = form.fingerprints.length > 0 ? form.fingerprints[0].token : form.biometricTag.trim();
      const faceDescriptor = form.photo.startsWith("data:") ? await extractFaceDescriptor(form.photo) : (editingEmployee?.faceDescriptor || undefined);

      const empData: Employee = {
        id: form.id.trim(),
        name: form.name.trim(),
        departmentJobTitle: `${form.department.trim()} - ${form.jobTitle.trim()}`,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        rfidTag: form.rfidTag.trim() || undefined,
        biometricTag: primaryBio || undefined,
        fingerprints: form.fingerprints,
        qrCode: form.qrCode.trim() || undefined,
        managerName: form.managerName.trim(),
        managerPhone: form.managerPhone.trim(),
        emergencyContactName: form.emergencyContactName.trim() || undefined,
        emergencyContactPhone: form.emergencyContactPhone.trim() || undefined,
        photo: form.photo,
        faceDescriptor: faceDescriptor || undefined,
      };

      if (editingEmployee && onUpdate) {
        await onUpdate(empData);
      } else {
        await onAdd(empData);
      }
      setShowModal(false);
      setEditingEmployee(null);
      setForm(emptyForm());
      setErrors({});
      stopWebcam();
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    stopWebcam();
    setShowModal(false);
    setEditingEmployee(null);
    setErrors({});
    setForm(emptyForm());
  };

  return (
    <div className="directory-container">
      {/* Actions Row */}
      <div className="directory-actions">
        <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>
          Employee Registry <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({employees.length})</span>
        </h2>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <div className="search-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search name, ID, email, phone, dept, or manager..."
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            className="btn btn-outline"
            onClick={async () => {
              if (employees.length === 0) return;
              const headers = ["Employee ID", "Full Name", "Department & Job Title", "Employee Email", "Employee Phone", "RFID Tag", "Direct Leader / Manager Name", "Manager Phone Number"];
              const rows = employees.map((e) => [
                `"${e.id.replace(/"/g, '""')}"`,
                `"${e.name.replace(/"/g, '""')}"`,
                `"${e.departmentJobTitle.replace(/"/g, '""')}"`,
                `"${(e.email || "").replace(/"/g, '""')}"`,
                `"${(e.phone || "").replace(/"/g, '""')}"`,
                `"${(e.rfidTag || "").replace(/"/g, '""')}"`,
                `"${(e.managerName || "").replace(/"/g, '""')}"`,
                `"${e.managerPhone || ""}"`,
              ]);
              const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

              try {
                const { save } = await import("@tauri-apps/plugin-dialog");
                const { writeTextFile } = await import("@tauri-apps/plugin-fs");
                const filePath = await save({
                  title: "Export Employees",
                  defaultPath: "employees_export.csv",
                  filters: [{ name: "CSV", extensions: ["csv"] }]
                });
                if (filePath) {
                  await writeTextFile(filePath, csvContent);
                }
              } catch (error) {
                console.warn("Tauri export failed, trying browser download:", error);
                const encodedUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", "employees_export.csv");
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }
            }}
            disabled={employees.length === 0}
            title="Export all employees to CSV"
          >
            📥 Export
          </button>

          <button
            className="btn btn-outline"
            onClick={async () => {
              try {
                const { open } = await import("@tauri-apps/plugin-dialog");
                const { readTextFile } = await import("@tauri-apps/plugin-fs");
                const selected = await open({
                  title: "Import Employees CSV",
                  multiple: false,
                  filters: [{ name: "CSV", extensions: ["csv"] }]
                });

                if (!selected || Array.isArray(selected)) return;

                const csvContent = await readTextFile(selected);
                const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
                if (lines.length <= 1) {
                  toast.warning("CSV file is empty or only contains headers.", "Import CSV");
                  return;
                }

                const parseCSVLine = (text: string) => {
                  const result = [];
                  let current = "";
                  let inQuotes = false;
                  for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    if (char === '"') {
                      inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                      result.push(current.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
                      current = "";
                    } else {
                      current += char;
                    }
                  }
                  result.push(current.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
                  return result;
                };

                const importedEmployees: Employee[] = [];
                let skipCount = 0;

                for (let i = 1; i < lines.length; i++) {
                  const cols = parseCSVLine(lines[i]);
                  if (cols.length < 4) continue;

                  const id = cols[0] || `EMP-${Math.floor(1000 + Math.random() * 9000)}`;
                  const name = cols[1];
                  const departmentJobTitle = cols[2];
                  const email = cols[3] && cols[3].includes("@") ? cols[3] : undefined;
                  const phone = cols[3] && !cols[3].includes("@") ? cols[3] : cols[4];
                  const rfidTag = cols[5] || cols[3];
                  const managerName = cols[6] || "";
                  const managerPhone = cols[7] || "";

                  if (!name || !rfidTag) {
                    skipCount++;
                    continue;
                  }

                  const isDuplicate = employees.some(e => e.id === id || e.rfidTag === rfidTag) ||
                    importedEmployees.some(e => e.id === id || e.rfidTag === rfidTag);

                  if (isDuplicate) {
                    skipCount++;
                    continue;
                  }

                  importedEmployees.push({
                    id,
                    name,
                    departmentJobTitle,
                    email,
                    phone,
                    rfidTag,
                    managerName,
                    managerPhone,
                    photo: "👤"
                  });
                }

                if (importedEmployees.length === 0) {
                  toast.warning(`No new employees imported. (Skipped ${skipCount} duplicates/invalid rows)`, "Import CSV");
                  return;
                }

                for (const emp of importedEmployees) {
                  await onAdd(emp);
                }

                toast.success(`Successfully imported ${importedEmployees.length} employees! (Skipped ${skipCount} duplicates)`, "Import Complete");
              } catch (error) {
                console.error("Failed to import CSV:", error);
                toast.error("Error importing CSV file. Please check format.", "Import Failed");
              }
            }}
            title="Import employees from CSV"
          >
            📤 Import
          </button>

          <button className="btn btn-primary" onClick={() => { setForm(emptyForm()); setErrors({}); setShowModal(true); }}>
            + Add Employee
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <div className="stat-card">
          <div className="stat-icon">👔</div>
          <div className="stat-info">
            <span className="stat-title">Total Employees</span>
            <span className="stat-number">{employees.length}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🪪</div>
          <div className="stat-info">
            <span className="stat-title">RFID Enrolled</span>
            <span className="stat-number">{employees.filter((e) => e.rfidTag).length}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✉️</div>
          <div className="stat-info">
            <span className="stat-title">With Email</span>
            <span className="stat-number">{employees.filter((e) => e.email).length}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📱</div>
          <div className="stat-info">
            <span className="stat-title">With Phone</span>
            <span className="stat-number">{employees.filter((e) => e.phone).length}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👤👔</div>
          <div className="stat-info">
            <span className="stat-title">With Manager Contact</span>
            <span className="stat-number">{employees.filter((e) => e.managerPhone).length}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="table-card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👔</div>
            <p>No employees found. Register your first employee above.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>ID Number</th>
                <th>Department &amp; Job Title</th>
                <th>Employee Contact</th>
                <th>RFID / QR / Bio</th>
                <th>Direct Leader / Manager</th>
                <th>Manager Phone</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const fingerCount = e.fingerprints?.length || (e.biometricTag ? 1 : 0);
                const fingerListStr = e.fingerprints?.map(f => f.finger).join(", ") || (e.biometricTag ? "Right Index" : "");

                return (
                  <tr key={e.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                        <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", background: "var(--bg-input)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", flexShrink: 0 }}>
                          {e.photo.startsWith("data:") ? <img src={e.photo} alt={e.name} className="avatar-img" /> : e.photo}
                        </div>
                        <strong>{e.name}</strong>
                      </div>
                    </td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem" }}>{e.id}</td>
                    <td>{e.departmentJobTitle}</td>
                    <td style={{ fontSize: "0.78rem" }}>
                      {e.email && <div>✉️ {e.email}</div>}
                      {e.phone && <div style={{ fontFamily: "JetBrains Mono, monospace" }}>📱 {e.phone}</div>}
                      {!e.email && !e.phone && <span style={{ color: "var(--text-dim)" }}>—</span>}
                    </td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                        {(e.faceDescriptor && e.faceDescriptor.length > 0) || e.photo.startsWith("data:") ? (
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.72rem", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 700 }} title="AI Face Recognition Enrolled">
                            👤 Face Registered
                          </span>
                        ) : null}
                        {fingerCount > 0 && (
                          <span
                            style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.72rem", background: "var(--primary-dim)", color: "var(--primary)", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 700 }}
                            title={`Enrolled fingers: ${fingerListStr}`}
                          >
                            ☝️ {fingerCount} Finger{fingerCount > 1 ? "s" : ""} Enrolled
                          </span>
                        )}
                        {e.rfidTag && (
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.72rem", background: "var(--bg-input)", padding: "0.15rem 0.45rem", borderRadius: "4px" }} title="RFID Tag Card">
                            🪪 {e.rfidTag}
                          </span>
                        )}
                        {e.qrCode && (
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.72rem", background: "var(--warning-dim)", color: "var(--warning)", padding: "0.15rem 0.45rem", borderRadius: "4px" }} title="QR Code Token">
                            📷 {e.qrCode}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{e.managerName || <span style={{ color: "var(--text-dim)" }}>—</span>}</td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem" }}>
                      {e.managerPhone || <span style={{ color: "var(--text-dim)" }}>—</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                        <button
                          className="btn btn-outline"
                          style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                          onClick={() => handleOpenEdit(e)}
                          title="Edit Employee Information"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                          onClick={() => { if (confirm(`Remove ${e.name}?`)) onDelete(e.id); }}
                          title="Remove Employee"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit Employee Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={(ev) => ev.target === ev.currentTarget && handleClose()}>
          <div className="modal" style={{ width: 600 }}>
            <div className="modal-header">
              <span className="modal-title">{editingEmployee ? "Edit Employee Profile" : "Register New Employee"}</span>
              <button className="modal-close" onClick={handleClose}>✕</button>
            </div>

            {/* Photo Upload & Webcam Zone */}
            {webcamActive ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
                <div style={{ width: 160, height: 160, borderRadius: "50%", overflow: "hidden", border: "3px solid var(--primary)", background: "#000", boxShadow: "0 0 15px rgba(56, 189, 248, 0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <video ref={videoRef} playsInline autoPlay muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", borderRadius: "50%", clipPath: "circle(50% at 50% 50%)" }} />
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="button" className="btn btn-primary" style={{ fontSize: "0.8rem", padding: "0.4rem 1rem" }} onClick={captureWebcamPhoto}>
                    📸 Snap Photo
                  </button>
                  <button type="button" className="btn btn-outline" style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }} onClick={stopWebcam}>
                    ✕ Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="photo-upload-zone" onClick={() => photoInputRef.current?.click()}>
                  {form.photo.startsWith("data:") ? (
                    <img src={form.photo} alt="Employee photo preview" className="photo-preview-img" />
                  ) : (
                    <div className="photo-upload-placeholder">
                      <span className="photo-upload-icon">📷</span>
                      <span className="photo-upload-label">Click to upload employee photo</span>
                      <span className="photo-upload-hint">JPG, PNG — max 2MB · Will be resized to 150×150</span>
                    </div>
                  )}
                  {form.photo.startsWith("data:") && (
                    <div className="photo-upload-overlay">
                      <span>🔄 Change Photo</span>
                    </div>
                  )}
                </div>
                {webcamError && (
                  <div style={{ color: "var(--danger)", fontSize: "0.75rem", textAlign: "center", marginBottom: "0.5rem" }}>
                    ⚠ {webcamError}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
                  <button type="button" className="btn btn-primary" style={{ fontSize: "0.75rem", padding: "0.35rem 0.8rem" }} onClick={startWebcam}>
                    📸 Take Photo
                  </button>
                  <button type="button" className="btn btn-outline" style={{ fontSize: "0.75rem", padding: "0.35rem 0.8rem" }} onClick={() => photoInputRef.current?.click()}>
                    📁 Choose File
                  </button>
                  {form.photo.startsWith("data:") && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ fontSize: "0.75rem", padding: "0.35rem 0.8rem" }}
                      onClick={(ev) => { ev.stopPropagation(); setForm((f) => ({ ...f, photo: DEFAULT_PHOTO })); }}
                    >
                      🗑 Remove
                    </button>
                  )}
                </div>
              </>
            )}
            <input type="file" accept="image/*" ref={photoInputRef} style={{ display: "none" }} onChange={handlePhotoUpload} />
            <input type="file" accept="image/*" capture="user" ref={cameraCaptureRef} style={{ display: "none" }} onChange={handlePhotoUpload} />

            <div className="form-grid">
              {/* Full Name */}
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Full Name <span style={{ color: "var(--danger)" }}>*</span></label>
                <input
                  className={`form-input ${errors.name ? "input-error" : ""}`}
                  placeholder="e.g. Maria Santos"
                  value={form.name}
                  onChange={(ev) => { setForm((f) => ({ ...f, name: ev.target.value })); clearError("name"); }}
                />
                {errors.name && <span className="field-error">⚠ {errors.name}</span>}
              </div>

              {/* Employee ID */}
              <div className="form-group">
                <label className="form-label">Employee ID <span style={{ color: "var(--danger)" }}>*</span></label>
                <input
                  className={`form-input ${errors.id ? "input-error" : ""}`}
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                  value={form.id}
                  disabled={!!editingEmployee}
                  onChange={(ev) => { setForm((f) => ({ ...f, id: ev.target.value })); clearError("id"); }}
                />
                {errors.id && <span className="field-error">⚠ {errors.id}</span>}
              </div>

              {/* Department */}
              <div className="form-group">
                <label className="form-label">Department / Division <span style={{ color: "var(--danger)" }}>*</span></label>
                <input
                  className={`form-input ${errors.department ? "input-error" : ""}`}
                  placeholder="e.g. Operations"
                  value={form.department}
                  onChange={(ev) => { setForm((f) => ({ ...f, department: ev.target.value })); clearError("department"); }}
                />
                {errors.department && <span className="field-error">⚠ {errors.department}</span>}
              </div>

              {/* Job Title / Position */}
              <div className="form-group">
                <label className="form-label">Job Title / Position <span style={{ color: "var(--danger)" }}>*</span></label>
                <input
                  className={`form-input ${errors.jobTitle ? "input-error" : ""}`}
                  placeholder="e.g. Logistics Manager"
                  value={form.jobTitle}
                  onChange={(ev) => { setForm((f) => ({ ...f, jobTitle: ev.target.value })); clearError("jobTitle"); }}
                />
                {errors.jobTitle && <span className="field-error">⚠ {errors.jobTitle}</span>}
              </div>

              {/* Employee Email */}
              <div className="form-group">
                <label className="form-label">Employee Email Address</label>
                <input
                  type="email"
                  className={`form-input ${errors.email ? "input-error" : ""}`}
                  placeholder="e.g. maria.santos@company.com"
                  value={form.email}
                  onChange={(ev) => { setForm((f) => ({ ...f, email: ev.target.value })); clearError("email"); }}
                />
                {errors.email && <span className="field-error">⚠ {errors.email}</span>}
              </div>

              {/* Employee Phone */}
              <div className="form-group">
                <label className="form-label">Employee Phone / Contact Number</label>
                <input
                  className={`form-input ${errors.phone ? "input-error" : ""}`}
                  placeholder="e.g. 09179876543"
                  value={form.phone}
                  onChange={(ev) => { setForm((f) => ({ ...f, phone: ev.target.value })); clearError("phone"); }}
                />
                {errors.phone && <span className="field-error">⚠ {errors.phone}</span>}
              </div>

              {/* RFID Tag */}
              <div className="form-group">
                <label className="form-label">RFID Tag <span style={{ color: "var(--text-dim)", textTransform: "none", fontWeight: 400 }}>(Optional)</span></label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    className={`form-input ${errors.rfidTag ? "input-error" : ""}`}
                    style={{ fontFamily: "JetBrains Mono, monospace", flex: 1 }}
                    placeholder={scanningRfid ? "Waiting for card scan..." : "Tag number or tap scan"}
                    value={form.rfidTag}
                    onChange={(ev) => { setForm((f) => ({ ...f, rfidTag: ev.target.value })); clearError("rfidTag"); }}
                  />
                  <button type="button" className="btn btn-outline" style={{ flexShrink: 0 }} onClick={startRfidScan}>
                    {scanningRfid ? "🟢 Scanning..." : "🪪 Scan Card"}
                  </button>
                </div>
                {errors.rfidTag && <span className="field-error">⚠ {errors.rfidTag}</span>}
              </div>

              {/* QR Code / Barcode */}
              <div className="form-group">
                <label className="form-label">QR Code / Barcode <span style={{ color: "var(--text-dim)", textTransform: "none", fontWeight: 400 }}>(Optional)</span></label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    className="form-input"
                    style={{ fontFamily: "JetBrains Mono, monospace", flex: 1 }}
                    placeholder={scanningQr ? "Scan QR / Barcode..." : "QR Token / Barcode ID"}
                    value={form.qrCode}
                    onChange={(ev) => setForm((f) => ({ ...f, qrCode: ev.target.value }))}
                  />
                  <button type="button" className="btn btn-outline" style={{ flexShrink: 0 }} onClick={startQrScan}>
                    {scanningQr ? "🟢 Scanning..." : "📷 Scan QR"}
                  </button>
                </div>
              </div>

              {/* 10-Finger Biometric Registry */}
              <div className="form-group" style={{ gridColumn: "1 / -1", marginTop: "0.5rem", background: "var(--bg-input)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    10-Finger Biometric Registry <span style={{ color: "var(--text-dim)", textTransform: "none", fontWeight: 400 }}>(Scan any finger)</span>
                  </label>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>
                    {form.fingerprints.length} / 10 Enrolled
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
                  {ALL_FINGERS.map((fingerName) => {
                    const enrolled = form.fingerprints.find((f) => f.finger === fingerName);
                    const isScanningThis = scanningFingerName === fingerName;

                    return (
                      <div
                        key={fingerName}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.45rem 0.65rem",
                          borderRadius: "6px",
                          background: enrolled ? "var(--primary-dim)" : "var(--bg-card)",
                          border: enrolled ? "1px solid var(--primary)" : "1px solid var(--border-color)",
                        }}
                      >
                        {enrolled && (
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: "4px",
                              overflow: "hidden",
                              border: "1px solid var(--primary)",
                              marginRight: "0.5rem",
                              flexShrink: 0,
                              background: "#000",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            title="Base64 Fingerprint Biometric Image"
                          >
                            <img
                              src={enrolled.image || generateFingerprintBase64(enrolled.token)}
                              alt={`${fingerName} fingerprint scan`}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          </div>
                        )}

                        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", marginRight: "0.5rem" }}>
                          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: enrolled ? "var(--primary)" : "var(--text-main)" }}>
                            {fingerName}
                          </span>
                          {enrolled ? (
                            <span style={{ fontSize: "0.68rem", fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>
                              ID: {enrolled.token}
                            </span>
                          ) : (
                            <span style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>Not Enrolled</span>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: "0.25rem", flexShrink: 0 }}>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem" }}
                            onClick={() => startFingerScan(fingerName)}
                          >
                            {isScanningThis ? "🟢 Press..." : enrolled ? "Re-scan" : "Scan"}
                          </button>
                          {enrolled && (
                            <button
                              type="button"
                              className="btn btn-danger"
                              style={{ padding: "0.2rem 0.4rem", fontSize: "0.7rem" }}
                              onClick={() => removeFingerprint(fingerName)}
                              title="Clear Fingerprint"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {errors.credentials && (
                <div style={{ gridColumn: "1 / -1", color: "var(--danger)", background: "var(--danger-dim)", padding: "0.5rem 0.75rem", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 500 }}>
                  ⚠ {errors.credentials}
                </div>
              )}

              {/* Direct Leader / Manager Name */}
              <div className="form-group">
                <label className="form-label">Direct Leader / Manager Name</label>
                <input
                  className="form-input"
                  placeholder="e.g. John Doe (Department Head)"
                  value={form.managerName}
                  onChange={(ev) => setForm((f) => ({ ...f, managerName: ev.target.value }))}
                />
              </div>

              {/* Direct Leader / Manager Phone */}
              <div className="form-group">
                <label className="form-label">Manager Phone Number (SMS Alerts)</label>
                <input
                  className={`form-input ${errors.managerPhone ? "input-error" : ""}`}
                  placeholder="e.g. 09171234567"
                  value={form.managerPhone}
                  onChange={(ev) => { setForm((f) => ({ ...f, managerPhone: ev.target.value })); clearError("managerPhone"); }}
                />
                {errors.managerPhone && <span className="field-error">⚠ {errors.managerPhone}</span>}
              </div>

              {/* Emergency Contact Name */}
              <div className="form-group">
                <label className="form-label">Emergency Contact Name</label>
                <input
                  className="form-input"
                  placeholder="e.g. Juanita Santos (Spouse / Parent)"
                  value={form.emergencyContactName}
                  onChange={(ev) => setForm((f) => ({ ...f, emergencyContactName: ev.target.value }))}
                />
              </div>

              {/* Emergency Contact Phone */}
              <div className="form-group">
                <label className="form-label">Emergency Contact Number</label>
                <input
                  className={`form-input ${errors.emergencyContactPhone ? "input-error" : ""}`}
                  placeholder="e.g. 09181234567"
                  value={form.emergencyContactPhone}
                  onChange={(ev) => { setForm((f) => ({ ...f, emergencyContactPhone: ev.target.value })); clearError("emergencyContactPhone"); }}
                />
                {errors.emergencyContactPhone && <span className="field-error">⚠ {errors.emergencyContactPhone}</span>}
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-outline" onClick={handleClose}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingEmployee ? "Save Changes" : "Register Employee"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
