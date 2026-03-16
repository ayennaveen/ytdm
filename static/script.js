document.addEventListener('DOMContentLoaded', () => {
    // Initialize Particles JS
    if (window.particlesJS) {
        particlesJS('particles-js', {
            particles: {
                number: { value: 60, density: { enable: true, value_area: 800 } },
                color: { value: ['#8b5cf6', '#ec4899', '#3b82f6'] },
                shape: { type: 'circle' },
                opacity: { value: 0.5, random: true },
                size: { value: 4, random: true },
                line_linked: { enable: true, distance: 150, color: '#ffffff', opacity: 0.1, width: 1 },
                move: { enable: true, speed: 2, direction: 'none', random: true, out_mode: 'out' }
            },
            interactivity: {
                detect_on: 'window',
                events: { onhover: { enable: true, mode: 'grab' }, onclick: { enable: true, mode: 'push' } },
                modes: { grab: { distance: 140, line_linked: { opacity: 0.3 } } }
            },
            retina_detect: true
        });
    }

    // DOM Elements
    const urlInput = document.getElementById('video-url');
    const fetchBtn = document.getElementById('fetch-btn');
    const loader = document.getElementById('fetch-loader');
    const errorMsg = document.getElementById('error-message');
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const backBtn = document.getElementById('back-btn');
    
    // Video Info Elements
    const videoTitle = document.getElementById('video-title');
    const videoChannel = document.getElementById('video-channel');
    const videoThumb = document.getElementById('video-thumb');
    const videoDuration = document.getElementById('video-duration');
    const formatList = document.getElementById('format-list');
    
    // Download Action Elements
    const dlVideoBtn = document.getElementById('download-video-btn');
    const dlAudioBtn = document.getElementById('download-audio-btn');
    const progressSection = document.getElementById('download-progress');
    const successSection = document.getElementById('download-success');
    const serverStatus = document.getElementById('server-status');

    // Health Check
    async function checkHealth() {
        if (!serverStatus) return;
        try {
            const res = await fetch('/health');
            if (res.ok) {
                serverStatus.className = 'status-badge online';
                serverStatus.querySelector('.status-text').textContent = 'Online';
            } else {
                throw new Error();
            }
        } catch (e) {
            serverStatus.className = 'status-badge offline';
            serverStatus.querySelector('.status-text').textContent = 'Connection Error';
        }
    }

    checkHealth();
    // Re-check every 30 seconds
    setInterval(checkHealth, 30000);

    let currentVideoData = null;
    let selectedFormatId = null;

    // Format Duration
    function formatTime(seconds) {
        if (!seconds) return "0:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // Format Bytes
    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return 'Unknown Size';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Handle Fetch
    fetchBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) return;

        try {
            const res = await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!res.ok) {
                const errorText = await res.text();
                try {
                    const errorJson = JSON.parse(errorText);
                    throw new Error(errorJson.error || "Server error");
                } catch (e) {
                    throw new Error(`Server Error (${res.status}): ${errorText.substring(0, 50)}...`);
                }
            }

            const data = await res.json();

            currentVideoData = data;
            
            // Populate UI
            videoTitle.textContent = data.title || "Unknown Title";
            videoChannel.textContent = data.channel || "Unknown Channel";
            videoThumb.src = data.thumbnail || "";
            videoDuration.textContent = formatTime(data.duration);
            
            // Populate Formats
            formatList.innerHTML = '';
            selectedFormatId = null;
            dlVideoBtn.disabled = true;

            if (data.formats && data.formats.length > 0) {
                // Determine the highest resolution formatting text for UI selection clarity
                const highestRes = data.formats[0].resolution;
                
                data.formats.forEach((format, index) => {
                    const card = document.createElement('div');
                    card.className = 'format-card';
                    // Auto-select the best format
                    if (index === 0) {
                        card.classList.add('selected');
                        selectedFormatId = format.id;
                        dlVideoBtn.disabled = false;
                        dlVideoBtn.innerHTML = `<i class="fa-solid fa-video"></i> Download Max (${highestRes})`;
                    }
                    
                    const isHDR = format.vcodec && format.vcodec.includes('hdr');
                    
                    card.innerHTML = `
                        <span class="res-text">${format.resolution} ${isHDR ? '<span style="color:var(--secondary);font-size:0.6em;vertical-align:top">HDR</span>' : ''}</span>
                        <span class="size-text">${format.ext.toUpperCase()} • ${formatBytes(format.filesize)}</span>
                    `;
                    
                    card.addEventListener('click', () => {
                        document.querySelectorAll('.format-card').forEach(c => c.classList.remove('selected'));
                        card.classList.add('selected');
                        selectedFormatId = format.id;
                        dlVideoBtn.disabled = false;
                        dlVideoBtn.innerHTML = `<i class="fa-solid fa-video"></i> Download ${format.resolution}`;
                    });
                    
                    formatList.appendChild(card);
                });
            } else {
                formatList.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;">No formats found. (Age restricted or live stream)</p>';
                dlVideoBtn.disabled = true;
            }

            // Transition UI
            step1.classList.add('hidden');
            step2.classList.remove('hidden');
            successSection.classList.add('hidden');

        } catch (error) {
            console.error(error);
            errorMsg.classList.remove('hidden');
            const errorTextEl = document.getElementById('error-text');
            if (errorTextEl) errorTextEl.value = error.message;
        } finally {
            fetchBtn.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    });

    // Handle Enter Key on Input
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            fetchBtn.click();
        }
    });

    // Handle Back
    backBtn.addEventListener('click', () => {
        step2.classList.add('hidden');
        step1.classList.remove('hidden');
        progressSection.classList.add('hidden');
        
        // Reset state
        dlVideoBtn.disabled = false;
        dlAudioBtn.disabled = false;
        successSection.classList.add('hidden');
    });

    // Handle Download
    async function triggerDownload(isAudioOnly) {
        if (!currentVideoData || (!selectedFormatId && !isAudioOnly)) return;

        // UI State
        dlVideoBtn.disabled = true;
        dlAudioBtn.disabled = true;
        backBtn.style.opacity = '0.5';
        backBtn.style.pointerEvents = 'none';
        
        progressSection.classList.remove('hidden');
        successSection.classList.add('hidden');
        
        const statusText = progressSection.querySelector('.status-text');
        const percentageText = progressSection.querySelector('.percentage');
        const progressBar = progressSection.querySelector('.progress-bar');
        
        // Reset progress bar to basic state
        progressBar.classList.remove('infinite-loading');
        progressBar.style.width = '0%';
        progressBar.style.background = 'linear-gradient(90deg, var(--primary), var(--secondary))';
        
        statusText.innerHTML = isAudioOnly 
            ? 'Starting Audio Extraction...' 
            : 'Starting Video & Audio Download...';
        percentageText.textContent = "0%";

        try {
            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    url: urlInput.value.trim(),
                    format_id: selectedFormatId,
                    audio_only: isAudioOnly
                })
            });

            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || "Download failed to start");
            
            const downloadId = data.download_id;
            
            // Start polling progress
            const pollInterval = setInterval(async () => {
                try {
                    const progRes = await fetch(`/api/progress/${downloadId}`);
                    const progData = await progRes.json();
                    
                    if (progRes.ok) {
                        if (progData.status === 'downloading') {
                            statusText.textContent = "Downloading...";
                            percentageText.textContent = `${progData.percentage}%`;
                            progressBar.style.width = `${progData.percentage}%`;
                        } else if (progData.status === 'processing') {
                            statusText.textContent = "Processing via FFmpeg... (This takes a moment)";
                            percentageText.textContent = "100%";
                            progressBar.style.width = "100%";
                            // Make it pulse to show it's working
                            progressBar.classList.add('infinite-loading');
                            progressBar.style.background = ''; // clear specific width gradient
                        } else if (progData.status === 'completed') {
                            clearInterval(pollInterval);
                            
                            // Success UI
                            progressSection.classList.add('hidden');
                            successSection.classList.remove('hidden');
                            successSection.querySelector('p').innerHTML = `Saved as:<br><code>${progData.file_name}</code><br>in your downloads folder.`;
                            
                            // Reset UI states
                            dlVideoBtn.disabled = false;
                            dlAudioBtn.disabled = false;
                            backBtn.style.opacity = '1';
                            backBtn.style.pointerEvents = 'all';
                        } else if (progData.status === 'error') {
                            clearInterval(pollInterval);
                            throw new Error(progData.error);
                        }
                    }
                } catch (e) {
                    console.error("Polling error", e);
                }
            }, 1000); // poll every second

        } catch (error) {
            alert("Error downloading: " + error.message);
            progressSection.classList.add('hidden');
            dlVideoBtn.disabled = false;
            dlAudioBtn.disabled = false;
            backBtn.style.opacity = '1';
            backBtn.style.pointerEvents = 'all';
        }
    }

    dlVideoBtn.addEventListener('click', () => triggerDownload(false));
    dlAudioBtn.addEventListener('click', () => triggerDownload(true));

    // Handle Copy Error Button
    const copyErrorBtn = document.getElementById('copy-error-btn');
    if (copyErrorBtn) {
        copyErrorBtn.addEventListener('click', () => {
            const errText = document.getElementById('error-text').value;
            if (!errText) return;
            navigator.clipboard.writeText(errText).then(() => {
                copyErrorBtn.innerHTML = '<i class="fa-solid fa-check" style="color:var(--success)"></i>';
                setTimeout(() => {
                    copyErrorBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        });
    }
});
