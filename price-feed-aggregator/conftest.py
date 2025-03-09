"""Configuration file for pytest."""
import sys
import os

# Add the project root directory to the Python path so that 
# the src package can be imported in tests
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)