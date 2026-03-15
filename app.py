from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import yt_dlp
import os
import threading

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

DOWNLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__name__)), 'downloads')
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Store active downloads
active_downloads = {}

# Common yt-dlp options for better bot bypass
COMMON_OPTS = {
    'cookiefile': 'cookies.txt',
    'impersonate': 'chrome',
    'nocheckcertificate': True,
    'quiet': True,
    'no_warnings': True,
}

@app.route('/')
def serve_index():
    return send_from_directory('templates', 'index.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/api/info', methods=['POST'])
def get_video_info():
    data = request.json
    url = data.get('url')
    
    if not url:
        return jsonify({'error': 'URL is required'}), 400
        
    ydl_opts = {
        **COMMON_OPTS,
        'noplaylist': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # extract_info with download=False just fetches metadata
            info = ydl.extract_info(url, download=False)
            
            # Filter and organize formats (we want video with audio or ability to merge)
            formats = []
            
            # Basic formats that already have both video and audio
            for f in info.get('formats', []):
                # Look for formats that have both video and audio (progressive) or are high quality video to be merged later
                if f.get('vcodec') != 'none' and f.get('ext') in ['mp4', 'webm']:
                    height = f.get('height', 0)
                    fps = f.get('fps', '')
                    
                    if height:
                        format_name = f"{height}p"
                        if fps and fps > 30:
                            format_name += f"{fps}"
                            
                        formats.append({
                            'id': f.get('format_id'),
                            'ext': f.get('ext'),
                            'resolution': format_name,
                            'filesize': f.get('filesize') or f.get('filesize_approx', 0),
                            'vcodec': f.get('vcodec'),
                            'acodec': f.get('acodec'),
                            'has_audio': f.get('acodec') != 'none'
                        })
            
            # Deduplicate by resolution, keeping highest quality/best codec combination
            unique_formats = {}
            for f in formats:
                res = f['resolution']
                # If we haven't seen this resolution, or if this new one has audio while the old one didn't
                if res not in unique_formats:
                    unique_formats[res] = f
                elif f['has_audio'] and not unique_formats[res]['has_audio']:
                    unique_formats[res] = f
            
            # Sort formats by resolution (descending)
            sorted_formats = sorted(unique_formats.values(), 
                                  key=lambda x: int(str(x['resolution']).split('p')[0]) if 'p' in str(x['resolution']) else 0, 
                                  reverse=True)
            
            return jsonify({
                'title': info.get('title'),
                'thumbnail': info.get('thumbnail'),
                'duration': info.get('duration'),
                'channel': info.get('uploader'),
                'formats': sorted_formats
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

import uuid

def download_video_thread(url, format_id, audio_only, download_id):
    active_downloads[download_id] = {'status': 'starting', 'percentage': 0, 'eta': None, 'speed': None}
        
    try:
        def my_hook(d):
            if d['status'] == 'downloading':
                # Some formats might not report total_bytes (e.g. m3u8), so try total_bytes_estimate
                total = d.get('total_bytes') or d.get('total_bytes_estimate')
                downloaded = d.get('downloaded_bytes', 0)
                
                pct = 0
                if total and total > 0:
                    pct = (downloaded / total) * 100
                    
                active_downloads[download_id] = {
                    'status': 'downloading',
                    'percentage': round(pct, 1),
                    'eta': d.get('eta'),
                    'speed': d.get('speed')
                }
            elif d['status'] == 'finished':
                active_downloads[download_id] = {
                    'status': 'processing',
                    'percentage': 100,
                    'eta': None,
                    'speed': None
                }

        if audio_only:
            ydl_opts = {
                **COMMON_OPTS,
                'format': 'bestaudio/best',
                'outtmpl': os.path.join(DOWNLOAD_DIR, '%(title)s.%(ext)s'),
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
                'progress_hooks': [my_hook]
            }
        else:
            ydl_opts = {
                **COMMON_OPTS,
                'format': f'{format_id}+bestaudio[ext=m4a]/bestvideo+bestaudio/best' if format_id else 'bestvideo+bestaudio/best',
                'outtmpl': os.path.join(DOWNLOAD_DIR, '%(title)s.%(ext)s'),
                'merge_output_format': 'mp4',
                'progress_hooks': [my_hook]
            }
            
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            
            if audio_only:
                filename = os.path.splitext(filename)[0] + '.mp3'
            elif ydl_opts.get('merge_output_format'):
                 filename = os.path.splitext(filename)[0] + '.' + ydl_opts['merge_output_format']
                 
            active_downloads[download_id] = {
                'status': 'completed',
                'percentage': 100,
                'file_name': os.path.basename(filename)
            }
            
    except Exception as e:
        active_downloads[download_id] = {
            'status': 'error',
            'error': str(e)
        }

@app.route('/api/download', methods=['POST'])
def download_video():
    data = request.json
    url = data.get('url')
    format_id = data.get('format_id')
    audio_only = data.get('audio_only', False)
    
    if not url:
        return jsonify({'error': 'URL is required'}), 400
        
    download_id = str(uuid.uuid4())
    
    # Start download in a background thread
    thread = threading.Thread(target=download_video_thread, args=(url, format_id, audio_only, download_id))
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'download_id': download_id,
        'message': 'Download started'
    })

@app.route('/api/progress/<download_id>')
def get_progress(download_id):
    data = active_downloads.get(download_id)
    if not data:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(data)


if __name__ == '__main__':
    print(f"Server starting. Downloads will be saved to: {DOWNLOAD_DIR}")
    # Note: Requires system FFmpeg installation for video/audio merging
    app.run(debug=True, port=8000)
