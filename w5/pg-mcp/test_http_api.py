#!/usr/bin/env python3
"""Test script for pg-mcp HTTP Server.

Demonstrates how to interact with the HTTP API.
"""

import requests
import json

BASE_URL = "http://localhost:8000/mcp"


def print_response(title: str, response: requests.Response):
    """Pretty print HTTP response."""
    print(f"\n{'=' * 60}")
    print(f"📡 {title}")
    print(f"{'=' * 60}")
    print(f"Status Code: {response.status_code}")
    print(f"Response:")
    try:
        print(json.dumps(response.json(), indent=2, ensure_ascii=False))
    except:
        print(response.text)


def test_health():
    """Test health endpoint."""
    response = requests.get(f"{BASE_URL}/health")
    print_response("Health Check", response)


def test_list_databases():
    """Test list databases endpoint."""
    response = requests.get(f"{BASE_URL}/databases")
    print_response("List Databases", response)


def test_query_database():
    """Test natural language query."""
    data = {
        "query": "查询前10个用户的姓名和邮箱",
        "database": "mydb",
        "validate": False
    }
    response = requests.post(f"{BASE_URL}/query", json=data)
    print_response("Natural Language Query", response)


def test_execute_sql():
    """Test direct SQL execution."""
    data = {
        "sql": "SELECT * FROM users LIMIT 10",
        "database": "mydb"
    }
    response = requests.post(f"{BASE_URL}/execute", json=data)
    print_response("Execute SQL", response)


def test_refresh_schema():
    """Test schema refresh."""
    data = {
        "database": "mydb"
    }
    response = requests.post(f"{BASE_URL}/refresh-schema", json=data)
    print_response("Refresh Schema", response)


def main():
    """Run all tests."""
    print("🚀 Testing pg-mcp HTTP Server")
    print(f"Base URL: {BASE_URL}")
    
    try:
        # Test 1: Health check
        test_health()
        
        # Test 2: List databases
        test_list_databases()
        
        # Test 3: Natural language query
        # test_query_database()  # Uncomment if you have a configured database
        
        # Test 4: Direct SQL execution
        # test_execute_sql()  # Uncomment if you have a configured database
        
        # Test 5: Refresh schema
        # test_refresh_schema()  # Uncomment if you have a configured database
        
        print("\n" + "=" * 60)
        print("✅ Tests completed!")
        print("=" * 60)
        
    except requests.exceptions.ConnectionError:
        print("\n❌ Error: Cannot connect to server")
        print("Make sure the HTTP server is running:")
        print("  python http_server.py")
    except Exception as e:
        print(f"\n❌ Error: {e}")


if __name__ == "__main__":
    main()
