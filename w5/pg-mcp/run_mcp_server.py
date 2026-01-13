#!/usr/bin/env python3
"""Simple pg-mcp server runner for foreground use."""

import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from pg_mcp.mcp.server import PostgresMCPServer

if __name__ == "__main__":
    print("Starting pg-mcp server...")
    print("=" * 60)

    server = PostgresMCPServer("config/config.yaml")

    try:
        # Run server (blocks until interrupted)
        import asyncio
        asyncio.run(server.run())
    except KeyboardInterrupt:
        print("\n\nServer stopped by user")
        sys.exit(0)
