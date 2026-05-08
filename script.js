// ---------- 全局变量 ----------
let users = [];
let nextUserId = 1;
let currentFullPrompt = "";
let currentOutlineInsights = [];
let currentAdditionalFindings = [];
let parsedOutlineTree = [];
let currentUserProfiles = [];

const usersContainer = document.getElementById('usersContainer');
const addUserBtn = document.getElementById('addUserBtn');
const clearAllUsersBtn = document.getElementById('clearAllUsersBtn');
const saveAllUsersBtn = document.getElementById('saveAllUsersBtn');
const textSaveMsg = document.getElementById('textSaveMsg');

const deepseekApiKeyInput = document.getElementById('deepseekApiKey');
const rememberApiKeyCheck = document.getElementById('rememberApiKey');
const clearApiKeyBtn = document.getElementById('clearApiKeyBtn');
const modelSelect = document.getElementById('modelSelect');
const callDeepSeekBtn = document.getElementById('callDeepSeekBtn');
const apiCallStatus = document.getElementById('apiCallStatus');

// ---------- 统一更新所有相关按钮状态 ----------
function updateAllButtonsState() {
    const outline = document.getElementById('interviewOutline').value.trim();
    const hasOutline = outline.length > 0;
    const singleTab = document.getElementById('tab-single');
    const isSingleActive = singleTab && singleTab.classList.contains('active');

    const clearResearchBtn = document.getElementById('clearResearchBtn');
    const saveResearchBtn = document.getElementById('saveResearchBtn');
    if (clearResearchBtn && saveResearchBtn) {
        const shouldEnable = isSingleActive && hasOutline;
        clearResearchBtn.disabled = !shouldEnable;
        saveResearchBtn.disabled = !shouldEnable;
    }

    const hasValidUser = users.some(u => u.content.trim().length > 0);
    const hasAtLeastOneUser = users.length > 0;
    const shouldEnableUserBtns = hasAtLeastOneUser && hasValidUser;
    if (clearAllUsersBtn) clearAllUsersBtn.disabled = !shouldEnableUserBtns;
    if (saveAllUsersBtn) saveAllUsersBtn.disabled = !shouldEnableUserBtns;

    const generateBtn = document.getElementById('generatePromptBtn');
    if (generateBtn) {
        generateBtn.disabled = !(hasOutline && hasValidUser);
    }
    if (callDeepSeekBtn) {
        callDeepSeekBtn.disabled = !(hasOutline && hasValidUser);
    }
}

// ---------- 选项卡切换 ----------
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tabContents.forEach(content => {
                if (content.id === `tab-${tabId}`) content.classList.add('active');
                else content.classList.remove('active');
            });
            updateAllButtonsState();
        });
    });
    const outlineTextarea = document.getElementById('interviewOutline');
    if (outlineTextarea) outlineTextarea.addEventListener('input', updateAllButtonsState);
    updateAllButtonsState();
}

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'toast-notify';
    if (isError) toast.style.background = 'rgba(185, 28, 28, 0.9)';
    else toast.style.background = 'rgba(0, 0, 0, 0.85)';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1500);
}

// ---------- 提纲解析 ----------
function parseOutlineToTree(outlineText) {
    if (!outlineText.trim()) return [];
    const lines = outlineText.split(/\r?\n/);
    const stack = [];
    const tree = [];
    const patterns = [
        {
            regex: /^(#+)\s+(.+)$/, getLevel: (m) => m[1].length, process: (m) => {
                const raw = m[2].trim();
                const matchNum = raw.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
                if (matchNum) return { numbered: `${matchNum[1]} ${matchNum[2]}`, clean: matchNum[2] };
                else return { numbered: raw, clean: raw };
            }
        },
        { regex: /^(\d+(?:\.\d+)*)\s+[.、]?\s*(.+)$/, getLevel: (m) => m[1].split('.').length, process: (m) => ({ numbered: `${m[1]} ${m[2].trim()}`, clean: m[2].trim() }) },
        { regex: /^([一二三四五六七八九十]+[、])\s*(.+)$/, getLevel: () => 1, process: (m) => ({ numbered: `${m[1]} ${m[2].trim()}`, clean: m[2].trim() }) },
        { regex: /^\((\d+)\)\s*(.+)$/, getLevel: () => 1, process: (m) => ({ numbered: `(${m[1]}) ${m[2].trim()}`, clean: m[2].trim() }) }
    ];
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        for (let p of patterns) {
            const match = line.match(p.regex);
            if (match) {
                const level = p.getLevel(match);
                const { numbered, clean } = p.process(match);
                const node = { title: clean, numberedTitle: numbered, level, children: [], fullPath: numbered };
                while (stack.length >= level) stack.pop();
                if (stack.length === 0) tree.push(node);
                else stack[stack.length - 1].children.push(node);
                stack.push(node);
                break;
            }
        }
    }
    function setFullPath(node, parentPath = '') {
        node.fullPath = parentPath ? `${parentPath} > ${node.numberedTitle}` : node.numberedTitle;
        if (node.children) node.children.forEach(child => setFullPath(child, node.fullPath));
    }
    tree.forEach(root => setFullPath(root));
    return tree;
}

