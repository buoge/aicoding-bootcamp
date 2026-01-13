"""Main entry point for pg-mcp server.

This script runs the PostgresMCP Server that integrates with Claude Desktop
and other MCP clients to provide PostgreSQL database access through natural
language queries.

Usage:
    python main.py
    python main.py --config /path/to/config.yaml
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from pg_mcp.mcp.server import PostgresMCPServer


def setup_logging(verbose: bool = False) -> None:
    """Setup logging configuration."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stderr)
        ]
    )

    # Reduce noise from other libraries
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)


async def main() -> None:
    """Main async entry point."""
    parser = argparse.ArgumentParser(
        description='PostgreSQL MCP Server with AI-powered SQL generation'
    )
    parser.add_argument(
        '--config', '-c',
        type=str,
        help='Path to configuration file',
        default=None
    )
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose logging'
    )

    args = parser.parse_args()

    # Setup logging
    setup_logging(args.verbose)
    logger = logging.getLogger(__name__)

    # Create server instance
    server = PostgresMCPServer(config_path=args.config)

    try:
        # Run the server
        logger.info("Starting pg-mcp server...")
        await server.run()

    except KeyboardInterrupt:
        logger.info("Shutdown requested by user")
    except Exception as e:
        logger.error(f"Server error: {e}", exc_info=True)
        sys.exit(1)
    finally:
        # Cleanup
        await server.cleanup()
        logger.info("Server shutdown complete")


if __name__ == "__main__":
    # Create event loop and run
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped by user")
        sys.exit(0)
