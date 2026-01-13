"""PostgresMCPServer - MCP protocol implementation for PostgreSQL integration.

This module implements the MCP (Model Context Protocol) server that exposes
PostgreSQL database operations as tools for Claude Desktop and other MCP clients.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from mcp.server import Server
from mcp.types import Tool, TextContent

from pg_mcp.config.loader import Config
from pg_mcp.service.query import QueryService
from pg_mcp.exceptions import PGMCPErr, ConfigError, DatabaseError, SecurityError, QueryError

logger = logging.getLogger(__name__)


class PostgresMCPServer:
    """MCP Server implementation for PostgreSQL database operations.

    This class implements the MCP protocol server that provides four main tools:
    - query_database: Natural language to SQL conversion and execution
    - execute_sql: Direct SQL execution with validation
    - list_databases: List configured databases and their status
    - refresh_schema: Refresh database schema cache
    """

    def __init__(self, config_path: Optional[str] = None) -> None:
        """Initialize the MCP server.

        Args:
            config_path: Path to configuration file. If None, uses default config.

        Raises:
            ConfigError: If configuration is invalid
        """
        # Load configuration
        self.config = Config(config_path) if config_path else Config()

        # Initialize query service
        self.query_service = QueryService(self.config)

        # Initialize MCP server
        self.server = Server("postgres-mcp")

        # Setup tool handlers
        self._setup_handlers()

        logger.info("PostgresMCP Server initialized")

    def _setup_handlers(self) -> None:
        """Setup MCP tool handlers."""

        @self.server.list_tools()
        async def list_tools() -> List[Tool]:
            """List available tools."""
            return [
                Tool(
                    name="query_database",
                    description="Execute natural language query against PostgreSQL database. Converts natural language to SQL using AI and executes safely.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Natural language query to execute"
                            },
                            "database": {
                                "type": "string",
                                "description": "Database identifier from configuration"
                            },
                            "validate": {
                                "type": "boolean",
                                "description": "Whether to validate results using LLM",
                                "default": False
                            }
                        },
                        "required": ["query", "database"]
                    }
                ),
                Tool(
                    name="execute_sql",
                    description="Execute direct SQL query with security validation. Only SELECT queries are allowed.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "sql": {
                                "type": "string",
                                "description": "SQL query to execute (must be SELECT)"
                            },
                            "database": {
                                "type": "string",
                                "description": "Database identifier from configuration"
                            }
                        },
                        "required": ["sql", "database"]
                    }
                ),
                Tool(
                    name="list_databases",
                    description="List all configured PostgreSQL databases and their connection status.",
                    inputSchema={
                        "type": "object",
                        "properties": {},
                        "description": "No parameters required"
                    }
                ),
                Tool(
                    name="refresh_schema",
                    description="Refresh schema cache for a specific database to update table/column information.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "database": {
                                "type": "string",
                                "description": "Database identifier to refresh"
                            }
                        },
                        "required": ["database"]
                    }
                )
            ]

        @self.server.call_tool()
        async def call_tool(name: str, arguments: Dict[str, Any]) -> List[TextContent]:
            """Handle tool execution."""
            try:
                if name == "query_database":
                    return await self._handle_query_database(arguments)
                elif name == "execute_sql":
                    return await self._handle_execute_sql(arguments)
                elif name == "list_databases":
                    return await self._handle_list_databases()
                elif name == "refresh_schema":
                    return await self._handle_refresh_schema(arguments)
                else:
                    return [TextContent(
                        type="text",
                        text=self._format_error(
                            "UNKNOWN_TOOL",
                            f"Unknown tool: {name}"
                        )
                    )]
            except Exception as e:
                logger.error(f"Unexpected error in tool {name}: {e}", exc_info=True)
                return [TextContent(
                    type="text",
                    text=self._format_error(
                        "UNEXPECTED_ERROR",
                        f"Unexpected error: {str(e)}"
                    )
                )]

    async def _handle_query_database(self, arguments: Dict[str, Any]) -> List[TextContent]:
        """Handle query_database tool execution."""
        try:
            query = arguments.get("query")
            database = arguments.get("database")
            validate = arguments.get("validate", False)

            if not query or not database:
                return [TextContent(
                    type="text",
                    text=self._format_error(
                        "INVALID_INPUT",
                        "Missing required parameters: query and database"
                    )
                )]

            # Execute query
            result = await self.query_service.query_database(
                query=query,
                db_id=database,
                validate_result=validate
            )

            # Format result
            if result.get("success", False):
                return [TextContent(
                    type="text",
                    text=self._format_success(result)
                )]
            else:
                return [TextContent(
                    type="text",
                    text=self._format_error(
                        result.get("error_code", "QUERY_ERROR"),
                        result.get("error", "Query failed")
                    )
                )]

        except Exception as e:
            logger.error(f"Error in query_database: {e}", exc_info=True)
            return [TextContent(
                type="text",
                text=self._format_error("EXECUTION_ERROR", str(e))
            )]

    async def _handle_execute_sql(self, arguments: Dict[str, Any]) -> List[TextContent]:
        """Handle execute_sql tool execution."""
        try:
            sql = arguments.get("sql")
            database = arguments.get("database")

            if not sql or not database:
                return [TextContent(
                    type="text",
                    text=self._format_error(
                        "INVALID_INPUT",
                        "Missing required parameters: sql and database"
                    )
                )]

            # Execute SQL
            result = await self.query_service.execute_sql(
                sql=sql,
                db_id=database
            )

            # Format result
            if result.get("success", False):
                return [TextContent(
                    type="text",
                    text=self._format_success(result)
                )]
            else:
                error_code = result.get("error_code", "EXECUTION_ERROR")
                # Map some errors for better user experience
                if "SECURITY_ERROR" in error_code:
                    error_code = "SECURITY_ERROR"
                return [TextContent(
                    type="text",
                    text=self._format_error(
                        error_code,
                        result.get("error", "Query execution failed")
                    )
                )]

        except Exception as e:
            logger.error(f"Error in execute_sql: {e}", exc_info=True)
            return [TextContent(
                type="text",
                text=self._format_error("EXECUTION_ERROR", str(e))
            )]

    async def _handle_list_databases(self) -> List[TextContent]:
        """Handle list_databases tool execution."""
        try:
            result = await self.query_service.list_databases()

            if result.get("success", False):
                return [TextContent(
                    type="text",
                    text=self._format_success(result)
                )]
            else:
                return [TextContent(
                    type="text",
                    text=self._format_error(
                        result.get("error_code", "LIST_ERROR"),
                        result.get("error", "Failed to list databases")
                    )
                )]

        except Exception as e:
            logger.error(f"Error in list_databases: {e}", exc_info=True)
            return [TextContent(
                type="text",
                text=self._format_error("LIST_ERROR", str(e))
            )]

    async def _handle_refresh_schema(self, arguments: Dict[str, Any]) -> List[TextContent]:
        """Handle refresh_schema tool execution."""
        try:
            database = arguments.get("database")

            if not database:
                return [TextContent(
                    type="text",
                    text=self._format_error(
                        "INVALID_INPUT",
                        "Missing required parameter: database"
                    )
                )]

            result = await self.query_service.refresh_schema(db_id=database)

            if result.get("success", False):
                return [TextContent(
                    type="text",
                    text=self._format_success(result)
                )]
            else:
                return [TextContent(
                    type="text",
                    text=self._format_error(
                        result.get("error_code", "SCHEMA_ERROR"),
                        result.get("error", "Failed to refresh schema")
                    )
                )]

        except Exception as e:
            logger.error(f"Error in refresh_schema: {e}", exc_info=True)
            return [TextContent(
                type="text",
                text=self._format_error("SCHEMA_ERROR", str(e))
            )]

    def _format_success(self, data: Dict[str, Any]) -> str:
        """Format successful result as JSON string."""
        # Add timestamp for tracking
        import time
        data["_timestamp"] = time.time()

        # Pretty print for better readability
        return json.dumps(data, indent=2, ensure_ascii=False)

    def _format_error(self, error_code: str, error_message: str) -> str:
        """Format error response as JSON string."""
        import time
        error_data = {
            "success": False,
            "error_code": error_code,
            "error": error_message,
            "_timestamp": time.time()
        }
        return json.dumps(error_data, indent=2, ensure_ascii=False)

    async def run(self) -> None:
        """Run the MCP server.

        This method starts the MCP server and handles client connections.
        """
        try:
            # Import stdio transport
            from mcp.server.stdio import stdio_server

            logger.info("Starting PostgresMCP Server...")

            async with stdio_server() as streams:
                await self.server.run(
                    streams[0],
                    streams[1],
                    self.server.create_initialization_options()
                )

        except Exception as e:
            logger.error(f"Failed to run server: {e}", exc_info=True)
            raise

    async def cleanup(self) -> None:
        """Cleanup resources when shutting down."""
        logger.info("Cleaning up PostgresMCP Server...")
        await self.query_service.close()

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.cleanup()
