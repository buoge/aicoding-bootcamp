"""Test script for PostgresMCP Server.

This script provides manual testing functionality for all MCP tools.
"""

import asyncio
import json
import logging
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from pg_mcp.mcp.server import PostgresMCPServer

# Setup logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_list_tools():
    """Test listing available tools."""
    print("=" * 60)
    print("TEST: Listing available tools")
    print("=" * 60)

    server = PostgresMCPServer()

    # Get tools (this simulates what happens internally)
    tools_result = await server.server.request_handlers["tools/list"].handler()
    tools = tools_result.tools

    print(f"\nFound {len(tools)} tools:\n")
    for tool in tools:
        print(f"Tool: {tool.name}")
        print(f"Description: {tool.description}")
        print(f"Input Schema: {json.dumps(tool.inputSchema, indent=2)}")
        print("-" * 40)

    await server.cleanup()
    return tools


async def test_call_tool(tool_name: str, arguments: dict = None):
    """Test calling a specific tool."""
    print("=" * 60)
    print(f"TEST: Calling tool '{tool_name}'")
    print(f"Arguments: {json.dumps(arguments, indent=2)}")
    print("=" * 60)

    server = PostgresMCPServer()

    try:
        # Call the tool
        result = await server.server.request_handlers["tools/call"].handler(
            name=tool_name,
            arguments=arguments or {}
        )

        print("\nResult:")
        print("-" * 40)
        for content in result:
            if hasattr(content, 'text'):
                try:
                    # Try to parse as JSON for better formatting
                    data = json.loads(content.text)
                    print(json.dumps(data, indent=2))
                except:
                    print(content.text)
            else:
                try:
                    print(json.dumps(content, indent=2))
                except:
                    print(content)

        await server.cleanup()
        return result

    except Exception as e:
        logger.error(f"Error calling tool: {e}", exc_info=True)
        await server.cleanup()
        raise


async def main():
    """Main test function."""
    print("pg-mcp Server Test Suite")
    print("=" * 60)
    print("\n")

    try:
        # Test 1: List tools
        tools = await test_list_tools()
        input("\nPress Enter to continue...\n")

        # Test 2: List databases (should work without config)
        print("\n")
        await test_call_tool("list_databases")
        input("\nPress Enter to continue...\n")

        # Test 3: Try to query (will likely fail due to no config)
        print("\n")
        await test_call_tool("query_database", {
            "query": "test query",
            "database": "test_db"
        })
        input("\nPress Enter to continue...\n")

        # Test 4: Try to execute SQL (will likely fail due to no config)
        print("\n")
        await test_call_tool("execute_sql", {
            "sql": "SELECT 1",
            "database": "test_db"
        })
        input("\nPress Enter to continue...\n")

        # Test 5: Try to refresh schema (will likely fail due to no config)
        print("\n")
        await test_call_tool("refresh_schema", {
            "database": "test_db"
        })
        input("\nPress Enter to continue...\n")

        print("\n" + "=" * 60)
        print("All tests completed!")
        print("=" * 60)

    except Exception as e:
        logger.error(f"Test failed: {e}", exc_info=True)
        print(f"\nTest failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nTests interrupted by user")
        sys.exit(0)