function renderTreeContainer(container, treeData, showDetails = false, insightsMap = new Map()) {
    if (!treeData || treeData.length === 0) {
        container.innerHTML = '<div class="empty-placeholder">无内容</div>';
        return;
    }
    const ul = document.createElement('ul');
    ul.className = 'tree-root';
    function buildNode(node, level = 0) {
        const li = document.createElement('li');
        li.className = 'tree-node';
        const headerDiv = document.createElement('div');
        headerDiv.className = 'tree-node-header';
        const toggleSpan = document.createElement('span');
        toggleSpan.className = 'toggle-icon';
        const hasChildren = node.children && node.children.length > 0;
        if (hasChildren) { toggleSpan.textContent = '▼'; toggleSpan.style.cursor = 'pointer'; }
        else { toggleSpan.textContent = '•'; toggleSpan.style.opacity = '0.5'; }
        const titleSpan = document.createElement('span');
        titleSpan.className = 'node-title';
        titleSpan.textContent = node.numberedTitle || node.title;
        headerDiv.appendChild(toggleSpan);
        headerDiv.appendChild(titleSpan);
        li.appendChild(headerDiv);
        if (showDetails) {
            const insight = insightsMap.get(node.fullPath);
            if (insight && (insight.key_findings || (insight.supporting_quotes && insight.supporting_quotes.length))) {
                const detailsDiv = document.createElement('div');
                detailsDiv.className = 'node-details';
                if (insight.key_findings) {
                    const findingsDiv = document.createElement('div');
                    findingsDiv.className = 'node-findings';
                    findingsDiv.innerHTML = `<strong>🔍 结论：</strong> ${escapeHtml(insight.key_findings)}`;
                    detailsDiv.appendChild(findingsDiv);
                }
                if (insight.supporting_quotes && insight.supporting_quotes.length) {
                    const quotesDiv = document.createElement('div');
                    quotesDiv.className = 'node-quotes';
                    const ulQuotes = document.createElement('ul');
                    insight.supporting_quotes.forEach(q => { const liq = document.createElement('li'); liq.textContent = q; ulQuotes.appendChild(liq); });
                    quotesDiv.appendChild(document.createTextNode('💬 用户原声：'));
                    quotesDiv.appendChild(ulQuotes);
                    detailsDiv.appendChild(quotesDiv);
                }
                li.appendChild(detailsDiv);
            } else if (insight === undefined && !hasChildren) {
                const noDataDiv = document.createElement('div');
                noDataDiv.className = 'node-details';
                noDataDiv.style.color = '#94a3b8';
                noDataDiv.style.fontSize = '0.75rem';
                noDataDiv.textContent = '（该维度暂无AI返回的结论和引述）';
                li.appendChild(noDataDiv);
            }
        }
        if (hasChildren) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'children-container';
            const childUl = document.createElement('ul');
            childUl.style.listStyle = 'none';
            childUl.style.paddingLeft = '0';
            node.children.forEach(child => childUl.appendChild(buildNode(child, level + 1)));
            childrenContainer.appendChild(childUl);
            li.appendChild(childrenContainer);
            let isCollapsed = false;
            headerDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                isCollapsed = !isCollapsed;
                if (isCollapsed) { childrenContainer.style.display = 'none'; toggleSpan.textContent = '▶'; }
                else { childrenContainer.style.display = 'block'; toggleSpan.textContent = '▼'; }
            });
        }
        return li;
    }
    treeData.forEach(root => ul.appendChild(buildNode(root)));
    container.innerHTML = '';
    container.appendChild(ul);
}

function buildInsightsMap(insightsArray) {
    const map = new Map();
    insightsArray.forEach(item => {
        if (item.node_path) {
            map.set(item.node_path, { key_findings: item.key_findings || '', supporting_quotes: item.supporting_quotes || [] });
            const normalized = item.node_path.replace(/\s+/g, '').replace(/[>]/g, '>');
            map.set(normalized, { key_findings: item.key_findings || '', supporting_quotes: item.supporting_quotes || [] });
        }
    });
    return map;
}

function getInsightForNode(fullPath, insightsMap) {
    let insight = insightsMap.get(fullPath);
    if (!insight) {
        const normalizedFull = fullPath.replace(/\s+/g, '').replace(/[>]/g, '>');
        insight = insightsMap.get(normalizedFull);
    }
    return insight;
}

