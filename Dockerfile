FROM python:3.10-slim

# Install ffmpeg for yt-dlp video/audio merging
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependencies first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Ensure the downloads directory exists and has permissions
RUN mkdir -p downloads && chmod 777 downloads

# Expose the port
EXPOSE 10000

# Run the app using gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:10000", "--timeout", "600", "app:app"]
