#!/usr/bin/env python3
"""Test database connection directly."""

import asyncio
import asyncpg

async def test_connection():
    try:
        print("Testing database connection...")
        print(f"Host: localhost")
        print(f"Database: complex_test")
        print(f"User: postgres")
        print(f"Password: postgres")
        
        # Create connection pool
        pool = await asyncpg.create_pool(
            host="localhost",
            port=5432,
            database="complex_test",
            user="postgres",
            password="postgres",
            min_size=1,
            max_size=2
        )
        
        print("✓ Pool created")
        
        # Test query
        async with pool.acquire() as conn:
            result = await conn.fetch("SELECT 1 as test")
            print(f"✓ Query result: {result}")
        
        await pool.close()
        print("✓ Pool closed")
        print("\n✅ Connection test successful!")
        
    except Exception as e:
        print(f"\n❌ Connection test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_connection())
