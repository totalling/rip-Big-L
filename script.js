document.addEventListener('DOMContentLoaded', () => {
    const audioPlayer = document.getElementById('audio-player');
    const playBtn = document.getElementById('play-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const repeatBtn = document.getElementById('repeat-btn');
    const progressBar = document.querySelector('.progress');
    const progressContainer = document.querySelector('.progress-bar');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl = document.getElementById('duration');
    const volumeSlider = document.querySelector('.volume-slider');
    const volumeProgress = document.querySelector('.volume-progress');
    const playlistEl = document.getElementById('playlist');
    const uploadBtn = document.getElementById('upload-btn');
    const fileUpload = document.getElementById('file-upload');
    const trackTitle = document.getElementById('track-title');
    const trackArtist = document.getElementById('track-artist');
    const albumArt = document.getElementById('album-art');
    const visualizer = document.getElementById('visualizer');
    const visualizerCtx = visualizer.getContext('2d');

    const playerState = {
        isPlaying: false,
        currentTrackIndex: 0,
        isShuffled: false,
        repeatMode: 'none',
        volume: 0.7,
        playlist: [],
        originalPlaylist: [],
    };

    let audioContext;
    let audioSource;
    let analyser;
    let dataArray;

    const playerSettings = {
        dynamicColors: false,
    };
    

    const initAudioContext = () => {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioSource = audioContext.createMediaElementSource(audioPlayer);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            
            audioSource.connect(analyser);
            analyser.connect(audioContext.destination);
            
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            
            renderVisualizer();
        }
    };

    const renderVisualizer = () => {
        const WIDTH = visualizer.width;
        const HEIGHT = visualizer.height;
        
        visualizerCtx.clearRect(0, 0, WIDTH, HEIGHT);
        
        if (playerState.isPlaying) {
            analyser.getByteFrequencyData(dataArray);
            
            const barWidth = (WIDTH / dataArray.length) * 2.5;
            let x = 0;
            
            for (let i = 0; i < dataArray.length; i++) {
                const barHeight = dataArray[i] / 255 * HEIGHT;
                
                const gradient = visualizerCtx.createLinearGradient(0, HEIGHT, 0, HEIGHT - barHeight);
                
                const hue = (i / dataArray.length) * 180 + 180;
                gradient.addColorStop(0, `hsl(${hue}, 80%, 60%)`);
                gradient.addColorStop(1, `hsl(${hue + 30}, 90%, 70%)`);
                
                visualizerCtx.fillStyle = gradient;
                
                visualizerCtx.beginPath();
                visualizerCtx.moveTo(x, HEIGHT);
                visualizerCtx.lineTo(x, HEIGHT - barHeight + 5);
                visualizerCtx.arcTo(x, HEIGHT - barHeight, x + 5, HEIGHT - barHeight, 5);
                visualizerCtx.lineTo(x + barWidth - 5, HEIGHT - barHeight);
                visualizerCtx.arcTo(x + barWidth, HEIGHT - barHeight, x + barWidth, HEIGHT - barHeight + 5, 5);
                visualizerCtx.lineTo(x + barWidth, HEIGHT);
                visualizerCtx.fill();
                
                visualizerCtx.shadowColor = `hsl(${hue}, 90%, 70%)`;
                visualizerCtx.shadowBlur = 15;
                
                const reflectionGradient = visualizerCtx.createLinearGradient(0, HEIGHT, 0, HEIGHT - barHeight/4);
                reflectionGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
                reflectionGradient.addColorStop(1, `hsla(${hue}, 90%, 80%, 0.2)`);
                
                visualizerCtx.fillStyle = reflectionGradient;
                visualizerCtx.beginPath();
                visualizerCtx.moveTo(x, HEIGHT);
                visualizerCtx.lineTo(x, HEIGHT - barHeight/4);
                visualizerCtx.lineTo(x + barWidth, HEIGHT - barHeight/4);
                visualizerCtx.lineTo(x + barWidth, HEIGHT);
                visualizerCtx.fill();
                
                visualizerCtx.shadowBlur = 0;
                
                x += barWidth + 1;
            }
        } else {
            const time = Date.now() / 1000;
            const barCount = 64;
            const barWidth = WIDTH / barCount;
            
            for (let i = 0; i < barCount; i++) {
                const barHeight = Math.sin(time + i * 0.2) * 10 + 15;
                
                const gradient = visualizerCtx.createLinearGradient(0, HEIGHT, 0, HEIGHT - barHeight);
                gradient.addColorStop(0, 'rgba(18, 194, 233, 0.4)');
                gradient.addColorStop(1, 'rgba(196, 113, 237, 0.4)');
                
                visualizerCtx.fillStyle = gradient;
                visualizerCtx.fillRect(i * barWidth, HEIGHT - barHeight, barWidth - 1, barHeight);
            }
        }
        
        requestAnimationFrame(renderVisualizer);
    };

    const initPlayer = () => {
        audioPlayer.volume = playerState.volume;
        volumeProgress.style.width = `${playerState.volume * 100}%`;
        
        visualizer.width = visualizer.offsetWidth;
        visualizer.height = visualizer.offsetHeight;
        
        fetchPlaylist();
        
        window.addEventListener('resize', () => {
            visualizer.width = visualizer.offsetWidth;
            visualizer.height = visualizer.offsetHeight;
        });
        
        const playerContainer = document.querySelector('.player-container');
        playerContainer.style.opacity = '0';
        playerContainer.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            playerContainer.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
            playerContainer.style.opacity = '1';
            playerContainer.style.transform = 'translateY(0)';
        }, 300);
        
        animateBackground();
    };
    
