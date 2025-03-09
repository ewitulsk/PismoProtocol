import logging
import sys
from typing import Optional


def setup_logging(
    level: int = logging.INFO,
    log_format: Optional[str] = None,
    file_path: Optional[str] = None,
) -> None:
    """
    Configure logging for the application.
    
    Args:
        level: The logging level (default: INFO)
        log_format: Custom format string for logs (optional)
        file_path: Path to a log file to write logs to (optional)
    """
    if log_format is None:
        log_format = "[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s"
        
    # Configure root logger
    logging.basicConfig(
        level=level,
        format=log_format,
        handlers=[
            logging.StreamHandler(sys.stdout),
            *(
                [logging.FileHandler(file_path)]
                if file_path is not None
                else []
            ),
        ],
    )
    
    # Set logging levels for some noisy libraries
    logging.getLogger("websockets").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    logging.getLogger("aiohttp").setLevel(logging.WARNING)