function renderUserProfiles(profiles) {
    const container = document.getElementById('vizContainer');
    const section = document.createElement('div');
    section.className = 'report-section';
    const header = document.createElement('div');
    header.className = 'report-section-header';
    header.innerHTML = `<div class="report-section-title">👤 受访者画像小结</div><div class="report-section-subtitle">每人100字以内概括</div>`;
    const body = document.createElement('div');
    body.className = 'report-section-body';
    const grid = document.createElement('div');
    grid.className = 'profile-grid';
    if (!profiles || profiles.length === 0) {
        grid.innerHTML = '<div class="empty-placeholder" style="grid-column: 1/-1;">暂无用户画像数据</div>';
    } else {
        profiles.forEach(p => {
            const card = document.createElement('div');
            card.className = 'profile-card';
            card.innerHTML = `<div class="profile-card-name">${escapeHtml(p.user_name || '未知用户')}</div><div class="profile-card-text">${escapeHtml(p.profile || '')}</div>`;
            grid.appendChild(card);
        });
    }
    body.appendChild(grid);
    section.appendChild(header);
    section.appendChild(body);
    if (container.firstChild) {
        container.insertBefore(section, container.firstChild);
    } else {
        container.appendChild(section);
    }
}

function renderInsightsTree(tree, insightsArray) {
    const container = document.getElementById('vizContainer');
    if (!tree || tree.length === 0) {
        container.innerHTML = '<div>未识别到有效的提纲结构，请检查输入的提纲格式。</div>';
        return;
    }
    const insightsMap = buildInsightsMap(insightsArray);
    function customRenderTree(containerEl, treeData) {
        if (!treeData || treeData.length === 0) { containerEl.innerHTML = '<div>无内容</div>'; return; }
        const ul = document.createElement('ul'); ul.className = 'tree-root';
        function buildNode(node) {
            const li = document.createElement('li'); li.className = 'tree-node';
            const headerDiv = document.createElement('div'); headerDiv.className = 'tree-node-header';
            const toggleSpan = document.createElement('span'); toggleSpan.className = 'toggle-icon';
            const hasChildren = node.children && node.children.length > 0;
            if (hasChildren) { toggleSpan.textContent = '▼'; toggleSpan.style.cursor = 'pointer'; }
            else { toggleSpan.textContent = '•'; toggleSpan.style.opacity = '0.5'; }
            const titleSpan = document.createElement('span'); titleSpan.className = 'node-title';
            titleSpan.textContent = node.numberedTitle || node.title;
            headerDiv.appendChild(toggleSpan); headerDiv.appendChild(titleSpan); li.appendChild(headerDiv);
            const insight = getInsightForNode(node.fullPath, insightsMap);
            if (insight && (insight.key_findings || (insight.supporting_quotes && insight.supporting_quotes.length))) {
                const detailsDiv = document.createElement('div'); detailsDiv.className = 'node-details';
                if (insight.key_findings) {
                    const findingsDiv = document.createElement('div'); findingsDiv.className = 'node-findings';
                    findingsDiv.innerHTML = `<strong>🔍 结论：</strong> ${escapeHtml(insight.key_findings)}`;
                    detailsDiv.appendChild(findingsDiv);
                }
                if (insight.supporting_quotes && insight.supporting_quotes.length) {
                    const quotesWrapper = document.createElement('div'); quotesWrapper.className = 'node-quotes';
                    const toggleBtn = document.createElement('button'); toggleBtn.className = 'quote-toggle-btn';
                    const quoteCount = insight.supporting_quotes.length;
                    toggleBtn.innerHTML = `💬 用户原声 (${quoteCount}条) ▶`;
                    const quotesListContainer = document.createElement('div'); quotesListContainer.className = 'quotes-list-container';
                    quotesListContainer.style.display = 'none';
                    const ulQuotes = document.createElement('ul');
                    insight.supporting_quotes.forEach(q => { const liq = document.createElement('li'); liq.textContent = q; ulQuotes.appendChild(liq); });
                    quotesListContainer.appendChild(ulQuotes);
                    let isQuotesExpanded = false;
                    toggleBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        isQuotesExpanded = !isQuotesExpanded;
                        if (isQuotesExpanded) { quotesListContainer.style.display = 'block'; toggleBtn.innerHTML = `💬 用户原声 (${quoteCount}条) ▼`; }
                        else { quotesListContainer.style.display = 'none'; toggleBtn.innerHTML = `💬 用户原声 (${quoteCount}条) ▶`; }
                    });
                    quotesWrapper.appendChild(toggleBtn); quotesWrapper.appendChild(quotesListContainer);
                    detailsDiv.appendChild(quotesWrapper);
                }
                li.appendChild(detailsDiv);
            } else if (!hasChildren) {
                const noDataDiv = document.createElement('div'); noDataDiv.className = 'node-details';
                noDataDiv.style.color = '#94a3b8'; noDataDiv.style.fontSize = '0.75rem';
                noDataDiv.textContent = '（该维度暂无AI返回的结论和引述）';
                li.appendChild(noDataDiv);
            }
            if (hasChildren) {
                const childrenContainer = document.createElement('div'); childrenContainer.className = 'children-container';
                const childUl = document.createElement('ul'); childUl.style.listStyle = 'none'; childUl.style.paddingLeft = '0';
                node.children.forEach(child => childUl.appendChild(buildNode(child)));
                childrenContainer.appendChild(childUl); li.appendChild(childrenContainer);
                let isCollapsed = false;
                headerDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    isCollapsed = !isCollapsed;
                    if (isCollapsed) { childrenContainer.style.display = 'none'; toggleSpan.textContent = '▶'; }
                    else { childrenContainer.style.display = 'block'; toggleSpan.textContent = '▼'; }
                });
            }
            return li;
        }
        treeData.forEach(root => ul.appendChild(buildNode(root)));
        containerEl.innerHTML = ''; containerEl.appendChild(ul);
    }

    container.innerHTML = '';

    if (currentUserProfiles && currentUserProfiles.length > 0) {
        renderUserProfiles(currentUserProfiles);
    }

    const section1 = document.createElement('div'); section1.className = 'report-section';
    const header1 = document.createElement('div'); header1.className = 'report-section-header';
    header1.innerHTML = `<div class="report-section-title">📑 提纲维度洞察</div><div class="report-section-subtitle">点击节点可折叠/展开，原声默认折叠</div>`;
    const body1 = document.createElement('div'); body1.className = 'report-section-body';
    customRenderTree(body1, tree);
    section1.appendChild(header1); section1.appendChild(body1);
    container.appendChild(section1);

    if (currentAdditionalFindings && currentAdditionalFindings.length > 0) {
        const section2 = document.createElement('div'); section2.className = 'report-section';
        const header2 = document.createElement('div'); header2.className = 'report-section-header';
        header2.innerHTML = `<div class="report-section-title">提纲外额外发现</div><div class="report-section-subtitle">仅在允许并返回时展示</div>`;
        const body2 = document.createElement('div'); body2.className = 'report-section-body';
        const list = document.createElement('div'); list.className = 'extra-list';
        currentAdditionalFindings.forEach(ext => {
            const item = document.createElement('div'); item.className = 'extra-item';
            const quotes = (ext.quotes || []).map(q => `<li>${escapeHtml(q)}</li>`).join('');
            item.innerHTML = `<div class="extra-item-title">💡 ${escapeHtml(ext.theme || '')}</div><div class="extra-item-desc">${escapeHtml(ext.description || '')}</div><div class="extra-item-quotes"><strong>原声：</strong><ul>${quotes}</ul></div>`;
            list.appendChild(item);
        });
        body2.appendChild(list);
        section2.appendChild(header2); section2.appendChild(body2);
        container.appendChild(section2);
    }
}

