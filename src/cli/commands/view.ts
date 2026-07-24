import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { storage, escapeSql } from '../../core/storage.js';
import { getCurrentBranch } from '../../core/cache.js';

export function buildHtmlVisualizer(
  branch: string,
  nodes: any[],
  links: any[]
): string {
  const safeJsonStringify = (val: any) => {
    return JSON.stringify(val)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e');
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vision Memory Visualizer - ${branch}</title>
  <script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>
  <script src="https://unpkg.com/3d-force-graph@1.72.0/dist/3d-force-graph.min.js"></script>
  <script src="https://unpkg.com/three-spritetext@1.8.2/dist/three-spritetext.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #050811;
      --sidebar-bg: rgba(10, 15, 30, 0.85);
      --card-bg: rgba(22, 30, 49, 0.6);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-color: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #38bdf8;
      --primary-glow: rgba(56, 189, 248, 0.3);
    }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg-color);
      color: var(--text-color);
      font-family: 'Inter', sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      position: relative;
    }
    h1, h2, h3, .brand {
      font-family: 'Outfit', sans-serif;
    }
    #graph-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 1;
    }
    #sidebar {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 400px;
      background: var(--sidebar-bg);
      backdrop-filter: blur(25px);
      -webkit-backdrop-filter: blur(25px);
      border-left: 1px solid var(--border-color);
      padding: 24px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 20px;
      overflow-y: auto;
      z-index: 10;
      box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
    }
    .brand {
      font-size: 22px;
      font-weight: 700;
      background: linear-gradient(135deg, #38bdf8, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    }
    .card h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #e2e8f0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .node-detail-title {
      font-size: 15px;
      font-weight: 600;
      color: #fff;
      word-break: break-word;
      line-height: 1.4;
    }
    .tag {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 9999px;
      padding: 3px 10px;
      font-size: 11px;
      color: #38bdf8;
      display: inline-block;
      margin-right: 4px;
      margin-top: 4px;
    }
    .badge {
      font-size: 10px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      display: inline-block;
      width: fit-content;
    }
    .badge-state { background: rgba(56, 189, 248, 0.2); color: #60a5fa; }
    .badge-transition { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    
    @media (prefers-reduced-motion: reduce) {
      *, ::before, ::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
    
    .meta-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      padding-bottom: 6px;
    }
    .meta-label {
      color: var(--text-muted);
    }
    .meta-value {
      color: #fff;
      font-weight: 500;
      max-width: 60%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .thumbnail-container {
      width: 100%;
      border-radius: 8px;
      border: 1px solid var(--border-color);
      overflow: hidden;
      background: #000;
      display: flex;
      justify-content: center;
      align-items: center;
      max-height: 180px;
      position: relative;
      cursor: zoom-in;
      box-shadow: inset 0 0 20px rgba(0,0,0,0.8);
    }
    .thumbnail-container img {
      width: 100%;
      height: auto;
      max-height: 180px;
      object-fit: contain;
      transition: transform 0.3s;
    }
    .thumbnail-container:hover img {
      transform: scale(1.05);
    }
    .layout-modes {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    .btn-toggle {
      background: #0f172a;
      border: 1px solid var(--border-color);
      color: #fff;
      padding: 8px 4px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      transition: background 0.2s, border-color 0.2s;
      text-align: center;
    }
    .btn-toggle:hover {
      background: #1e293b;
    }
    .btn-toggle.active {
      background: rgba(56, 189, 248, 0.2);
      color: #38bdf8;
      border-color: #38bdf8;
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.15);
    }
    .roi-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .roi-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      padding: 10px;
      text-align: center;
    }
    .roi-value {
      font-size: 18px;
      font-weight: 700;
      color: #38bdf8;
      font-family: 'Outfit', sans-serif;
    }
    .roi-label {
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    /* Expanded modal */
    #image-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0,0,0,0.9);
      z-index: 1000;
      justify-content: center;
      align-items: center;
      cursor: zoom-out;
    }
    #image-modal img {
      max-width: 90%;
      max-height: 90%;
      object-fit: contain;
      border: 2px solid #555;
      border-radius: 4px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.8);
    }
  </style>
</head>
<body>
  <div id="graph-container"></div>
  <div id="sidebar">
    <div>
      <div class="brand">🧠 Vision Memory</div>
      <div style="font-size: 12px; color: var(--text-muted)">Active Branch: <b>${branch}</b></div>
    </div>

    <!-- ROI & Metrics Card -->
    <div class="card" id="metrics-card">
      <h3>Productivity ROI & Savings</h3>
      <div class="roi-grid">
        <div class="roi-card">
          <div class="roi-value" id="roi-time">0h</div>
          <div class="roi-label">Est. Time Saved</div>
        </div>
        <div class="roi-card">
          <div class="roi-value" id="roi-money">$0.00</div>
          <div class="roi-label">Est. Savings</div>
        </div>
        <div class="roi-card">
          <div class="roi-value" id="roi-tokens">0k</div>
          <div class="roi-label">Tokens Saved</div>
        </div>
        <div class="roi-card">
          <div class="roi-value" id="roi-rate">0%</div>
          <div class="roi-label">Cache Hit Rate</div>
        </div>
      </div>
    </div>
    
    <!-- Layout Mode Card -->
    <div class="card">
      <h3>3D Graph Layout</h3>
      <div class="layout-modes">
        <button id="layout-physics" class="btn-toggle active" onclick="setLayout('physics')">Physics</button>
        <button id="layout-dag-td" class="btn-toggle" onclick="setLayout('dag-td')">Flow (TD)</button>
        <button id="layout-dag-lr" class="btn-toggle" onclick="setLayout('dag-lr')">Flow (LR)</button>
      </div>
    </div>

    <!-- Detail Inspector Card -->
    <div id="detail-card" class="card" style="display: none;">
      <h3>Inspector</h3>
      <div id="detail-badge" class="badge"></div>
      <div id="detail-title" class="node-detail-title"></div>
      
      <!-- Thumbnail for Node -->
      <div id="detail-thumb-container" class="thumbnail-container" onclick="openModal()">
        <img id="detail-thumb-img" src="" alt="Perceptual Thumbnail">
      </div>

      <div id="detail-meta" style="display: flex; flex-direction: column; gap: 8px;"></div>
      
      <div id="detail-tags-section">
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">Tags</div>
        <div id="detail-tags"></div>
      </div>
    </div>

    <!-- Summary Statistics -->
    <div class="card" id="stats-card">
      <h3>Database Stats</h3>
      <div class="meta-item">
        <span class="meta-label">Total Cached States</span>
        <span class="meta-value" id="stats-nodes">0</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Recorded Transitions</span>
        <span class="meta-value" id="stats-links">0</span>
      </div>
    </div>
  </div>

  <!-- Modal for full screen visual thumbnail -->
  <div id="image-modal" onclick="closeModal()">
    <img id="modal-img" src="" alt="Expanded View">
  </div>

  <script>
    const allGraphNodes = ${safeJsonStringify(nodes)};
    const allGraphLinks = ${safeJsonStringify(links)};

    // Initialize 3D Force Graph
    const Graph = ForceGraph3D()(document.getElementById('graph-container'))
      .backgroundColor('#050811')
      .nodeId('id')
      .nodeLabel(node => \`State ID: \${node.id}\`)
      .nodeColor(node => node.color)
      .nodeVal(node => Math.max(1, node.val))
      .nodeOpacity(0.95)
      .nodeResolution(24)
      .linkSource('source')
      .linkTarget('target')
      .linkColor(link => link.color)
      .linkWidth(link => link.width || 2)
      .linkLabel(link => link.label || link.action)
      .linkDirectionalArrowLength(6)
      .linkDirectionalArrowRelPos(0.95)
      .linkDirectionalParticles(2)
      .linkDirectionalParticleSpeed(0.007)
      .linkCurvature(0.2)
      .onNodeClick(handleNodeClick)
      .onLinkClick(handleLinkClick)
      .onNodeHover(handleNodeHover)
      .onBackgroundClick(handleBackgroundClick)
      .graphData({ nodes: allGraphNodes, links: allGraphLinks });

    // Custom SpriteText node labels (sit above the node)
    Graph.nodeThreeObject(node => {
      // Create shortened visual descriptive label
      const desc = node.label || 'Screen State';
      const labelText = desc.length > 25 ? desc.slice(0, 22) + '...' : desc;
      const sprite = new SpriteText(labelText);
      sprite.color = '#e2e8f0';
      sprite.textHeight = 3.5;
      sprite.backgroundColor = node.color + '22'; // 13% opacity backdrop
      sprite.padding = 1.8;
      sprite.borderRadius = 3;
      sprite.position.y = 8; // Float above
      return sprite;
    })
    .nodeThreeObjectExtend(true);

    function handleNodeClick(node) {
      showNodeDetails(node);
      
      // Fly to node animation
      Graph.cameraPosition(
        { x: node.x + 100, y: node.y + 100, z: node.z + 100 },
        node, 
        1000
      );
    }

    function handleLinkClick(link) {
      showLinkDetails(link);
    }

    function handleNodeHover(node) {
      document.body.style.cursor = node ? 'pointer' : 'default';
    }

    function handleBackgroundClick() {
      document.getElementById('detail-card').style.display = 'none';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function showNodeDetails(node) {
      document.getElementById('detail-card').style.display = 'flex';
      
      const badge = document.getElementById('detail-badge');
      badge.className = 'badge badge-state';
      badge.textContent = 'State';
      
      document.getElementById('detail-title').textContent = node.label || 'Unnamed UI State';
      
      // Setup image thumbnail
      const thumbImg = document.getElementById('detail-thumb-img');
      const thumbContainer = document.getElementById('detail-thumb-container');
      if (node.thumbnail) {
        thumbImg.src = node.thumbnail;
        thumbContainer.style.display = 'flex';
      } else {
        thumbContainer.style.display = 'none';
      }

      const meta = document.getElementById('detail-meta');
      meta.innerHTML = \`
        <div class="meta-item"><span class="meta-label">ID</span><span class="meta-value" style="font-family:monospace; font-size:11px;" title="\${node.id}">\${node.id}</span></div>
        <div class="meta-item"><span class="meta-label">Access Hits</span><span class="meta-value">\${node.access_count} times</span></div>
        <div class="meta-item"><span class="meta-label">Source URL</span><span class="meta-value" title="\${escapeHtml(node.source_url || 'Unknown')}">\${escapeHtml(node.source_url || 'Unknown')}</span></div>
        <div class="meta-item"><span class="meta-label">Created</span><span class="meta-value">\${escapeHtml(new Date(node.created_at).toLocaleDateString())}</span></div>
      \`;

      const tagsContainer = document.getElementById('detail-tags');
      tagsContainer.innerHTML = '';
      if (node.tags && node.tags.length > 0) {
        node.tags.forEach(t => {
          const span = document.createElement('span');
          span.className = 'tag';
          span.textContent = t;
          tagsContainer.appendChild(span);
        });
        document.getElementById('detail-tags-section').style.display = 'block';
      } else {
        document.getElementById('detail-tags-section').style.display = 'none';
      }
    }

    function showLinkDetails(link) {
      document.getElementById('detail-card').style.display = 'flex';
      document.getElementById('detail-thumb-container').style.display = 'none';
      
      const badge = document.getElementById('detail-badge');
      badge.className = 'badge badge-transition';
      badge.textContent = 'Transition';

      document.getElementById('detail-title').textContent = \`Action: \${link.action}\`;
      
      const ratePercentage = Math.round(link.success_rate * 100);
      const totalCount = link.success_count + link.failure_count;
      
      const meta = document.getElementById('detail-meta');
      meta.innerHTML = \`
        <div class="meta-item"><span class="meta-label">From State</span><span class="meta-value" style="font-family:monospace; font-size:11px;" title="\${link.source.id}">\${link.source.id}</span></div>
        <div class="meta-item"><span class="meta-label">To State</span><span class="meta-value" style="font-family:monospace; font-size:11px;" title="\${link.target.id}">\${link.target.id}</span></div>
        <div class="meta-item"><span class="meta-label">Success Rate</span><span class="meta-value" style="color: \${link.success_rate >= 0.8 ? '#34d399' : '#fbbf24'}">\${ratePercentage}% (\${link.success_count}/\${totalCount})</span></div>
        <div class="meta-item"><span class="meta-label">Failures</span><span class="meta-value" style="color:#f87171">\${link.failure_count} times</span></div>
      \`;
      document.getElementById('detail-tags-section').style.display = 'none';
    }

    function openModal() {
      const src = document.getElementById('detail-thumb-img').src;
      if (src) {
        document.getElementById('modal-img').src = src;
        document.getElementById('image-modal').style.display = 'flex';
      }
    }

    function closeModal() {
      document.getElementById('image-modal').style.display = 'none';
    }

    function setLayout(mode) {
      document.getElementById('layout-physics').classList.remove('active');
      document.getElementById('layout-dag-td').classList.remove('active');
      document.getElementById('layout-dag-lr').classList.remove('active');
      document.getElementById('layout-' + mode).classList.add('active');

      if (mode === 'physics') {
        Graph.dagMode(null);
        Graph.d3Force('charge').strength(-150);
      } else if (mode === 'dag-td') {
        Graph.dagMode('td');
      } else if (mode === 'dag-lr') {
        Graph.dagMode('lr');
      }
    }

    function calculateROI() {
      let totalHits = 0;
      let totalLookups = 0;
      allGraphNodes.forEach(n => {
        const count = n.access_count || 1;
        totalLookups += count;
        if (count > 1) {
          totalHits += (count - 1);
        }
      });

      // ROI constants
      const SECONDS_SAVED_PER_HIT = 3.8; // LLM response baseline
      const TOKENS_SAVED_PER_HIT = 1200; // Baseline multimodal token footprint
      const DOLLAR_COST_PER_MILLION_TOKENS = 3.00;

      const timeSavedSeconds = totalHits * SECONDS_SAVED_PER_HIT;
      const timeSavedHours = timeSavedSeconds / 3600;
      const tokensSaved = totalHits * TOKENS_SAVED_PER_HIT;
      const dollarsSaved = (tokensSaved / 1000000) * DOLLAR_COST_PER_MILLION_TOKENS;
      const hitRate = totalLookups > 0 ? (totalHits / totalLookups) * 100 : 0;

      // Populate ROI panel
      document.getElementById('roi-time').textContent = timeSavedHours.toFixed(1) + 'h';
      document.getElementById('roi-money').textContent = '$' + dollarsSaved.toFixed(2);
      document.getElementById('roi-tokens').textContent = Math.round(tokensSaved / 1000).toLocaleString() + 'k';
      document.getElementById('roi-rate').textContent = Math.round(hitRate) + '%';

      // Populate Stats panel
      document.getElementById('stats-nodes').textContent = allGraphNodes.length;
      document.getElementById('stats-links').textContent = allGraphLinks.length;
    }

    calculateROI();
  </script>
</body>
</html>`;
}

export async function runView(args: string[] = []) {
  await storage.init();
  const branch = getCurrentBranch();

  const states = await storage.listStates(
    `git_branch = '${escapeSql(branch)}'`,
    1000
  );
  const transitions = await storage.listTransitions(
    `git_branch = '${escapeSql(branch)}'`,
    1000
  );

  const nodes = states.map((s) => {
    let parsedTags: string[] = [];
    try {
      if (s.tags) {
        parsedTags = Array.isArray(s.tags) ? s.tags : JSON.parse(s.tags);
      }
    } catch (e) {}

    return {
      id: s.id,
      label: s.description,
      val: s.access_count || 1,
      thumbnail: s.thumbnail,
      color:
        s.access_count > 10
          ? '#38bdf8'
          : s.access_count > 3
            ? '#818cf8'
            : '#e2e8f0',
      source_url: s.source_url,
      tags: parsedTags,
      created_at: s.created_at,
      access_count: s.access_count || 1,
    };
  });

  const links = transitions.map((t) => {
    const total = t.success_count + t.failure_count;
    const rate = total > 0 ? t.success_count / total : 1.0;
    return {
      source: t.from_state_id,
      target: t.to_state_id,
      action: t.action,
      success_count: t.success_count,
      failure_count: t.failure_count,
      success_rate: rate,
      width: Math.max(1.5, Math.min(6, total / 2)),
      color:
        rate >= 0.8 ? '#10b98180' : rate >= 0.5 ? '#f59e0b80' : '#ef444480',
    };
  });

  const htmlContent = buildHtmlVisualizer(branch, nodes, links);

  const outIdx =
    args.indexOf('--out') !== -1 ? args.indexOf('--out') : args.indexOf('-o');
  let filename = 'viewer.html';
  if (outIdx !== -1 && args[outIdx + 1]) {
    filename = args[outIdx + 1];
  } else if (fs.existsSync(path.resolve(process.cwd(), './viewer.html'))) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    filename = `viewer-${timestamp}.html`;
  }

  const htmlPath = path.resolve(process.cwd(), filename);
  fs.writeFileSync(htmlPath, htmlContent);
  console.log(`📊 Exported graph HTML to: ${htmlPath}`);

  // Open in browser
  const openCmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';
  exec(`${openCmd} "${htmlPath}"`);
}
