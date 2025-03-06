# Backend Tests

This directory contains tests for the PismoProtocol backend.

## Setup

1. Install test dependencies:
```bash
pip install pytest pytest-asyncio pytest-mock
```

2. Make sure your virtual environment is activated:
```bash
# From the project root directory
source myenv/bin/activate  # Linux/Mac
# OR
myenv\Scripts\activate     # Windows
```

## Running Tests

To run all tests:
```bash
pytest -v
```

To run specific test files:
```bash
pytest -v tests/test_async_backend.py
pytest -v tests/test_server.py
```

To run tests with coverage:
```bash
pip install pytest-cov
pytest --cov=. tests/
```

## Mock Data

Tests use mock data defined in `mock_data.json` to avoid making actual API calls during testing.
If you need to update the mock data structure, edit the JSON file directly.