function updateOutlinePreview() {
    const outlineTextarea = document.getElementById('interviewOutline');
    parsedOutlineTree = parseOutlineToTree(outlineTextarea.value);
    const container = document.getElementById('outlineTreeContainer');
    const previewDiv = document.getElementById('outlinePreview');
    if (!parsedOutlineTree || parsedOutlineTree.length === 0) { previewDiv.style.display = 'none'; return; }
    previewDiv.style.display = 'block';
    renderTreeContainer(container, parsedOutlineTree, false, new Map());
}

// ---------- 多用户管理 ----------
function renderUsers() {
    usersContainer.innerHTML = '';
    users.forEach(user => {
        const card = document.createElement('div'); card.className = 'user-card'; card.dataset.id = user.id;
        card.innerHTML = `
            <div class="user-header">
                <input type="text" class="user-name-input" value="${escapeHtml(user.name)}" placeholder="受访者名称" data-id="${user.id}" data-field="name">
                <div class="user-actions">
                    <button class="btn-icon upload-user-btn" data-id="${user.id}">📄 上传文件</button>
                    <button class="btn-icon btn-danger delete-user-btn" data-id="${user.id}">删除</button>
                </div>
            </div>
            <textarea class="user-textarea" rows="5" placeholder="上传或粘贴该用户的访谈转录稿..." data-id="${user.id}" data-field="content">${escapeHtml(user.content)}</textarea>
            <input type="file" accept=".txt,.md" style="display:none;" data-id="${user.id}" class="user-file-input">
        `;
        usersContainer.appendChild(card);
    });
    document.querySelectorAll('.user-name-input').forEach(inp => inp.addEventListener('change', (e) => {
        const uid = parseInt(inp.dataset.id);
        const u = users.find(u => u.id === uid);
        if (u) u.name = inp.value.trim() || `用户${uid}`;
        updateAllButtonsState();
    }));
    document.querySelectorAll('.user-textarea').forEach(ta => ta.addEventListener('input', (e) => {
        const uid = parseInt(ta.dataset.id);
        const u = users.find(u => u.id === uid);
        if (u) u.content = ta.value;
        updateAllButtonsState();
    }));
    document.querySelectorAll('.upload-user-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const uid = parseInt(btn.dataset.id);
        const fileInput = document.querySelector(`.user-file-input[data-id="${uid}"]`);
        fileInput && fileInput.click();
    }));
    document.querySelectorAll('.user-file-input').forEach(fi => fi.addEventListener('change', (e) => {
        const uid = parseInt(fi.dataset.id);
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target.result;
            const u = users.find(u => u.id === uid);
            if (u) { u.content = content; const ta = document.querySelector(`.user-textarea[data-id="${uid}"]`); if (ta) ta.value = content; updateAllButtonsState(); showToast(`✅ 已加载 ${file.name}`); }
        };
        reader.readAsText(file, 'UTF-8');
    }));
    document.querySelectorAll('.delete-user-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const uid = parseInt(btn.dataset.id);
        users = users.filter(u => u.id !== uid);
        renderUsers();
        updateAllButtonsState();
    }));
    updateAllButtonsState();
}

