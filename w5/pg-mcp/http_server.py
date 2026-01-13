#!/usr/bin/env python3
"""HTTP Server wrapper for pg-mcp MCP Server.

This module provides HTTP REST API access to the MCP server functionality.
Access at: http://localhost:8000/mcp
"""

import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Dict, Any, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# Add project path
sys.path.insert(0, str(Path(__file__).parent))

from pg_mcp.config.loader import Config
from pg_mcp.service.query import QueryService
from pg_mcp.database.manager import DatabaseManager
from pg_mcp.exceptions import ConfigError, DatabaseError

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="pg-mcp HTTP Server",
    description="HTTP API wrapper for PostgreSQL MCP Server",
    version="1.0.0",
    docs_url="/mcp/docs",
    redoc_url="/mcp/redoc",
    openapi_url="/mcp/openapi.json"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
query_service: Optional[QueryService] = None
db_manager: Optional[DatabaseManager] = None
config: Optional[Config] = None


# Pydantic models for request/response
class QueryDatabaseRequest(BaseModel):
    """Request model for natural language query."""
    query: str = Field(..., description="Natural language query to execute")
    database: str = Field(..., description="Database identifier from configuration")
    validate: bool = Field(False, description="Whether to validate results using LLM")


class ExecuteSQLRequest(BaseModel):
    """Request model for direct SQL execution."""
    sql: str = Field(..., description="SQL query to execute (must be SELECT)")
    database: str = Field(..., description="Database identifier from configuration")


class RefreshSchemaRequest(BaseModel):
    """Request model for schema refresh."""
    database: str = Field(..., description="Database identifier to refresh")


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    service: str
    version: str


@app.on_event("startup")
async def startup_event():
    """Initialize server on startup."""
    global query_service, db_manager, config
    
    logger.info("=" * 60)
    logger.info("pg-mcp HTTP Server Starting")
    logger.info("=" * 60)
    
    try:
        # Load configuration
        logger.info("[1/3] Loading configuration...")
        config = Config("config/config.yaml")
        logger.info("✓ Configuration loaded")
        
        # Initialize query service (which creates its own DatabaseManager)
        logger.info("[2/3] Initializing query service...")
        query_service = QueryService(config)
        
        # Get the database manager from query service
        db_manager = query_service.db_manager
        
        # Connect to databases using the same db_manager
        logger.info("[3/3] Connecting to databases...")
        for db_id in config.list_databases():
            db_config = config.get_database(db_id)
            if not db_config:
                logger.warning(f"  ⚠ Skipping {db_id}: configuration not found")
                continue
            
            try:
                await db_manager.connect(
                    db_id=db_id,
                    host=db_config["host"],
                    database=db_config["database"],
                    user=db_config["user"],
                    password=db_config["password"],
                    port=db_config.get("port", 5432),
                    min_size=db_config.get("min_pool_size", 1),
                    max_size=db_config.get("max_pool_size", 10),
                )
                logger.info(f"  ✓ Connected to {db_id}")
            except DatabaseError as e:
                logger.error(f"  ✗ Failed to connect to {db_id}: {e.message}")
        
        logger.info("=" * 60)
        logger.info("🎉 pg-mcp HTTP Server Started!")
        logger.info("=" * 60)
        logger.info("📍 API Base URL: http://localhost:8000/mcp")
        logger.info("📚 API Docs: http://localhost:8000/mcp/docs")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"❌ Startup failed: {e}")
        raise


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    global db_manager, query_service
    
    logger.info("Shutting down pg-mcp HTTP Server...")
    
    if db_manager:
        await db_manager.disconnect_all()
    
    if query_service:
        await query_service.close()
    
    logger.info("Server shutdown complete")


@app.get("/mcp", response_model=HealthResponse)
async def root():
    """Root endpoint - health check."""
    return {
        "status": "running",
        "service": "pg-mcp HTTP Server",
        "version": "1.0.0"
    }


@app.get("/mcp/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "databases": config.list_databases() if config else [],
        "timestamp": asyncio.get_event_loop().time()
    }


@app.post("/mcp/query")
async def query_database(request: QueryDatabaseRequest) -> JSONResponse:
    """Execute natural language query against PostgreSQL database.
    
    Converts natural language to SQL using AI and executes safely.
    """
    if not query_service:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    try:
        result = await query_service.query_database(
            query=request.query,
            db_id=request.database,
            validate_result=request.validate
        )
        
        if result.get("success", False):
            return JSONResponse(content=result, status_code=200)
        else:
            return JSONResponse(
                content=result,
                status_code=400 if result.get("error_code") == "SECURITY_ERROR" else 500
            )
    
    except Exception as e:
        logger.error(f"Error in query_database: {e}", exc_info=True)
        return JSONResponse(
            content={
                "success": False,
                "error_code": "EXECUTION_ERROR",
                "error": str(e)
            },
            status_code=500
        )


@app.post("/mcp/execute")
async def execute_sql(request: ExecuteSQLRequest) -> JSONResponse:
    """Execute direct SQL query with security validation.
    
    Only SELECT queries are allowed.
    """
    if not query_service:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    try:
        result = await query_service.execute_sql(
            sql=request.sql,
            db_id=request.database
        )
        
        if result.get("success", False):
            return JSONResponse(content=result, status_code=200)
        else:
            status_code = 400 if "SECURITY_ERROR" in result.get("error_code", "") else 500
            return JSONResponse(content=result, status_code=status_code)
    
    except Exception as e:
        logger.error(f"Error in execute_sql: {e}", exc_info=True)
        return JSONResponse(
            content={
                "success": False,
                "error_code": "EXECUTION_ERROR",
                "error": str(e)
            },
            status_code=500
        )


@app.get("/mcp/databases")
async def list_databases() -> JSONResponse:
    """List all configured PostgreSQL databases and their connection status."""
    if not query_service:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    try:
        result = await query_service.list_databases()
        
        if result.get("success", False):
            return JSONResponse(content=result, status_code=200)
        else:
            return JSONResponse(content=result, status_code=500)
    
    except Exception as e:
        logger.error(f"Error in list_databases: {e}", exc_info=True)
        return JSONResponse(
            content={
                "success": False,
                "error_code": "LIST_ERROR",
                "error": str(e)
            },
            status_code=500
        )


@app.post("/mcp/refresh-schema")
async def refresh_schema(request: RefreshSchemaRequest) -> JSONResponse:
    """Refresh schema cache for a specific database.
    
    Updates table/column information.
    """
    if not query_service:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    try:
        result = await query_service.refresh_schema(db_id=request.database)
        
        if result.get("success", False):
            return JSONResponse(content=result, status_code=200)
        else:
            return JSONResponse(content=result, status_code=500)
    
    except Exception as e:
        logger.error(f"Error in refresh_schema: {e}", exc_info=True)
        return JSONResponse(
            content={
                "success": False,
                "error_code": "SCHEMA_ERROR",
                "error": str(e)
            },
            status_code=500
        )


def main():
    """Run the HTTP server."""
    try:
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            log_level="info"
        )
    except KeyboardInterrupt:
        logger.info("\nServer stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
