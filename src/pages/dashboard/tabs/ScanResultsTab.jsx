import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Zap, ShieldCheck, FileCode, CheckCircle2, AlertTriangle, Database,
    XCircle, Activity, ClipboardList, Key, Shield,
    ChevronDown, ChevronUp, Cpu, Globe, Server, BarChart3, Info, Hash, Link, Lock as LockIcon, MessageSquareText, Search
} from 'lucide-react';
import API from "../../../services/api";
import SecurityChatbot from '../../../components/Dashboard/SecurityChatbot';
import SkeletonBlock from '../../../components/ui/SkeletonBlock';

const ScanResultsTab = () => {
    const location = useLocation();
    const [scanId, setScanId] = useState(location.state?.activeScanId || null);
    const expectedAssetCount = Number(location.state?.expectedAssetCount || 0);

    // Data States
    const [scanResults, setScanResults] = useState([]);
    const [cbomData, setCbomData] = useState(null);
    const [assetPlans, setAssetPlans] = useState([]);

    // UI States
    const [loading, setLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState("");
    const [activeTechTab, setActiveTechTab] = useState("algorithms");
    const [expandedAssetId, setExpandedAssetId] = useState(null);
    const [expandedProtocolIndex, setExpandedProtocolIndex] = useState(null); // New state for cipher suites
    const [futureAsset, setFutureAsset] = useState(null); // Look Into The Future simulation state

    const [expandedField, setExpandedField] = React.useState(null);
    const [simulatedCheckedIndices, setSimulatedCheckedIndices] = useState([]);

    const toggleField = (field) => {
        setExpandedField(expandedField === field ? null : field);
    };

    const ExpandableRow = ({ label, data, colorClass = "text-white" }) => {
        const count = data?.length || 0;
        const isExpanded = expandedField === label;

        return (
            <div className="border-b border-slate-800/50 py-3 last:border-0">
                <div
                    className="flex justify-between items-center cursor-pointer hover:bg-slate-800/30 transition-colors rounded-lg px-2 -mx-2"
                    onClick={() => count > 0 && toggleField(label)}
                >
                    <span className="text-slate-500 uppercase text-xs sm:text-sm">{label}</span>
                    <div className="flex items-center gap-2">
                        <span className={`${count > 0 ? colorClass : 'text-slate-600'} text-xs sm:text-sm`}>
                            {count} {count === 1 ? 'Item' : 'Items'} Found
                        </span>
                        {count > 0 && (
                            <ChevronDown size={14} className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        )}
                    </div>
                </div>

                {isExpanded && count > 0 && (
                    <div className="mt-3 space-y-2 pl-2 border-l border-slate-700 animate-in fade-in slide-in-from-top-1">
                        {data.map((item, i) => (
                            <div key={i} className="text-xs sm:text-sm font-mono text-slate-400 break-all leading-tight">
                                • {item}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const orchestrationRef = useRef(false);

    useEffect(() => {
        if (!scanId) return;
        if (orchestrationRef.current) return;
        orchestrationRef.current = true;
        runFullOrchestration();
    }, [scanId]);

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const fetchAggregatedResults = async (currentScanId, expectedCount = 0) => {
        const maxAttempts = expectedCount > 1 ? 8 : 3;
        let lastResults = [];

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const resultRes = await API.get(`/scan/${currentScanId}/results`);
            lastResults = Array.isArray(resultRes.data) ? resultRes.data : [];

            if (!expectedCount || expectedCount <= 1 || lastResults.length >= expectedCount) {
                return lastResults;
            }

            try {
                const statusRes = await API.get(`/scan/${currentScanId}/status`);
                const status = statusRes.data?.status;

                if (status === "completed" && lastResults.length > 0) {
                    return lastResults;
                }
            } catch (statusErr) {
                console.warn("Scan status check failed during aggregation retry", statusErr);
            }

            if (attempt < maxAttempts) {
                setStatusMsg(`Collecting scan results (${lastResults.length}/${expectedCount})...`);
                await sleep(1000);
            }
        }

        return lastResults;
    };

    const runFullOrchestration = async () => {
        setLoading(true);
        try {
            setStatusMsg("Fetching cryptographic scan results...");
            const aggregatedResults = await fetchAggregatedResults(scanId, expectedAssetCount);
            setScanResults(aggregatedResults);

            if (aggregatedResults.length === 0) {
                throw new Error("SCAN_EMPTY");
            }

            setStatusMsg("Synchronizing Cryptographic Bill of Materials...");
            const currentMode = location.state?.mode || "aggregate";
            let currentCbom;
            try {
                // Try to find CBOM with the SPECIFIC mode requested
                const cbomRes = await API.get(`/cbom/${scanId}/cbom?mode=${currentMode === 'perAsset' ? 'per_asset' : currentMode}`);
                currentCbom = cbomRes.data;
            } catch (err) {
                if (err.response?.status === 404) {
                    const genRes = await API.post(`/cbom/${scanId}`, { mode: currentMode === 'perAsset' ? 'per_asset' : currentMode });
                    currentCbom = genRes.data.cbom;
                }
            }
            setCbomData(currentCbom || null);

            setStatusMsg("AI Engine generating mitigation roadmap...");
            let finalRecommendations;

            try {
                // 1. Try to fetch existing recommendations first
                const existingRecs = await API.get(`/scan/${scanId}/recommendations`);

                if (existingRecs.data && existingRecs.data.length > 0) {
                    finalRecommendations = existingRecs.data;
                } else {
                    // 2. If the GET returns an empty list, trigger the AI generation
                    const genRes = await API.post(`/scan/${scanId}/recommendations`);
                    finalRecommendations = genRes.data;
                }
            } catch (err) {
                // 3. Fallback: If GET fails with 404, trigger generation
                if (err.response?.status === 404) {
                    const genRes = await API.post(`/scan/${scanId}/recommendations`);
                    finalRecommendations = genRes.data;
                } else {
                    console.error("Critical error fetching roadmap:", err);
                }
            }

            setAssetPlans(Array.isArray(finalRecommendations) ? finalRecommendations : []);
            setStatusMsg("Analysis Complete.");

        } catch (err) {
            if (err.message === "SCAN_EMPTY") {
                setStatusMsg("No data found for this scan ID.");
            }
            console.error("Orchestration Error:", err);
        } finally {
            setLoading(false);
        }
    };

    function InfoItem({ label, value, highlight, isRed }) {
        return (
            <div className="flex flex-col">
                <span className="text-xs uppercase font-bold text-slate-400 mb-0.5">{label}</span>
                <span className={`text-sm break-all ${highlight ? 'font-black text-slate-900' : 'font-medium text-slate-600'} ${isRed ? 'text-rose-500' : ''}`}>
                    {value || "null"}
                </span>
            </div>
        );
    }

    const [downloading, setDownloading] = useState(false);
    const [exportFormat, setExportFormat] = useState("pdf");

    const handleDownloadPDF = async () => {
        if (!scanId) return;
        setDownloading(true);
        try {
            const mode = cbomData?.mode || "aggregate";
            // Use responseType: 'blob' to handle binary PDF data
            const response = await API.get(`/cbom/${scanId}/cbom/pdf?mode=${mode}`, {
                responseType: 'blob'
            });

            // Create a download link in the browser
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;

            // Set filename - you can customize this
            link.setAttribute('download', `CBOM-${mode}-${scanId.substring(0, 8)}.pdf`);
            document.body.appendChild(link);
            link.click();

            // Cleanup
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("PDF Download failed:", err);
            alert("Failed to generate PDF report. Please try again.");
        } finally {
            setDownloading(false);
        }
    };

    const handleDownloadExport = async (format) => {
        if (!scanId) return;
        setDownloading(true);
        try {
            const mode = cbomData?.mode || "aggregate";
            const response = await API.get(`/cbom/${scanId}/cbom/${format}?mode=${mode}`, {
                responseType: format === 'json' ? 'json' : 'blob'
            });

            let blob;
            if (format === 'json') {
                blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
            } else {
                blob = new Blob([response.data], { type: format === 'csv' ? 'text/csv' : 'application/pdf' });
            }

            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `CBOM-${mode}-${scanId.substring(0, 8)}.${format}`);
            document.body.appendChild(link);
            link.click();

            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error(`${format.toUpperCase()} Download failed:`, err);
            alert(`Failed to generate ${format.toUpperCase()} report. Please try again.`);
        } finally {
            setDownloading(false);
        }
    };

    const getClassification = (score) => {
        const s = score * 1000;
        if (s >= 900) return { label: "Quantum Safe", color: "text-emerald-400", bg: "bg-emerald-500/10" };
        if (s >= 700) return { label: "PQC Ready", color: "text-blue-400", bg: "bg-blue-500/10" };
        if (s >= 400) return { label: "Migration Required", color: "text-amber-400", bg: "bg-amber-500/10" };
        return { label: "Quantum Vulnerable", color: "text-red-400", bg: "bg-red-500/10" };
    };

    const avgScanScore = scanResults.length > 0
        ? Math.round((scanResults.reduce((acc, curr) => acc + (curr.pqcReadyScore || 0), 0) / scanResults.length) * 1000)
        : 0;

    if (loading) return (
        <div className="space-y-10 pb-20 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 editorial-shell p-8 space-y-4">
                    <SkeletonBlock className="h-8 w-80" />
                    <SkeletonBlock className="h-5 w-64" />
                </div>
                <div className="rounded-[2.5rem] p-8 border border-slate-200 bg-white shadow-sm space-y-4">
                    <SkeletonBlock className="h-4 w-32" />
                    <SkeletonBlock className="h-16 w-28" />
                </div>
            </div>

            <div className="px-4">
                <p className="text-slate-400 font-black uppercase text-sm tracking-[0.2em]">{statusMsg}</p>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {Array.from({ length: 3 }).map((_, idx) => (
                    <div key={idx} className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm space-y-6">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                            <div className="flex items-center gap-4 w-full md:w-auto">
                                <SkeletonBlock className="h-14 w-14 rounded-[1.5rem]" />
                                <div className="space-y-2 w-full">
                                    <SkeletonBlock className="h-6 w-56" />
                                    <SkeletonBlock className="h-4 w-64" />
                                </div>
                            </div>
                            <SkeletonBlock className="h-10 w-10 rounded-full" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <SkeletonBlock className="h-20 w-full" />
                            <SkeletonBlock className="h-20 w-full" />
                            <SkeletonBlock className="h-20 w-full" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    if (!scanId) return (
        <div className="flex flex-col items-center justify-center py-40 animate-in fade-in duration-700">
            <div className="p-8 editorial-shell border-dashed border-2 border-slate-200 flex flex-col items-center text-center max-w-md">
                <div className="p-5 bg-white shadow-xl rounded-2xl mb-6 text-slate-300">
                    <Search size={48} />
                </div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight italic mb-2">
                    No Active Audit Found
                </h2>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                    Please initiate a new network scan from the <span className="text-orange-500">Scan Tab</span>.
                </p>
            </div>
        </div>
    );

    return (
        <div className="space-y-10 pb-20 animate-in fade-in duration-500">

            {/* --- TOP HUD --- */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 editorial-shell p-8 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div className="p-5 bg-blue-50 rounded-[2rem] text-blue-700 shadow-inner"><Globe size={32} /></div>
                        <div>
                            <h2 className="editorial-title text-2xl tracking-tight uppercase leading-none">
                                {location.state?.domainName || "Network Audit"}
                            </h2>
                            <p className="text-xs sm:text-sm font-mono text-slate-400 mt-2 uppercase font-bold tracking-tighter">REF_ID: {scanId}</p>
                        </div>
                    </div>
                </div>

                <div className="rounded-[2.5rem] p-8 text-white flex flex-col items-center justify-center shadow-2xl relative overflow-hidden" style={{ background: 'var(--primary)' }}>
                    <ShieldCheck className="absolute -right-4 -bottom-4 w-24 h-24 text-white/20" />
                    <h4 className="text-xs sm:text-sm font-black text-slate-100 uppercase tracking-[0.2em] mb-4">Domain Score</h4>
                    <div className="text-6xl font-bold text-slate-100 drop-shadow-lg">
                        {avgScanScore}
                    </div>
                </div>
            </div>

            {/* --- PER-ASSET ANALYSIS --- */}
            <div className="space-y-4">
                <div className="flex items-center gap-3 px-4">
                    <Server className="text-blue-700" size={20} />
                    <h3 className="editorial-title text-lg uppercase tracking-tight italic">Asset Intelligence</h3>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {scanResults.map((res) => {
                        const config = getClassification(res.pqcReadyScore || 0);
                        const isExpanded = expandedAssetId === res._id;
                        const matchingPlan = assetPlans.find(p => p.scanResultId === res._id);

                        return (
                            <div key={res._id} className={`bg-white border border-slate-100 rounded-[2.5rem] overflow-hidden transition-all shadow-sm ${isExpanded ? 'border-orange-400' : ''}`}>
                                <div className="p-8 flex flex-col md:flex-row justify-between items-center gap-6">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-4 rounded-[1.5rem] ${config.bg} ${config.color}`}>
                                            <Activity size={24} />
                                        </div>

                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-lg font-black text-slate-900 uppercase italic leading-none">
                                                    {res.assetId?.host}
                                                </h4>

                                                <span className="bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded font-black">
                                                    {res.assetId?.assetType}
                                                </span>

                                                {/* STATUS BADGE */}
                                                {res.status && (
                                                    (() => {
                                                        const status = res.status.toLowerCase();
                                                        const isSuccess = status === 'completed' || status === 'success';
                                                        const isBlocked = status === 'blocked';

                                                        const style = isSuccess
                                                            ? 'bg-green-100 text-green-600'
                                                            : isBlocked
                                                                ? 'bg-amber-100 text-amber-500'
                                                                : 'bg-rose-100 text-rose-600';

                                                        return (
                                                            <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${style}`}>
                                                                {status}
                                                            </span>
                                                        );
                                                    })()
                                                )}
                                            </div>

                                            <p className="text-sm font-mono text-slate-400 mt-2 font-bold">
                                                {res.assetId?.ip} • PORT {res.port}
                                            </p>

                                            {/* FAILURE REASON */}
                                            {(res.status === 'failed' || res.status === 'blocked') && (
                                                <p className="text-xs font-bold text-rose-500 mt-1 uppercase tracking-tight">
                                                    Reason: {res.failureReason || 'Connection failed or blocked'}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* RIGHT SECTION */}
                                    <div className="flex items-center gap-12">
                                        {(() => {
                                            const status = (res.status || '').toLowerCase();
                                            const isSuccess = !status || status === 'completed' || status === 'success';
                                            const isBlocked = status === 'blocked';

                                            if (isSuccess) {
                                                return (
                                                    <>
                                                        <div className="text-center">
                                                            <p className={`text-2xl font-black uppercase ${config.color}`}>
                                                                {config.label}
                                                            </p>
                                                        </div>

                                                        <div className="text-right">
                                                            <p className="text-xs sm:text-sm font-black text-slate-400 uppercase tracking-widest mb-1">
                                                                PQC Score
                                                            </p>
                                                            <p className="text-3xl font-black text-slate-900">
                                                                {Math.round(res.pqcReadyScore * 1000)}
                                                            </p>
                                                        </div>

                                                        {/* Look Into the Future Button */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const hostName = res.assetId?.host || "Unknown Asset";
                                                                const checkedStateKey = `sim_${hostName}`;
                                                                let initialChecked = [];
                                                                try {
                                                                    const saved = localStorage.getItem(checkedStateKey);
                                                                    if (saved) initialChecked = JSON.parse(saved);
                                                                } catch (err) {}
                                                                setSimulatedCheckedIndices(initialChecked);
                                                                setFutureAsset({
                                                                    host: hostName,
                                                                    currentScore: Math.round(res.pqcReadyScore * 1000),
                                                                    pqcKex: matchingPlan?.recommendedPqcKex || "ML-KEM-768",
                                                                    pqcSig: matchingPlan?.recommendedPqcSignature || "CRYSTALS-Dilithium",
                                                                    migrationSteps: matchingPlan?.migrationSteps || [
                                                                        "Deploy hybrid post-quantum key encapsulation (ML-KEM-768/X25519)",
                                                                        "Update digital signature algorithm to CRYSTALS-Dilithium",
                                                                        "Enable hybrid trust anchors in intermediate CAs",
                                                                        "Perform end-to-end cryptographic telemetry audit"
                                                                    ]
                                                                });
                                                            }}
                                                            className="flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-slate-900 text-orange-400 hover:bg-orange-500 hover:text-white transition-all shadow-md active:scale-95 whitespace-nowrap"
                                                        >
                                                            <Zap size={14} className="animate-pulse" /> Look Into Future
                                                        </button>

                                                        {/* ✅ DROPDOWN ONLY FOR SUCCESS */}
                                                        <button
                                                            onClick={() => setExpandedAssetId(isExpanded ? null : res._id)}
                                                            className={`p-3 rounded-full transition-all ${isExpanded
                                                                    ? 'bg-orange-500 text-white shadow-lg'
                                                                    : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                                                                }`}
                                                        >
                                                            {isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                                                        </button>
                                                    </>
                                                );
                                            }

                                            return (
                                                <div className="text-right pr-4">
                                                    <p className="text-xs sm:text-sm font-black text-slate-400 uppercase tracking-widest mb-1">
                                                        Status
                                                    </p>

                                                    <p
                                                        className={`text-2xl font-black uppercase ${isBlocked ? 'text-amber-500' : 'text-rose-600'
                                                            }`}
                                                    >
                                                        {status}
                                                    </p>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="px-10 pb-10 animate-in slide-in-from-top-4 duration-300">
                                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-10 border-t border-slate-50 pt-10">
                                            <div className="space-y-4">
                                                <h4 className="text-xs sm:text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                    <LockIcon size={14} /> Node Crypto Analysis
                                                </h4>
                                                <div className="bg-slate-900 rounded-[2.5rem] p-7 text-slate-300 shadow-2xl">

                                                    {/* --- 1. NEGOTIATED SUMMARY (Non-Expandable) --- */}
                                                    <div className="grid grid-cols-2 gap-4 mb-6">
                                                        <div className="bg-slate-800/30 p-3 rounded-2xl border border-slate-800">
                                                            <p className="text-slate-500 uppercase text-xs mb-1">Active TLS</p>
                                                            <p className="text-orange-400 font-black text-sm">{res.negotiated?.tlsVersion || 'N/A'}</p>
                                                        </div>
                                                        <div className="bg-slate-800/30 p-3 rounded-2xl border border-slate-800">
                                                            <p className="text-slate-500 uppercase text-xs mb-1">KEX / Size</p>
                                                            <p className="text-black font-black text-sm">
                                                                {res.negotiated?.keyExchange || 'N/A'} <span className="text-slate-500 text-xs">({res.negotiated?.serverTempKeySize || 0}b)</span>
                                                            </p>
                                                        </div>
                                                        <div className="col-span-2 bg-slate-800/30 p-3 rounded-2xl border border-slate-800">
                                                            <p className="text-slate-500 uppercase text-xs mb-1">Negotiated Cipher</p>
                                                            <p className="text-black font-mono text-xs sm:text-sm truncate">{res.negotiated?.cipher || 'N/A'}</p>
                                                        </div>
                                                    </div>

                                                    {/* --- 2. THE EXPANDABLE SECTION (Using Your Helper) --- */}
                                                    <div className="space-y-1">
                                                        {/* New Negotiated Fields */}
                                                        <ExpandableRow
                                                            label="ALPN Protocols"
                                                            data={res.negotiated?.alpn ? [res.negotiated.alpn] : []}
                                                            colorClass='text-black'
                                                        />

                                                        <ExpandableRow
                                                            label="Supported TLS Versions"
                                                            data={res.supported?.tlsVersions}
                                                            colorClass="text-blue-400"
                                                        />

                                                        <ExpandableRow
                                                            label="Supported Cipher Suites"
                                                            data={res.supported?.cipherSuites}
                                                            colorClass='text-black'
                                                        />

                                                        <ExpandableRow
                                                            label="PQC Negotiated"
                                                            data={res.pqc?.negotiated}
                                                            colorClass="text-emerald-400"
                                                        />

                                                        <ExpandableRow
                                                            label="PQC Supported Groups"
                                                            data={res.pqc?.supported}
                                                            colorClass="text-orange-400"
                                                        />

                                                        <ExpandableRow
                                                            label="Weak Ciphers"
                                                            data={res.weakCiphers}
                                                            colorClass="text-red-400"
                                                        />

                                                        <ExpandableRow
                                                            label="Vulnerabilities"
                                                            data={res.vulnerabilities}
                                                            colorClass="text-red-500"
                                                        />
                                                    </div>

                                                    {/* --- 3. SYSTEM FLAGS --- */}
                                                    <div className="mt-6 pt-4 border-t border-slate-800 grid grid-cols-2 gap-4 text-[10px]">
                                                        <div className="flex justify-between">
                                                            <span className="text-slate-500 uppercase text-xs">PFS Support</span>
                                                            <span className={res.pfsSupported ? 'text-emerald-400' : 'text-red-400'}>
                                                                {res.pfsSupported ? 'YES' : 'NO'}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-slate-500 uppercase text-xs">OCSP Stapled</span>
                                                            <span className="text-slate-300">{res.negotiated?.ocsp?.stapled ? 'YES' : 'NO'}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-slate-500 uppercase text-xs">Session Reused</span>
                                                            <span className="text-slate-300">{res.negotiated?.sessionReused ? 'YES' : 'NO'}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-slate-500 uppercase text-xs">PQC Confidence</span>
                                                            <span className="text-emerald-500 italic">{res.pqc?.confidence || 'N/A'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-10">
                                                <h4 className="text-xs sm:text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><BarChart3 size={14} /> ML Weight Distribution</h4>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-[2.5rem] text-center shadow-sm">
                                                        <p className="text-xs font-black text-emerald-600 uppercase mb-2">ML Score</p>
                                                        <p className="text-2xl font-black text-emerald-700">{Math.round(res.mlScore * 1000)}</p>
                                                    </div>
                                                    <div className="bg-blue-50 border border-blue-100 p-6 rounded-[2.5rem] text-center shadow-sm">
                                                        <p className="text-xs font-black text-blue-600 uppercase mb-2">Env Score</p>
                                                        <p className="text-2xl font-black text-blue-700">{Math.round(res.envScore * 1000)}</p>
                                                    </div>
                                                </div>
                                                <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-3">
                                                    <div className="flex justify-between text-sm font-black"><span className="text-slate-400">Criticality</span> <span className="text-slate-900">LV: {res.businessContext?.assetCriticality}</span></div>
                                                    <div className="flex justify-between text-sm font-black"><span className="text-slate-400">Dependent Services</span> <span className="text-slate-900">{res.businessContext?.dependentServices} Nodes</span></div>
                                                    <div className="flex justify-between text-sm font-black"><span className="text-slate-400">Confidentiality Weight</span> <span className="text-slate-900">{res.businessContext?.confidentialityWeight}</span></div>
                                                    <div className="flex justify-between text-sm font-black"><span className="text-slate-400">Integrity Weight</span> <span className="text-slate-900">{res.businessContext?.integrityWeight}</span></div>
                                                    <div className="flex justify-between text-sm font-black"><span className="text-slate-400">Availability Weight</span> <span className="text-slate-900">{res.businessContext?.availabilityWeight}</span></div>
                                                    <div className="flex justify-between text-sm font-black"><span className="text-slate-400">SLA Requirement</span> <span className="text-slate-900">{res.businessContext?.slaRequirement}</span></div>
                                                    <div className="flex justify-between text-sm font-black"><span className="text-slate-400">Remediation Difficulty</span> <span className="text-slate-900">{res.businessContext?.remediationDifficulty}</span></div>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <h4 className="text-xs sm:text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                    <ClipboardList size={14} /> AI Migration Advisor
                                                </h4>
                                                <div className="bg-orange-50/50 border border-orange-100 rounded-[2.5rem] p-7 h-full flex flex-col justify-evenly shadow-sm">

                                                    {/* 1. AI Recommendation Text */}
                                                    <div>
                                                        <h4 className="text-base font-black text-slate-400 tracking-widest flex items-center mb-1">AI Recommendation</h4>
                                                        <p className="text-sm font-bold text-slate-700 leading-relaxed italic">
                                                            "{matchingPlan?.recommendations || 'Aggregating per-asset neural analysis...'}"
                                                        </p>
                                                    </div>

                                                    {/* 2. NEW: PQC Technical Targets Section */}
                                                    <div className="mt-4 py-4 border-y border-orange-100/50 grid grid-cols-2 gap-4">
                                                        <div>
                                                            <h5 className="text-xs font-black text-orange-500 uppercase tracking-tighter mb-1">Recommended PQC KEX</h5>
                                                            <div className="bg-white border border-orange-100 px-3 py-2 rounded-2xl text-sm font-mono font-black text-slate-800 shadow-sm">
                                                                {matchingPlan?.recommendedPqcKex || "ML-KEM-768"}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <h5 className="text-xs font-black text-orange-500 uppercase tracking-tighter mb-1">Recommended PQC Signature</h5>
                                                            <div className="bg-white border border-orange-100 px-3 py-2 rounded-2xl text-sm font-mono font-black text-slate-800 shadow-sm">
                                                                {matchingPlan?.recommendedPqcSignature || "CRYSTALS-Dilithium"}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 3. Migration Steps */}
                                                    <div className="mt-4 space-y-3">
                                                        <h4 className="text-base font-black text-slate-400 tracking-widest flex items-center">AI Migration Steps</h4>
                                                        <div className="space-y-2">
                                                            {matchingPlan?.migrationSteps?.slice(0, 3).map((step, idx) => (
                                                                <div key={idx} className="flex gap-3 items-start text-sm font-bold text-slate-600 leading-tight">
                                                                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                                                                    {step}
                                                                </div>
                                                            )) || <p className="text-sm italic text-slate-400">Analysis in progress...</p>}
                                                        </div>
                                                    </div>

                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* --- SCAN RESILIENCE / FAILED ASSETS --- */}
            {cbomData?.failedAssets?.length > 0 && (
                <div className="bg-white border border-slate-100 rounded-[3rem] p-8 shadow-sm overflow-hidden relative">
                    <div className="absolute right-0 top-0 p-10 opacity-[0.03] pointer-events-none">
                        <XCircle size={120} className="text-rose-500" />
                    </div>

                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-4 bg-rose-50 rounded-[1.5rem] text-rose-600 shadow-inner">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <h3 className="editorial-title text-xl tracking-tight uppercase italic leading-none text-slate-900">Scan Resiliency Issues</h3>
                            <p className="text-[10px] font-black uppercase mt-2 tracking-widest text-slate-400">Non-Deterministic Handshake Analysis</p>
                        </div>
                    </div>

                    <div className="pl-2 border-l-2 border-rose-500 mb-8 max-w-2xl">
                        <p className="text-sm font-bold text-slate-500 leading-relaxed uppercase">
                            The following nodes were reachable but did not return valid cryptographic responses. 
                            As a result, a meaningful CBOM could not be generated, and these assets were excluded to preserve the integrity of the analysis.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {cbomData.failedAssets.map((fail, idx) => (
                            <div key={idx} className="bg-slate-50 border border-slate-100 rounded-2xl p-5 hover:border-rose-200 transition-all group">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                    <span className="text-sm font-black text-slate-800 uppercase italic truncate">{fail.host}</span>
                                </div>
                                <div className="text-[10px] font-bold text-rose-500 uppercase tracking-tighter leading-tight bg-white border border-rose-100 px-2 py-1 rounded-lg">
                                    {fail.reason || 'HANDSHAKE_TIMEOUT'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* --- SECTION 4: GLOBAL TECHNICAL CBOM --- */}
            <div className="bg-white rounded-[4rem] border border-slate-100 shadow-xl overflow-hidden">
                <div className="bg-slate-900 p-5 flex items-center justify-between w-full gap-3">
                    {/* Left Side: Tabs */}
                    <div className="flex gap-3 overflow-x-auto scrollbar-hide">
                        {[
                            { id: 'algorithms', label: 'Algorithms', icon: Cpu },
                            { id: 'keys', label: 'Keys', icon: Key },
                            { id: 'protocols', label: 'Protocols', icon: Globe },
                            { id: 'certificates', label: 'Certificates', icon: Shield }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTechTab(tab.id)}
                                className={`flex items-center gap-3 px-8 py-4 rounded-[1.8rem] text-sm font-black uppercase tracking-widest transition-all shrink-0 ${activeTechTab === tab.id ? 'bg-orange-500 text-slate-100 shadow-lg' : 'text-slate-800 hover:bg-slate-300'}`}
                            >
                                <tab.icon size={18} /> {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Right Side: Export Options Dropdown & Button */}
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <select
                                value={exportFormat}
                                onChange={(e) => setExportFormat(e.target.value)}
                                className="bg-slate-800 text-white border border-slate-700 px-6 py-4 pr-10 rounded-2xl text-xs sm:text-sm font-black uppercase tracking-widest focus:ring-2 focus:ring-orange-500 appearance-none cursor-pointer shadow-md"
                            >
                                <option value="pdf" className="bg-slate-900 text-white">PDF (Default)</option>
                                <option value="csv" className="bg-slate-900 text-white">CSV</option>
                                <option value="json" className="bg-slate-900 text-white">JSON</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                                <ChevronDown size={14} />
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                if (exportFormat === "pdf") {
                                    handleDownloadPDF();
                                } else {
                                    handleDownloadExport(exportFormat);
                                }
                            }}
                            disabled={downloading}
                            className="flex items-center gap-2 px-6 py-4 rounded-2xl text-xs sm:text-sm font-black uppercase tracking-widest transition-all shadow-sm shrink-0 whitespace-nowrap bg-orange-500 text-white hover:bg-orange-600 active:scale-95"
                        >
                            {downloading ? (
                                <SkeletonBlock className="h-4 w-16 bg-white/40 rounded-md" />
                            ) : (
                                <Database size={18} />
                            )}
                            {downloading ? "Generating..." : `Export ${exportFormat.toUpperCase()}`}
                        </button>
                    </div>
                </div>
                <div className="p-8">
                    {/* 1. RENDER TABLE ONLY FOR NON-CERTIFICATE TABS */}
                    {activeTechTab !== 'certificates' && (
                        <div className="space-y-12">
                            {Object.entries(
                                cbomData?.mode === 'per_asset' 
                                    ? (cbomData?.[activeTechTab] || []).reduce((acc, item) => {
                                        const key = item.asset || "Unknown Asset";
                                        if (!acc[key]) acc[key] = [];
                                        acc[key].push(item);
                                        return acc;
                                    }, {})
                                    : { "Aggregate": cbomData?.[activeTechTab] || [] }
                            ).map(([groupName, items], groupIdx) => (
                                <div key={groupIdx} className="w-full">
                                    {cbomData?.mode === 'per_asset' && (
                                        <div className="flex items-center gap-3 mb-6 bg-slate-900 px-5 py-3 rounded-2xl w-fit shadow-md">
                                            <Server className="text-orange-500" size={18} />
                                            <h3 className="text-sm font-black text-black tracking-widest uppercase">{groupName}</h3>
                                        </div>
                                    )}
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-separate border-spacing-y-2">
                                            <thead className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                                {activeTechTab === 'algorithms' && (
                                                    <tr>
                                                        <th className="px-6 py-4">Name</th>
                                                        <th className="px-6 py-4">Asset Type</th>
                                                        <th className="px-6 py-4">Primitive</th>
                                                        <th className="px-6 py-4">Mode</th>
                                                        <th className="px-6 py-4">Security Level</th>
                                                        <th className="px-6 py-4">OID</th>
                                                    </tr>
                                                )}
                                                {activeTechTab === 'keys' && (
                                                    <tr>
                                                        <th className="px-6 py-4">Name</th>
                                                        <th className="px-6 py-4">Asset Type</th>
                                                        <th className="px-6 py-4">Size</th>
                                                        <th className="px-6 py-4">State</th>
                                                        <th className="px-6 py-4">Creation</th>
                                                        <th className="px-6 py-4">Activation</th>
                                                        <th className="px-6 py-4">ID</th>
                                                    </tr>
                                                )}
                                                {activeTechTab === 'protocols' && (
                                                    <tr>
                                                        <th className="px-6 py-4">Protocol</th>
                                                        <th className="px-6 py-4">Version</th>
                                                        <th className="px-6 py-4">Cipher Suites</th>
                                                        <th className="px-6 py-4">ALPN</th>
                                                        <th className="px-6 py-4">OID</th>
                                                    </tr>
                                                )}
                                            </thead>
                                            <tbody className="text-xs font-bold">
                                                {items.map((item, idx) => (
                                                    <React.Fragment key={idx}>
                                                        <tr className="bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                                            {activeTechTab === 'algorithms' && (
                                                                <>
                                                                    <td className="px-6 py-5 text-orange-600 font-black uppercase rounded-l-[1.5rem]">{item.name || "null"}</td>
                                                                    <td className="px-6 py-5">{item.assetType || "null"}</td>
                                                                    <td className="px-6 py-5">{item.primitive || "null"}</td>
                                                                    <td className="px-6 py-5">{item.mode || "null"}</td>
                                                                    <td className="px-6 py-5">{item.classicalSecurityLevel} Bits</td>
                                                                    <td className="px-6 py-5 text-xs text-slate-400 font-mono rounded-r-[1.5rem]">{item.oid || "null"}</td>
                                                                </>
                                                            )}
                                                            {activeTechTab === 'keys' && (
                                                                <>
                                                                    <td className="px-6 py-5 font-black uppercase rounded-l-[1.5rem]">{item.name || "null"}</td>
                                                                    <td className="px-6 py-5">{item.assetType || "null"}</td>
                                                                    <td className="px-6 py-5 text-blue-500">{item.size} Bits</td>
                                                                    <td className="px-6 py-5"><span className="px-2 py-1 bg-white border rounded-md text-xs">{item.state || "null"}</span></td>
                                                                    <td className="px-6 py-5 text-slate-400">{item.creationDate || "null"}</td>
                                                                    <td className="px-6 py-5 text-slate-400">{item.activationDate || "null"}</td>
                                                                    <td className="px-6 py-5 text-xs text-slate-400 font-mono rounded-r-[1.5rem]">{item.id || "null"}</td>
                                                                </>
                                                            )}
                                                            {activeTechTab === 'protocols' && (
                                                                <>
                                                                    <td className="px-6 py-5 font-black text-slate-900 uppercase rounded-l-[1.5rem]">{item.name || "null"}</td>
                                                                    <td className="px-6 py-5">{Array.isArray(item.version) ? item.version.join(', ') : item.version}</td>
                                                                    <td className="px-6 py-5">
                                                                        <button onClick={() => setExpandedProtocolIndex(expandedProtocolIndex === idx ? null : idx)} className="flex items-center gap-2 text-orange-500">
                                                                            {item.cipherSuites?.length || 0} Suites
                                                                            {expandedProtocolIndex === idx ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                                        </button>
                                                                    </td>
                                                                    <td className="px-6 py-5 font-mono">{item.alpn || "N/A"}</td>
                                                                    <td className="px-6 py-5 text-xs text-slate-400 font-mono rounded-r-[1.5rem]">{item.oid || "N/A"}</td>
                                                                </>
                                                            )}
                                                        </tr>
                                                        {/* Protocol Expansion */}
                                                        {activeTechTab === 'protocols' && expandedProtocolIndex === idx && (
                                                            <tr>
                                                                <td colSpan="5" className="px-8 pb-4">
                                                                    <div className="bg-slate-900 rounded-3xl p-6 grid grid-cols-2 md:grid-cols-3 gap-3 animate-in fade-in zoom-in duration-200">
                                                                        {item.cipherSuites?.map((suite, sIdx) => (
                                                                            <div key={sIdx} className="text-xs text-slate-400 font-mono border border-slate-800 p-2 rounded-xl flex items-center gap-2">
                                                                                <div className="w-1 h-1 bg-orange-500 rounded-full" /> {suite}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 2. RENDER FULL DATA TREE FOR CERTIFICATES (Outside of Table) */}
                    {activeTechTab === 'certificates' && (
                        <div className="space-y-10">
                            {cbomData?.certificates?.map((cert, certIdx) => (
                                <div key={certIdx} className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
                                    {/* Header Strip */}
                                    <div className="bg-slate-900 p-8 flex justify-between items-center">
                                        <div>
                                            <h2 className="text-2xl font-black  tracking-tight">{cert.asset}</h2>
                                            <p className="text-orange-500 font-mono text-xs mt-1">Format: {cert.leafCertificate?.certificateFormat}</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs uppercase text-slate-500 font-bold mb-1">Fingerprint (SHA256)</div>
                                            <div className="text-xs font-mono text-slate-300 bg-slate-800 px-3 py-1 rounded-full">{cert.leafCertificate?.fingerprintSha256}</div>
                                        </div>
                                    </div>

                                    <div className="p-10 grid grid-cols-1 lg:grid-cols-3 gap-12">
                                        {/* LEFT: LEAF DATA */}
                                        <div className="space-y-8">
                                            <div>
                                                <h3 className="text-xs sm:text-sm font-black uppercase text-orange-600 mb-4 tracking-widest">Leaf Identity</h3>
                                                <div className="space-y-4">
                                                    <InfoItem label="Subject" value={cert.leafCertificate?.subjectName} highlight />
                                                    <InfoItem label="Issuer" value={cert.leafCertificate?.issuerName} />
                                                    <div className="grid grid-cols-2 gap-4 pt-2">
                                                        <InfoItem label="Valid From" value={cert.leafCertificate?.validityPeriod?.notBefore} />
                                                        <InfoItem label="Valid Until" value={cert.leafCertificate?.validityPeriod?.notAfter} isRed />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="pt-6 border-t border-slate-100">
                                                <h3 className="text-xs sm:text-sm font-black uppercase text-slate-400 mb-4 tracking-widest">Cryptography</h3>
                                                <div className="flex gap-4">
                                                    <div className="flex-1 bg-slate-50 p-4 rounded-2xl">
                                                        <p className="text-xs text-slate-400 uppercase">Public Key</p>
                                                        <p className="text-sm font-bold text-slate-700">{cert.leafCertificate?.subjectPublicKeyReference}</p>
                                                    </div>
                                                    <div className="flex-1 bg-slate-50 p-4 rounded-2xl">
                                                        <p className="text-xs text-slate-400 uppercase">Signature</p>
                                                        <p className="text-sm font-bold text-slate-700">{cert.leafCertificate?.signatureAlgorithmReference}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* MIDDLE: EXTENSIONS */}
                                        <div className="bg-slate-50/50 p-8 rounded-[2rem] border border-slate-100">
                                            <h3 className="text-xs sm:text-sm font-black uppercase text-slate-400 mb-6 tracking-widest">Cert Extensions</h3>
                                            <div className="space-y-6">
                                                <div>
                                                    <label className="text-xs font-bold text-slate-400 block mb-2">Key Usage</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {cert.leafCertificate?.certificateExtension?.keyUsage?.map(u => (
                                                            <span key={u} className="px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg uppercase">{u}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-400 block mb-2">Extended Key Usage</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {cert.leafCertificate?.certificateExtension?.extendedKeyUsage?.map(u => (
                                                            <span key={u} className="px-2 py-1 bg-slate-200 text-slate-600 text-xs font-bold rounded-lg">{u}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 border-t border-slate-200 pt-4">
                                                    <InfoItem label="CA Status" value={cert.leafCertificate?.certificateExtension?.basicConstraints?.ca ? "Authority" : "End Entity"} />
                                                    <InfoItem label="Path Len" value={cert.leafCertificate?.certificateExtension?.basicConstraints?.pathLength ?? "N/A"} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* RIGHT: TRUST TREE */}
                                        <div>
                                            <h3 className="text-xs sm:text-sm font-black uppercase text-slate-400 mb-6 tracking-widest">Trust Chain Tree</h3>
                                            <div className="relative pl-6 space-y-4 border-l-2 border-slate-100">
                                                {cert.certificateChain?.map((node, nIdx) => (
                                                    <div key={nIdx} className="relative bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                                                        <div className="absolute -left-[33px] top-6 w-4 h-4 rounded-full bg-orange-500 border-4 border-white shadow-sm" />
                                                        <p className="text-xs sm:text-sm font-black text-slate-800 break-all">{node.subject}</p>
                                                        <p className="text-xs text-slate-400 mt-1 italic">Issued by: {node.issuer}</p>
                                                        {/* Added Fingerprint here */}
                                                        <div className="bg-slate-50 p-2 rounded-lg">
                                                            <p className="text-[10px] text-slate-400 uppercase mb-1 font-bold">SHA256 Fingerprint</p>
                                                            <p className="text-xs font-mono text-slate-600 break-all uppercase leading-tight">
                                                                {node.fingerprintSha256 || "N/A"}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-8 pt-6 border-t border-slate-100">
                                                <h3 className="text-xs sm:text-sm font-black uppercase text-slate-400 mb-3 tracking-widest">Renewal History</h3>
                                                <div className="space-y-3">
                                                    {cert.leafCertificate?.certificateHistory?.map((h, hIdx) => (
                                                        <div key={hIdx} className="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                                                            <p className="text-xs sm:text-sm font-bold text-slate-700 truncate mb-1">{h.issuer}</p>
                                                            <div className="flex justify-between items-center text-xs font-mono text-slate-500">
                                                                <span>S: {h.notBefore}</span>
                                                                <span className="text-slate-300">|</span>
                                                                <span>E: {h.notAfter}</span>
                                                            </div>
                                                        </div>
                                                    )) || <p className="text-sm italic text-slate-300">No history available</p>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* --- Final Static Wrapper (No Shifting) --- */}
            <div className="fixed bottom-8 right-8 z-[9999] flex flex-col items-end">

                {/* 1. Speech Bubble - Pre-rendered & Static */}
                <div className="mb-2 mr-2 pointer-events-none">
                    <div className="bg-white border border-slate-100 shadow-2xl rounded-2xl px-4 py-3 relative max-w-[180px] border-b-2 border-r-2">
                        <p className="text-xs font-black text-slate-700 uppercase tracking-tighter leading-tight">
                            Need help with your <span className="text-orange-500">PQC Strategy?</span>
                        </p>
                        {/* Bubble Tail */}
                        <div className="absolute -bottom-1 right-6 w-3 h-3 bg-white border-r border-b border-slate-100 rotate-45"></div>
                    </div>
                </div>

                {/* 2. Anchor Point - Fixed Dimensions */}
                <div className="relative w-14 h-14 flex items-center justify-center">

                    {/* Glow - Now using a simple opacity instead of pulse to prevent jitter */}
                    <div className="absolute inset-0 bg-orange-500 rounded-full blur-xl opacity-20"></div>

                    {/* --- THE WAVING HAND - Absolute positioned outside the flex flow --- */}
                    <div
                        className="absolute -top-6 left-12 bg-white shadow-lg rounded-full w-8 h-8 flex items-center justify-center z-[10001] border-2 border-orange-100 animate-wave pointer-events-none"
                        style={{ transformOrigin: 'bottom center' }}
                    >
                        <span role="img" aria-label="wave" className="text-base">👋</span>
                    </div>

                    {/* --- THE CHATBOT COMPONENT --- */}
                    <div className="relative z-[10002]">
                        <SecurityChatbot scanId={scanId} />
                    </div>
                </div>
            </div>

            {/* --- LOOK INTO THE FUTURE MODAL --- */}
            {futureAsset && (
                (() => {
                    const stepsCount = futureAsset.migrationSteps.length;
                    const checkedStateKey = `sim_${futureAsset.host}`;

                    const handleToggle = (idx) => {
                        let newChecked;
                        if (simulatedCheckedIndices.includes(idx)) {
                            newChecked = simulatedCheckedIndices.filter(i => i !== idx);
                                        } else {
                            newChecked = [...simulatedCheckedIndices, idx];
                        }
                        setSimulatedCheckedIndices(newChecked);
                        localStorage.setItem(checkedStateKey, JSON.stringify(newChecked));
                    };

                    // Compute dynamic simulated score using the planned Hybrid Model
                    // 1. Exponential growth curve to model realistic returns (diminishing returns)
                    const totalSteps = stepsCount || 4;
                    const checkedCount = simulatedCheckedIndices.length;
                    const baseScore = futureAsset.currentScore;
                    const scoreDifference = 1000 - baseScore;
                    
                    // We use an exponential ratio so first steps have a higher contribution:
                    // e.g. Ratio = 1 - (1 - stepRate)^checkedCount
                    // If checkedCount is 0, ratio is 0. If all checked, ratio is 1.
                    const stepContributionRatio = checkedCount === totalSteps
                        ? 1
                        : 1 - Math.pow(1 - (1 / totalSteps) * 1.15, checkedCount);
                    
                    let computedScore = baseScore + (scoreDifference * stepContributionRatio);

                    // 2. Stable hostname-seeded noise so scores look organic (identical hosts get identical noise offsets)
                    let noise = 0;
                    if (futureAsset.host && checkedCount > 0 && checkedCount < totalSteps) {
                        let hash = 0;
                        for (let i = 0; i < futureAsset.host.length; i++) {
                            hash = futureAsset.host.charCodeAt(i) + ((hash << 5) - hash);
                        }
                        // Noise ranges between -12 and +12 points
                        noise = ((Math.abs(hash) % 24) - 12);
                        computedScore += noise;
                    }

                    // Enforce clean upper bounds and make sure all checks guarantee exactly 1000
                    if (checkedCount === totalSteps) {
                        computedScore = 1000;
                    }

                    const simulatedScore = Math.max(baseScore, Math.min(1000, Math.round(computedScore)));

                    return (
                        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[11000] p-4 animate-in fade-in duration-300">
                            <div className="bg-slate-900 border border-slate-800 text-white rounded-[3rem] shadow-2xl max-w-4xl w-full overflow-hidden animate-in zoom-in-95 duration-200">
                                {/* Header */}
                                <div className="p-8 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                                    <div>
                                        <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full font-black uppercase tracking-widest">
                                            Interactive PQC Simulation
                                        </span>
                                        <h3 className="text-2xl font-black italic tracking-tight uppercase mt-2 text-slate-100">
                                            {futureAsset.host}
                                        </h3>
                                    </div>
                                    <button
                                        onClick={() => setFutureAsset(null)}
                                        className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors"
                                    >
                                        <XCircle size={28} />
                                    </button>
                                </div>

                                {/* Body - Two Columns Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-800 max-h-[75vh] overflow-y-auto">
                                    {/* Left: Score Comparison & Upgrades Details */}
                                    <div className="p-8 md:col-span-2 space-y-8 flex flex-col justify-between">
                                        <div className="space-y-6">
                                            <div className="text-center bg-slate-950/40 p-8 rounded-[2rem] border border-slate-800/60 space-y-4">
                                                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block">Simulated Quantum Score</span>
                                                <div className="relative inline-block">
                                                    <span className={`text-6xl font-black tracking-tight transition-all duration-500 block ${simulatedScore === 1000 ? 'text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.4)] scale-110' : 'text-orange-400'}`}>
                                                        {simulatedScore}
                                                    </span>
                                                </div>
                                                <span className={`text-[10px] font-bold block uppercase tracking-widest transition-all duration-300 ${simulatedScore === 1000 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                                    {simulatedScore === 1000 ? 'Fully Post-Quantum Safe' : 'Simulation in Progress'}
                                                </span>
                                            </div>

                                            <div className="space-y-4">
                                                <h4 className="text-xs uppercase font-black text-slate-500 tracking-widest flex items-center gap-2">
                                                    <Cpu size={14} className="text-orange-500" /> Target Crypto Upgrades
                                                </h4>
                                                <div className="space-y-3">
                                                    <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800">
                                                        <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Key Encapsulation (KEX)</span>
                                                        <span className="font-mono text-xs font-black text-emerald-400">{futureAsset.pqcKex}</span>
                                                    </div>
                                                    <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800">
                                                        <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Digital Signature</span>
                                                        <span className="font-mono text-xs font-black text-emerald-400">{futureAsset.pqcSig}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="text-[10px] text-slate-500 leading-normal uppercase">
                                            ℹ️ Toggling checklist items simulates active deployment and provides real-time model re-scoring.
                                        </div>
                                    </div>

                                    {/* Right: Migration Checklist with Action Items */}
                                    <div className="p-8 md:col-span-3 space-y-6">
                                        <h4 className="text-xs uppercase font-black text-slate-400 tracking-widest flex items-center gap-2">
                                            <CheckCircle2 size={14} className="text-orange-500" /> Deployment Action Items
                                        </h4>
                                        <div className="space-y-3">
                                            {futureAsset.migrationSteps.map((step, idx) => {
                                                const isChecked = simulatedCheckedIndices.includes(idx);
                                                return (
                                                    <div
                                                        key={idx}
                                                        onClick={() => handleToggle(idx)}
                                                        className={`flex gap-4 items-center p-5 rounded-2xl border transition-all duration-300 cursor-pointer select-none ${isChecked ? 'bg-emerald-500/10 border-emerald-500/30 text-slate-100 shadow-md translate-x-1' : 'bg-slate-950/20 border-slate-800/40 text-slate-400 hover:border-slate-700'}`}
                                                    >
                                                        {/* Animated Custom Checkbox */}
                                                        <div className={`w-6 h-6 rounded-xl flex items-center justify-center border transition-all duration-300 ${isChecked ? 'bg-emerald-500 border-emerald-400 scale-110 rotate-[360deg]' : 'bg-slate-900 border-slate-700'}`}>
                                                            {isChecked && (
                                                                <span className="text-slate-950 font-black text-sm animate-in zoom-in duration-300">
                                                                    ✓
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className={`text-xs sm:text-sm font-black leading-snug transition-all duration-300 ${isChecked ? 'line-through opacity-70' : ''}`}>
                                                            {step}
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="p-8 bg-slate-950 border-t border-slate-800 flex justify-end gap-3">
                                    <button
                                        onClick={() => {
                                            setSimulatedCheckedIndices([]);
                                            localStorage.removeItem(checkedStateKey);
                                        }}
                                        className="px-6 py-4 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
                                    >
                                        Reset Progress
                                    </button>
                                    <button
                                        onClick={() => setFutureAsset(null)}
                                        className="px-8 py-4 rounded-2xl bg-orange-500 text-slate-950 font-black uppercase text-xs tracking-widest hover:bg-orange-400 active:scale-95 transition-all shadow-lg"
                                    >
                                        Close Simulation
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()
            )}
        </div>
    );
};

{/* Global Animations */ }
<style dangerouslySetInnerHTML={{
    __html: `
        @keyframes wave-animation {
            0%, 100% { transform: rotate(0deg); }
            20% { transform: rotate(15deg); }
            40% { transform: rotate(-10deg); }
            60% { transform: rotate(10deg); }
            80% { transform: rotate(-5deg); }
        }
        .animate-wave {
            animation: wave-animation 1s ease-in-out infinite;
        }
    `
}} />

export default ScanResultsTab;
