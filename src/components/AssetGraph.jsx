import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Maximize2, Play, Pause, Info, Check, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';

const AssetGraph = ({ assets = [], domainInput = "", selectedAssets = [], onToggleSelectAsset, initialZoom = 0.5, compactControls = false, height = 620 }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    // Zoom and pan state stored in refs to avoid React re-render lag during drag/zoom
    const transformRef = useRef({ zoom: 1, offsetX: 0, offsetY: 0 });
    const dragRef = useRef({ isDraggingNode: null, isPanning: false, startX: 0, startY: 0 });
    const animationFrameRef = useRef(null);
    const nodesRef = useRef([]);
    const linksRef = useRef([]);

    // Hovered node state (for HTML tooltip rendering)
    const [hoveredNode, setHoveredNode] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [physicsEnabled, setPhysicsEnabled] = useState(true);

    // Compute and sync nodes/links whenever assets or domainInput change
    useEffect(() => {
        const rootHost = domainInput || assets[0]?.domainName || 'Root Domain';
        const nodesMap = {};
        const newLinks = [];

        // 1. Initialize root node
        nodesMap[rootHost] = {
            id: rootHost,
            label: rootHost,
            isRoot: true,
            isVirtual: false,
            depth: 0,
            asset: assets.find(a => a.host === rootHost) || null
        };

        // 2. Build DNS hierarchy
        assets.forEach(asset => {
            if (!asset.host) return;
            if (asset.host === rootHost) {
                // Update root node asset if it matches exactly
                nodesMap[rootHost].asset = asset;
                return;
            }

            const host = asset.host;

            if (host.endsWith(rootHost) && host !== rootHost) {
                const rootLabels = rootHost.split('.');
                const hostLabels = host.split('.');
                const diff = hostLabels.length - rootLabels.length;

                if (diff > 0) {
                    let currentHost = rootHost;
                    // Traverse from root levels up to leaf
                    for (let i = diff - 1; i >= 0; i--) {
                        const nextHost = hostLabels.slice(i).join('.');
                        const depth = diff - i;

                        if (!nodesMap[nextHost]) {
                            const matchingAsset = assets.find(a => a.host === nextHost);
                            nodesMap[nextHost] = {
                                id: nextHost,
                                label: nextHost,
                                isRoot: false,
                                isVirtual: !matchingAsset,
                                depth: depth,
                                asset: matchingAsset || null
                            };
                            newLinks.push({ source: currentHost, target: nextHost });
                        } else {
                            // If virtual node exists, check if this loop has the real asset and promote it
                            if (nodesMap[nextHost].isVirtual) {
                                const matchingAsset = assets.find(a => a.host === nextHost);
                                if (matchingAsset) {
                                    nodesMap[nextHost].isVirtual = false;
                                    nodesMap[nextHost].asset = matchingAsset;
                                }
                            }
                        }
                        currentHost = nextHost;
                    }
                } else {
                    if (!nodesMap[host]) {
                        nodesMap[host] = {
                            id: host,
                            label: host,
                            isRoot: false,
                            depth: 1,
                            asset: asset
                        };
                        newLinks.push({ source: rootHost, target: host });
                    }
                }
            } else {
                if (!nodesMap[host]) {
                    nodesMap[host] = {
                        id: host,
                        label: host,
                        isRoot: false,
                        depth: 1,
                        asset: asset
                    };
                    newLinks.push({ source: rootHost, target: host });
                }
            }
        });

        const newNodesList = Object.values(nodesMap);

        // Preserve coordinates from existing nodes to avoid jarring resets
        const oldNodesMap = {};
        nodesRef.current.forEach(node => {
            oldNodesMap[node.id] = node;
        });

        const canvas = canvasRef.current;
        const width = canvas ? canvas.width : 800;
        const height = canvas ? canvas.height : 600;

        const angleStep = (2 * Math.PI) / (newNodesList.length || 1);
        newNodesList.forEach((node, index) => {
            const oldNode = oldNodesMap[node.id];
            if (oldNode) {
                node.x = oldNode.x;
                node.y = oldNode.y;
                node.vx = oldNode.vx;
                node.vy = oldNode.vy;
            } else {
                // Fan out nodes based on depth
                if (node.isRoot) {
                    node.x = width / 2;
                    node.y = height / 2;
                } else {
                    const angle = index * angleStep;
                    const r = node.depth * 250 + Math.random() * 50;
                    node.x = width / 2 + Math.cos(angle) * r;
                    node.y = height / 2 + Math.sin(angle) * r;
                }
                node.vx = 0;
                node.vy = 0;
            }

            // Assign radiuses
            if (node.isRoot) {
                node.radius = 24;
            } else if (node.isVirtual) {
                node.radius = 8;
            } else {
                node.radius = 14;
            }
        });

        nodesRef.current = newNodesList;
        linksRef.current = newLinks;
    }, [assets, domainInput]);

    // Handle Resize
    useEffect(() => {
        const resizeCanvas = () => {
            const canvas = canvasRef.current;
            const container = containerRef.current;
            if (!canvas || !container) return;

            const rect = container.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;

                // First time auto-centering and applying initial zoom
                if (transformRef.current.offsetX === 0 && transformRef.current.offsetY === 0) {
                    transformRef.current.zoom = initialZoom;
                    transformRef.current.offsetX = rect.width / 2 - (rect.width / 2) * transformRef.current.zoom;
                    transformRef.current.offsetY = rect.height / 2 - (rect.height / 2) * transformRef.current.zoom;
                }
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
    }, []);

    // Prevent default mouse wheel scroll/zoom behavior when cursor is on the canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handlePreventWheel = (e) => {
            e.preventDefault();
        };

        canvas.addEventListener('wheel', handlePreventWheel, { passive: false });
        return () => {
            canvas.removeEventListener('wheel', handlePreventWheel);
        };
    }, []);

    // Get color theme based on node type
    const getNodeStyle = (node) => {
        const isSelected = !node.isVirtual && !node.isRoot && selectedAssets.includes(node.asset?._id);

        if (node.isRoot) {
            return {
                gradient: ['#2563eb', '#1d4ed8'],
                glow: 'rgba(37, 99, 235, 0.8)',
                labelColor: '#3b82f6'
            };
        }
        if (node.isVirtual) {
            return {
                gradient: ['#64748b', '#475569'],
                glow: 'rgba(100, 116, 139, 0.2)',
                labelColor: '#94a3b8'
            };
        }

        if (isSelected) {
            return {
                gradient: ['#ef4444', '#b91c1c'], // Selected RED
                glow: 'rgba(239, 68, 68, 0.8)',
                labelColor: '#ef4444'
            };
        }

        // Default standard nodes (Blue)
        return {
            gradient: ['#3b82f6', '#2563eb'], // Default BLUE
            glow: 'rgba(59, 130, 246, 0.6)',
            labelColor: '#3b82f6'
        };
    };

    // Main animation loop: force calculation, drag handling, rendering
    useEffect(() => {
        let isComponentActive = true;

        const tick = () => {
            if (!isComponentActive) return;

            const canvas = canvasRef.current;
            if (!canvas) {
                animationFrameRef.current = requestAnimationFrame(tick);
                return;
            }

            const ctx = canvas.getContext('2d');
            const { width, height } = canvas;
            const { zoom, offsetX, offsetY } = transformRef.current;

            // 1. Force Simulation Calculations (only if physics is enabled)
            if (physicsEnabled) {
                const nodes = nodesRef.current;
                const links = linksRef.current;
                const nodesMap = {};
                nodes.forEach(n => { nodesMap[n.id] = n; });

                const SIMULATION_DECAY = 0.94;
                const nodeCount = nodes.length;
                const REPULSION_STRENGTH = Math.max(35000, nodeCount * 5500);
                const ATTRACTION_STRENGTH = nodeCount > 60 ? 0.015 : 0.035;
                const CENTER_FORCE_STRENGTH = nodeCount > 60 ? 0.002 : 0.005;
                const LINK_LENGTH = Math.max(260, 180 + nodeCount * 7);

                // Repulsion between all nodes
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        const n1 = nodes[i];
                        const n2 = nodes[j];
                        let dx = n2.x - n1.x;
                        let dy = n2.y - n1.y;
                        if (dx === 0) dx = 0.1;
                        const distSq = dx * dx + dy * dy;
                        const dist = Math.sqrt(distSq) || 0.1;

                        const force = REPULSION_STRENGTH / distSq;
                        const fx = (dx / dist) * force;
                        const fy = (dy / dist) * force;

                        // Don't push dragging node or root away if it is fixed, let them drift gently
                        n1.vx -= fx;
                        n1.vy -= fy;
                        n2.vx += fx;
                        n2.vy += fy;
                    }
                }

                // Link attraction
                links.forEach(link => {
                    const sourceNode = nodesMap[link.source];
                    const targetNode = nodesMap[link.target];
                    if (!sourceNode || !targetNode) return;

                    const dx = targetNode.x - sourceNode.x;
                    const dy = targetNode.y - sourceNode.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;

                    // Spring force: F = k * (x - L)
                    const force = (dist - LINK_LENGTH) * ATTRACTION_STRENGTH;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;

                    sourceNode.vx += fx;
                    sourceNode.vy += fy;
                    targetNode.vx -= fx;
                    targetNode.vy -= fy;
                });

                // Pull towards center of screen
                const cx = width / 2;
                const cy = height / 2;
                nodes.forEach(node => {
                    const dx = cx - node.x;
                    const dy = cy - node.y;
                    node.vx += dx * CENTER_FORCE_STRENGTH;
                    node.vy += dy * CENTER_FORCE_STRENGTH;
                });

                // Update positions
                nodes.forEach(node => {
                    if (node.isDragging) return;
                    node.x += node.vx;
                    node.y += node.vy;
                    node.vx *= SIMULATION_DECAY;
                    node.vy *= SIMULATION_DECAY;
                });

                // Overlap prevention force
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        const n1 = nodes[i];
                        const n2 = nodes[j];
                        const dx = n2.x - n1.x;
                        const dy = n2.y - n1.y;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                        
                        const padding = nodeCount > 60 ? 65 : 45;
                        const minDist = n1.radius + n2.radius + padding;
                        
                        if (dist < minDist) {
                            const overlap = minDist - dist;
                            const pushX = (dx / dist) * overlap * 0.55;
                            const pushY = (dy / dist) * overlap * 0.55;
                            
                            if (!n1.isDragging && !n1.isRoot) {
                                n1.x -= pushX;
                                n1.y -= pushY;
                            }
                            if (!n2.isDragging && !n2.isRoot) {
                                n2.x += pushX;
                                n2.y += pushY;
                            }
                        }
                    }
                }
            }

            // 2. Render Graph
            ctx.clearRect(0, 0, width, height);

            // Draw Background Grid
            ctx.save();
            const isDark = document.documentElement.classList.contains('dark');
            ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(15, 23, 42, 0.045)';
            ctx.lineWidth = 1;
            const gridSize = 40 * zoom;
            const gridStartX = offsetX % gridSize;
            const gridStartY = offsetY % gridSize;

            for (let x = gridStartX; x < width; x += gridSize) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
            }
            for (let y = gridStartY; y < height; y += gridSize) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
            }
            ctx.restore();

            // Transform viewport (Zoom and Pan)
            ctx.save();
            ctx.translate(offsetX, offsetY);
            ctx.scale(zoom, zoom);

            const nodesMap = {};
            nodesRef.current.forEach(n => { nodesMap[n.id] = n; });
            const time = Date.now() * 0.002;

            // Draw Edges (Links)
            linksRef.current.forEach(link => {
                const source = nodesMap[link.source];
                const target = nodesMap[link.target];
                if (!source || !target) return;

                // Draw edge line
                ctx.beginPath();
                ctx.moveTo(source.x, source.y);
                ctx.lineTo(target.x, target.y);
                ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.1)';
                ctx.lineWidth = 1.8 / zoom;
                ctx.stroke();

                // Draw flow particle along the edge (animated)
                const flowSpeed = 0.8;
                const particlePos = (time * flowSpeed + (source.x + source.y) * 0.005) % 1.0;
                const px = (1 - particlePos) * source.x + particlePos * target.x;
                const py = (1 - particlePos) * source.y + particlePos * target.y;

                ctx.beginPath();
                ctx.arc(px, py, 2.5 / zoom, 0, Math.PI * 2);
                ctx.fillStyle = isDark ? '#4b7adf' : '#094cb2';
                ctx.shadowBlur = 6;
                ctx.shadowColor = '#3b82f6';
                ctx.fill();
                ctx.shadowBlur = 0; // reset shadow
            });

            // Draw Nodes
            nodesRef.current.forEach(node => {
                const styles = getNodeStyle(node);
                const isSelected = !node.isVirtual && !node.isRoot && selectedAssets.includes(node.asset?._id);

                // Draw Outer Pulsing / Selection Ring
                if (node.isRoot) {
                    ctx.beginPath();
                    const pulseRadius = node.radius + 8 + Math.sin(time * 2.5) * 4;
                    ctx.arc(node.x, node.y, pulseRadius, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(59, 130, 246, 0.18)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                } else if (isSelected) {
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
                    ctx.lineWidth = 3;
                    ctx.stroke();

                    // Tiny Checkmark indicator drawn on selection ring
                    ctx.beginPath();
                    ctx.arc(node.x + node.radius + 4, node.y - node.radius - 4, 6, 0, Math.PI * 2);
                    ctx.fillStyle = '#ef4444';
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }

                // Draw Hover Glow
                const isHovered = hoveredNode && hoveredNode.id === node.id;
                if (isHovered) {
                    ctx.save();
                    ctx.shadowBlur = 25;
                    ctx.shadowColor = styles.glow;
                }

                // Draw Node Circle
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

                // Gradient Fill
                const grad = ctx.createRadialGradient(
                    node.x - node.radius * 0.3,
                    node.y - node.radius * 0.3,
                    1,
                    node.x,
                    node.y,
                    node.radius
                );
                grad.addColorStop(0, styles.gradient[0]);
                grad.addColorStop(1, styles.gradient[1]);
                ctx.fillStyle = grad;
                ctx.fill();

                if (isHovered) {
                    ctx.restore();
                }

                // Virtual Node Stroke
                if (node.isVirtual) {
                    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }

                // Draw Text Label (only if zoom is high enough to be readable or it is a key node)
                const nodeCount = nodesRef.current.length;
                const shouldDrawLabel = nodeCount < 40 
                    ? (zoom > 0.3)
                    : (zoom > 0.65 || node.isRoot || isHovered || isSelected);

                if (shouldDrawLabel) {
                    ctx.save();
                    ctx.font = node.isRoot ? 'bold 13px "Inter", sans-serif' : '11px "Inter", sans-serif';
                    
                    const labelText = node.label;
                    const textWidth = ctx.measureText(labelText).width;

                    // Draw a subtle text background pill for high contrast readability
                    ctx.fillStyle = isDark ? 'rgba(18, 21, 27, 0.85)' : 'rgba(255, 255, 255, 0.88)';
                    ctx.beginPath();
                    ctx.roundRect(
                        node.x - textWidth / 2 - 6,
                        node.y + node.radius + 5,
                        textWidth + 12,
                        18,
                        6
                    );
                    ctx.fill();

                    // Text color
                    ctx.fillStyle = isDark ? '#f2f6fb' : '#1b1c1d';
                    ctx.textAlign = 'center';
                    ctx.fillText(labelText, node.x, node.y + node.radius + 18);
                    ctx.restore();
                }
            });

            ctx.restore();

            animationFrameRef.current = requestAnimationFrame(tick);
        };

        animationFrameRef.current = requestAnimationFrame(tick);
        return () => {
            isComponentActive = false;
            cancelAnimationFrame(animationFrameRef.current);
        };
    }, [physicsEnabled, hoveredNode, selectedAssets]);

    // Canvas Events: Drag, Zoom, Pan
    const getMousePos = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    const handleMouseDown = (e) => {
        const pos = getMousePos(e);
        const { zoom, offsetX, offsetY } = transformRef.current;

        // Convert canvas click to world space coordinates
        const worldX = (pos.x - offsetX) / zoom;
        const worldY = (pos.y - offsetY) / zoom;

        // Check if clicked a node
        let clickedNode = null;
        for (let i = nodesRef.current.length - 1; i >= 0; i--) {
            const node = nodesRef.current[i];
            const dx = node.x - worldX;
            const dy = node.y - worldY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= node.radius + 6) { // margin for easier clicking
                clickedNode = node;
                break;
            }
        }

        if (clickedNode) {
            clickedNode.isDragging = true;
            dragRef.current = {
                isDraggingNode: clickedNode,
                isPanning: false,
                startX: worldX - clickedNode.x,
                startY: worldY - clickedNode.y,
                screenX: e.clientX,
                screenY: e.clientY
            };
        } else {
            // Start panning
            dragRef.current = {
                isDraggingNode: null,
                isPanning: true,
                startX: pos.x,
                startY: pos.y,
                screenX: e.clientX,
                screenY: e.clientY
            };
        }
    };

    const handleMouseMove = (e) => {
        const pos = getMousePos(e);
        const { zoom, offsetX, offsetY } = transformRef.current;
        const worldX = (pos.x - offsetX) / zoom;
        const worldY = (pos.y - offsetY) / zoom;

        // 1. Handle Node Dragging
        if (dragRef.current.isDraggingNode) {
            const node = dragRef.current.isDraggingNode;
            node.x = worldX - dragRef.current.startX;
            node.y = worldY - dragRef.current.startY;
            node.vx = 0;
            node.vy = 0;
            return;
        }

        // 2. Handle Panning
        if (dragRef.current.isPanning) {
            const dx = pos.x - dragRef.current.startX;
            const dy = pos.y - dragRef.current.startY;
            transformRef.current.offsetX += dx;
            transformRef.current.offsetY += dy;
            dragRef.current.startX = pos.x;
            dragRef.current.startY = pos.y;
            return;
        }

        // 3. Handle Hover detection
        let currentHover = null;
        for (let i = nodesRef.current.length - 1; i >= 0; i--) {
            const node = nodesRef.current[i];
            const dx = node.x - worldX;
            const dy = node.y - worldY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= node.radius + 4) {
                currentHover = node;
                break;
            }
        }

        if (currentHover !== hoveredNode) {
            setHoveredNode(currentHover);
        }

        // Always update tooltip position relative to client canvas bounds
        if (currentHover) {
            setTooltipPos({
                x: pos.x + 20,
                y: pos.y + 15
            });
        }
    };

    const handleMouseUp = (e) => {
        const dragInfo = dragRef.current;
        if (dragInfo.isDraggingNode) {
            dragInfo.isDraggingNode.isDragging = false;
        }

        // Determine if it was a click (moved less than 5px)
        const moveX = e.clientX - (dragInfo.screenX || 0);
        const moveY = e.clientY - (dragInfo.screenY || 0);
        const distance = Math.sqrt(moveX * moveX + moveY * moveY);

        if (distance < 5) {
            const pos = getMousePos(e);
            const { zoom, offsetX, offsetY } = transformRef.current;
            const worldX = (pos.x - offsetX) / zoom;
            const worldY = (pos.y - offsetY) / zoom;

            // Find if clicked node
            let clickedNode = null;
            for (let i = nodesRef.current.length - 1; i >= 0; i--) {
                const node = nodesRef.current[i];
                const dx = node.x - worldX;
                const dy = node.y - worldY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= node.radius + 6) { // margin for easier clicking
                    clickedNode = node;
                    break;
                }
            }

            if (clickedNode && !clickedNode.isVirtual && !clickedNode.isRoot && clickedNode.asset) {
                onToggleSelectAsset(clickedNode.asset._id);
            }
        }

        dragRef.current = {
            isDraggingNode: null,
            isPanning: false,
            startX: 0,
            startY: 0,
            screenX: 0,
            screenY: 0
        };
    };

    const handleMouseLeave = () => {
        if (dragRef.current.isDraggingNode) {
            dragRef.current.isDraggingNode.isDragging = false;
        }
        dragRef.current.isPanning = false;
        setHoveredNode(null);
    };



    // Auto-fit Graph view to fit container
    const handleRecenter = () => {
        const canvas = canvasRef.current;
        if (!canvas || nodesRef.current.length === 0) return;

        const { width, height } = canvas;

        // Calculate bounds of current nodes
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        nodesRef.current.forEach(node => {
            if (node.x < minX) minX = node.x;
            if (node.x > maxX) maxX = node.x;
            if (node.y < minY) minY = node.y;
            if (node.y > maxY) maxY = node.y;
        });

        const graphW = maxX - minX || 100;
        const graphH = maxY - minY || 100;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const padding = 100;
        const scaleX = (width - padding) / graphW;
        const scaleY = (height - padding) / graphH;
        const nextZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.2), 1.5);

        transformRef.current.zoom = nextZoom;
        transformRef.current.offsetX = width / 2 - centerX * nextZoom;
        transformRef.current.offsetY = height / 2 - centerY * nextZoom;
    };

    const handleZoomIn = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const { zoom, offsetX, offsetY } = transformRef.current;
        const nextZoom = Math.min(zoom * 1.3, 5);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const worldX = (cx - offsetX) / zoom;
        const worldY = (cy - offsetY) / zoom;
        transformRef.current.zoom = nextZoom;
        transformRef.current.offsetX = cx - worldX * nextZoom;
        transformRef.current.offsetY = cy - worldY * nextZoom;
    };

    const handleZoomOut = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const { zoom, offsetX, offsetY } = transformRef.current;
        const nextZoom = Math.max(zoom / 1.3, 0.15);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const worldX = (cx - offsetX) / zoom;
        const worldY = (cy - offsetY) / zoom;
        transformRef.current.zoom = nextZoom;
        transformRef.current.offsetX = cx - worldX * nextZoom;
        transformRef.current.offsetY = cy - worldY * nextZoom;
    };

    // Quick Select All Discovered Assets
    const handleSelectAll = () => {
        const validIds = assets.map(a => a._id);
        const allSelected = validIds.every(id => selectedAssets.includes(id));
        if (allSelected) {
            // Deselect all
            validIds.forEach(id => {
                if (selectedAssets.includes(id)) onToggleSelectAsset(id);
            });
        } else {
            // Select all
            validIds.forEach(id => {
                if (!selectedAssets.includes(id)) onToggleSelectAsset(id);
            });
        }
    };

    return (
        <div ref={containerRef} style={{ height: `${height}px` }} className="relative w-full bg-slate-950 dark:bg-slate-950/70 border border-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl">
            {/* Canvas Element */}
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                className="w-full h-full block cursor-grab active:cursor-grabbing"
            />

            {/* Tooltip Overlay */}
            {hoveredNode && (
                <div
                    style={{ left: tooltipPos.x, top: tooltipPos.y }}
                    className="absolute z-50 pointer-events-none p-4 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-2xl max-w-xs transition-all duration-75 text-xs text-slate-800 dark:text-slate-200 leading-relaxed"
                >
                    <div className="font-extrabold text-sm text-slate-950 dark:text-white truncate border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
                        {hoveredNode.label}
                    </div>

                    {hoveredNode.isRoot ? (
                        <div className="flex items-center gap-1.5 font-black uppercase text-blue-500 tracking-wider text-[10px] bg-blue-500/10 px-2 py-0.5 rounded-md w-fit">
                            Root Domain
                        </div>
                    ) : hoveredNode.isVirtual ? (
                        <div className="flex items-center gap-1.5 font-bold text-slate-400 dark:text-slate-500 italic text-[10px]">
                            <Info size={10} /> Structural node (not in list)
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center gap-6">
                                <span className="font-bold text-slate-400 dark:text-slate-500">IP Address:</span>
                                <span className="font-mono font-bold">{hoveredNode.asset?.ip || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between items-center gap-6">
                                <span className="font-bold text-slate-400 dark:text-slate-500">Asset Type:</span>
                                <span className="bg-blue-500/10 text-blue-500 font-extrabold text-[10px] px-2 py-0.5 rounded uppercase">
                                    {hoveredNode.asset?.assetType || 'WEB'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center gap-6">
                                <span className="font-bold text-slate-400 dark:text-slate-500">Hierarchy Depth:</span>
                                <span className="font-extrabold">{hoveredNode.depth}</span>
                            </div>
                            <div className="flex justify-between items-center gap-6 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                                <span className="font-bold text-slate-400 dark:text-slate-500">Selection:</span>
                                <span className={`font-black uppercase text-[10px] px-2 py-0.5 rounded ${
                                    selectedAssets.includes(hoveredNode.asset?._id)
                                        ? 'bg-red-500/15 text-red-500'
                                        : 'bg-slate-500/10 text-slate-400 dark:text-slate-500'
                                }`}>
                                    {selectedAssets.includes(hoveredNode.asset?._id) ? 'Selected' : 'Deselected'}
                                </span>
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 italic mt-2 text-center">
                                Click node to toggle selection
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Float Controls Layer */}
            <div className="absolute bottom-6 left-6 right-6 flex justify-between items-center pointer-events-none">
                {/* Left side legend (always visible) */}
                <div className="flex flex-col gap-2 p-3 rounded-2xl bg-slate-900/90 dark:bg-slate-900/70 backdrop-blur-md border border-slate-800 shadow-xl pointer-events-auto text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                            <span>Root Domain</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                            <span>Asset Node</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                            <span>Selected</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                            <span>Structural Node</span>
                        </div>
                    </div>
                </div>

                {/* Right side buttons */}
                <div className="flex gap-2.5 pointer-events-auto">
                    {!compactControls && (
                        <>
                            <button
                                onClick={handleSelectAll}
                                title="Toggle select all assets"
                                className="p-3 bg-slate-900/90 dark:bg-slate-900/70 backdrop-blur-md border border-slate-800 text-slate-200 hover:text-white rounded-xl shadow-xl hover:bg-slate-800/90 transition-all font-black text-[10px] uppercase tracking-wider flex items-center gap-2"
                            >
                                <Check size={14} className="text-blue-500" />
                                Select All ({selectedAssets.length})
                            </button>
                            <button
                                onClick={() => setPhysicsEnabled(!physicsEnabled)}
                                title={physicsEnabled ? "Pause simulation layout" : "Start simulation layout"}
                                className="p-3 bg-slate-900/90 dark:bg-slate-900/70 backdrop-blur-md border border-slate-800 text-slate-200 hover:text-white rounded-xl shadow-xl hover:bg-slate-800/90 transition-all"
                            >
                                {physicsEnabled ? <Pause size={14} /> : <Play size={14} />}
                            </button>
                        </>
                    )}

                    {/* Always show only zoom controls when compact, otherwise show full set */}
                    <button
                        onClick={handleZoomIn}
                        title="Zoom In"
                        className="p-3 bg-slate-900/90 dark:bg-slate-900/70 backdrop-blur-md border border-slate-800 text-slate-200 hover:text-white rounded-xl shadow-xl hover:bg-slate-800/90 transition-all cursor-pointer"
                    >
                        <ZoomIn size={14} />
                    </button>
                    <button
                        onClick={handleZoomOut}
                        title="Zoom Out"
                        className="p-3 bg-slate-900/90 dark:bg-slate-900/70 backdrop-blur-md border border-slate-800 text-slate-200 hover:text-white rounded-xl shadow-xl hover:bg-slate-800/90 transition-all cursor-pointer"
                    >
                        <ZoomOut size={14} />
                    </button>

                    {!compactControls && (
                        <button
                            onClick={handleRecenter}
                            title="Recenter and auto-fit graph"
                            className="p-3 bg-slate-900/90 dark:bg-slate-900/70 backdrop-blur-md border border-slate-800 text-slate-200 hover:text-white rounded-xl shadow-xl hover:bg-slate-800/90 transition-all cursor-pointer"
                        >
                            <Maximize2 size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Quick instruction notice */}
            <div className="absolute top-6 left-6 p-4 rounded-2xl bg-slate-900/90 dark:bg-slate-900/70 backdrop-blur-md border border-slate-800 shadow-xl text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 pointer-events-none">
                <Info size={12} className="text-blue-500 animate-pulse" />
                Drag to pan • Use buttons to zoom • Click nodes to toggle selection
            </div>
        </div>
    );
};

export default AssetGraph;
