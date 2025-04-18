from flask import Flask, request, jsonify, send_from_directory
import os
import json
import time
import base64
import tempfile
import threading
import logging
from werkzeug.utils import secure_filename

try:
    import mutagen
    from mutagen.mp3 import MP3
    from mutagen.id3 import ID3, APIC
    from mutagen.flac import FLAC
    from mutagen.oggvorbis import OggVorbis
    from mutagen.mp4 import MP4
    HAS_MUTAGEN = True
except ImportError:
    HAS_MUTAGEN = False
    print("Warning: mutagen library not found. Audio metadata extraction will be limited.")

try:
    import numpy as np
    import pydub
    from pydub import AudioSegment
    HAS_PYDUB = True
except ImportError:
    HAS_PYDUB = False
    print("Warning: pydub library not found. Audio processing features will be disabled.")

app = Flask(__name__, static_folder='.')
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'}
PLAYLIST_FILE = 'playlist.json'
TEMP_FOLDER = 'temp'
LOG_FILE = 'music_player.log'

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('music_player')

for folder in [UPLOAD_FOLDER, TEMP_FOLDER]:
    if not os.path.exists(folder):
        os.makedirs(folder)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_playlist():
    if os.path.exists(PLAYLIST_FILE):
        try:
            with open(PLAYLIST_FILE, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            logger.error("Invalid playlist file format. Creating new playlist.")
            return []
    return []

def save_playlist(playlist):
    with open(PLAYLIST_FILE, 'w') as f:
        json.dump(playlist, f)

def extract_audio_metadata(file_path):
    if not HAS_MUTAGEN:
        filename = os.path.basename(file_path)
        title = os.path.splitext(filename)[0]
        return {
            'title': title,
            'artist': 'Unknown Artist',
            'album': 'Unknown Album',
            'duration': '0:00',
            'artwork': None
        }

    try:
        audio = mutagen.File(file_path)
        
        if audio is None:
            logger.warning(f"Couldn't read metadata from {file_path}")
            return {
                'title': os.path.splitext(os.path.basename(file_path))[0],
                'artist': 'Unknown Artist',
                'album': 'Unknown Album',
                'duration': '0:00',
                'artwork': None
            }
        
        metadata = {}
        
        duration_seconds = audio.info.length
        minutes = int(duration_seconds // 60)
        seconds = int(duration_seconds % 60)
        metadata['duration'] = f"{minutes}:{seconds:02d}"
        
        if isinstance(audio, MP3):
            id3 = ID3(file_path)
            metadata['title'] = str(id3.get('TIT2', os.path.splitext(os.path.basename(file_path))[0]))
            metadata['artist'] = str(id3.get('TPE1', 'Unknown Artist'))
            metadata['album'] = str(id3.get('TALB', 'Unknown Album'))
            
            for tag in id3.values():
                if isinstance(tag, APIC):
                    artwork_data = tag.data
                    artwork_mime = tag.mime
                    metadata['artwork'] = f"data:{artwork_mime};base64,{base64.b64encode(artwork_data).decode('utf-8')}"
                    break
                    
        elif isinstance(audio, FLAC):
            metadata['title'] = ' '.join(audio.get('title', [os.path.splitext(os.path.basename(file_path))[0]]))
            metadata['artist'] = ' '.join(audio.get('artist', ['Unknown Artist']))
            metadata['album'] = ' '.join(audio.get('album', ['Unknown Album']))
            
            if audio.pictures:
                picture = audio.pictures[0]
                artwork_data = picture.data
                artwork_mime = picture.mime
                metadata['artwork'] = f"data:{artwork_mime};base64,{base64.b64encode(artwork_data).decode('utf-8')}"
                
        elif isinstance(audio, OggVorbis):
            metadata['title'] = ' '.join(audio.get('title', [os.path.splitext(os.path.basename(file_path))[0]]))
            metadata['artist'] = ' '.join(audio.get('artist', ['Unknown Artist']))
            metadata['album'] = ' '.join(audio.get('album', ['Unknown Album']))
            
        elif isinstance(audio, MP4):
            title_tag = '\xa9nam'
            artist_tag = '\xa9ART'
            album_tag = '\xa9alb'
            
            metadata['title'] = ' '.join(audio.get(title_tag, [os.path.splitext(os.path.basename(file_path))[0]]))
            metadata['artist'] = ' '.join(audio.get(artist_tag, ['Unknown Artist']))
            metadata['album'] = ' '.join(audio.get(album_tag, ['Unknown Album']))
            
            if 'covr' in audio:
                artwork_data = audio['covr'][0]
                if artwork_data.imageformat == MP4.MP4Cover.FORMAT_JPEG:
                    artwork_mime = 'image/jpeg'
                else:
                    artwork_mime = 'image/png'
                metadata['artwork'] = f"data:{artwork_mime};base64,{base64.b64encode(bytes(artwork_data)).decode('utf-8')}"
        
        else:
            metadata['title'] = os.path.splitext(os.path.basename(file_path))[0]
            metadata['artist'] = 'Unknown Artist'
            metadata['album'] = 'Unknown Album'
        
        if 'title' not in metadata or not metadata['title']:
            metadata['title'] = os.path.splitext(os.path.basename(file_path))[0]
        if 'artist' not in metadata or not metadata['artist']:
            metadata['artist'] = 'Unknown Artist'
        if 'album' not in metadata or not metadata['album']:
            metadata['album'] = 'Unknown Album'
        if 'artwork' not in metadata:
            metadata['artwork'] = None
            
        return metadata
        
    except Exception as e:
        logger.error(f"Error extracting metadata: {str(e)}")
        return {
            'title': os.path.splitext(os.path.basename(file_path))[0],
            'artist': 'Unknown Artist',
            'album': 'Unknown Album',
            'duration': '0:00',
            'artwork': None
        }

def process_audio_file(input_path, output_path, process_type, params=None):
    if not HAS_PYDUB:
        logger.error("Audio processing attempted but pydub is not installed")
        return False
        
    try:
        format = os.path.splitext(input_path)[1].lower().lstrip('.')
        audio = AudioSegment.from_file(input_path, format=format)
        
        if process_type == 'normalize':
            target_dBFS = params.get('target_db', -20)
            change_in_dBFS = target_dBFS - audio.dBFS
            processed_audio = audio.apply_gain(change_in_dBFS)
        
        elif process_type == 'speed':
            speed_factor = params.get('speed', 1.0)
            samples = np.array(audio.get_array_of_samples())
            processed_samples = np.interp(
                np.linspace(0, len(samples) - 1, int(len(samples) / speed_factor)),
                np.arange(0, len(samples)),
                samples
            ).astype(samples.dtype)
            processed_audio = audio._spawn(processed_samples)
        
        elif process_type == 'pitch':
            semitones = params.get('semitones', 0)
            new_sample_rate = int(audio.frame_rate * (2 ** (semitones / 12.0)))
            processed_audio = audio._spawn(audio.raw_data, overrides={'frame_rate': new_sample_rate})
            processed_audio = processed_audio.set_frame_rate(audio.frame_rate)
        
        elif process_type == 'fade':
            fade_in = params.get('fade_in', 0)
            fade_out = params.get('fade_out', 0)
            processed_audio = audio
            
            if fade_in > 0:
                processed_audio = processed_audio.fade_in(fade_in)
            if fade_out > 0:
                processed_audio = processed_audio.fade_out(fade_out)
        
        else:
            logger.error(f"Unknown processing type: {process_type}")
            return False
        
        processed_audio.export(output_path, format=format)
        return True
        
    except Exception as e:
        logger.error(f"Error processing audio: {str(e)}")
        return False

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    track_id = request.form.get('trackId', str(int(time.time())))
    
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(file_path)
        metadata = extract_audio_metadata(file_path)
        playlist = get_playlist()
        track_exists = False
        for track in playlist:
            if track.get('id') == track_id:
                track_exists = True
                break
        if not track_exists:
            track = {
                'id': track_id,
                'title': metadata['title'],
                'artist': metadata['artist'],
                'album': metadata['album'],
                'url': f'/uploads/{filename}',
                'duration': metadata['duration'],
                'artwork': metadata['artwork'],
                'original_file': filename
            }
            playlist.append(track)
            save_playlist(playlist)
        return jsonify({'success': True, 'track': track_id, 'metadata': metadata}), 200
    
    return jsonify({'error': 'File type not allowed'}), 400

@app.route('/playlist', methods=['GET'])
def get_playlist_route():
    playlist = get_playlist()
    return jsonify(playlist)

@app.route('/delete/<track_id>', methods=['DELETE'])
def delete_track(track_id):
    playlist = get_playlist()
    for i, track in enumerate(playlist):
        if track.get('id') == track_id:
            file_path = os.path.join('.', track.get('url', '').lstrip('/'))
            if os.path.exists(file_path):
                os.remove(file_path)
            playlist.pop(i)
            save_playlist(playlist)
            return jsonify({'success': True}), 200
    return jsonify({'error': 'Track not found'}), 404

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route('/process/<track_id>', methods=['POST'])
def process_track(track_id):
    if not HAS_PYDUB:
        return jsonify({'error': 'Audio processing not available (pydub not installed)'}), 400
        
    process_type = request.json.get('type')
    params = request.json.get('params', {})
    
    if not process_type:
        return jsonify({'error': 'Processing type not specified'}), 400
        
    playlist = get_playlist()
    track = None
    
    for t in playlist:
        if t.get('id') == track_id:
            track = t
            break
            
    if not track:
        return jsonify({'error': 'Track not found'}), 404
        
    original_file = track.get('original_file', os.path.basename(track.get('url')))
    input_path = os.path.join(UPLOAD_FOLDER, original_file)
    
    if not os.path.exists(input_path):
        return jsonify({'error': 'Original file not found'}), 404
        
    output_filename = f"{os.path.splitext(original_file)[0]}_{process_type}_{int(time.time())}{os.path.splitext(original_file)[1]}"
    output_path = os.path.join(UPLOAD_FOLDER, output_filename)
    
    def process_thread():
        success = process_audio_file(input_path, output_path, process_type, params)
        
        if success:
            metadata = extract_audio_metadata(output_path)
            new_track = {
                'id': f"{track_id}_{process_type}_{int(time.time())}",
                'title': f"{metadata['title']} ({process_type})",
                'artist': metadata['artist'],
                'album': metadata['album'],
                'url': f'/uploads/{output_filename}',
                'duration': metadata['duration'],
                'artwork': metadata['artwork'],
                'original_file': output_filename,
                'processed': True,
                'process_type': process_type
            }
            playlist = get_playlist()
            playlist.append(new_track)
            save_playlist(playlist)
            logger.info(f"Successfully processed track {track_id} with {process_type}")
        else:
            logger.error(f"Failed to process track {track_id} with {process_type}")
    
    processing_thread = threading.Thread(target=process_thread)
    processing_thread.start()
    
    return jsonify({'success': True, 'message': 'Processing started'}), 202

@app.route('/extract-metadata/<track_id>', methods=['GET'])
def extract_metadata_route(track_id):
    playlist = get_playlist()
    for track in playlist:
        if track.get('id') == track_id:
            file_path = os.path.join('.', track.get('url', '').lstrip('/'))
            if os.path.exists(file_path):
                metadata = extract_audio_metadata(file_path)
                return jsonify(metadata)
            else:
                return jsonify({'error': 'File not found'}), 404
    return jsonify({'error': 'Track not found'}), 404

@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({'error': 'File too large'}), 413

@app.errorhandler(500)
def internal_server_error(error):
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    if not os.path.exists('index.html'):
        print("Error: index.html not found in the current directory")
        exit(1)
    print("Starting advanced music player server...")
    print(f"Upload directory: {os.path.abspath(UPLOAD_FOLDER)}")
    print("Available at http://127.0.0.1:5000")
    logger.info("Server started")
    logger.info(f"Mutagen available: {HAS_MUTAGEN}")
    logger.info(f"Pydub available: {HAS_PYDUB}")
    app.run(debug=True, threaded=True)