function addUser() { users.push({ id: nextUserId++, name: `受访者${nextUserId - 1}`, content: '' }); renderUsers(); }
function clearAllUsers() { users = []; nextUserId = 1; renderUsers(); updateAllButtonsState(); showToast("🗑️ 清空所有用户"); }
function saveAllUsers() { showToast("✅ 所有用户已保存"); }
addUserBtn.addEventListener('click', addUser);
clearAllUsersBtn.addEventListener('click', clearAllUsers);
saveAllUsersBtn.addEventListener('click', saveAllUsers);
addUser();

function getAllUsersMergedText() {
    return users.map(u => u.content.trim() ? `【用户：${u.name}】\n${u.content.trim()}\n【/用户：${u.name}】` : "").filter(t => t).join("\n\n");
}

// ---------- 构建 Prompt ----------
function buildPromptWithContext() {
    const mergedText = getAllUsersMergedText();
    if (!mergedText.trim()) { showToast("请至少为一个用户填写访谈文本内容！", true); return null; }
    const topic = document.getElementById('researchTopic').value.trim();
    const projectBg = document.getElementById('projectBackground').value.trim();
    const researchGoal = document.getElementById('researchBackground').value.trim();
    const outline = document.getElementById('interviewOutline').value.trim();
    if (!outline) { showToast("请先填写访谈提纲维度！", true); return null; }
    const focus = document.getElementById('focusContent').value.trim();
    const custom = document.getElementById('customInstructions').value.trim();
    const allowExtra = document.getElementById('allowExtraFindings').checked;
    const userNames = users.map(u => u.name.trim()).filter(n => n);
    let manualTagRule = userNames.length ? `手动受访者标签：${userNames.map(n => `"${n}"`).join('、')}。` : "";
    const outlineTree = parseOutlineToTree(outline);
    let outlineStructure = "";
    if (outlineTree.length) {
        const paths = [];
        function collectPaths(node) { paths.push(node.fullPath); node.children.forEach(collectPaths); }
        outlineTree.forEach(collectPaths);
        outlineStructure = paths.map(p => `- ${p}`).join('\n');
    } else { outlineStructure = outline.trim() || "未提供有效提纲"; }
    const focusInstruction = focus ? `\n## 重点关注内容（必须着重提取）\n用户指定以下内容为本次分析的重点关注方向，请在各维度结论和引述中特别关注这些主题，并确保相关用户原声被优先提取和总结：\n${focus}\n` : "";
    const extraInstruction = allowExtra ? `\n**额外要求**：请额外分析并输出一个 "additional_findings" 数组，包含超出上述提纲范围但非常重要的主题或洞察。每个元素包含 "theme", "description", "quotes" (至少2条用户原声，带【用户名】)。如果无则输出空数组。` : `\n**重要**：不要输出任何超出提纲范围的内容，仅严格按上述提纲节点进行分析。`;
    const coreTaskDesc = `## 核心任务
1. **忽略访谈者（调研员）的话语**：访谈者的问题仅作为理解上下文的参考，帮助您更好地聚类受访者回答的维度，但**最终的编码引述必须只包含受访者的话语**，并标注来源用户（格式：【用户名】引述内容）。
2. **按提纲层级归类**：将受访者的回答内容归类到提纲的对应节点下（node_path 必须与给定的提纲层级路径完全匹配）。
3. **提炼每个节点的核心结论（key_findings）**：
   - **必须输出一个综合性的总体结论**，该结论应跨所有受访者进行归纳，反映该维度的整体发现、共性或主要分歧。
   - **严禁**按不同受访者分别罗列观点（例如："用户A认为…，用户B认为…"）。结论应是一段连贯的、总结性的文字。
4. **提取典型原声**：每个节点至少提供2-5条带用户标签的原文引述（supporting_quotes），这些引述用于支撑上述总体结论，而非代替结论本身。`;

    const profileTaskDesc = `5. **为每位受访者生成简短画像（user_profiles）**：
   - 基于该用户在整个访谈中透露的关键信息（如行为特征、态度、痛点、使用场景、需求等），提炼一句高度概括的用户画像。
   - **要求**：每条画像字数必须严格控制在 **100字以内**，语言精炼、突出该用户最显著的特征。
   - 输出格式：数组中每个元素包含 "user_name" （与访谈文本中的用户名一致）和 "profile" （画像文本）。`;

    const prompt = `你是一位具有互联网行业背景的资深用户研究专家。请采用提纲驱动的编码方式，严格基于以下访谈提纲维度对多用户访谈文本进行分析。

${coreTaskDesc}
${profileTaskDesc}
${focusInstruction}
## 研究定向
主题: ${topic || "未提供"}
背景: ${projectBg || "未提供"}
目标: ${researchGoal || "未提供"}
自定义指令: ${custom || "无"}

## 访谈提纲层级结构（必须严格遵循，作为归码框架）
${outlineStructure}

## 角色识别与编码规则
- ${manualTagRule}
- 仅对受访者话语进行引述，标注来源如【张三】。
- 访谈者标识（如"访谈员："、"问："、"Q："等）不要出现在引述中，但可帮助您判断对话脉络。

${extraInstruction}

## 输出JSON格式要求
请返回如下结构的JSON对象：
{
  "outline_insights": [
    {
      "node_path": "1. 使用习惯 > 1.1 使用频率",
      "key_findings": "综合多个用户的总体结论...",
      "supporting_quotes": ["【用户A】...", "【用户B】..."]
    }
  ],
  "additional_findings": [],
  "user_profiles": [
    {
      "user_name": "张三",
      "profile": "极度依赖快捷操作的重度用户，对响应速度敏感，常使用碎片时间处理工作。"
    }
  ]
}

## 访谈文本（已标注用户）
${mergedText}

请严格输出合法JSON，不要额外解释。`;
    return prompt;
}