const extractColorsFromImage = (imgElement) => {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (imgElement.complete) {
            processImage();
        } else {
            imgElement.onload = processImage;
        }
        
        function processImage() {
            try {
                canvas.width = imgElement.naturalWidth || imgElement.width;
                canvas.height = imgElement.naturalHeight || imgElement.height;
                
                ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
                
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                
                const pixels = [];
                const sampleSize = 10;
                
                for (let i = 0; i < data.length; i += 4 * sampleSize) {
                    const r = data[i];
                    const g = data[i+1];
                    const b = data[i+2];
                    const a = data[i+3];
                    
                    if (a < 128) continue;
                    
                    const brightness = (r + g + b) / 3;
                    if (brightness < 20 || brightness > 235) continue;
                    
                    pixels.push({ r, g, b });
                }
                
                let primaryColor = { r: 18, g: 194, b: 233 };
                let secondaryColor = { r: 196, g: 113, b: 237 };
                let accentColor = { r: 246, g: 79, b: 89 };
                
                const sortedPixels = pixels.map(pixel => {
                    const max = Math.max(pixel.r, pixel.g, pixel.b);
                    const min = Math.min(pixel.r, pixel.g, pixel.b);
                    const saturation = max === 0 ? 0 : (max - min) / max;
                    return { ...pixel, saturation };
                }).sort((a, b) => b.saturation - a.saturation);
                
                if (sortedPixels.length > 0) {
                    primaryColor = sortedPixels[0];
                    
                    const contrastCandidates = sortedPixels.filter(pixel => {
                        const colorDistance = Math.sqrt(
                            Math.pow(pixel.r - primaryColor.r, 2) +
                            Math.pow(pixel.g - primaryColor.g, 2) +
                            Math.pow(pixel.b - primaryColor.b, 2)
                        );
                        return colorDistance > 100;
                    });
                    
                    if (contrastCandidates.length > 0) {
                        secondaryColor = contrastCandidates[0];
                        
                        const accentCandidates = sortedPixels.filter(pixel => {
                            const distanceFromPrimary = Math.sqrt(
                                Math.pow(pixel.r - primaryColor.r, 2) +
                                Math.pow(pixel.g - primaryColor.g, 2) +
                                Math.pow(pixel.b - primaryColor.b, 2)
                            );
                            const distanceFromSecondary = Math.sqrt(
                                Math.pow(pixel.r - secondaryColor.r, 2) +
                                Math.pow(pixel.g - secondaryColor.g, 2) +
                                Math.pow(pixel.b - secondaryColor.b, 2)
                            );
                            
                            return distanceFromPrimary > 100 && distanceFromSecondary > 100;
                        });
                        
                        if (accentCandidates.length > 0) {
                            accentColor = accentCandidates[0];
                        } else {
                            accentColor = {
                                r: (primaryColor.r + 128) % 255,
                                g: (primaryColor.g + 128) % 255,
                                b: (primaryColor.b + 128) % 255
                            };
                        }
                    } else {
                        secondaryColor = {
                            r: (primaryColor.r + 100) % 255,
                            g: (primaryColor.g + 150) % 255,
                            b: (primaryColor.b + 200) % 255
                        };
                        
                        accentColor = {
                            r: (primaryColor.r + 180) % 255,
                            g: (primaryColor.g + 210) % 255,
                            b: (primaryColor.b + 120) % 255
                        };
                    }
                }
                
                resolve({
                    primary: `rgb(${primaryColor.r}, ${primaryColor.g}, ${primaryColor.b})`,
                    secondary: `rgb(${secondaryColor.r}, ${secondaryColor.g}, ${secondaryColor.b})`,
                    accent: `rgb(${accentColor.r}, ${accentColor.g}, ${accentColor.b})`,
                    primaryRgb: `${primaryColor.r}, ${primaryColor.g}, ${primaryColor.b}`,
                    secondaryRgb: `${secondaryColor.r}, ${secondaryColor.g}, ${secondaryColor.b}`,
                    accentRgb: `${accentColor.r}, ${accentColor.g}, ${accentColor.b}`
                });
            } catch (error) {
                console.error('Error processing image:', error);
                resolve({
                    primary: 'rgb(18, 194, 233)',
                    secondary: 'rgb(196, 113, 237)',
                    accent: 'rgb(246, 79, 89)',
                    primaryRgb: '18, 194, 233',
                    secondaryRgb: '196, 113, 237',
                    accentRgb: '246, 79, 89'
                });
            }
        }
    });
};

