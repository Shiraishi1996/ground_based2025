// --- GLOBAL STATE ---
let allRows = [];
let polygonsData = [];
let nextRowId = 1;
let nextPolygonId = 1;

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. GRAB UI ELEMENTS ---
    const map = L.map('map').setView([35.681236, 139.767125], 13);
    const dataTableBody = document.getElementById('dataTableBody');
    const polygonTableBody = document.getElementById('polygonTableBody');
    const searchInput = document.getElementById('searchInput');
    const categoryInput = document.getElementById('categoryInput');
    const latInput = document.getElementById('latInput');
    const lonInput = document.getElementById('lonInput');
    const azimuthInput = document.getElementById('azimuthInput');
    const fovAngleInput = document.getElementById('fovAngleInput');
    const roadWidthInput = document.getElementById('roadWidthInput');
    const addRowBtn = document.getElementById('addRowBtn');
    const deleteRowBtn = document.getElementById('deleteRowBtn');
    const sortTimeBtn = document.getElementById('sortTimeBtn');
    const importCsvBtn = document.getElementById('importCsvBtn');
    const csvFileInput = document.getElementById('csvFileInput');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const plotSelectedBtn = document.getElementById('plotSelectedBtn');
    const plotAllBtn = document.getElementById('plotAllBtn');
    const clearTableMarkersBtn = document.getElementById('clearTableMarkersBtn');
    const importPolygonBtn = document.getElementById('importPolygonBtn');
    const polygonFileInput = document.getElementById('polygonFileInput');
    const calcStatsBtn = document.getElementById('calcStatsBtn');
    const deleteSelectedPolygonsBtn = document.getElementById('deleteSelectedPolygonsBtn');
    const exportPolygonCsvBtn = document.getElementById('exportPolygonCsvBtn');
    const clearPolygonMapBtn = document.getElementById('clearPolygonMapBtn');
    const osmBuildingTypeSelect = document.getElementById('osmBuildingType');
    const osmImportBtn = document.getElementById('osmImportBtn');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const selectAllPolygonsCheckbox = document.getElementById('selectAllPolygonsCheckbox');
    const imageAnalysisBtn = document.getElementById('imageAnalysisBtn');
    const imageAnalysisInput = document.getElementById('imageAnalysisInput');
    const numeratorFormulaInput = document.getElementById('numeratorFormula');
    const denominatorFormulaInput = document.getElementById('denominatorFormula');
    const nClustersInput = document.getElementById('nClusters');
    const targetRIInput = document.getElementById('targetRI');
    const analysisProgress = document.getElementById('analysisProgress');
    const csvMappingModal = document.getElementById('csvMappingModal');
    const csvCloseBtn = csvMappingModal.querySelector('.close-button');
    const confirmMappingBtn = document.getElementById('confirmMappingBtn');
    const imageModal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const imageCloseBtn = imageModal.querySelector('.close-button');
    let csvDataCache = null;

    // --- 2. MAP & LEGEND INITIALIZATION ---
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    const tableMarkersLayer = L.featureGroup().addTo(map);
    const polygonLayer = L.featureGroup().addTo(map);
    const legend = L.control({position: 'bottomright'});
    legend.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = '<h4>平均RI値</h4><div class="color-bar"></div><div class="labels"><span id="legend-min">0.0</span><span id="legend-mid">0.5</span><span id="legend-max">1.0</span></div>';
        return div;
    };
    legend.addTo(map);

    // --- 3. FUNCTION DEFINITIONS ---

    function formatNum(value, precision) {
        if (value === null || value === undefined) return '';
        const num = parseFloat(value);
        if (isNaN(num)) return '';
        return num.toFixed(precision);
    }
    
    function calculateGeodeticDestination(lat, lon, bearing, dist) {
        const R = 6371000;
        const lat_r = lat * Math.PI / 180, lon_r = lon * Math.PI / 180, bearing_r = bearing * Math.PI / 180;
        const lat2_r = Math.asin(Math.sin(lat_r) * Math.cos(dist / R) + Math.cos(lat_r) * Math.sin(dist / R) * Math.cos(bearing_r));
        const lon2_r = lon_r + Math.atan2(Math.sin(bearing_r) * Math.sin(dist / R) * Math.cos(lat_r), Math.cos(dist / R) - Math.sin(lat_r) * Math.sin(lat2_r));
        return [lat2_r * 180 / Math.PI, lon2_r * 180 / Math.PI];
    }
    
    function calculateBearing(lat1, lon1, lat2, lon2) {
        const lat1_r = lat1 * Math.PI / 180, lat2_r = lat2 * Math.PI / 180, dLon_r = (lon2 - lon1) * Math.PI / 180;
        const y = Math.sin(dLon_r) * Math.cos(lat2_r);
        const x = Math.cos(lat1_r) * Math.sin(lat2_r) - Math.sin(lat1_r) * Math.cos(lat2_r) * Math.cos(dLon_r);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    function calculateFovCoords(lat, lon, azimuth, angle, width) {
        if ([lat, lon, azimuth, angle, width].some(v => v === null || v === undefined || v === '')) return { fov_lat_l: null, fov_lon_l: null, fov_lat_r: null, fov_lon_r: null };
        const half_angle_r = (angle / 2) * Math.PI / 180;
        if (angle <= 0 || angle >= 360 || Math.sin(half_angle_r) === 0 || width <= 0) return { fov_lat_l: lat, fov_lon_l: lon, fov_lat_r: lat, fov_lon_r: lon };
        const distance = (width / 2) / Math.sin(half_angle_r);
        const [lat_r, lon_r] = calculateGeodeticDestination(lat, lon, (azimuth + angle / 2) % 360, distance);
        const [lat_l, lon_l] = calculateGeodeticDestination(lat, lon, (azimuth - angle / 2 + 360) % 360, distance);
        return { fov_lat_l: lat_l, fov_lon_l: lon_l, fov_lat_r: lat_r, fov_lon_r: lon_r };
    }
    
    function renderTable() {
        dataTableBody.innerHTML = '';
        const filterText = searchInput.value.toLowerCase();
        allRows.filter(row => row.category.toLowerCase().includes(filterText)).forEach(row => {
            const tr = document.createElement('tr');
            tr.dataset.id = row.id;
            tr.innerHTML = `<td><input type="checkbox" class="row-checkbox"></td><td>${row.id}</td><td>${row.category}</td><td>${formatNum(row.lat, 6)}</td><td>${formatNum(row.lon, 6)}</td><td>${formatNum(row.azimuth, 2)}</td><td>${formatNum(row.ri_r, 3)}</td><td>${formatNum(row.ri_l, 3)}</td><td>${formatNum(row.fov_lat_l, 6)}</td><td>${formatNum(row.fov_lon_l, 6)}</td><td>${formatNum(row.fov_lat_r, 6)}</td><td>${formatNum(row.fov_lon_r, 6)}</td>`;
            tr.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;
                document.querySelectorAll('#dataTableBody tr.selected').forEach(r => r.classList.remove('selected'));
                tr.classList.add('selected');
                populateFormFromSelectedRow();
            });
            dataTableBody.appendChild(tr);
        });
    }

    function renderPolygonTable() {
        polygonTableBody.innerHTML = '';
        polygonsData.forEach(poly => {
            const tr = document.createElement('tr');
            tr.dataset.id = poly.id;
            const stats = poly.stats || {};
            tr.innerHTML = `<td><input type="checkbox" class="polygon-row-checkbox"></td><td>${poly.id}</td><td>${poly.source}</td><td>${poly.vertices_lat_lon.length}</td><td>${stats.avg_ri ? formatNum(stats.avg_ri, 3) : '---'}</td><td>${stats.point_count || 0}</td>`;
            polygonTableBody.appendChild(tr);
        });
    }

    function clearInputForm() {
        categoryInput.value = ''; latInput.value = ''; lonInput.value = ''; azimuthInput.value = '';
        document.querySelectorAll('#dataTableBody tr.selected').forEach(r => r.classList.remove('selected'));
    }

    function populateFormFromSelectedRow() {
        const selectedRow = document.querySelector('#dataTableBody tr.selected');
        if (!selectedRow) return;
        const rowId = parseInt(selectedRow.dataset.id);
        const rowData = allRows.find(r => r.id === rowId);
        if (rowData) {
            categoryInput.value = rowData.category || '';
            latInput.value = rowData.lat || '';
            lonInput.value = rowData.lon || '';
            azimuthInput.value = rowData.azimuth || '';
        }
    }

    function showImageModal(imageUrl) {
        if (!imageUrl) return;
        modalImage.src = imageUrl;
        imageModal.style.display = "block";
    }
    
    function addRowToTable(data) {
        const { fov_lat_l, fov_lon_l, fov_lat_r, fov_lon_r } = calculateFovCoords(data.lat, data.lon, data.azimuth, parseFloat(fovAngleInput.value), parseFloat(roadWidthInput.value));
        allRows.push({
            id: nextRowId++, category: data.category || '未分類',
            lat: data.lat, lon: data.lon, azimuth: data.azimuth,
            ri_r: data.ri_r, ri_l: data.ri_l,
            fov_lat_l, fov_lon_l, fov_lat_r, fov_lon_r,
            processedImageURL: data.processedImageURL || null,
            timestamp: data.timestamp || null
        });
    }
    
    function deleteSelectedRows() {
        const selectedIds = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb => parseInt(cb.closest('tr').dataset.id));
        if (selectedIds.length === 0) { alert('削除する行を選択してください。'); return; }
        if (confirm(`${selectedIds.length}行を削除しますか？`)) {
            allRows = allRows.filter(row => !selectedIds.includes(row.id));
            renderTable();
        }
    }

    function deleteSelectedPolygons() {
        const selectedIds = Array.from(document.querySelectorAll('.polygon-row-checkbox:checked')).map(cb => cb.closest('tr').dataset.id);
        if (selectedIds.length === 0) { alert('削除するポリゴンを選択してください。'); return; }
        if (confirm(`${selectedIds.length}個のポリゴンを削除しますか？`)) {
            polygonsData = polygonsData.filter(poly => !selectedIds.includes(poly.id));
            renderPolygonTable();
            drawPolygonsOnMap();
        }
    }

    function getExifData(file) {
        return new Promise((resolve) => {
            EXIF.getData(file, function() {
                const latDMS = EXIF.getTag(this, "GPSLatitude");
                const lonDMS = EXIF.getTag(this, "GPSLongitude");
                const latRef = EXIF.getTag(this, "GPSLatitudeRef");
                const lonRef = EXIF.getTag(this, "GPSLongitudeRef");
                const azimuthTag = EXIF.getTag(this, "GPSImgDirection");
                const dateTime = EXIF.getTag(this, "DateTimeOriginal") || EXIF.getTag(this, "DateTime");
                if (!latDMS || !lonDMS) { resolve({ lat: null, lon: null, azimuth: null, timestamp: null }); return; }
                const toDecimal = (dms, ref) => (dms[0] + dms[1] / 60 + dms[2] / 3600) * ((ref === "S" || ref === "W") ? -1 : 1);
                const azimuth = azimuthTag ? (azimuthTag.numerator ? azimuthTag.numerator / azimuthTag.denominator : azimuthTag) : null;
                const parseableDateTime = dateTime ? dateTime.replace(':', '-').replace(':', '-') : null;
                resolve({ lat: toDecimal(latDMS, latRef), lon: toDecimal(lonDMS, lonRef), azimuth, timestamp: parseableDateTime });
            });
        });
    }

    function kmeans(data, k) {
        if (data.length < k) return { labels: [], centers: [] };
        let min = data[0], max = data[0];
        for (let i = 1; i < data.length; i++) {
            if (data[i] < min) min = data[i]; if (data[i] > max) max = data[i];
        }
        let centroids = Array.from({ length: k }, () => Math.random() * (max - min) + min);
        let labels = new Array(data.length);
        for (let iter = 0; iter < 20; iter++) {
            for (let i = 0; i < data.length; i++) {
                let minDist = Infinity, bestCentroid = -1;
                for (let j = 0; j < k; j++) {
                    const dist = Math.abs(data[i] - centroids[j]);
                    if (dist < minDist) { minDist = dist; bestCentroid = j; }
                }
                labels[i] = bestCentroid;
            }
            const oldCentroids = [...centroids];
            const clusters = Array.from({ length: k }, () => []);
            labels.forEach((label, i) => { if(clusters[label]) clusters[label].push(data[i]) });
            clusters.forEach((cluster, j) => {
                if(cluster.length > 0) centroids[j] = cluster.reduce((a, b) => a + b, 0) / cluster.length;
            });
            if (JSON.stringify(oldCentroids) === JSON.stringify(centroids)) break;
        }
        return { labels, centers: centroids };
    }

    async function analyzeImage(file, params) {
        const exif = await getExifData(file);
        if (exif.lat === null) { console.warn(`Skipping ${file.name}: No GPS data.`); return null; }
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    canvas.width = img.width; canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    const startY = Math.floor(img.height / 2);
                    const imageData = ctx.getImageData(0, startY, img.width, img.height - startY);
                    const pixels = imageData.data, riValues = [];
                    const evaluateNumerator = new Function('R', 'G', 'B', `return ${params.numeratorFormula};`);
                    const evaluateDenominator = new Function('R', 'G', 'B', `return ${params.denominatorFormula};`);
                    for (let i = 0; i < pixels.length; i += 4) {
                        try {
                            const den = evaluateDenominator(pixels[i], pixels[i+1], pixels[i+2]);
                            riValues.push(den !== 0 ? evaluateNumerator(pixels[i], pixels[i+1], pixels[i+2]) / den : Infinity);
                        } catch (e) { riValues.push(Infinity); }
                    }
                    const validRiValues = riValues.filter(v => isFinite(v));
                    if (validRiValues.length < params.n_clusters) { resolve(null); return; }
                    const { labels, centers } = kmeans(validRiValues, params.n_clusters);
                    let closestCenterIndex = -1, minCenterDist = Infinity;
                    centers.forEach((center, i) => {
                        const dist = Math.abs(center - params.target_ri_value);
                        if (dist < minCenterDist) { minCenterDist = dist; closestCenterIndex = i; }
                    });
                    
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
                    let validRiIndex = 0;
                    for (let y = 0; y < (img.height - startY); y++) {
                        for (let x = 0; x < img.width; x++) {
                            if(isFinite(riValues[y * img.width + x])) {
                                if(labels[validRiIndex] === closestCenterIndex) ctx.fillRect(x, y + startY, 1, 1);
                                validRiIndex++;
                            }
                        }
                    }
                    const processedImageURL = canvas.toDataURL('image/jpeg');
                    let leftCount = 0, rightCount = 0, totalLeftPixels = 0, totalRightPixels = 0;
                    validRiIndex = 0;
                    const midX = Math.floor(img.width / 2);
                    for (let y = 0; y < (img.height - startY); y++) {
                        for (let x = 0; x < img.width; x++) {
                            if(isFinite(riValues[y * img.width + x])) {
                                const isTarget = labels[validRiIndex] === closestCenterIndex;
                                if (x < midX) { totalLeftPixels++; if(isTarget) leftCount++; } 
                                else { totalRightPixels++; if(isTarget) rightCount++; }
                                validRiIndex++;
                            }
                        }
                    }
                    resolve({
                        category: file.name.split('.').slice(0, -1).join('.'),
                        lat: exif.lat, lon: exif.lon, azimuth: exif.azimuth,
                        ri_l: totalLeftPixels > 0 ? leftCount / totalLeftPixels : 0,
                        ri_r: totalRightPixels > 0 ? rightCount / totalRightPixels : 0,
                        processedImageURL, timestamp: exif.timestamp
                    });
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }
    
    function getColorForRI(value, min, max) {
        if (value === null || value === undefined) return '#808080';
        const range = max - min;
        if (range <= 0) return '#ffeb3b';
        const normalized = (value - min) / range;
        const r = Math.round(255 * Math.min(2 * normalized, 1));
        const g = Math.round(255 * (1 - 2 * Math.abs(normalized - 0.5)));
        const b = Math.round(255 * Math.max(1 - 2 * normalized, 0));
        return `rgb(${r},${g},${b})`;
    }
    
    function calculatePolygonStats() {
        if (polygonsData.length === 0 || allRows.length === 0) { alert("統計を計算するには、ポリゴンとデータテーブルの両方にデータが必要です。"); return; }
        polygonsData.forEach(poly => {
            const polyCoords = poly.vertices_lat_lon.map(v => [v[1], v[0]]);
            if (polyCoords.length > 0 && (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] || polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1])) polyCoords.push(polyCoords[0]);
            if (polyCoords.length < 4) return;
            const turfPolygon = turf.polygon([polyCoords]);
            let riValues = [];
            allRows.forEach(row => {
                if (isFinite(row.fov_lat_l) && isFinite(row.fov_lon_l) && isFinite(row.ri_l)) {
                    if (turf.booleanPointInPolygon(turf.point([row.fov_lon_l, row.fov_lat_l]), turfPolygon)) riValues.push(row.ri_l);
                }
                if (isFinite(row.fov_lat_r) && isFinite(row.fov_lon_r) && isFinite(row.ri_r)) {
                    if (turf.booleanPointInPolygon(turf.point([row.fov_lon_r, row.fov_lat_r]), turfPolygon)) riValues.push(row.ri_r);
                }
            });
            poly.stats = (riValues.length > 0) ? { avg_ri: riValues.reduce((a, b) => a + b, 0) / riValues.length, point_count: riValues.length } : { avg_ri: null, point_count: 0 };
        });
        alert("統計計算が完了しました。");
        renderPolygonTable();
        drawPolygonsOnMap();
    }

    function plotDataOnMap(rowsToPlot) {
        tableMarkersLayer.clearLayers();
        if (!rowsToPlot || rowsToPlot.length === 0) return;
        rowsToPlot.forEach(row => {
            if (row.lat === null || row.lon === null) return;
            const marker = L.marker([row.lat, row.lon]);
            if (row.processedImageURL) {
                marker.on('click', () => showImageModal(row.processedImageURL));
            } else {
                marker.bindPopup(`<b>${row.category}</b><br>No. ${row.id}`);
            }
            tableMarkersLayer.addLayer(marker);
            if (row.fov_lat_l && row.fov_lat_r) {
                const fovPoly = L.polygon([[row.lat, row.lon], [row.fov_lat_r, row.fov_lon_r], [row.fov_lat_l, row.fov_lon_l]], { color: 'blue', weight: 1, fillColor: '#B4C6E7', fillOpacity: 0.4 });
                tableMarkersLayer.addLayer(fovPoly);
                if(row.ri_l !== null) L.marker([row.fov_lat_l, row.fov_lon_l], { icon: L.divIcon({ className: 'ri-label', html: formatNum(row.ri_l, 2) }) }).addTo(tableMarkersLayer);
                if(row.ri_r !== null) L.marker([row.fov_lat_r, row.fov_lon_r], { icon: L.divIcon({ className: 'ri-label', html: formatNum(row.ri_r, 2) }) }).addTo(tableMarkersLayer);
            }
        });
        if (tableMarkersLayer.getLayers().length > 0) map.fitBounds(tableMarkersLayer.getBounds(), { padding: [50, 50] });
    }

    function drawPolygonsOnMap() {
        polygonLayer.clearLayers();
        const validRIs = polygonsData.map(p => p.stats?.avg_ri).filter(ri => ri !== null && ri !== undefined);
        const minRI = validRIs.length > 0 ? Math.min(...validRIs) : 0;
        const maxRI = validRIs.length > 0 ? Math.max(...validRIs) : 1;
        
        document.getElementById('legend-min').textContent = formatNum(minRI, 2);
        document.getElementById('legend-mid').textContent = formatNum(minRI + (maxRI-minRI)/2, 2);
        document.getElementById('legend-max').textContent = formatNum(maxRI, 2);

        polygonsData.forEach(poly => {
            const latLngs = poly.vertices_lat_lon.map(v => [v[0], v[1]]);
            const avgRI = poly.stats ? poly.stats.avg_ri : null;
            const color = getColorForRI(avgRI, minRI, maxRI);
            const leafletPolygon = L.polygon(latLngs, { color: 'purple', weight: 1, fillColor: color, fillOpacity: 0.6 });
            let popupContent = `<b>ID: ${poly.id}</b><br>Source: ${poly.source}`;
            if(poly.stats) popupContent += `<br><b>平均RI:</b> ${avgRI !== null ? formatNum(avgRI, 3) : 'N/A'}<br><b>内部点数:</b> ${poly.stats.point_count}`;
            leafletPolygon.bindPopup(popupContent);
            polygonLayer.addLayer(leafletPolygon);
        });
        if (polygonLayer.getLayers().length > 0) map.fitBounds(polygonLayer.getBounds(), { padding: [50, 50] });
    }

    function openCsvMappingModal(headers) {
        const mappingUI = document.getElementById('mappingUI');
        mappingUI.innerHTML = '';
        const targetFields = ["カテゴリ", "緯度", "経度", "方位角", "RI右", "RI左"];
        const keywordMap = {
             "カテゴリ": ["カテゴリ", "category", "name"], "緯度": ["緯度", "latitude", "lat"], "経度": ["経度", "longitude", "lon", "lng"],
             "方位角": ["方位角", "azimuth", "direction"], "RI右": ["ri右", "ri_right"], "RI左": ["ri左", "ri_left"],
        };
        targetFields.forEach(field => {
            const label = document.createElement('label'); label.textContent = `${field}:`;
            const select = document.createElement('select'); select.id = `map-to-${field}`;
            const defaultOption = document.createElement('option'); defaultOption.value = ""; defaultOption.textContent = "(選択しない)";
            select.appendChild(defaultOption);
            let bestMatch = "";
            headers.forEach(header => {
                const option = document.createElement('option'); option.value = header; option.textContent = header;
                select.appendChild(option);
                if (keywordMap[field] && keywordMap[field].some(k => header.toLowerCase().includes(k))) bestMatch = header;
            });
            if (bestMatch) select.value = bestMatch;
            mappingUI.appendChild(label); mappingUI.appendChild(select);
        });
        csvMappingModal.style.display = 'block';
    }

    async function handleImageAnalysis() {
        const files = imageAnalysisInput.files;
        if (files.length === 0) return;
        const params = {
            numeratorFormula: numeratorFormulaInput.value, denominatorFormula: denominatorFormulaInput.value,
            n_clusters: parseInt(nClustersInput.value), target_ri_value: parseFloat(targetRIInput.value)
        };
        if (!params.numeratorFormula || !params.denominatorFormula || isNaN(params.n_clusters) || isNaN(params.target_ri_value)) {
            alert('画像解析のパラメータを正しく入力してください。'); return;
        }
        imageAnalysisBtn.disabled = true;
        analysisProgress.innerHTML = `解析準備中...`;
        const analysisResults = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            analysisProgress.innerHTML = `解析中: ${i + 1}/${files.length} - ${file.name}`;
            try {
                const result = await analyzeImage(file, params);
                if (result) analysisResults.push(result);
            } catch (error) { console.error(`Error analyzing ${file.name}:`, error); }
        }
        
        analysisResults.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
        if (analysisResults.length > 1) {
            for (let i = 0; i < analysisResults.length - 1; i++) {
                if (analysisResults[i].azimuth === null) {
                    analysisResults[i].azimuth = calculateBearing(analysisResults[i].lat, analysisResults[i].lon, analysisResults[i+1].lat, analysisResults[i+1].lon);
                }
            }
            if (analysisResults[analysisResults.length - 1].azimuth === null) {
                analysisResults[analysisResults.length - 1].azimuth = analysisResults[analysisResults.length - 2].azimuth;
            }
        }
        
        analysisResults.forEach(result => addRowToTable(result));

        analysisProgress.innerHTML = `${files.length}件の画像を処理しました。`;
        renderTable();
        plotDataOnMap(allRows);
        imageAnalysisBtn.disabled = false;
        imageAnalysisInput.value = '';
    }

    function handleCsvImport(event) {
        const file = event.target.files[0];
        if (file) {
            Papa.parse(file, { header: true, skipEmptyLines: true, complete: (results) => {
                if (results.errors.length > 0) { alert("CSV解析エラー:\n" + results.errors.map(e => e.message).join('\n')); return; }
                csvDataCache = results.data;
                openCsvMappingModal(results.meta.fields);
            }});
        }
        csvFileInput.value = '';
    }

    async function handlePolygonImport(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;
        
        const fileReadPromises = files.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve({ content: e.target.result, file });
                reader.onerror = err => reject(err);
                reader.readAsText(file);
            });
        });

        try {
            const results = await Promise.all(fileReadPromises);
            let importedCount = 0;
            results.forEach(({ content, file }) => {
                let parsedPolygons = [];
                if (file.name.toLowerCase().endsWith('.json') || file.name.toLowerCase().endsWith('.geojson')) {
                    try { parsedPolygons = parseGeoJsonData(JSON.parse(content)); } catch (err) { alert(`JSON解析エラー: ${file.name}\n${err}`); }
                } else if (file.name.toLowerCase().endsWith('.txt')) {
                    parsedPolygons = parseTxtData(content);
                }
                if(parsedPolygons.length > 0) {
                    parsedPolygons.forEach(p => polygonsData.push({ id: `poly_${nextPolygonId++}`, source: file.name, vertices_lat_lon: p, stats: null }));
                    importedCount += parsedPolygons.length;
                }
            });
            if (importedCount > 0) {
                renderPolygonTable();
                drawPolygonsOnMap();
                alert(`${importedCount}個のポリゴンをインポートしました。`);
            }
        } catch (error) {
            console.error("Error reading one or more files:", error);
            alert("ファイルの読み込み中にエラーが発生しました。");
        }
        polygonFileInput.value = '';
    }

    function parseGeoJsonData(data) {
        const polygons = [];
        if (data.type === 'FeatureCollection') {
            data.features.forEach(f => { if (f.geometry?.type === 'Polygon') polygons.push(f.geometry.coordinates[0].map(c => [c[1], c[0]])); });
        } else if (data.type === 'Polygon') {
            polygons.push(data.coordinates[0].map(c => [c[1], c[0]]));
        }
        return polygons;
    }

    function parseTxtData(content) {
        const polygons = []; let currentPoly = [];
        content.split(/\r?\n/).forEach(line => {
            const parts = line.trim().split(/[\s,;]+/);
            if (parts.length === 2) {
                const [lat, lon] = parts.map(parseFloat);
                if (!isNaN(lat) && !isNaN(lon)) currentPoly.push([lat, lon]);
            } else {
                if (currentPoly.length >= 3) polygons.push(currentPoly);
                currentPoly = [];
            }
        });
        if (currentPoly.length >= 3) polygons.push(currentPoly);
        return polygons;
    }

    function handleCsvExport() {
        if (allRows.length === 0) { alert("エクスポートするデータがありません。"); return; }
        const dataToExport = allRows.map(row => ({
            'No': row.id, 'カテゴリ': row.category,
            '緯度': formatNum(row.lat, 6), '経度': formatNum(row.lon, 6),
            '方位角': formatNum(row.azimuth, 2),
            'RI右': formatNum(row.ri_r, 3), 'RI左': formatNum(row.ri_l, 3),
            'FOV左緯度': formatNum(row.fov_lat_l, 6), 'FOV左経度': formatNum(row.fov_lon_l, 6),
            'FOV右緯度': formatNum(row.fov_lat_r, 6), 'FOV右経度': formatNum(row.fov_lon_r, 6),
            'タイムスタンプ': row.timestamp || ''
        }));
        const blob = new Blob([`\uFEFF${Papa.unparse(dataToExport)}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "exported_data.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    function handlePolygonCsvExport() {
        if (polygonsData.length === 0) { alert("エクスポートするポリゴンデータがありません。"); return; }
        const dataToExport = polygonsData.map(poly => {
            const stats = poly.stats || {};
            return {
                'ID': poly.id,
                'ソース': poly.source,
                '頂点数': poly.vertices_lat_lon.length,
                '平均RI': stats.avg_ri ? formatNum(stats.avg_ri, 3) : '',
                '内部点数': stats.point_count || 0,
            };
        });
        const blob = new Blob([`\uFEFF${Papa.unparse(dataToExport)}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "polygons_data.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    function sortAndRecalcAzimuth() {
        const sortedRows = allRows.filter(row => row.timestamp).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        if (sortedRows.length < 2) {
            alert("方位角を計算するには、撮影時刻の入ったデータが2行以上必要です。");
            return;
        }
        for (let i = 0; i < sortedRows.length - 1; i++) {
            sortedRows[i].azimuth = calculateBearing(sortedRows[i].lat, sortedRows[i].lon, sortedRows[i+1].lat, sortedRows[i+1].lon);
        }
        sortedRows[sortedRows.length - 1].azimuth = sortedRows[sortedRows.length - 2].azimuth;
        
        allRows.forEach(row => {
            const { fov_lat_l, fov_lon_l, fov_lat_r, fov_lon_r } = calculateFovCoords(
                row.lat, row.lon, row.azimuth, parseFloat(fovAngleInput.value), parseFloat(roadWidthInput.value)
            );
            row.fov_lat_l = fov_lat_l; row.fov_lon_l = fov_lon_l;
            row.fov_lat_r = fov_lat_r; row.fov_lon_r = fov_lon_r;
        });
        renderTable();
        alert("時間でソートし、方位角とFOVの再計算が完了しました。");
    }

    async function extractAndDrawOSMBuildings(key, value) {
        const bounds = map.getBounds();
        const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
        const query = `[out:json][timeout:25];(way[${key}="${value}"](${bbox});relation[${key}="${value}"](${bbox}););(._;>;);out geom;`;
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        analysisProgress.innerHTML = "OSMデータを取得中...";
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const osmData = await response.json();
            const geojsonData = osmtogeojson(osmData);
            if (geojsonData.features.length > 0) {
                const newPolygons = geojsonData.features.map(feature => {
                    // ここでは単純なポリゴンのみを対象とします
                    if (feature.geometry.type === 'Polygon') {
                        return feature.geometry.coordinates[0].map(c => [c[1], c[0]]);
                    }
                    return null;
                }).filter(p => p !== null);

                newPolygons.forEach(p => polygonsData.push({ id: `poly_${nextPolygonId++}`, source: `OSM-${value}`, vertices_lat_lon: p, stats: null }));
                renderPolygonTable();
                drawPolygonsOnMap();
                alert(`${newPolygons.length}件の建物ポリゴンをインポートしました。`);
            } else {
                alert("指定された条件の建物は見つかりませんでした。");
            }
        } catch (error) {
            console.error("OSMデータの取得または処理に失敗しました:", error);
            alert("データの取得に失敗しました。時間をおいて再度試すか、ズームレベルを変更してください。");
        } finally {
            analysisProgress.innerHTML = "";
        }
    }
    
    // --- 4. EVENT LISTENERS ---
    addRowBtn.addEventListener('click', () => {
        const lat = parseFloat(latInput.value), lon = parseFloat(lonInput.value);
        if (isNaN(lat) || isNaN(lon)) { alert('緯度と経度は有効な数値でなければなりません。'); return; }
        addRowToTable({ category: categoryInput.value || '未分類', lat, lon, azimuth: azimuthInput.value ? parseFloat(azimuthInput.value) : null, ri_r: null, ri_l: null });
        renderTable();
        clearInputForm();
    });

    confirmMappingBtn.addEventListener('click', () => {
        const mapping = {
            category: document.getElementById('map-to-カテゴリ').value, lat: document.getElementById('map-to-緯度').value,
            lon: document.getElementById('map-to-経度').value, azimuth: document.getElementById('map-to-方位角').value,
            ri_r: document.getElementById('map-to-RI右').value, ri_l: document.getElementById('map-to-RI左').value,
        };
        if (!mapping.lat || !mapping.lon) { alert("緯度と経度のカラムは必須です。"); return; }
        let importedCount = 0;
        csvDataCache.forEach(csvRow => {
            const lat = parseFloat(csvRow[mapping.lat]), lon = parseFloat(csvRow[mapping.lon]);
            if (!isNaN(lat) && !isNaN(lon)) {
                addRowToTable({
                    category: csvRow[mapping.category] || 'Imported', lat, lon,
                    azimuth: csvRow[mapping.azimuth] ? parseFloat(csvRow[mapping.azimuth]) : null,
                    ri_r: csvRow[mapping.ri_r] ? parseFloat(csvRow[mapping.ri_r]) : null,
                    ri_l: csvRow[mapping.ri_l] ? parseFloat(csvRow[mapping.ri_l]) : null,
                });
                importedCount++;
            }
        });
        renderTable();
        alert(`${importedCount}件のデータをインポートしました。`);
        csvMappingModal.style.display = "none";
    });

    imageAnalysisBtn.addEventListener('click', () => imageAnalysisInput.click());
    imageAnalysisInput.addEventListener('change', handleImageAnalysis);
    deleteRowBtn.addEventListener('click', deleteSelectedRows);
    sortTimeBtn.addEventListener('click', sortAndRecalcAzimuth);
    calcStatsBtn.addEventListener('click', calculatePolygonStats);
    importCsvBtn.addEventListener('click', () => csvFileInput.click());
    csvFileInput.addEventListener('change', handleCsvImport);
    exportCsvBtn.addEventListener('click', handleCsvExport);
    exportPolygonCsvBtn.addEventListener('click', handlePolygonCsvExport);
    importPolygonBtn.addEventListener('click', () => polygonFileInput.click());
    polygonFileInput.addEventListener('change', handlePolygonImport);
    osmImportBtn.addEventListener('click', () => {
        const buildingType = osmBuildingTypeSelect.value;
        extractAndDrawOSMBuildings('building', buildingType);
    });
    plotAllBtn.addEventListener('click', () => plotDataOnMap(allRows));
    clearTableMarkersBtn.addEventListener('click', () => tableMarkersLayer.clearLayers());
    clearPolygonMapBtn.addEventListener('click', () => polygonLayer.clearLayers());
    searchInput.addEventListener('input', renderTable);
    selectAllCheckbox.addEventListener('change', (e) => document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = e.target.checked));
    selectAllPolygonsCheckbox.addEventListener('change', (e) => document.querySelectorAll('.polygon-row-checkbox').forEach(cb => cb.checked = e.target.checked));
    csvCloseBtn.onclick = () => { csvMappingModal.style.display = "none"; };
    imageCloseBtn.onclick = () => { imageModal.style.display = "none"; };
    window.onclick = (event) => {
        if (event.target == csvMappingModal) csvMappingModal.style.display = "none";
        if (event.target == imageModal) imageModal.style.display = "none";
    };
    plotSelectedBtn.addEventListener('click', () => {
        const selectedIds = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb => parseInt(cb.closest('tr').dataset.id));
        if (selectedIds.length === 0) { alert("プロットする行を選択してください。"); return; }
        plotDataOnMap(allRows.filter(row => selectedIds.includes(row.id)));
    });

    // --- 5. INITIAL RENDER ---
    renderTable();
    renderPolygonTable();
});