// ---------- 通用解析函数 ----------
function processApiResult(result) {
    if (!result.outline_insights && !result.additional_findings && !result.user_profiles) {
        throw new Error("JSON中缺少必要字段 outline_insights 或 user_profiles");
    }
    currentOutlineInsights = result.outline_insights || [];
    currentAdditionalFindings = result.additional_findings || [];
    currentUserProfiles = result.user_profiles || [];

    const outlineText = document.getElementById('interviewOutline').value;
    if (outlineText.trim()) {
        parsedOutlineTree = parseOutlineToTree(outlineText);
    }
    if (!parsedOutlineTree.length) {
        showToast("未找到有效的提纲结构，请先保存提纲。", true);
        return false;
    }

    renderInsightsTree(parsedOutlineTree, currentOutlineInsights);
    document.getElementById('exportReportBtn').disabled = false;
    return true;
}

// ---------- DeepSeek API 调用 ----------
async function callDeepSeekAPI(prompt, apiKey, model) {
    const url = 'https://api.deepseek.com/v1/chat/completions';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };
    const body = {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
    };
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }
    const data = await response.json();
    const content = data.choices[0].message.content;
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    return JSON.parse(jsonStr);
}

async function handleCallDeepSeek() {
    const apiKey = deepseekApiKeyInput.value.trim();
    if (!apiKey) { showToast("请先输入 DeepSeek API Key", true); return; }
    const model = modelSelect.value;
    const prompt = buildPromptWithContext();
    if (!prompt) return;
    currentFullPrompt = prompt;
    document.getElementById('promptPreview').innerText = prompt;
    apiCallStatus.innerHTML = '⏳ 正在调用 DeepSeek API，请稍候...';
    apiCallStatus.style.color = '#2563eb';
    callDeepSeekBtn.disabled = true;
    try {
        const result = await callDeepSeekAPI(prompt, apiKey, model);
        processApiResult(result);
        apiCallStatus.innerHTML = '✅ AI 分析完成，结果已自动展示！';
        apiCallStatus.style.color = '#059669';
        showToast("分析成功，报告已生成");
        if (rememberApiKeyCheck.checked) localStorage.setItem('deepseek_api_key', apiKey);
        else localStorage.removeItem('deepseek_api_key');
    } catch (err) {
        console.error(err);
        apiCallStatus.innerHTML = `❌ 调用失败: ${err.message}`;
        apiCallStatus.style.color = '#b91c1c';
        showToast(`错误: ${err.message}`, true);
    } finally {
        callDeepSeekBtn.disabled = false;
    }
}

