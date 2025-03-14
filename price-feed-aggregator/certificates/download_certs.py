#!/usr/bin/env python
"""
Download the Mozilla CA certificate bundle and save it to a local file.
This ensures we have the latest root certificates for SSL verification.
"""

import os
import urllib.request
import ssl
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s",
)
logger = logging.getLogger("cert_downloader")

# Define the URL for Mozilla's CA certificate bundle
MOZILLA_CA_BUNDLE_URL = "https://curl.se/ca/cacert.pem"

# Define the local path to save the CA bundle
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_CA_BUNDLE_PATH = os.path.join(CURRENT_DIR, "cacert.pem")

def download_ca_bundle():
    """Download Mozilla's CA certificate bundle and save it locally."""
    logger.info(f"Downloading CA certificate bundle from {MOZILLA_CA_BUNDLE_URL}")
    
    try:
        # Create an unverified context for initial download since we're having cert issues
        context = ssl._create_unverified_context()
        
        # Attempt to download the CA bundle
        with urllib.request.urlopen(MOZILLA_CA_BUNDLE_URL, context=context) as response:
            cert_data = response.read()
            
        # Save the CA bundle to the local file
        with open(LOCAL_CA_BUNDLE_PATH, "wb") as cert_file:
            cert_file.write(cert_data)
            
        logger.info(f"CA certificate bundle saved to {LOCAL_CA_BUNDLE_PATH}")
        logger.info(f"File size: {os.path.getsize(LOCAL_CA_BUNDLE_PATH)} bytes")
        return True
        
    except Exception as e:
        logger.error(f"Failed to download CA certificate bundle: {e}")
        return False
        
if __name__ == "__main__":
    download_ca_bundle()