const updateInterfaceColors = async (imgElement) => {
    try {
        const colors = await extractColorsFromImage(imgElement);

        if (!playerSettings.dynamicColors) return;
        
        document.documentElement.style.setProperty('--primary-color', colors.primary);
        document.documentElement.style.setProperty('--primary-color-rgb', colors.primaryRgb);
        document.documentElement.style.setProperty('--secondary-color', colors.secondary);
        document.documentElement.style.setProperty('--secondary-color-rgb', colors.secondaryRgb);
        document.documentElement.style.setProperty('--accent-color', colors.accent);
        document.documentElement.style.setProperty('--accent-color-rgb', colors.accentRgb);
        
        const backgroundGradients = [
            `radial-gradient(circle at 20% 30%, ${colors.primary.replace('rgb', 'rgba').replace(')', ', 0.2)')} 0%, transparent 30%)`,
            `radial-gradient(circle at 80% 70%, ${colors.accent.replace('rgb', 'rgba').replace(')', ', 0.2)')} 0%, transparent 30%)`,
            `radial-gradient(circle at 50% 50%, ${colors.secondary.replace('rgb', 'rgba').replace(')', ', 0.2)')} 0%, transparent 60%)`
        ].join(',');
        
        document.documentElement.style.setProperty('--bg-gradients', backgroundGradients);
        
        window.currentArtworkColors = {
            primary: colors.primary.replace('rgb', 'rgba').replace(')', ', 0.2)'),
            secondary: colors.secondary.replace('rgb', 'rgba').replace(')', ', 0.2)'),
            accent: colors.accent.replace('rgb', 'rgba').replace(')', ', 0.2)')
        };
        
        console.log('Updated colors:', colors);
    } catch (error) {
        console.error('Error updating colors:', error);
    }
};

const animateBackground = () => {
    const body = document.querySelector('body');
    
    const defaultColors = {
        primary: 'rgba(18, 194, 233, 0.2)',
        secondary: 'rgba(196, 113, 237, 0.2)',
        accent: 'rgba(246, 79, 89, 0.2)'
    };
    
    window.currentArtworkColors = defaultColors;
    
    let currentPos = [
        { x: 20, y: 30 },
        { x: 80, y: 70 },
        { x: 50, y: 50 }
    ];
    
    let targetPos = [
        { x: 20, y: 30 },
        { x: 80, y: 70 },
        { x: 50, y: 50 }
    ];
    
    setInterval(() => {
        targetPos = [
            { x: Math.random() * 100, y: Math.random() * 100 },
            { x: Math.random() * 100, y: Math.random() * 100 },
            { x: Math.random() * 100, y: Math.random() * 100 }
        ];
    }, 5000);
    
    const animate = () => {
        for (let i = 0; i < currentPos.length; i++) {
            currentPos[i].x += (targetPos[i].x - currentPos[i].x) * 0.01;
            currentPos[i].y += (targetPos[i].y - currentPos[i].y) * 0.01;
        }
        
        const colors = playerSettings.dynamicColors ? window.currentArtworkColors : defaultColors;
        
        const newGradients = [
            `radial-gradient(circle at ${currentPos[0].x}% ${currentPos[0].y}%, ${colors.primary} 0%, transparent 30%)`,
            `radial-gradient(circle at ${currentPos[1].x}% ${currentPos[1].y}%, ${colors.accent} 0%, transparent 30%)`,
            `radial-gradient(circle at ${currentPos[2].x}% ${currentPos[2].y}%, ${colors.secondary} 0%, transparent 60%)`
        ];
        
        body.style.background = '#121212';
        body.style.setProperty('--bg-gradients', newGradients.join(','));
        
        requestAnimationFrame(animate);
    };
    
    animate();
};