// ---------- 手动粘贴JSON解析 ----------
function handleManualJsonParse() {
    const inputEl = document.getElementById('manualJsonInput');
    const statusEl = document.getElementById('manualParseStatus');
    const rawJson = inputEl.value.trim();
    if (!rawJson) {
        showToast("请粘贴JSON内容", true);
        return;
    }
    try {
        let jsonStr = rawJson;
        const codeBlockMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) jsonStr = codeBlockMatch[1];
        const result = JSON.parse(jsonStr);
        processApiResult(result);
        statusEl.innerHTML = '✅ JSON 解析成功，结果已展示！';
        statusEl.style.color = '#059669';
        showToast("手动粘贴的JSON已解析并生成报告");
    } catch (e) {
        console.error(e);
        statusEl.innerHTML = `❌ JSON 解析失败: ${e.message}`;
        statusEl.style.color = '#b91c1c';
        showToast(`JSON 解析错误: ${e.message}`, true);
    }
}

// ---------- 生成报告 ----------
function generateOutlineBasedReport() {
    if ((!currentOutlineInsights || currentOutlineInsights.length === 0) && (!currentAdditionalFindings || currentAdditionalFindings.length === 0)) {
        showToast("当前没有提纲洞察数据，请先调用AI分析或手动粘贴JSON。", true);
        return null;
    }
    const topic = document.getElementById('researchTopic').value.trim() || "未提供";
    const projectBg = document.getElementById('projectBackground').value.trim() || "未提供";
    const researchGoal = document.getElementById('researchBackground').value.trim() || "未提供";
    let md = `# 访谈分析报告\n\n**生成时间**：${new Date().toLocaleString()}\n\n## 研究元信息\n- **主题**：${topic}\n- **背景**：${projectBg}\n- **目标**：${researchGoal}\n\n## 受访者列表\n${users.map(u => `- ${u.name}`).join('\n')}\n`;

    if (currentUserProfiles && currentUserProfiles.length > 0) {
        md += `\n## 👤 受访者画像小结\n`;
        currentUserProfiles.forEach(p => {
            md += `- **${p.user_name}**：${p.profile}\n`;
        });
        md += `\n`;
    }

    md += `## 提纲维度分析\n`;

    function outputNode(node, level = 0) {
        const insight = currentOutlineInsights.find(i => i.node_path === node.fullPath);
        const heading = node.numberedTitle || node.title;
        if (insight) {
            md += `\n${'#'.repeat(level + 2)} ${heading}\n\n**核心结论**：${insight.key_findings}\n\n**用户原声引用**：\n`;
            for (let q of (insight.supporting_quotes || [])) md += `- ${q}\n`;
        } else {
            if (node.children.length === 0) md += `\n${'#'.repeat(level + 2)} ${heading}\n\n*（该维度无AI返回结论）*\n`;
            else md += `\n${'#'.repeat(level + 2)} ${heading}\n`;
        }
        node.children.forEach(child => outputNode(child, level + 1));
    }
    parsedOutlineTree.forEach(root => outputNode(root, 0));
    if (currentAdditionalFindings && currentAdditionalFindings.length > 0) {
        md += `\n## 提纲外额外发现\n`;
        for (let ext of currentAdditionalFindings) {
            md += `\n### ${ext.theme}\n\n**描述**：${ext.description}\n\n**相关原声**：\n`;
            for (let q of (ext.quotes || [])) md += `- ${q}\n`;
        }
    }
    md += `\n---\n*报告基于AI提纲编码生成，引述已标注用户来源。*`;
    return md;
}

// ---------- API Key 记忆 ----------
function loadApiKeyFromStorage() {
    const saved = localStorage.getItem('deepseek_api_key');
    if (saved) {
        deepseekApiKeyInput.value = saved;
        rememberApiKeyCheck.checked = true;
    }
}
clearApiKeyBtn.addEventListener('click', () => {
    deepseekApiKeyInput.value = '';
    localStorage.removeItem('deepseek_api_key');
    rememberApiKeyCheck.checked = false;
    showToast("API Key 已清除");
});

