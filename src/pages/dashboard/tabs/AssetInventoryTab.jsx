import React, { useState, useEffect } from 'react';
import {
    Globe, Server, Search, Activity,
    Shield, Cpu, Network, ChevronDown, ChevronUp, Lock as LockIcon, Zap, LayoutGrid
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import API from "../../../services/api";
import SkeletonBlock from '../../../components/ui/SkeletonBlock';
import AssetGraph from '../../../components/AssetGraph';

const AssetInventoryTab = () => {
    const navigate = useNavigate();

    // Selection & Data States
    const [domains, setDomains] = useState([]);
    
    const [selectedDomain, setSelectedDomain] = useState(() => {
        return sessionStorage.getItem('inventory_selectedDomain') || "";
    });

    const [assets, setAssets] = useState(() => {
        try {
            const saved = sessionStorage.getItem('inventory_assets');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [scanningAssetId, setScanningAssetId] = useState(null);

    // UI Interaction States
    const [expandedAssetId, setExpandedAssetId] = useState(() => {
        return sessionStorage.getItem('inventory_expandedAssetId') || null;
    });

    const [showInventoryGraph, setShowInventoryGraph] = useState(false);

    const [detailedServices, setDetailedServices] = useState({}); // Stores results of the second route

    // Sync state variables to sessionStorage
    useEffect(() => {
        sessionStorage.setItem('inventory_selectedDomain', selectedDomain);
    }, [selectedDomain]);

    useEffect(() => {
        sessionStorage.setItem('inventory_assets', JSON.stringify(assets));
    }, [assets]);

    useEffect(() => {
        if (expandedAssetId) sessionStorage.setItem('inventory_expandedAssetId', expandedAssetId);
        else sessionStorage.removeItem('inventory_expandedAssetId');
    }, [expandedAssetId]);

    // Fetch expanded asset services if restored from refresh
    useEffect(() => {
        if (expandedAssetId && !detailedServices[expandedAssetId]) {
            const fetchServices = async () => {
                try {
                    const res = await API.get(`/services/${expandedAssetId}/services`);
                    setDetailedServices(prev => ({ ...prev, [expandedAssetId]: res.data }));
                } catch (err) {
                    console.error("Error fetching deep service details:", err);
                }
            };
            fetchServices();
        }
    }, [expandedAssetId]);

    // 1. Initial Load: Fetch Domains
    useEffect(() => {
        const fetchDomains = async () => {
            try {
                const res = await API.get("/domains");
                setDomains(res.data || []);
            } catch (err) { console.error("Error fetching domains:", err); }
        };
        fetchDomains();
    }, []);

    // 2. Fetch Assets when Domain changes (Route 1)
    const handleDomainChange = async (domainId) => {
        setSelectedDomain(domainId);
        setShowInventoryGraph(false);
        if (!domainId) {
            setAssets([]);
            return;
        }
        setLoading(true);
        try {
            const res = await API.get(`/asset-discovery/${domainId}/assets`);
            setAssets(res.data.assets || []);
            setExpandedAssetId(null); // Reset UI
        } catch (err) {
            console.error("Error fetching assets:", err);
            setAssets([]);
        } finally {
            setLoading(false);
        }
    };

    // 3. Toggle Expansion and Fetch Service Details (Route 2)
    const toggleAssetExpansion = async (assetId) => {
        if (expandedAssetId === assetId) {
            setExpandedAssetId(null);
            return;
        }

        setExpandedAssetId(assetId);

        // Only fetch if we haven't cached the deep service data yet
        if (!detailedServices[assetId]) {
            try {
                const res = await API.get(`/services/${assetId}/services`);
                setDetailedServices(prev => ({ ...prev, [assetId]: res.data }));
            } catch (err) {
                console.error("Error fetching deep service details:", err);
            }
        }
    };

    const filteredAssets = assets.filter(a =>
        a.host?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.ip?.includes(searchTerm)
    );

    const handleStartAssetScan = async (assetId) => {
        setScanningAssetId(assetId);
        try {
            const payload = {
                domainId: assets[0]?.domainId,
                scanType: "soft",
                assets: [
                    {
                        assetId,
                        businessContext: {
                            assetCriticality: 5,
                            confidentialityWeight: 5,
                            integrityWeight: 5,
                            availabilityWeight: 5,
                            slaRequirement: 5,
                            dependentServices: 0
                        }
                    }
                ]
            };

            const res = await API.post("/scan", payload);
            navigate('/dashboard/results', { state: { activeScanId: res.data.scanId } });
        } catch (err) {
            console.error("Scan trigger failed", err);
        } finally {
            setScanningAssetId(null);
        }
    };

    return (
        <div className="space-y-10 pb-24 animate-in fade-in duration-500">

            {/* --- SELECTION HUD (Consistent with HistoryTab) --- */}
            <div className="editorial-shell p-8">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                        <div className="p-5 bg-blue-50 rounded-4xl text-blue-600 shadow-inner">
                            <Server size={32} />
                        </div>
                        <div>
                            <h2 className="editorial-title text-2xl tracking-tight uppercase italic leading-none">Global Inventory</h2>
                            <p className="text-md font-mono text-slate-400 mt-2 uppercase tracking-widest font-bold">Network Endpoint Discovery</p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="relative">
                            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" size={16} />
                            <select
                                value={selectedDomain}
                                onChange={(e) => handleDomainChange(e.target.value)}
                                className="w-full sm:w-64 pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-md font-black uppercase tracking-widest focus:ring-2 focus:ring-blue-500 appearance-none"
                            >
                                <option value="">Select Domain</option>
                                {domains.map(d => <option key={d._id} value={d._id}>{d.domainName}</option>)}
                            </select>
                        </div>

                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="SEARCH ENDPOINTS..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full sm:w-64 pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-md font-black uppercase tracking-widest focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {selectedDomain && assets.length > 0 && (
                <div className="space-y-6 animate-in fade-in duration-500">
                    <div className="flex justify-between items-center px-4">
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight italic flex items-center gap-2">
                            <Network size={20} className="text-blue-500" /> Topology Graph
                        </h3>
                        <button
                            onClick={() => setShowInventoryGraph(prev => !prev)}
                            className={`flex items-center gap-2 text-xs font-black uppercase transition-colors cursor-pointer px-4 py-2 rounded-3xl bg-orange-500 text-white shadow-xl hover:bg-orange-600`}
                        >
                            {showInventoryGraph ? "Hide Graph" : "Show Graph"}
                        </button>
                    </div>

                    {showInventoryGraph && (
                        <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                            <AssetGraph
                                assets={assets}
                                domainInput={domains.find(d => d._id === selectedDomain)?.domainName || ''}
                                selectedAssets={expandedAssetId ? [expandedAssetId] : []}
                                onToggleSelectAsset={(id) => toggleAssetExpansion(id)}
                                initialZoom={0.08}
                                compactControls={true}
                                height={420}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* --- DATA AREA --- */}
            {loading ? (
                <div className="space-y-4">
                    <div className="flex items-center gap-3 px-4 mb-2">
                        <LayoutGrid className="text-blue-500" size={20} />
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight italic">
                            Detected Assets
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        {Array.from({ length: 3 }).map((_, idx) => (
                            <div key={idx} className="editorial-shell rounded-3xl p-8 space-y-6">
                                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                                    <div className="flex items-center gap-4 w-full md:w-auto">
                                        <SkeletonBlock className="h-14 w-14 rounded-3xl" />
                                        <div className="space-y-2 w-full">
                                            <SkeletonBlock className="h-6 w-56" />
                                            <SkeletonBlock className="h-4 w-64" />
                                        </div>
                                    </div>
                                    <SkeletonBlock className="h-10 w-10 rounded-full" />
                                </div>
                                <SkeletonBlock className="h-px w-full" />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <SkeletonBlock className="h-16 w-full" />
                                    <SkeletonBlock className="h-16 w-full" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : selectedDomain ? (
                <div className="space-y-4">
                    <div className="flex items-center gap-3 px-4 mb-2">
                        <LayoutGrid className="text-blue-500" size={20} />
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight italic">
                            Detected Assets ({filteredAssets.length})
                        </h3>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {filteredAssets.map((asset) => {
                            const isExpanded = expandedAssetId === asset._id;
                            const services = detailedServices[asset._id] || asset.services || [];

                            return (
                                <div key={asset._id} className={`editorial-shell rounded-3xl overflow-hidden transition-all ${isExpanded ? 'ring-2 ring-blue-500 border-transparent' : ''}`}>

                                    {/* Asset Summary Row */}
                                    <div className="p-8 flex flex-col md:flex-row justify-between items-center gap-6">
                                        <div className="flex items-center gap-4">
                                            <div className="p-4 rounded-3xl bg-slate-100 text-blue-700 shadow-sm group-hover:scale-110 transition-transform">
                                                <Activity size={24} />
                                            </div>
                                            <div>
                                                <h4 className="text-xl font-black text-slate-900 uppercase italic leading-none">{asset.host}</h4>
                                                <p className="text-md font-mono text-slate-400 mt-2 font-bold">{asset.ip} • <span className="text-blue-600 uppercase">{asset.assetType || 'Compute Node'}</span></p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-8">
                                            <div className="hidden lg:block text-right">
                                                <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Services</p>
                                                <div className="flex gap-1 justify-end">
                                                    {asset.services?.slice(0, 3).map((s, idx) => (
                                                        <span key={idx} className="bg-slate-100 text-slate-600 text-sm px-2 py-0.5 rounded font-black">{s.port}</span>
                                                    ))}
                                                    {asset.services?.length > 3 && <span className="text-slate-400 text-sm font-black">+{asset.services.length - 3}</span>}
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleStartAssetScan(asset._id)}
                                                disabled={Boolean(scanningAssetId)}
                                                className="editorial-button editorial-button-primary px-4 py-2 text-xs sm:text-sm disabled:opacity-50 cursor-pointer transition-all duration-200 ease-in-out hover:bg-red-600 hover:scale-105 hover:shadow-md"
                                            >
                                                {scanningAssetId === asset._id ? (
                                                    <SkeletonBlock className="h-4 w-14 bg-white/40 rounded-md" />
                                                ) : (
                                                    <span className="flex items-center gap-2">
                                                        <Shield size={14} /> Scan
                                                    </span>
                                                )}
                                            </button>

                                            <button
                                                onClick={() => toggleAssetExpansion(asset._id)}
                                                className={`p-3 rounded-full transition-all cursor-pointer ${isExpanded ? 'bg-blue-600 shadow-lg' : 'bg-slate-50 text-slate-400 border border-slate-400 hover:bg-slate-100'}`}
                                            >
                                                {isExpanded ? <ChevronUp size={24} color='white' /> : <ChevronDown size={24} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Asset Detail Expansion (Deep Dive) */}
                                    {isExpanded && (
                                        <div className="px-8 pb-8 animate-in slide-in-from-top-4 duration-300">
                                            <div className="border-t border-slate-50 pt-8 grid grid-cols-1 xl:grid-cols-12 gap-8">

                                                {/* Left: Services List (Deep Data from Route 2) */}
                                                <div className="xl:col-span-8 space-y-4">
                                                    <h5 className="text-md font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                        <Network size={14} className="text-blue-500" /> Active Service Topography
                                                    </h5>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {services.length > 0 ? services.map((svc,idx) => (
                                                            <div key={idx} className="bg-slate-100 rounded-3xl p-5 flex items-center justify-between group hover:bg-slate-200 transition-colors">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="p-3 bg-white rounded-xl text-emerald-500 border border-slate-200">
                                                                        <Zap size={18} />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-slate-900 font-black text-md uppercase tracking-tight">{svc.protocolName || 'TCP'}</p>
                                                                        <p className="text-md font-mono text-slate-500">Port {svc.port}</p>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className="text-sm font-black text-blue-700 uppercase border border-blue-200 px-2 py-1 rounded-lg bg-blue-50">
                                                                        Active
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )) : (
                                                            <p className="text-md text-slate-400 italic col-span-2 py-4">No active services detected in latest scan.</p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Right: Technical Metadata (Infrastructure side-bar) */}
                                                <div className="xl:col-span-4 space-y-6">
                                                    <h5 className="text-md font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                        <Cpu size={14} className="text-blue-500" /> Node Metadata
                                                    </h5>
                                                    <div className="bg-slate-50 rounded-4xl p-6 space-y-4 shadow-inner">

                                                        {/* 1. Asset Type (Direct from assetType field) */}
                                                        <div className="flex justify-between items-center border-b border-slate-200/50 pb-3">
                                                            <span className="text-sm font-black text-slate-400 uppercase">Asset Classification</span>
                                                            <span className="text-md font-bold text-slate-700 uppercase">
                                                                {asset.assetType || 'N/A'}
                                                            </span>
                                                        </div>

                                                        {/* 2. IPv4 Address (Direct from ip field) */}
                                                        <div className="flex justify-between items-center border-b border-slate-200/50 pb-3">
                                                            <span className="text-sm font-black text-slate-400 uppercase">Mapped IP</span>
                                                            <span className="text-md font-mono font-bold text-slate-700">
                                                                {asset.ip || '0.0.0.0'}
                                                            </span>
                                                        </div>

                                                        {/* 3. Service Count (Direct count of the services array) */}
                                                        <div className="flex justify-between items-center border-b border-slate-200/50 pb-3">
                                                            <span className="text-sm font-black text-slate-400 uppercase">Active Services</span>
                                                            <span className="text-md font-bold text-slate-700">
                                                                {services?.length || 0} {services?.length === 1 ? 'Port' : 'Ports'}
                                                            </span>
                                                        </div>

                                                        {/* 4. Primary Protocol (Uses the first protocolName from the services list) */}
                                                        <div className="flex justify-between items-center border-b border-slate-200/50 pb-3">
                                                            <span className="text-sm font-black text-slate-400 uppercase">Primary Protocol</span>
                                                            <span className="text-md font-bold text-blue-600">
                                                                {services?.[0]?.protocolName || 'None'}
                                                            </span>
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
            ) : (
                <div className="flex flex-col items-center justify-center py-40 opacity-30 text-center">
                    <Search size={64} className="text-slate-300 mb-6" />
                    <p className="text-md font-black uppercase tracking-[0.4em]">Select domain to initiate inventory lookup</p>
                </div>
            )}
        </div>
    );
};

export default AssetInventoryTab;