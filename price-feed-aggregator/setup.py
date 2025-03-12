from setuptools import setup, find_packages

setup(
    name="pyth-price-feed",
    version="0.1.0",
    description="A service that provides price feeds from Pyth Network",
    author="Pismo Synthetics",
    packages=find_packages(include=["src", "src.*"]),
    package_data={},
    install_requires=[
        "aiohttp>=3.9.1",
        "websockets>=11.0.3",
        "pydantic>=2.5.2",
        "fastapi>=0.104.1",
        "uvicorn[standard]>=0.24.0",
        "typing-extensions>=4.8.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.3",
            "pytest-asyncio>=0.21.1",
            "mypy>=1.7.1",
            "pytest-mock>=3.12.0",
        ]
    },
    python_requires=">=3.8",
    entry_points={
        "console_scripts": [
            "pyth-price-feed=src.main:main_cli",
        ],
    },
)