// ---------- 手动粘贴区域折叠切换 ----------
const toggleManualBtn = document.getElementById('toggleManualBtn');
const manualPasteSection = document.getElementById('manualPasteSection');
let isManualExpanded = false;
toggleManualBtn.addEventListener('click', () => {
    isManualExpanded = !isManualExpanded;
    if (isManualExpanded) {
        manualPasteSection.style.display = 'block';
        toggleManualBtn.innerHTML = '📋 手动粘贴AI返回的JSON结果（备选）▼';
    } else {
        manualPasteSection.style.display = 'none';
        toggleManualBtn.innerHTML = '📋 手动粘贴AI返回的JSON结果（备选）▶';
    }
});

// ---------- 事件绑定 ----------
document.getElementById('generatePromptBtn').addEventListener('click', async () => {
    const p = buildPromptWithContext();
    if (!p) return;
    currentFullPrompt = p;
    document.getElementById('promptPreview').innerText = p;

    // 复制到剪贴板
    try {
        await navigator.clipboard.writeText(p);
        showToast("✅ Prompt 已复制到剪贴板！");
    } catch (err) {
        showToast("⚠️ 复制失败，请手动复制", true);
    }
    showToast("✅ Prompt 已生成，并已尝试复制到剪贴板");
});

callDeepSeekBtn.addEventListener('click', handleCallDeepSeek);

document.getElementById('parseManualJsonBtn').addEventListener('click', handleManualJsonParse);
document.getElementById('clearManualJsonBtn').addEventListener('click', () => {
    document.getElementById('manualJsonInput').value = '';
    document.getElementById('manualParseStatus').innerHTML = '';
});

document.getElementById('exportReportBtn').addEventListener('click', () => {
    const report = generateOutlineBasedReport();
    if (!report) return;
    const blob = new Blob([report], { type: "text/markdown" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `outline_report_${new Date().toISOString().slice(0, 19)}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("📑 报告已导出");
});
document.getElementById('clearResearchBtn').addEventListener('click', () => {
    ['researchTopic', 'projectBackground', 'researchBackground', 'interviewOutline', 'focusContent', 'customInstructions'].forEach(id => document.getElementById(id).value = "");
    document.getElementById('allowExtraFindings').checked = false;
    updateOutlinePreview();
    updateAllButtonsState();
    showToast("🗑️ 已清空研究定向");
});
document.getElementById('saveResearchBtn').addEventListener('click', () => {
    updateOutlinePreview();
    showToast("✅ 研究定向已保存，提纲已解析");
});

function parseBatchText(text) {
    const markers = { '【访谈主题】': 'researchTopic', '【背景信息】': 'projectBackground', '【研究目标】': 'researchBackground', '【提纲维度】': 'interviewOutline', '【重点关注】': 'focusContent', '【自定义指令】': 'customInstructions' };
    const result = {};
    let remaining = text;
    for (const [marker, fieldId] of Object.entries(markers)) {
        const regex = new RegExp(`${marker}\\s*([\\s\\S]*?)(?=${Object.keys(markers).map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}|$)`, 'i');
        const match = remaining.match(regex);
        if (match && match[1]) { result[fieldId] = match[1].trim(); remaining = remaining.replace(match[0], ''); }
        else result[fieldId] = '';
    }
    return result;
}
function fillResearchForm(data) { for (const [fieldId, value] of Object.entries(data)) { const el = document.getElementById(fieldId); if (el) el.value = value; } updateOutlinePreview(); }
document.getElementById('parseBatchBtn').addEventListener('click', () => {
    const batchText = document.getElementById('batchText').value;
    if (!batchText.trim()) { showToast("请在文本框中粘贴内容", true); return; }
    const parsed = parseBatchText(batchText);
    if (!parsed.interviewOutline || parsed.interviewOutline.trim() === '') { showToast("❌ 解析失败：必须包含【提纲维度】且内容不能为空！", true); return; }
    fillResearchForm(parsed);
    showToast("✅ 已解析并填充表单，请检查内容后保存");
    const singleTabBtn = document.querySelector('.tab-btn[data-tab="single"]');
    if (singleTabBtn) singleTabBtn.click();
    updateAllButtonsState();
});
document.getElementById('clearBatchBtn').addEventListener('click', () => { document.getElementById('batchText').value = ''; showToast("已清空批量输入框"); });
document.getElementById('batchFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { document.getElementById('batchText').value = ev.target.result; showToast(`✅ 已加载文件: ${file.name}`); };
    reader.readAsText(file, 'UTF-8');
});
function escapeHtml(str) { if (!str) return ""; return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

// 初始化
initTabs();
updateOutlinePreview();
loadApiKeyFromStorage();