FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY price-feed-aggregator/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY price-feed-aggregator/ .

# Install the package in development mode
RUN pip install -e .

# Expose ports
EXPOSE 8765 8080

# Use shell form to allow environment variable expansion
CMD python -m src.main --host 0.0.0.0 --port 8765 --api-host 0.0.0.0 --api-port 8080