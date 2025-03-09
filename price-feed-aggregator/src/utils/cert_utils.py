import os
import ssl
import logging
from pathlib import Path

logger = logging.getLogger("cert_utils")

def get_ssl_context() -> ssl.SSLContext:
    """
    Creates and returns an SSL context with our custom CA certificate bundle.
    
    Returns:
        An SSL context with proper certificate verification.
    """
    # Define the path to our downloaded CA certificate bundle
    project_root = Path(__file__).parent.parent.parent
    custom_ca_file = project_root / "certificates" / "cacert.pem"
    
    # Create an SSL context with proper verification
    context = ssl.create_default_context()
    
    # If we have our custom CA bundle, use it
    if custom_ca_file.exists():
        logger.info(f"Using custom CA certificate bundle: {custom_ca_file}")
        context.load_verify_locations(cafile=str(custom_ca_file))
    else:
        logger.warning(f"Custom CA certificate bundle not found at {custom_ca_file}")
        logger.warning("Using system default CA certificates")
        # Fall back to system certificates
        
    return context