const loadTrack = (index) => {
    if (playerState.playlist.length === 0) return;
    
    if (index < 0) index = playerState.playlist.length - 1;
    if (index >= playerState.playlist.length) index = 0;
    
    playerState.currentTrackIndex = index;
    
    const track = playerState.playlist[index];
    
    audioPlayer.src = track.url;
    
    trackTitle.textContent = track.title;
    trackArtist.textContent = track.artist || 'Unknown Artist';
    
    if (track.artwork) {
        albumArt.src = track.artwork;
    } else {
        albumArt.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Ccircle cx='100' cy='100' r='90' fill='%23333'/%3E%3Ccircle cx='100' cy='100' r='20' fill='%23666'/%3E%3C/svg%3E";
    }
    
    updateInterfaceColors(albumArt);
    
    updatePlaylistUI();
    
    if (playerState.isPlaying) {
        audioPlayer.play();
        playBtn.innerHTML = '<i class="fas fa-pause"></i>';
    }
};

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const updateProgress = () => {
        const { currentTime, duration } = audioPlayer;
        const progressPercent = (currentTime / duration) * 100;
        
        progressBar.style.width = `${progressPercent}%`;
        currentTimeEl.textContent = formatTime(currentTime);
        durationEl.textContent = formatTime(duration || 0);
    };

    const togglePlay = () => {
        if (playerState.playlist.length === 0) return;
        
        if (playerState.isPlaying) {
            audioPlayer.pause();
            playBtn.innerHTML = '<i class="fas fa-play"></i>';
        } else {
            initAudioContext();
            audioPlayer.play();
            playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        }
        
        playerState.isPlaying = !playerState.isPlaying;
    };

    const playPrevious = () => {
        loadTrack(playerState.currentTrackIndex - 1);
    };

    const playNext = () => {
        if (playerState.repeatMode === 'one') {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
            return;
        }
        
        loadTrack(playerState.currentTrackIndex + 1);
    };

    const toggleShuffle = () => {
        playerState.isShuffled = !playerState.isShuffled;
        
        if (playerState.isShuffled) {
            playerState.originalPlaylist = [...playerState.playlist];
            const currentTrack = playerState.playlist[playerState.currentTrackIndex];
            const shuffledPlaylist = [...playerState.playlist];
            
            for (let i = shuffledPlaylist.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffledPlaylist[i], shuffledPlaylist[j]] = [shuffledPlaylist[j], shuffledPlaylist[i]];
            }
            playerState.playlist = shuffledPlaylist;
            playerState.currentTrackIndex = playerState.playlist.findIndex(track => track.id === currentTrack.id);
            
            shuffleBtn.classList.add('active');
        } else {
            const currentTrack = playerState.playlist[playerState.currentTrackIndex];
            playerState.playlist = [...playerState.originalPlaylist];
            playerState.currentTrackIndex = playerState.playlist.findIndex(track => track.id === currentTrack.id);
            
            shuffleBtn.classList.remove('active');
        }
        
        updatePlaylistUI();
    };

    const toggleRepeat = () => {
        const modes = ['none', 'one', 'all'];
        const currentIndex = modes.indexOf(playerState.repeatMode);
        playerState.repeatMode = modes[(currentIndex + 1) % modes.length];
        repeatBtn.classList.remove('active');
        if (playerState.repeatMode !== 'none') {
            repeatBtn.classList.add('active');
        }
        if (playerState.repeatMode === 'one') {
            repeatBtn.innerHTML = '<i class="fas fa-redo">1</i>';
        } else {
            repeatBtn.innerHTML = '<i class="fas fa-redo"></i>';
        }
    };

    const updatePlaylistUI = () => {
        playlistEl.innerHTML = '';
        
        playerState.playlist.forEach((track, index) => {
            const li = document.createElement('li');
            li.className = `playlist-item ${index === playerState.currentTrackIndex ? 'active' : ''}`;
            
            let statusIcon = '';
            if (index === playerState.currentTrackIndex && playerState.isPlaying) {
                statusIcon = '<i class="fas fa-volume-up" style="color: var(--primary-color); margin-right: 10px;"></i>';
            } else {
                statusIcon = '<i class="fas fa-music" style="opacity: 0.5; margin-right: 10px;"></i>';
            }
            
            li.innerHTML = `
                <div class="song-info">
                    ${statusIcon}
                    <div class="song-title">${track.title}</div>
                    <div class="song-artist">${track.artist || 'Unknown Artist'}</div>
                </div>
                <div class="song-duration">${track.duration || '0:00'}</div>
            `;
            
            li.addEventListener('click', () => {
                playerState.currentTrackIndex = index;
                loadTrack(index);
                togglePlay();
            });
            
            playlistEl.appendChild(li);
        });
    };

    const handleFileUpload = (files) => {
        for (const file of files) {
            if (file.type.startsWith('audio/')) {
                const reader = new FileReader();
                
                reader.onload = (e) => {
                    const trackId = Math.random().toString(36).substring(2, 15);
                    
                    const audio = new Audio(e.target.result);
                    audio.onloadedmetadata = () => {
                        const track = {
                            id: trackId,
                            title: file.name.replace(/\.[^/.]+$/, ""),
                            artist: 'Local File',
                            url: e.target.result,
                            duration: formatTime(audio.duration),
                            artwork: null
                        };
                        
                        playerState.playlist.push(track);
                        if (!playerState.isShuffled) {
                            playerState.originalPlaylist.push(track);
                        }
                        
                        uploadToServer(file, trackId);
                        
                        if (playerState.playlist.length === 1) {
                            loadTrack(0);
                        } else {
                            updatePlaylistUI();
                        }
                    };
                };
                
                reader.readAsDataURL(file);
            }
        }
    };

    const uploadToServer = async (file, trackId) => {
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('trackId', trackId);
            
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                console.log('File uploaded successfully');
            } else {
                console.error('Error uploading file');
            }
        } catch (error) {
            console.error('Error uploading file:', error);
        }
    };

    const fetchPlaylist = async () => {
        try {
            const response = await fetch('/playlist');
            
            if (response.ok) {
                const data = await response.json();
                playerState.playlist = data;
                playerState.originalPlaylist = [...data];
                
                if (data.length > 0) {
                    loadTrack(0);
                }
            }
        } catch (error) {
            console.error('Error fetching playlist:', error);
        }
    };

    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', playPrevious);
    nextBtn.addEventListener('click', playNext);
    shuffleBtn.addEventListener('click', toggleShuffle);
    repeatBtn.addEventListener('click', toggleRepeat);
    
    progressContainer.addEventListener('click', (e) => {
        const width = progressContainer.clientWidth;
        const clickX = e.offsetX;
        const duration = audioPlayer.duration;
        
        audioPlayer.currentTime = (clickX / width) * duration;
    });
    
    volumeSlider.addEventListener('click', (e) => {
        const width = volumeSlider.clientWidth;
        const clickX = e.offsetX;
        
        playerState.volume = clickX / width;
        audioPlayer.volume = playerState.volume;
        volumeProgress.style.width = `${playerState.volume * 100}%`;
    });
    
    uploadBtn.addEventListener('click', () => {
        fileUpload.click();
    });
    
    fileUpload.addEventListener('change', (e) => {
        handleFileUpload(e.target.files);
    });
    
    audioPlayer.addEventListener('timeupdate', updateProgress);
    
    audioPlayer.addEventListener('ended', () => {
        if (playerState.repeatMode === 'one') {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
        } else if (playerState.repeatMode === 'all' && playerState.currentTrackIndex === playerState.playlist.length - 1) {
            loadTrack(0);
        } else {
            playNext();
        }
    });
    
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        document.body.style.opacity = '0.7';
    });
    document.addEventListener('dragleave', () => {
        document.body.style.opacity = '1';
    });
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        document.body.style.opacity = '1';
        
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files);
        }
    });
    initPlayer();
});